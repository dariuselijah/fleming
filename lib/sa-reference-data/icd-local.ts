/**
 * Local ICD-10 fallback from SA Health Codes seed (NDoH MIT subset).
 * Used when SA_REFERENCE_DATA_URL is unreachable so code search still works in dev.
 */
import seed from "../../services/sa-reference-data/data/seed/icd10-seed.json"

export type LocalIcdRow = {
  code: string
  description: string
  category?: string
}

const ROWS = seed as LocalIcdRow[]

export function searchLocalIcd(query: string, limit = 12): LocalIcdRow[] {
  const q = query.trim()
  if (q.length < 1) return []
  const codeQ = q.toUpperCase().replace(/\s+/g, "")
  const lower = q.toLowerCase()
  const scored = ROWS.map((row) => {
    const code = row.code.toUpperCase()
    let score = 99
    if (code === codeQ) score = 0
    else if (code.startsWith(codeQ)) score = 1
    else if (row.description.toLowerCase().includes(lower)) score = 2
    else return null
    return { row, score }
  }).filter(Boolean) as Array<{ row: LocalIcdRow; score: number }>
  scored.sort((a, b) => a.score - b.score || a.row.code.localeCompare(b.row.code))
  return scored.slice(0, limit).map((s) => s.row)
}

export function validateLocalIcd(code: string): LocalIcdRow | null {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "")
  return ROWS.find((r) => r.code.toUpperCase().replace(/\s+/g, "") === normalized) ?? null
}
