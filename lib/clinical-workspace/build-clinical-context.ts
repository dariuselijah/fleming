import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"
import type { PatientSession } from "./types"

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Legacy flat context for slash-command expanded prompts (still used by chat-input).
 */
export function buildClinicalContext(
  transcript: string,
  entities: ExtractedEntities,
  patient: PatientSession | null | undefined,
  entityStatus?: Record<string, "pending" | "accepted" | "rejected">
): string {
  return buildClinicalContextXml(transcript, entities, patient, entityStatus)
}

/**
 * Structured patient + consult context for prompts (XML-like, matches server injection style).
 */
export function buildClinicalContextXml(
  transcript: string,
  entities: ExtractedEntities,
  patient: PatientSession | null | undefined,
  entityStatus?: Record<string, "pending" | "accepted" | "rejected">
): string {
  const parts: string[] = []

  if (patient) {
    const demo = [
      patient.name ? `Name: ${patient.name}` : "",
      patient.age ? `Age: ${patient.age}` : "",
      patient.sex ? `Sex: ${patient.sex}` : "",
      patient.medicalAidScheme ? `Medical Aid: ${patient.medicalAidScheme}` : "",
    ]
      .filter(Boolean)
      .join("\n")

    const allergies =
      patient.criticalAllergies?.length && patient.criticalAllergies.join(", ")
    const chronic =
      patient.chronicConditions?.length && patient.chronicConditions.join(", ")
    const probs =
      patient.encounterProblems?.length && patient.encounterProblems.join(", ")
    const social =
      patient.lifestyle?.socialHistoryLines?.length &&
      patient.lifestyle.socialHistoryLines.join("; ")
    const medLine = patient.activeMedications?.length
      ? patient.activeMedications
          .map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(" · "))
          .join("; ")
      : ""
    const reason = patient.appointmentReason ?? ""

    parts.push(`<patient_context source="client_prompt">`)
    parts.push(`  <demographics>${escapeXml(demo)}</demographics>`)
    parts.push(
      `  <allergies>${escapeXml(allergies || "Not documented in chart (do not assume NKDA)")}</allergies>`
    )
    parts.push(`  <chronic_conditions>${escapeXml(chronic || "")}</chronic_conditions>`)
    parts.push(`  <active_medications>${escapeXml(medLine)}</active_medications>`)
    parts.push(`  <reason_for_visit>${escapeXml(reason)}</reason_for_visit>`)
    parts.push(`  <this_visit_problems>${escapeXml(probs || "")}</this_visit_problems>`)
    parts.push(`  <social_history>${escapeXml(social || "")}</social_history>`)
    parts.push(`</patient_context>`)
  }

  if (transcript.trim()) {
    const trimmed = transcript.length > 6000 ? transcript.slice(-6000) : transcript
    parts.push(`<scribe_transcript>${escapeXml(trimmed)}</scribe_transcript>`)
  }

  const entityLines: string[] = []
  const keys = Object.keys(entities) as (keyof ExtractedEntities)[]
  for (const key of keys) {
    const items = entities[key]
    if (!items?.length) continue
    const filtered = items.filter((item) => {
      const status = entityStatus?.[`${key}:${item}`]
      if (status === "rejected") return false
      if (entityStatus === undefined) return true
      return status === "accepted"
    })
    if (filtered.length === 0) continue
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    entityLines.push(`${label}: ${filtered.join("; ")}`)
  }
  if (entityLines.length > 0) {
    parts.push(`<extracted_entities status_filtered="accepted_or_pending">${escapeXml(entityLines.join("\n"))}</extracted_entities>`)
  }

  return parts.join("\n\n")
}
