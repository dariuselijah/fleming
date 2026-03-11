export type TrailingSourceEntry = {
  title: string
  pmid: string
  note?: string
}

type SplitSourceAppendixResult = {
  cleanText: string
  entries: TrailingSourceEntry[]
}

const TRAILING_HEADING_PATTERN =
  /^(references?|sources?|citations?|source list|references?\s*\((from tools?|tool output)\)|sources?\s*\((from tools?|tool output)\)|from (guideline|pubmed|clinical|evidence|tools?) search)\s*:?\s*$/i

function normalizeTitle(raw: string): string {
  const trimmed = raw.trim().replace(/^[-*]\s*/, "")
  if (!trimmed) return "PubMed"
  return trimmed.replace(/\s{2,}/g, " ")
}

function parseTrailingSourceBlock(block: string): TrailingSourceEntry[] {
  const normalizedBlock = block.replace(/\r\n/g, "\n").trim()
  if (!normalizedBlock) return []

  const lines = normalizedBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const entries: TrailingSourceEntry[] = []
  let pendingTitle = "PubMed"

  for (const line of lines) {
    if (TRAILING_HEADING_PATTERN.test(line)) {
      continue
    }

    const pmidMatch = line.match(/PMID\s*:?\s*(\d{6,10})(?:\s*\(([^)]+)\))?/i)
    if (pmidMatch?.[1]) {
      const pmidStartIndex = line.toLowerCase().indexOf("pmid")
      const inlineTitleCandidate =
        pmidStartIndex > 0 ? normalizeTitle(line.slice(0, pmidStartIndex)) : ""
      const title = inlineTitleCandidate && inlineTitleCandidate !== "PubMed"
        ? inlineTitleCandidate
        : pendingTitle

      entries.push({
        title: normalizeTitle(title),
        pmid: pmidMatch[1],
        note: pmidMatch[2]?.trim() || undefined,
      })
      continue
    }

    // Keep the latest non-PMID line as the source label for the next PMID line.
    pendingTitle = normalizeTitle(line)
  }

  return entries
}

function dedupeTrailingEntries(entries: TrailingSourceEntry[]): TrailingSourceEntry[] {
  if (entries.length <= 1) return entries
  const seenPmids = new Set<string>()
  const deduped: TrailingSourceEntry[] = []
  for (const entry of entries) {
    if (seenPmids.has(entry.pmid)) continue
    seenPmids.add(entry.pmid)
    deduped.push(entry)
  }
  return deduped
}

export function splitTrailingSourceAppendix(text: string): SplitSourceAppendixResult {
  if (!text || typeof text !== "string") {
    return { cleanText: "", entries: [] }
  }

  const normalized = text.replace(/\r\n/g, "\n").trimEnd()
  if (!normalized) {
    return { cleanText: "", entries: [] }
  }

  const blocks = normalized.split(/\n{2,}/g)
  const extracted: TrailingSourceEntry[] = []
  let cutIndex = blocks.length

  for (let idx = blocks.length - 1; idx >= 0; idx -= 1) {
    const rawBlock = blocks[idx]?.trim() || ""
    if (!rawBlock) {
      continue
    }

    const parsedEntries = parseTrailingSourceBlock(rawBlock)
    if (parsedEntries.length > 0) {
      extracted.unshift(...parsedEntries)
      cutIndex = idx
      continue
    }

    if (extracted.length > 0 && TRAILING_HEADING_PATTERN.test(rawBlock)) {
      cutIndex = idx
      continue
    }

    if (extracted.length > 0) {
      break
    }
  }

  if (extracted.length === 0) {
    return { cleanText: normalized, entries: [] }
  }

  const cleanText = blocks
    .slice(0, cutIndex)
    .join("\n\n")
    .trimEnd()

  return { cleanText, entries: dedupeTrailingEntries(extracted) }
}

