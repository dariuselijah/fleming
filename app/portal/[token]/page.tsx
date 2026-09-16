import { createAdminClient } from "@/lib/supabase/admin"
import { hashPortalToken } from "@/lib/portal/tokens"
import Link from "next/link"
import { BillingPortalShell } from "@/app/components/portal/billing-portal-shell"

export default async function PatientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const raw = decodeURIComponent(token)
  const hash = hashPortalToken(raw)

  const admin = createAdminClient()
  const { data: access } = await admin
    .from("patient_access_tokens")
    .select("id, practice_id, patient_id, purpose, appointment_id, invoice_id, expires_at, elevated_at")
    .eq("token_hash", hash)
    .maybeSingle()

  if (!access || new Date(access.expires_at) < new Date()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-center text-sm text-muted-foreground">This link is invalid or has expired.</p>
      </main>
    )
  }

  if (!access.elevated_at) {
    await admin
      .from("patient_access_tokens")
      .update({ elevated_at: new Date().toISOString() })
      .eq("id", access.id)
  }

  const { data: practice } = await admin
    .from("practices")
    .select("name")
    .eq("id", access.practice_id)
    .maybeSingle()

  const practiceName = practice?.name || "Your practice"

  if (access.purpose === "billing_invoice" && access.invoice_id) {
    const { data: inv } = await admin
      .from("practice_invoices")
      .select(
        "invoice_number, total_cents, amount_paid_cents, status, line_items, pdf_storage_path"
      )
      .eq("id", access.invoice_id)
      .eq("practice_id", access.practice_id)
      .maybeSingle()

    if (!inv) {
      return (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">Invoice not found.</p>
        </main>
      )
    }

    const linesRaw = inv.line_items as { description?: string; amountCents?: number; amount?: number }[] | null
    const lines = Array.isArray(linesRaw)
      ? linesRaw.map((l) => ({
          description: String(l.description ?? "Item"),
          amountCents:
            typeof l.amountCents === "number"
              ? l.amountCents
              : typeof l.amount === "number"
                ? Math.round(l.amount * 100)
                : 0,
        }))
      : []

    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-8 px-6 py-16">
        <header className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Pay invoice</p>
          <h1 className="text-2xl font-semibold tracking-tight">{practiceName}</h1>
        </header>
        <BillingPortalShell
          practiceName={practiceName}
          token={raw}
          invoiceNumber={inv.invoice_number}
          totalCents={inv.total_cents ?? 0}
          amountPaidCents={inv.amount_paid_cents ?? 0}
          status={inv.status}
          lines={lines}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-8 px-6 py-16">
      <header className="space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Patient portal</p>
        <h1 className="text-2xl font-semibold tracking-tight">{practiceName}</h1>
        <p className="text-sm text-muted-foreground capitalize">Purpose: {access.purpose.replace(/_/g, " ")}</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-panel">
        <p className="text-sm leading-relaxed text-muted-foreground">
          You&apos;re signed in with a secure, purpose-limited link. This link does not currently accept medical-aid
          cards or other document uploads. Contact the practice directly if they requested supporting documents.
        </p>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Need help?{" "}
        <Link href="/" className="underline underline-offset-2">
          Contact the practice
        </Link>
      </p>
    </main>
  )
}
