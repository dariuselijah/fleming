import type { Database } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ClaimResponse, EligibilityResponse, FamilyEligibilityResponse } from "./types"

export async function insertEligibilityCheck(
  supabase: SupabaseClient<Database>,
  row: {
    practiceId: string
    patientId: string
    checkType: "eligibility" | "famcheck"
    response: EligibilityResponse | FamilyEligibilityResponse
    rawXml?: string
    userId: string
  }
) {
  const res = row.response
  await supabase.from("eligibility_checks").insert({
    practice_id: row.practiceId,
    patient_id: row.patientId,
    check_type: row.checkType,
    tx_nbr: res.txNbr ?? null,
    res: res.res ?? res.responseCode ?? null,
    response: res as unknown as Record<string, unknown>,
    raw_xml: row.rawXml ?? null,
    created_by: row.userId,
  })
}

export async function insertPracticeClaim(
  supabase: SupabaseClient<Database>,
  row: {
    practiceId: string
    patientId: string
    lines: unknown[]
    medikreditResponse: ClaimResponse
    fingerprint?: string | null
    userId: string
    clinicalEncounterId?: string | null
  }
) {
  const r = row.medikreditResponse
  const status =
    r.outcome === "approved"
      ? "approved"
      : r.outcome === "partially_approved"
        ? "partial"
        : r.outcome === "rejected" || r.outcome === "duplicate"
          ? "rejected"
          : r.outcome === "pending"
            ? "submitted"
            : "submitted"

  const { data, error } = await supabase
    .from("practice_claims")
    .insert({
      practice_id: row.practiceId,
      patient_id: row.patientId,
      clinical_encounter_id: row.clinicalEncounterId ?? null,
      status,
      lines: row.lines,
      medikredit_response: r as unknown as Record<string, unknown>,
      submission_fingerprint: row.fingerprint ?? null,
      tx_nbr: r.txNbr ?? null,
      raw_last_response_xml: r.rawXml ?? null,
      created_by: row.userId,
    })
    .select("id")
    .single()
  if (error) throw error
  return data?.id as string | undefined
}
