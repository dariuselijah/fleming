import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { writeBillingAudit } from "./audit"

export async function writeOffInvoice(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    reason: string
  }
): Promise<void> {
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
