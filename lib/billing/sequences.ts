import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import type { SequenceKind } from "./types"

const PREFIX: Record<SequenceKind, string> = {
  invoice: "INV-",
  receipt: "RCP-",
  credit_note: "CN-",
}

/**
 * Allocate next gapless number for practice (Postgres SECURITY DEFINER function).
 */
export async function allocateBillingNumber(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  kind: SequenceKind
): Promise<string> {
  const { data, error } = await supabase.rpc("next_billing_number", {
    p_practice_id: practiceId,
    p_kind: kind,
    p_default_prefix: PREFIX[kind],
  })

  if (error) throw new Error(error.message)
  if (typeof data !== "string" || !data) {
    throw new Error("next_billing_number returned empty")
  }
  return data
}
