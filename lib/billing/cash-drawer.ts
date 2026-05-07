import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"

export type OpenCashDrawerRow = {
  id: string
  opened_at: string
  opening_float_cents: number
}

/** Sum succeeded cash payments posted to this drawer session. */
export async function sumCashSalesForSession(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  sessionId: string
): Promise<{ totalCents: number; paymentCount: number }> {
  const { data: rows, error } = await supabase
    .from("practice_payments")
    .select("amount_cents")
    .eq("practice_id", practiceId)
    .eq("cash_drawer_session_id", sessionId)
    .eq("provider", "cash")
    .eq("status", "succeeded")

  if (error) throw new Error(error.message)
  const list = rows || []
  const totalCents = list.reduce((s, r) => s + Number(r.amount_cents ?? 0), 0)
  return { totalCents, paymentCount: list.length }
}

export async function getOpenCashDrawerSession(
  supabase: SupabaseClient<Database>,
  practiceId: string
): Promise<OpenCashDrawerRow | null> {
  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opened_at, opening_float_cents")
    .eq("practice_id", practiceId)
    .is("closed_at", null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    opened_at: data.opened_at,
    opening_float_cents: data.opening_float_cents,
  }
}
