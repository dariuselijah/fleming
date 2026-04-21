import type { PatientMedication } from "./types"

/**
 * Best-effort parse of a scribe medication line into name + optional dose/frequency.
 * Example: "Metformin 500 mg twice daily" → name, dosage, frequency
 */
export function parseMedicationLine(line: string): Omit<PatientMedication, "id" | "startDate" | "prescribedBy" | "refillsRemaining"> {
  const raw = line.replace(/\s+/g, " ").trim()
  if (!raw) return { name: "" }

  // Split on common separators: " — ", " - ", "–"
  const normalized = raw.replace(/\s*[–—]\s*/g, " - ")
  const dashParts = normalized.split(" - ").map((s) => s.trim())
  let rest = dashParts[0] ?? raw

  // Trailing parenthetical notes
  const paren = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (paren) {
    rest = `${paren[1].trim()} (${paren[2].trim()})`
  }

  // Dose pattern: number + unit (mg, mcg, g, ml, IU, units)
  const doseRe = /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|IU|units?))\b/gi
  const freqRe = /\b(bid|tid|qid|qd|daily|twice\s+daily|three\s+times|weekly|prn|as\s+needed)\b/gi

  const doses: string[] = []
  let m: RegExpExecArray | null
  const copy = rest
  while ((m = doseRe.exec(copy)) !== null) {
    doses.push(m[1])
  }

  let name = rest
  let dosage: string | undefined
  let frequency: string | undefined

  if (doses.length > 0) {
    dosage = doses.join(", ")
    name = rest
      .replace(doseRe, "")
      .replace(/\s*,\s*$/, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  const fm = rest.match(freqRe)
  if (fm) {
    frequency = fm[0]
    if (!name) name = rest.replace(freqRe, "").replace(/\s+/g, " ").trim()
  }

  if (!name || name.length < 2) {
    return {
      name: raw,
      dosage: undefined,
      frequency: frequency,
    }
  }

  return {
    name,
    dosage: dosage?.trim() || undefined,
    frequency: frequency?.trim() || undefined,
  }
}
