export type EntityType = "medication" | "diagnosis" | "vital" | "procedure" | "symptom" | "history"

export type HighlightedSegment =
  | { type: "text"; text: string }
  | { type: "entity"; text: string; entityType: EntityType }

export interface ExtractedEntities {
  chief_complaint: string[]
  symptoms: string[]
  diagnoses: string[]
  medications: string[]
  allergies: string[]
  vitals: string[]
  procedures: string[]
  social_history: string[]
  family_history: string[]
  risk_factors: string[]
}

export const EMPTY_EXTRACTED: ExtractedEntities = {
  chief_complaint: [],
  symptoms: [],
  diagnoses: [],
  medications: [],
  allergies: [],
  vitals: [],
  procedures: [],
  social_history: [],
  family_history: [],
  risk_factors: [],
}

export interface HighlightSpan {
  text: string
  type: EntityType
}

interface MatchRange {
  start: number
  end: number
  text: string
  entityType: EntityType
}

/**
 * Entity-driven highlighting: uses LLM-extracted highlight spans
 * to find and mark exact phrases in the transcript text.
 * Falls back to empty if no highlights provided.
 */
export function highlightFromExtracted(
  text: string,
  highlights: HighlightSpan[]
): HighlightedSegment[] {
  if (!text || highlights.length === 0) {
    return [{ type: "text", text }]
  }

  const matches: MatchRange[] = []
  const lowerText = text.toLowerCase()

  for (const h of highlights) {
    if (!h.text || h.text.length < 2) continue

    const needle = h.text.toLowerCase()
    let searchFrom = 0

    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(needle, searchFrom)
      if (idx === -1) break

      matches.push({
        start: idx,
        end: idx + h.text.length,
        text: text.slice(idx, idx + h.text.length),
        entityType: h.type,
      })

      searchFrom = idx + needle.length
    }
  }

  if (matches.length === 0) {
    return [{ type: "text", text }]
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end)

  const filtered: MatchRange[] = []
  let lastEnd = 0
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m)
      lastEnd = m.end
    }
  }

  const segments: HighlightedSegment[] = []
  let cursor = 0

  for (const m of filtered) {
    if (m.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, m.start) })
    }
    segments.push({ type: "entity", text: m.text, entityType: m.entityType })
    cursor = m.end
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) })
  }

  return segments
}

/**
 * Legacy regex highlighter — kept only for the SOAP ghost-text mapper
 * which needs quick local extraction without an API call.
 */
export function extractEntitiesByType(text: string): ExtractedEntities {
  const result: ExtractedEntities = { ...EMPTY_EXTRACTED }
  if (!text) return result

  const MEDICATION_RE = /\b(amoxicillin|metformin|amlodipine|lisinopril|omeprazole|atorvastatin|losartan|hydrochlorothiazide|simvastatin|levothyroxine|azithromycin|prednisone|ibuprofen|paracetamol|aspirin|warfarin|clopidogrel|apixaban|rivaroxaban|enoxaparin|insulin|salbutamol|fluticasone|budesonide|montelukast|doxycycline|ciprofloxacin|ceftriaxone|vancomycin|meropenem|furosemide|spironolactone|carvedilol|bisoprolol|ramipril|enalapril|valsartan|candesartan|diltiazem|verapamil|digoxin|amiodarone|metoprolol|propranolol|gabapentin|pregabalin|sertraline|fluoxetine|escitalopram|duloxetine|venlafaxine|quetiapine|olanzapine|risperidone|diazepam|lorazepam|clonazepam|morphine|tramadol|codeine|fentanyl|rosuvastatin|acetaminophen|naproxen|tylenol|advil)\b/gi

  const VITAL_RE = /\b(\d{2,3}\s*\/\s*\d{2,3}\s*(?:mmHg)?)\b/g

  let match: RegExpExecArray | null
  const medRe = new RegExp(MEDICATION_RE.source, MEDICATION_RE.flags)
  while ((match = medRe.exec(text)) !== null) {
    const normalized = match[0].toLowerCase()
    if (!result.medications.some((v) => v.toLowerCase() === normalized)) {
      result.medications.push(match[0])
    }
  }

  const vitalRe = new RegExp(VITAL_RE.source, VITAL_RE.flags)
  while ((match = vitalRe.exec(text)) !== null) {
    const normalized = match[0].toLowerCase()
    if (!result.vitals.some((v) => v.toLowerCase() === normalized)) {
      result.vitals.push(match[0])
    }
  }

  return result
}
