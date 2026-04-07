import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"

const FAQ_CATEGORIES = [
  "hours",
  "services",
  "fees",
  "insurance",
  "directions",
  "parking",
  "preparation",
  "general",
] as const

export type ParsedPracticeHour = {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

export type ParsedPracticeFaq = {
  category: string
  question: string
  answer: string
  keywords: string[]
}

export type ParsedPracticeKnowledge = {
  hours: ParsedPracticeHour[]
  faqs: ParsedPracticeFaq[]
  notes?: string
}

const SYSTEM = `You extract structured practice information for a medical/dental practice AI receptionist.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "hours": [ { "day_of_week": 0, "open_time": "08:00", "close_time": "17:00", "is_closed": false } ],
  "faqs": [ { "category": "general", "question": "...", "answer": "...", "keywords": ["a","b"] } ],
  "notes": "optional short note if something was ambiguous"
}

Rules:
- day_of_week: 0=Sunday through 6=Saturday (US/JavaScript convention).
- open_time / close_time: 24-hour "HH:MM" strings. If closed all day, set is_closed true and use placeholder times "00:00"/"00:00" or any times (they are ignored when closed).
- Include one entry per day that the source mentions; you may include all 7 days if the source describes a full week.
- If the source does NOT mention opening hours at all, return "hours": [].
- faqs: pairs of patient-facing questions and concise answers suitable for chat/voice. Add 3-12 keywords per FAQ for retrieval (lowercase, no punctuation).
- category must be one of: ${FAQ_CATEGORIES.join(", ")}.
- If the source has no clear Q&A content, return "faqs": [].
- Infer reasonable FAQs from narrative text (e.g. "we validate in the parking garage" → parking FAQ).
- Keep answers factual and under ~400 characters when possible unless the source requires more detail.
`

export function normalizeFaqCategory(raw: string): (typeof FAQ_CATEGORIES)[number] {
  const c = (raw || "general").toLowerCase().trim()
  if (FAQ_CATEGORIES.includes(c as (typeof FAQ_CATEGORIES)[number])) {
    return c as (typeof FAQ_CATEGORIES)[number]
  }
  return "general"
}

export function normalizeTime(t: string): string {
  const s = (t || "09:00").trim().replace(/\./g, ":")
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return "09:00"
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

export async function parsePracticeKnowledgeFromText(
  sourceText: string
): Promise<ParsedPracticeKnowledge> {
  const trimmed = sourceText.trim()
  if (trimmed.length < 15) {
    throw new Error("Content is too short to analyze (need at least a short paragraph).")
  }

  const model = openproviders("gpt-4o-mini")

  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: trimmed.slice(0, 100_000),
    temperature: 0.1,
  })

  let parsed: Record<string, unknown>
  try {
    const cleaned = result.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim()
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error("Could not parse AI response as JSON. Try simplifying your text.")
  }

  const hoursRaw = Array.isArray(parsed.hours) ? parsed.hours : []
  const faqsRaw = Array.isArray(parsed.faqs) ? parsed.faqs : []

  const hours: ParsedPracticeHour[] = hoursRaw
    .map((h: Record<string, unknown>) => {
      const d = Number(h.day_of_week)
      if (!Number.isFinite(d)) return null
      const day = Math.min(6, Math.max(0, Math.floor(d)))
      return {
        day_of_week: day,
        open_time: normalizeTime(String(h.open_time ?? "09:00")),
        close_time: normalizeTime(String(h.close_time ?? "17:00")),
        is_closed: Boolean(h.is_closed),
      }
    })
    .filter(Boolean)
    .filter((h, i, arr) => arr.findIndex((x) => x.day_of_week === h.day_of_week) === i) as ParsedPracticeHour[]

  const faqs: ParsedPracticeFaq[] = faqsRaw
    .map((f: Record<string, unknown>) => {
      const q = String(f.question ?? "").trim()
      const a = String(f.answer ?? "").trim()
      if (!q || !a) return null
      const kw = Array.isArray(f.keywords)
        ? (f.keywords as unknown[])
            .map((k) => String(k).toLowerCase().trim())
            .filter(Boolean)
            .slice(0, 24)
        : []
      return {
        category: normalizeFaqCategory(String(f.category ?? "general")),
        question: q.slice(0, 2000),
        answer: a.slice(0, 8000),
        keywords: kw,
      }
    })
    .filter(Boolean) as ParsedPracticeFaq[]

  return {
    hours,
    faqs,
    notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 500) : undefined,
  }
}
