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
        <p className="text-center text-sm text-zinc-500">This link is invalid or has expired.</p>
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
          <p className="text-center text-sm text-zinc-500">Invoice not found.</p>
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
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Pay invoice</p>
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
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Patient portal</p>
        <h1 className="text-2xl font-semibold tracking-tight">{practiceName}</h1>
        <p className="text-sm text-zinc-500 capitalize">Purpose: {access.purpose.replace(/_/g, " ")}</p>
      </header>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          You&apos;re signed in with a secure link. Full check-in, intake forms, billing, and document upload will
          appear here as we roll out the portal UI.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700">
            Drag & drop medical aid card (coming soon)
          </div>
          <button
            type="button"
            disabled
            className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Confirm details
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-zinc-400">
        Need help?{" "}
        <Link href="/" className="underline underline-offset-2">
          Contact the practice
        </Link>
      </p>
    </main>
  )
}
