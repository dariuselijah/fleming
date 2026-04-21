/**
 * PubMed Bulk Ingestion Utilities
 *
 * Provides helpers for:
 * - Fetching recent PubMed articles for incremental (delta) sync
 * - Building the delta query with date ranges
 * - Invalidating retrieval caches after ingestion
 *
 * The heavy-lifting XML parser and chunk/embed pipeline lives in the
 * existing ingest-pubmed-bulk.ts script; this module adds the delta
 * coordination layer.
 */

import {
  invalidateEvidenceCache,
  invalidatePubMedCache,
} from "../cache/retrieval-cache"

const DEFAULT_DELTA_DAYS = 7

/**
 * Build a PubMed E-utilities query for articles added/revised in the last N days.
 * Adds common clinical quality filters.
 */
export function buildDeltaQuery(options: {
  relDays?: number
  highEvidence?: boolean
  meshTerms?: string[]
}): string {
  const relDays = options.relDays ?? DEFAULT_DELTA_DAYS
  const parts: string[] = [`reldate=${relDays}`]

  if (options.highEvidence) {
    parts.push(
      '("meta-analysis"[pt] OR "systematic review"[pt] OR "randomized controlled trial"[pt] OR "practice guideline"[pt] OR "guideline"[pt])',
    )
  }

  if (options.meshTerms && options.meshTerms.length > 0) {
    const meshFilter = options.meshTerms
      .map((t) => `"${t}"[MeSH]`)
      .join(" OR ")
    parts.push(`(${meshFilter})`)
  }

  return parts.join(" AND ")
}

/**
 * Fetch recent PubMed IDs for delta sync via E-utilities esearch.
 */
export async function fetchDeltaPmids(options: {
  /** Full PubMed query term (overrides built-in delta query when set). */
  term?: string
  relDays?: number
  highEvidence?: boolean
  meshTerms?: string[]
  maxResults?: number
  apiKey?: string
}): Promise<string[]> {
  const query = options.term?.trim() ? options.term : buildDeltaQuery(options)
  const maxResults = options.maxResults ?? 500
  const url = new URL(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
  )
  url.searchParams.set("db", "pubmed")
  url.searchParams.set("term", query)
  url.searchParams.set("retmax", String(maxResults))
  url.searchParams.set("retmode", "json")
  url.searchParams.set("sort", "pub_date")
  if (options.apiKey) url.searchParams.set("api_key", options.apiKey)

  const response = await fetch(url.toString())
  if (!response.ok) {
    console.error("[Delta Sync] esearch failed:", response.status)
    return []
  }

  const data = await response.json()
  return data.esearchresult?.idlist || []
}

/**
 * Run post-ingestion cache invalidation.
 * Call this after new articles are stored in medical_evidence.
 */
export async function postIngestionCacheFlush(): Promise<void> {
  const evicted = await invalidateEvidenceCache()
  const pubmedEvicted = await invalidatePubMedCache()
  console.log(
    `[Delta Sync] Cache invalidated: ${evicted} evidence keys, ${pubmedEvicted} PubMed keys`,
  )
}
