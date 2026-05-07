import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { writeBillingAudit } from "./audit"
import { recordSucceededManualPayment } from "./payments"

export async function writeOffInvoice(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    reason: string
  }
): Promise<void> {
  const { data: inv, error: invErr } = await supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found")

  const due = Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0))
  if (due > 0) {
    await recordSucceededManualPayment(supabase, {
      practiceId: opts.practiceId,
      invoiceId: opts.invoiceId,
      amountCents: due,
      actorUserId: opts.actorUserId,
      idempotencyKey: `write-off-${opts.invoiceId}-${Date.now()}`,
      provider: "write_off",
      reason: opts.reason,
    })
    return
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from("practice_invoices")
    .update({
      status: "write_off",
      write_off_reason: opts.reason,
      updated_at: now,
    })
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
  if (error) throw new Error(error.message)

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "invoice",
    entityId: opts.invoiceId,
    action: "write_off",
    reason: opts.reason,
  })
}
