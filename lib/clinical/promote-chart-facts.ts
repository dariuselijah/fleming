import type { SupabaseClient } from "@supabase/supabase-js"

export type PatientChartFactDomain =
  | "chief_complaint"
  | "finding"
  | "problem"
  | "medication"
  | "procedure"
  | "referral"
  | "lab"
  | "imaging"
  | "follow_up"
  | "immunization"
  | "family_history"
  | "social_history"
  | "vital"
  | "note"

/**
 * Replace prior promoted facts for this encounter, then insert rows derived from the AI summary.
 * Idempotent per encounter so re-signing refreshes the sidebar-facing chart strip.
 */
export async function replacePromotedChartFactsForEncounter(args: {
  supabase: SupabaseClient
  practiceId: string
  patientId: string
  encounterId: string
  chiefComplaint: string | null
  keyFindings: string[]
  followUp: string | null
}): Promise<void> {
  const { supabase, practiceId, patientId, encounterId, chiefComplaint, keyFindings, followUp } = args

  await supabase.from("patient_chart_facts").delete().eq("encounter_id", encounterId)

  const rows: {
    practice_id: string
    patient_id: string
    encounter_id: string
    domain: PatientChartFactDomain
    summary: string
    detail: Record<string, unknown>
  }[] = []

  const cc = chiefComplaint?.trim()
  if (cc) {
    rows.push({
      practice_id: practiceId,
      patient_id: patientId,
      encounter_id: encounterId,
      domain: "chief_complaint",
      summary: cc.slice(0, 500),
      detail: {},
    })
  }

  for (const raw of keyFindings.slice(0, 5)) {
    const s = String(raw ?? "").trim()
    if (!s) continue
    rows.push({
      practice_id: practiceId,
      patient_id: patientId,
      encounter_id: encounterId,
      domain: "finding",
      summary: s.slice(0, 500),
      detail: {},
    })
  }

  const fu = followUp?.trim()
  if (fu) {
    rows.push({
      practice_id: practiceId,
      patient_id: patientId,
      encounter_id: encounterId,
      domain: "follow_up",
      summary: fu.slice(0, 500),
      detail: {},
    })
  }

  if (rows.length === 0) return

  const { error } = await supabase.from("patient_chart_facts").insert(rows)
  if (error) {
    console.warn("[promote-chart-facts]", error.message)
  }
}
