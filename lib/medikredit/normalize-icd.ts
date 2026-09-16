/**
 * MediKredit claim primary diagnosis — RJ 762 if missing or unreadable on a line.
 * Normalizes UI input (dots allowed; trims and ups case).
 */
export function normalizeIcd10ForClaim(raw: string | undefined | null): string | undefined {
  const t = raw?.trim()
  if (!t) return undefined
  return t.replace(/\s+/g, "").toUpperCase()
}
