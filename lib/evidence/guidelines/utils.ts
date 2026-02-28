import type { GuidelineResult } from "./types"

export function normalizeWhitespace(text?: string): string | undefined {
  if (!text) return undefined
  return text.replace(/\s+/g, " ").trim()
}

export function dedupeGuidelineResults(results: GuidelineResult[]): GuidelineResult[] {
  const seen = new Set<string>()
  const deduped: GuidelineResult[] = []

  for (const result of results) {
    const key = `${result.sourceId}:${result.title}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(result)
  }

  return deduped
}

export function toYear(date?: string): number {
  if (!date) return 0
  const match = date.match(/\b(19|20)\d{2}\b/)
  if (!match) return 0
  return Number(match[0])
}
