import type { ConnectorSearchRecord } from "./types"

const OPENALEX_BASE = "https://api.openalex.org/works"
const EUROPE_PMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
const DEFAULT_TIMEOUT_MS = 6_000

type OpenAlexWork = {
  id?: string
  display_name?: string
  publication_year?: number
  doi?: string
  ids?: {
    doi?: string
    openalex?: string
  }
  abstract_inverted_index?: Record<string, number[]>
  primary_location?: {
    landing_page_url?: string
    source?: {
      display_name?: string
    }
  }
}

type OpenAlexResponse = {
  results?: OpenAlexWork[]
}

type EuropePmcResult = {
  id?: string
  source?: string
  title?: string
  authorString?: string
  journalTitle?: string
  pubYear?: string
  doi?: string
  abstractText?: string
}

type EuropePmcResponse = {
  resultList?: {
    result?: EuropePmcResult[]
  }
}

function truncate(value: string, max = 340): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1)}…`
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function relevanceScore(query: string, text: string): number {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return 0
  const tTokens = new Set(tokenize(text))
  let overlap = 0
  for (const token of qTokens) {
    if (tTokens.has(token)) overlap += 1
  }
  return overlap / qTokens.size
}

function toDateCandidate(year: string | number | null | undefined): string | null {
  if (typeof year === "number" && Number.isFinite(year)) {
    return String(year)
  }
  if (typeof year === "string" && year.trim().length > 0) {
    return year.trim()
  }
  return null
}

function openAlexAbstractToText(index: Record<string, number[]> | undefined): string {
  if (!index) return ""
  const entries: Array<{ word: string; position: number }> = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions || []) {
      if (Number.isFinite(pos)) {
        entries.push({ word, position: pos })
      }
    }
  }
  entries.sort((a, b) => a.position - b.position)
  return entries.map((entry) => entry.word).join(" ")
}

function openAlexWorkToRecord(work: OpenAlexWork, index: number): ConnectorSearchRecord {
  const title = (work.display_name || "").trim() || `OpenAlex result ${index + 1}`
  const abstract = openAlexAbstractToText(work.abstract_inverted_index)
  const host = work.primary_location?.source?.display_name || "OpenAlex"
  const snippetCore = abstract || `${host} | ${toDateCandidate(work.publication_year) || "n.d."}`
  const doi = work.doi || work.ids?.doi || ""
  const doiUrl = doi
    ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
    : null
  const url = doiUrl || work.primary_location?.landing_page_url || work.ids?.openalex || null

  return {
    id: `openalex_${work.id || index + 1}`,
    title,
    snippet: truncate(snippetCore),
    url,
    publishedAt: toDateCandidate(work.publication_year),
    sourceLabel: "OpenAlex",
    metadata: {
      doi: doi || null,
      evidenceLevel: 3,
      studyType: "Scholarly metadata",
    },
  }
}

function europePmcResultToRecord(result: EuropePmcResult, index: number): ConnectorSearchRecord {
  const title = (result.title || "").trim() || `Europe PMC result ${index + 1}`
  const doi = (result.doi || "").trim()
  const source = (result.source || "").toUpperCase()
  const id = (result.id || "").trim()
  const articleUrl =
    doi.length > 0
      ? `https://doi.org/${doi}`
      : source.length > 0 && id.length > 0
        ? `https://europepmc.org/article/${source}/${id}`
        : "https://europepmc.org"
  const snippetCore =
    (result.abstractText || "").trim() ||
    [result.authorString, result.journalTitle, result.pubYear].filter(Boolean).join(" | ")

  return {
    id: `epmc_${source || "unknown"}_${id || index + 1}`,
    title,
    snippet: truncate(snippetCore || "Europe PMC record"),
    url: articleUrl,
    publishedAt: toDateCandidate(result.pubYear),
    sourceLabel: "Europe PMC",
    metadata: {
      doi: doi || null,
      pmid: source === "MED" ? id : null,
      evidenceLevel: 2,
      studyType: "Literature record",
    },
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Scholar API timeout after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(t)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(t)
        reject(error)
      })
  })
}

async function fetchOpenAlex(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<ConnectorSearchRecord[]> {
  const endpoint = new URL(OPENALEX_BASE)
  endpoint.searchParams.set("search", query)
  endpoint.searchParams.set("per-page", String(Math.min(Math.max(maxResults, 1), 10)))
  const contactEmail = process.env.OPENALEX_MAILTO || process.env.CONTACT_EMAIL
  if (contactEmail && contactEmail.trim().length > 0) {
    endpoint.searchParams.set("mailto", contactEmail.trim())
  }
  const response = await withTimeout(fetch(endpoint.toString()), timeoutMs)
  if (!response.ok) {
    throw new Error(`OpenAlex API ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as OpenAlexResponse
  const rows = data.results || []
  return rows.map((row, index) => openAlexWorkToRecord(row, index))
}

async function fetchEuropePmc(
  query: string,
  maxResults: number,
  timeoutMs: number
): Promise<ConnectorSearchRecord[]> {
  const endpoint = new URL(EUROPE_PMC_BASE)
  endpoint.searchParams.set("query", query)
  endpoint.searchParams.set("format", "json")
  endpoint.searchParams.set("resultType", "core")
  endpoint.searchParams.set("pageSize", String(Math.min(Math.max(maxResults, 1), 10)))
  const response = await withTimeout(fetch(endpoint.toString()), timeoutMs)
  if (!response.ok) {
    throw new Error(`Europe PMC API ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as EuropePmcResponse
  const rows = data.resultList?.result || []
  return rows.map((row, index) => europePmcResultToRecord(row, index))
}

function dedupeAndRank(
  query: string,
  records: ConnectorSearchRecord[],
  maxResults: number
): ConnectorSearchRecord[] {
  const byKey = new Map<string, { record: ConnectorSearchRecord; score: number }>()
  for (const record of records) {
    const key =
      (typeof record.metadata?.doi === "string" && record.metadata.doi.trim()) ||
      record.url ||
      record.title.toLowerCase()
    const score = relevanceScore(query, `${record.title} ${record.snippet}`)
    const existing = byKey.get(key)
    if (!existing || score > existing.score) {
      byKey.set(key, { record, score })
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.record)
    .slice(0, maxResults)
}

export async function searchScholarApi(
  query: string,
  options: { maxResults?: number; timeoutMs?: number } = {}
): Promise<{ records: ConnectorSearchRecord[]; warnings: string[] }> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 10)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const warnings: string[] = []

  const [openAlexResult, europePmcResult] = await Promise.allSettled([
    fetchOpenAlex(query, maxResults, timeoutMs),
    fetchEuropePmc(query, maxResults, timeoutMs),
  ])

  const combined: ConnectorSearchRecord[] = []
  if (openAlexResult.status === "fulfilled") {
    combined.push(...openAlexResult.value)
  } else {
    warnings.push(`OpenAlex API error: ${openAlexResult.reason instanceof Error ? openAlexResult.reason.message : "unknown error"}`)
  }
  if (europePmcResult.status === "fulfilled") {
    combined.push(...europePmcResult.value)
  } else {
    warnings.push(
      `Europe PMC API error: ${
        europePmcResult.reason instanceof Error ? europePmcResult.reason.message : "unknown error"
      }`
    )
  }

  const ranked = dedupeAndRank(query, combined, maxResults)
  if (ranked.length === 0 && warnings.length === 0) {
    warnings.push("Scholar API returned no matching records.")
  }

  return { records: ranked, warnings }
}
