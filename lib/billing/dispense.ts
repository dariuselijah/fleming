import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import type { InvoiceLineSnapshot } from "./types"
import { writeBillingAudit } from "./audit"

/**
 * On invoice issue, decrement stock for lines with NAPPI codes.
 */
export async function applyDispenseOnIssue(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    lines: InvoiceLineSnapshot[]
    actorUserId: string | null
  }
): Promise<void> {
  for (const line of opts.lines) {
    const nappi = line.nappiCode?.trim()
    if (!nappi) continue
    const qty = Math.max(1, line.quantity ?? 1)

    const { data: items } = await supabase
      .from("practice_inventory_items")
      .select("id, current_stock, nappi_code")
      .eq("practice_id", opts.practiceId)
      .eq("nappi_code", nappi)
      .limit(1)

    const row = items?.[0]
    if (!row) continue

    const next = Math.max(0, (row.current_stock ?? 0) - qty)
    const { error } = await supabase
      .from("practice_inventory_items")
      .update({ current_stock: next, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (error) {
      console.warn("[dispense]", error.message)
      continue
    }
    await writeBillingAudit(supabase, {
      practiceId: opts.practiceId,
      actorUserId: opts.actorUserId,
      entityType: "inventory",
      entityId: row.id,
      action: "dispense_from_invoice",
      diff: { invoiceId: opts.invoiceId, nappi, qty, nextStock: next },
    })
  }
}
