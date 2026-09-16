import type { Database } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { enrichStoredClaimLines } from "./enrich-claim-lines"
import type { ClaimResponse, EligibilityResponse, FamilyEligibilityResponse } from "./types"

export function withoutRawMedikreditFields<T extends Record<string, unknown>>(value: T): T {
  const safe: Record<string, unknown> = { ...value }
  for (const key of [
    "rawXml",
    "raw_xml",
    "requestInnerXml",
    "requestSoapEnvelope",
    "responseRaw",
  ]) {
    delete safe[key]
  }
  return safe as T
}

function storedRawXml(rawXml?: string): string | null {
  return process.env.MEDIKREDIT_STORE_RAW_XML === "1" ? rawXml?.slice(0, 50_000) ?? null : null
}

export function publicMedikreditResponse<T extends EligibilityResponse | FamilyEligibilityResponse | ClaimResponse>(
  response: T
): Omit<T, "rawXml" | "requestInnerXml" | "requestSoapEnvelope" | "responseRaw"> {
  return withoutRawMedikreditFields(response as unknown as Record<string, unknown>) as Omit<
    T,
    "rawXml" | "requestInnerXml" | "requestSoapEnvelope" | "responseRaw"
  >
}

function claimStatusFromResponse(r: ClaimResponse): string {
  return r.outcome === "approved"
    ? "approved"
    : r.outcome === "partially_approved"
      ? "partial"
      : r.outcome === "rejected" || r.outcome === "duplicate"
        ? "rejected"
        : r.outcome === "pending"
          ? "submitted"
          : "submitted"
}

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
  const safeResponse = publicMedikreditResponse(res)
  const { error } = await supabase.from("eligibility_checks").insert({
    practice_id: row.practiceId,
    patient_id: row.patientId,
    check_type: row.checkType,
    tx_nbr: res.txNbr ?? null,
    res: res.res ?? res.responseCode ?? null,
    response: safeResponse as unknown as Record<string, unknown>,
    raw_xml: storedRawXml(row.rawXml),
    created_by: row.userId,
  })
  if (error) throw error
}

export async function appendClaimEvent(
  supabase: SupabaseClient<Database>,
  row: {
    practiceId: string
    claimId: string
    eventType: string
    status?: string | null
    txNbr?: string | null
    relatedClaimId?: string | null
    payload?: Record<string, unknown>
    userId?: string | null
  }
): Promise<void> {
  const db = supabase as unknown as SupabaseClient
  const { error } = await db.from("practice_claim_events").insert({
    practice_id: row.practiceId,
    claim_id: row.claimId,
    event_type: row.eventType,
    status: row.status ?? null,
    tx_nbr: row.txNbr ?? null,
    related_claim_id: row.relatedClaimId ?? null,
    payload: withoutRawMedikreditFields(row.payload ?? {}),
    actor_user_id: row.userId ?? null,
  })
  if (error) throw error
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
    appointmentId?: string | null
  }
) {
  const r = row.medikreditResponse
  const status = claimStatusFromResponse(r)
  const safeResponse = publicMedikreditResponse(r)

  const { data, error } = await supabase
    .from("practice_claims")
    .insert({
      practice_id: row.practiceId,
      patient_id: row.patientId,
      clinical_encounter_id: row.clinicalEncounterId ?? null,
      appointment_id: row.appointmentId?.trim() || null,
      status,
      lines: row.lines,
      medikredit_response: safeResponse as unknown as Record<string, unknown>,
      submission_fingerprint: row.fingerprint ?? null,
      tx_nbr: r.txNbr ?? null,
      raw_last_response_xml: storedRawXml(r.rawXml),
      created_by: row.userId,
    })
    .select("id")
    .single()
  if (error) throw error
  const claimId = data?.id as string | undefined
  if (claimId) {
    await appendClaimEvent(supabase, {
      practiceId: row.practiceId,
      claimId,
      eventType: "submitted",
      status,
      txNbr: r.txNbr,
      payload: safeResponse as unknown as Record<string, unknown>,
      userId: row.userId,
    })
  }
  return claimId
}

export async function updatePracticeClaimAfterSubmission(
  supabase: SupabaseClient<Database>,
  row: {
    claimId: string
    practiceId: string
    patientId: string
    /** Current JSON from DB before enrichment */
    existingLines: unknown[] | undefined
    medikreditResponse: ClaimResponse
    fingerprint?: string | null
    userId: string
  }
) {
  const r = row.medikreditResponse
  const enrichedLines = enrichStoredClaimLines(row.existingLines, r.itemStatuses)
  const status = claimStatusFromResponse(r)
  const safeResponse = publicMedikreditResponse(r)

  const { error } = await supabase
    .from("practice_claims")
    .update({
      status,
      lines: enrichedLines,
      medikredit_response: safeResponse as unknown as Record<string, unknown>,
      submission_fingerprint: row.fingerprint ?? null,
      tx_nbr: r.txNbr ?? null,
      raw_last_response_xml: storedRawXml(r.rawXml),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.claimId)
    .eq("practice_id", row.practiceId)
    .eq("patient_id", row.patientId)

  if (error) throw error
  await appendClaimEvent(supabase, {
    practiceId: row.practiceId,
    claimId: row.claimId,
    eventType: "submitted",
    status,
    txNbr: r.txNbr,
    payload: safeResponse as unknown as Record<string, unknown>,
    userId: row.userId,
  })
}
