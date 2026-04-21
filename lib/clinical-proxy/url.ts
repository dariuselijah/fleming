/**
 * Base URL for xai-proxy (e.g. http://localhost:3001) — no trailing slash.
 * Used for MediKredit JSON proxy and Medprax routes per API_REQUESTS_MEDIKREDIT_MEDPRAX.md.
 */
export function getClinicalProxyBase(): string | null {
  const u = process.env.CLINICAL_PROXY_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}
