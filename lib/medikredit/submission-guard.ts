import type { Database } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"

const DEDUP_WINDOW_MS = 10 * 60 * 1000

/**
 * Blocks accidental double-submit: same fingerprint for the same patient/practice within 10 minutes
 * on a *different* claim row (updates to an existing claim pass `excludeClaimId`).
 */
export async function findRecentDuplicateFingerprint(
  supabase: SupabaseClient<Database>,
  params: {
    practiceId: string
    patientId: string
    fingerprint: string
    excludeClaimId?: string
  }
): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  let q = supabase
    .from("practice_claims")
    .select("id")
    .eq("practice_id", params.practiceId)
    .eq("patient_id", params.patientId)
    .eq("submission_fingerprint", params.fingerprint)
    .gte("updated_at", since)
    .limit(1)
  if (params.excludeClaimId?.trim()) {
    q = q.neq("id", params.excludeClaimId.trim())
  }
  const { data, error } = await q
  if (error) throw error
  const row = data?.[0]
  return row?.id ? { id: row.id } : null
}
