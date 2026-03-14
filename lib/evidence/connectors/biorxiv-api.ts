/**
 * Native bioRxiv/medRxiv connector using the official API.
 * @see https://api.biorxiv.org/
 */

import type { ConnectorSearchRecord } from "./types"

const API_BASE = "https://api.biorxiv.org"
const REQUEST_TIMEOUT_MS = 6_000
const MAX_PAGES_PER_SERVER = 2
const PAGE_SIZE = 100
/** 5xx responses from the API are retried this many times. */
const SERVER_ERROR_RETRIES = 2

type BiorxivApiMessage = { status?: string }
type BiorxivApiPaper = {
  doi?: string
  title?: string
  authors?: string
  date?: string
  abstract?: string
  category?: string
  server?: string
}
type BiorxivApiResponse = {
  messages?: BiorxivApiMessage[]
  collection?: BiorxivApiPaper[]
}

function toDateRange(daysBack: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function paperToUrl(paper: BiorxivApiPaper, server: string): string {
  const doi = paper.doi?.trim()
  if (doi) return `https://doi.org/${doi}`
  const base = server === "medrxiv" ? "https://www.medrxiv.org" : "https://www.biorxiv.org"
  return base
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function scoreRelevance(query: string, title: string, abstract: string): number {
  const qTokens = new Set(tokenize(query))
  if (qTokens.size === 0) return 0
  const titleTokens = new Set(tokenize(title))
  const abstractTokens = new Set(tokenize(abstract))
  let score = 0
  for (const t of qTokens) {
    if (titleTokens.has(t)) score += 2
    else if (abstractTokens.has(t)) score += 1
  }
  return score / qTokens.size
}

function isRetryableServerError(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

async function fetchDetails(
  server: "biorxiv" | "medrxiv",
  startDate: string,
  endDate: string,
  cursor: number,
  signal: AbortSignal
): Promise<BiorxivApiResponse> {
  const url = `${API_BASE}/details/${server}/${startDate}/${endDate}/${cursor}/json`
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  })
  if (!res.ok) {
    const err = new Error(`bioRxiv API ${res.status}: ${res.statusText}`) as Error & {
      status?: number
      retryable?: boolean
    }
    err.status = res.status
    err.retryable = isRetryableServerError(res.status)
    throw err
  }
  const data = (await res.json()) as BiorxivApiResponse
  const msg = data.messages?.[0]?.status
  if (msg && msg.toLowerCase().includes("date") && !data.collection?.length) {
    throw new Error(`bioRxiv API: ${msg}`)
  }
  return data
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`bioRxiv API timeout after ${ms}ms`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(t))
  })
}

/**
 * Fetch preprints from bioRxiv API, filter by query, return connector records.
 */
export async function searchBiorxivApi(
  query: string,
  options: {
    maxResults?: number
    medicalOnly?: boolean
    timeoutMs?: number
  } = {}
): Promise<{ records: ConnectorSearchRecord[]; warnings: string[] }> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 10)
  const medicalOnly = options.medicalOnly ?? false
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const warnings: string[] = []
  const controller = new AbortController()
  const signal = controller.signal

  const { start: startDate, end: endDate } = toDateRange(60)
  const servers: ("biorxiv" | "medrxiv")[] = medicalOnly ? ["medrxiv"] : ["biorxiv", "medrxiv"]

  const allPapers: (BiorxivApiPaper & { server: string })[] = []

  async function fetchPage(
    server: "biorxiv" | "medrxiv",
    cursor: number
  ): Promise<BiorxivApiPaper[]> {
    const maxAttempts = 1 + SERVER_ERROR_RETRIES // 1 initial + 2 retries on 5xx/timeout
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await withTimeout(
          fetchDetails(server, startDate, endDate, cursor, signal),
          timeoutMs
        )
        return data.collection ?? []
      } catch (e) {
        const isRetryable =
          (e as Error & { retryable?: boolean }).retryable === true ||
          /timeout|503|502|504/i.test((e as Error).message ?? "")
        if (!isRetryable || attempt === maxAttempts - 1) throw e
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    return []
  }

  try {
    for (const server of servers) {
      for (let page = 0; page < MAX_PAGES_PER_SERVER; page++) {
        const cursor = page * PAGE_SIZE
        const collection = await fetchPage(server, cursor)
        for (const paper of collection) {
          allPapers.push({ ...paper, server })
        }
        if (collection.length < PAGE_SIZE) break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      records: [],
      warnings: [`bioRxiv API error: ${message}`],
    }
  }

  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return {
      records: allPapers
        .slice(0, maxResults)
        .map((p, i) => toRecord(p, i)),
      warnings,
    }
  }

  const scored = allPapers
    .map((paper) => {
      const title = paper.title ?? ""
      const abstract = paper.abstract ?? ""
      const score = scoreRelevance(normalizedQuery, title, abstract)
      return { paper, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults * 2)

  const records: ConnectorSearchRecord[] = scored.slice(0, maxResults).map(({ paper }, i) => toRecord(paper, i))

  return { records, warnings }
}

function toRecord(paper: BiorxivApiPaper & { server?: string }, index: number): ConnectorSearchRecord {
  const server = (paper.server ?? "biorxiv").toLowerCase()
  const sourceLabel = server === "medrxiv" ? "medRxiv" : "bioRxiv"
  const title = (paper.title ?? "Untitled").trim()
  const abstract = (paper.abstract ?? "").trim()
  const snippet = abstract.length > 320 ? `${abstract.slice(0, 319)}…` : abstract
  const url = paperToUrl(paper, server)
  const publishedAt = paper.date?.trim() ? paper.date.slice(0, 10) : null
  const doi = paper.doi?.trim() ?? undefined

  return {
    id: `biorxiv_${server}_${index + 1}`,
    title: title || "Untitled",
    snippet: snippet || title,
    url,
    publishedAt,
    sourceLabel,
    metadata: doi ? { doi } : undefined,
  }
}
