import { extractEntitiesByType } from "./entity-highlighter"
import type { SOAPNote } from "@/lib/clinical-workspace/types"

interface SOAPSuggestion {
  section: keyof SOAPNote
  text: string
  confidence: number
}

const SUBJECTIVE_KEYWORDS = [
  "complains", "reports", "states", "feels", "describes",
  "history of", "symptoms", "onset", "duration", "severity",
  "pain", "nausea", "vomiting", "cough", "fever", "headache",
  "dizziness", "fatigue", "weakness", "shortness of breath",
  "chest pain", "abdominal pain", "back pain",
  "denies", "no history of",
]

const OBJECTIVE_KEYWORDS = [
  "on examination", "vitals", "blood pressure", "heart rate", "temperature",
  "SpO2", "respiratory rate", "BMI", "weight", "height",
  "lung sounds", "heart sounds", "abdomen", "neurological",
  "clear to auscultation", "regular rate and rhythm",
  "no tenderness", "no swelling", "pupils equal",
  "lab results", "imaging", "ECG", "X-ray", "CT", "MRI",
]

const ASSESSMENT_KEYWORDS = [
  "diagnosis", "impression", "assessment",
  "likely", "consistent with", "rule out", "differential",
  "primary diagnosis", "secondary",
]

const PLAN_KEYWORDS = [
  "plan", "prescribe", "start", "continue", "discontinue",
  "refer", "follow up", "follow-up", "return", "monitor",
  "labs", "imaging ordered", "education",
  "discharge", "admit", "observe",
]

function scoreSection(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  return keywords.reduce((score, kw) => score + (lower.includes(kw) ? 1 : 0), 0)
}

export function mapTranscriptToSOAP(transcript: string): SOAPSuggestion[] {
  if (!transcript.trim()) return []

  const sentences = transcript
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const suggestions: SOAPSuggestion[] = []

  for (const sentence of sentences) {
    const scores: { section: keyof SOAPNote; score: number }[] = [
      { section: "subjective", score: scoreSection(sentence, SUBJECTIVE_KEYWORDS) },
      { section: "objective", score: scoreSection(sentence, OBJECTIVE_KEYWORDS) },
      { section: "assessment", score: scoreSection(sentence, ASSESSMENT_KEYWORDS) },
      { section: "plan", score: scoreSection(sentence, PLAN_KEYWORDS) },
    ]

    scores.sort((a, b) => b.score - a.score)
    const best = scores[0]

    if (best.score > 0) {
      suggestions.push({
        section: best.section,
        text: sentence,
        confidence: Math.min(best.score / 3, 1),
      })
    }
  }

  return suggestions
}

export function generateSOAPGhostText(
  transcript: string,
  currentNote: SOAPNote
): Partial<Record<keyof SOAPNote, string>> {
  const suggestions = mapTranscriptToSOAP(transcript)
  const entities = extractEntitiesByType(transcript)
  const ghost: Partial<Record<keyof SOAPNote, string>> = {}

  // Group high-confidence suggestions by section
  const bySections = new Map<keyof SOAPNote, string[]>()
  for (const s of suggestions) {
    if (s.confidence < 0.3) continue
    const existing = bySections.get(s.section) || []
    existing.push(s.text)
    bySections.set(s.section, existing)
  }

  // Only suggest if current section is empty or the suggestion adds new content
  for (const [section, texts] of bySections) {
    const currentContent = currentNote[section as keyof SOAPNote]
    if (typeof currentContent !== "string") continue
    const newText = texts
      .filter((t) => !currentContent.toLowerCase().includes(t.toLowerCase()))
      .join(". ")
    if (newText) {
      ghost[section as keyof SOAPNote] = (currentContent ? "\n" : "") + newText + "."
    }
  }

  // Auto-populate objective with detected vitals
  if (entities.vitals.length > 0 && !currentNote.objective.includes(entities.vitals[0])) {
    const vitalLine = entities.vitals.join(", ")
    ghost.objective = (ghost.objective ?? "") + (ghost.objective ? "\n" : "") + `Vitals: ${vitalLine}`
  }

  return ghost
}
