import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"
import type { PatientSession } from "./types"

export function buildClinicalContext(
  transcript: string,
  entities: ExtractedEntities,
  patient: PatientSession | null | undefined,
  entityStatus?: Record<string, "pending" | "accepted" | "rejected">
): string {
  const sections: string[] = []

  if (patient) {
    const parts = [`Name: ${patient.name}`]
    if (patient.age) parts.push(`Age: ${patient.age}`)
    if (patient.sex) parts.push(`Sex: ${patient.sex}`)
    if (patient.medicalAidScheme) parts.push(`Medical Aid: ${patient.medicalAidScheme}`)
    if (patient.criticalAllergies?.length)
      parts.push(`Known Allergies: ${patient.criticalAllergies.join(", ")}`)
    if (patient.chronicConditions?.length)
      parts.push(`Chronic Conditions: ${patient.chronicConditions.join(", ")}`)
    if (patient.activeMedications?.length) {
      const medLine = patient.activeMedications
        .map((m) =>
          [m.name, m.dosage, m.frequency].filter(Boolean).join(" · ")
        )
        .join("; ")
      parts.push(`Active Medications: ${medLine}`)
    }
    if (patient.appointmentReason)
      parts.push(`Reason for Visit: ${patient.appointmentReason}`)
    sections.push(`=== PATIENT ===\n${parts.join("\n")}`)
  }

  if (transcript.trim()) {
    const trimmed = transcript.length > 6000 ? transcript.slice(-6000) : transcript
    sections.push(`=== TRANSCRIPT ===\n${trimmed}`)
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
    sections.push(`=== EXTRACTED ENTITIES ===\n${entityLines.join("\n")}`)
  }

  return sections.join("\n\n")
}
