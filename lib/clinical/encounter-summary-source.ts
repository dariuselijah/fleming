import type { EncounterStatePlain } from "@/lib/clinical-workspace/encounter-state"
import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"

function acceptedScribeLines(plain: EncounterStatePlain): string {
  const entities = plain.scribeEntities
  const status = plain.scribeEntityStatus ?? {}
  if (!entities) return ""
  const lines: string[] = []
  const keys = Object.keys(entities) as (keyof ExtractedEntities)[]
  for (const k of keys) {
    const arr = entities[k]
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      const sk = `${String(k)}:${item}`
      if (status[sk] === "accepted") {
        lines.push(`${String(k).replace(/_/g, " ")}: ${item}`)
      }
    }
  }
  return lines.join("\n")
}

/** Plaintext excerpt sent to the summarizer (no encryption — generated client-side before POST). */
export function buildEncounterSummarySourceText(plain: EncounterStatePlain): string {
  const soap = plain.soapNote
  const transcript = (plain.scribeTranscript ?? "").replace(/\s+/g, " ").trim()
  const transcriptExcerpt = transcript.length > 6000 ? `${transcript.slice(0, 6000)}\n…` : transcript
  const accepted = acceptedScribeLines(plain)
  const lines = [
    `Appointment reason: ${plain.appointmentReason ?? "—"}`,
    `Subjective: ${soap?.subjective ?? "—"}`,
    `Objective: ${soap?.objective ?? "—"}`,
    `Assessment: ${soap?.assessment ?? "—"}`,
    `Plan: ${soap?.plan ?? "—"}`,
    `Problems: ${(plain.encounterProblems ?? []).join("; ") || "—"}`,
    `Allergies: ${(plain.criticalAllergies ?? []).join("; ") || "—"}`,
    `Chronic conditions: ${(plain.chronicConditions ?? []).join("; ") || "—"}`,
    `Active medications: ${(plain.activeMedications ?? []).map((m) => m.name).join("; ") || "—"}`,
  ]
  const extra: string[] = []
  if (transcriptExcerpt) {
    extra.push(`Scribe / visit transcript (excerpt):\n${transcriptExcerpt}`)
  }
  if (accepted) {
    extra.push(`Provider-accepted AI extraction items:\n${accepted}`)
  }
  return [...lines, ...extra].join("\n")
}
