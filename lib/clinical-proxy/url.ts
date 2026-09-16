/**
 * Base URL for SA Health Codes reference-data service (Medprax replacement).
 * When set, Fleming routes catalogue lookups here; MediKredit stays on CLINICAL_PROXY_URL.
 */
export function getSaReferenceDataBase(): string | null {
  const u = process.env.SA_REFERENCE_DATA_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

/**
 * Catalogue base: SA Health Codes first, else clinical proxy (legacy Medprax).
 */
export function getCatalogueProxyBase(): string | null {
  return getSaReferenceDataBase() || getClinicalProxyBase()
}

/**
 * Base URL for xai-proxy (e.g. http://localhost:3001) — no trailing slash.
 * Used for MediKredit JSON proxy. Catalogue may use SA_REFERENCE_DATA_URL instead.
 */
export function getClinicalProxyBase(): string | null {
  const u = process.env.CLINICAL_PROXY_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}
