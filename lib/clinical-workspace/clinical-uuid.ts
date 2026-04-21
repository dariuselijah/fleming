/** Accepts any canonical UUID string (Postgres gen_random_uuid format). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPracticePatientUuid(id: string): boolean {
  return UUID_RE.test(id.trim())
}
