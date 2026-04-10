import type { MedicalBlock } from "./types"

/** Stable local calendar key for grouping (YYYY-MM-DD). */
export function dateKeyLocal(ts: Date | string | number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Human-readable sticky header label for a date key. */
export function formatTimelineDateHeader(dateKey: string): string {
  const [ys, ms, ds] = dateKey.split("-")
  const y = Number(ys)
  const m = Number(ms)
  const day = Number(ds)
  if (!y || !m || !day) return dateKey
  const date = new Date(y, m - 1, day)
  const today = new Date()
  const todayKey = dateKeyLocal(today)
  if (dateKey === todayKey) return "Today"
  const yest = new Date(today)
  yest.setDate(yest.getDate() - 1)
  if (dateKey === dateKeyLocal(yest)) return "Yesterday"
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * If `title` is an "Accepted: …" extraction row, returns the category segment
 * (e.g. "Symptoms", "Active & Historical Dx") for clustering. Otherwise null.
 */
export function parseAcceptedCategory(title: string | undefined): string | null {
  if (!title?.trim()) return null
  const t = title.trim()
  if (!/^accepted:/i.test(t)) return null
  const rest = t.replace(/^accepted:\s*/i, "").trim()
  if (!rest) return "Accepted"
  const dash = rest.indexOf(" - ")
  if (dash === -1) return rest
  return rest.slice(0, dash).trim() || "Accepted"
}

export type TimelineDaySegment =
  | { type: "cluster"; category: string; blocks: MedicalBlock[] }
  | { type: "single"; block: MedicalBlock }

/**
 * Groups consecutive "Accepted: …" rows that share the same category into one cluster
 * when there are 2+ rows. Other blocks stay single. Order is preserved (newest-first in day).
 */
export function segmentBlocksForOneDay(blocksNewestFirst: MedicalBlock[]): TimelineDaySegment[] {
  const out: TimelineDaySegment[] = []
  let i = 0
  const n = blocksNewestFirst.length
  while (i < n) {
    const cat = parseAcceptedCategory(blocksNewestFirst[i].title)
    if (!cat) {
      out.push({ type: "single", block: blocksNewestFirst[i] })
      i += 1
      continue
    }
    let j = i + 1
    while (j < n && parseAcceptedCategory(blocksNewestFirst[j].title) === cat) {
      j += 1
    }
    const chunk = blocksNewestFirst.slice(i, j)
    if (chunk.length >= 2) {
      out.push({ type: "cluster", category: cat, blocks: chunk })
    } else {
      out.push({ type: "single", block: chunk[0] })
    }
    i = j
  }
  return out
}

/** Bucket sorted blocks (newest first) by local date key, newest days first. */
export function groupBlocksByDateKey(blocksNewestFirst: MedicalBlock[]): Map<string, MedicalBlock[]> {
  const map = new Map<string, MedicalBlock[]>()
  for (const b of blocksNewestFirst) {
    const dk = dateKeyLocal(b.timestamp)
    if (!map.has(dk)) map.set(dk, [])
    map.get(dk)!.push(b)
  }
  return map
}

export function sortedDateKeysDesc(dateKeys: Iterable<string>): string[] {
  return [...dateKeys].sort((a, b) => b.localeCompare(a))
}
