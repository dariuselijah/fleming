import { createAdminClient } from "@/lib/supabase/admin"
import {
  decryptClinicalDocumentShare,
  hashClinicalDocumentShareToken,
} from "@/lib/clinical/document-share"

export const dynamic = "force-dynamic"

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center justify-center px-6 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Document unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This secure link is invalid, expired, or has been revoked. Contact the practice for a new link.
        </p>
      </div>
    </main>
  )
}

export default async function SharedClinicalDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const rawToken = decodeURIComponent((await params).token)
  const admin = createAdminClient()
  const { data: share } = await admin
    .from("clinical_document_shares")
    .select(
      "id, practice_id, title, doc_type, content_ciphertext, content_iv, expires_at, revoked_at"
    )
    .eq("token_hash", hashClinicalDocumentShareToken(rawToken))
    .maybeSingle()

  if (
    !share ||
    share.revoked_at ||
    new Date(String(share.expires_at)).getTime() <= Date.now()
  ) {
    return <Unavailable />
  }

  const content = decryptClinicalDocumentShare(
    rawToken,
    String(share.content_ciphertext),
    String(share.content_iv)
  )
  if (!content) return <Unavailable />

  const { data: practice } = await admin
    .from("practices")
    .select("name")
    .eq("id", share.practice_id)
    .maybeSingle()

  await admin
    .from("clinical_document_shares")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", share.id)
    .is("opened_at", null)

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Secure clinical document
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{share.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {practice?.name || "Your practice"} · Link expires{" "}
          {new Date(String(share.expires_at)).toLocaleString("en-ZA")}
        </p>
      </header>

      <article className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-card-foreground">
          {content}
        </pre>
      </article>

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        This private link grants access to the document. Do not forward it. Contact the practice if
        any information appears incorrect.
      </p>
    </main>
  )
}
