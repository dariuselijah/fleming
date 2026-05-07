import type { ParsedSourceUnit, UploadDocumentKind } from "@/lib/rag/types"
import type { StudyExtractionMetadata, TimetableEntry } from "./types"

const STUDY_PARSER_VERSION = "2026-03-study-parser-v1"
const OBJECTIVE_VERBS = [
  "define",
  "describe",
  "explain",
  "differentiate",
  "classify",
  "identify",
  "analyze",
  "interpret",
  "apply",
  "summarize",
  "outline",
  "compare",
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function dedupeStrings(values: string[], cap = 24): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeWhitespace(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
    if (out.length >= cap) break
  }
  return out
}

function extractTopicCandidates(sourceUnits: ParsedSourceUnit[]): string[] {
  const candidates: string[] = []
  for (const unit of sourceUnits) {
    if (unit.title && unit.title.trim().length > 1) {
      candidates.push(unit.title)
    }
    const lines = unit.extractedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 18)
    for (const line of lines) {
      if (line.length < 4 || line.length > 96) continue
      const alphaRatio = (line.match(/[a-z]/gi) || []).length / Math.max(line.length, 1)
      if (alphaRatio < 0.55) continue
      const looksLikeHeader =
        /^[A-Z0-9][A-Za-z0-9 ,:/\-()]{3,95}$/.test(line) &&
        !/[.;!?]$/.test(line) &&
        !/^\d+\s*$/.test(line)
      if (looksLikeHeader) {
        candidates.push(line)
      }
    }
  }
  return dedupeStrings(candidates, 20)
}

function extractObjectives(sourceUnits: ParsedSourceUnit[]): string[] {
  const matches: string[] = []
  const objectiveVerbRegex = new RegExp(`\\b(${OBJECTIVE_VERBS.join("|")})\\b`, "i")
  for (const unit of sourceUnits) {
    const lines = unit.extractedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 120)
    for (const line of lines) {
      if (line.length < 10 || line.length > 180) continue
      const normalized = line.replace(/^[\-*•\d.)\s]+/, "").trim()
      if (!normalized) continue
      const hasObjectiveCue =
        /\b(objective|goal|aim|outcome|learning point|high-yield)\b/i.test(normalized) ||
        objectiveVerbRegex.test(normalized)
      if (!hasObjectiveCue) continue
      if (normalized.split(" ").length < 3) continue
      matches.push(normalized.replace(/^objective[s]?:?\s*/i, ""))
    }
  }
  return dedupeStrings(matches, 28)
}

function parseDateCandidate(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const isoLike = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (isoLike) {
    const [, y, m, d] = isoLike
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  const dmy = value.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/)
  if (dmy) {
    const [, d, m, yearRaw] = dmy
    const year = yearRaw ? (yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : String(new Date().getUTCFullYear())
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  const natural = new Date(value)
  if (!Number.isNaN(natural.getTime())) {
    return natural.toISOString().slice(0, 10)
  }
  return null
}

function normalizeTime(raw: string): string | null {
  const token = normalizeWhitespace(raw).toLowerCase()
  if (!token) return null
  const match = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] || "0")
  const meridiem = match[3]
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  if (meridiem) {
    if (meridiem === "pm" && hour < 12) hour += 12
    if (meridiem === "am" && hour === 12) hour = 0
  }
  return `${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:${String(
    Math.max(0, Math.min(59, minute))
  ).padStart(2, "0")}`
}

function extractTimetableEntries(sourceUnits: ParsedSourceUnit[]): TimetableEntry[] {
  const entries: TimetableEntry[] = []
  for (const unit of sourceUnits) {
    const lines = unit.extractedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 140)

    for (const line of lines) {
      if (line.length < 4 || line.length > 220) continue
      const dayMatch = line.match(
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i
      )
      const timeMatch = line.match(
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
      )
      const singleTimeMatch = line.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
      const dateMatch = line.match(
        /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/i
      )
      const looksScheduleLine =
        /\b(timetable|schedule|slot|lecture|session|tutorial|rotation|exam|assessment|ward|clinic)\b/i.test(
          line
        ) ||
        Boolean(dayMatch && (timeMatch || singleTimeMatch || dateMatch))

      if (!looksScheduleLine) continue

      const startRaw = timeMatch?.[1] ?? singleTimeMatch?.[1] ?? null
      const endRaw = timeMatch?.[2] ?? null
      const startsAt = startRaw ? normalizeTime(startRaw) : null
      const endsAt = endRaw ? normalizeTime(endRaw) : null
      const date = dateMatch ? parseDateCandidate(dateMatch[1]) : null
      const label = line.replace(/\s+/g, " ").trim()

      entries.push({
        label: label.slice(0, 180),
        dayHint: dayMatch ? dayMatch[1] : null,
        startsAt,
        endsAt,
        date,
        sourceUnitNumber: unit.unitNumber ?? null,
      })
    }
  }

  const seen = new Set<string>()
  const unique: TimetableEntry[] = []
  for (const entry of entries) {
    const key = `${entry.label.toLowerCase()}|${entry.dayHint || ""}|${entry.startsAt || ""}|${entry.date || ""}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
    if (unique.length >= 60) break
  }
  return unique
}

function extractActionables(sourceUnits: ParsedSourceUnit[]): string[] {
  const actionables: string[] = []
  const actionRegex =
    /\b(should|must|need to|remember to|next step|action item|prepare|review|practice|complete|submit|revise|watch|read)\b/i

  for (const unit of sourceUnits) {
    const lines = unit.extractedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 220)

    for (const line of lines) {
      if (line.length < 10 || line.length > 220) continue
      if (!actionRegex.test(line)) continue
      actionables.push(line.replace(/\s+/g, " ").trim())
    }
  }

  return dedupeStrings(actionables, 24)
}

function deriveLectureSummary(sourceUnits: ParsedSourceUnit[]): string | null {
  const text = sourceUnits
    .map((unit) => unit.extractedText)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return null
  const sentences = text
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24)
  if (sentences.length === 0) return null
  const summary = sentences.slice(0, 5).join(" ")
  return summary.length > 800 ? `${summary.slice(0, 797)}...` : summary
}

export function deriveStudyExtractionMetadata(input: {
  uploadTitle: string
  uploadKind: UploadDocumentKind
  sourceUnits: ParsedSourceUnit[]
}): StudyExtractionMetadata {
  const topicLabels = extractTopicCandidates(input.sourceUnits)
  const objectives = extractObjectives(input.sourceUnits)
  const actionables = extractActionables(input.sourceUnits)
  const timetableEntries = extractTimetableEntries(input.sourceUnits)
  const lectureSummary = input.uploadKind === "video" ? deriveLectureSummary(input.sourceUnits) : null
  const hasImageHeavyUnits = input.sourceUnits.some(
    (unit) => (unit.unitType === "image" || unit.unitType === "slide") && (unit.extractedText || "").length < 40
  )
  const ocrSuggested = input.uploadKind === "image" || hasImageHeavyUnits

  return {
    parserVersion: STUDY_PARSER_VERSION,
    uploadTitle: input.uploadTitle,
    uploadKind: input.uploadKind,
    topicLabels,
    objectives,
    actionables,
    lectureSummary,
    timetableEntries,
    ocrSuggested,
    hasImageHeavyUnits,
  }
}
