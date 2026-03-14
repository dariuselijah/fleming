import Exa from "exa-js"
import { z } from "zod"

export type WebSearchResult = {
  title: string
  url: string
  snippet: string
  score: number
  publishedDate: string | null
}

export type WebSearchResponse = {
  query: string
  results: WebSearchResult[]
  warnings: string[]
  metrics: {
    cacheHit: boolean
    elapsedMs: number
    retriesUsed: number
    totalCandidates: number
  }
}

export type LiveCrawlMode = "always" | "preferred" | "fallback" | "never"

export type WebSearchOptions = {
  maxResults?: number
  timeoutMs?: number
  retries?: number
  medicalOnly?: boolean
  /** Use "preferred" or "fallback" for faster results when Exa cache is available; "always" (default) forces live crawl. */
  liveCrawl?: LiveCrawlMode
}

const DEFAULT_MAX_RESULTS = 6
const MAX_RESULTS_LIMIT = 10
const DEFAULT_TIMEOUT_MS = 1600
const DEFAULT_RETRIES = 1
const CACHE_TTL_MS = 3 * 60 * 1000

const MEDICAL_RELEVANCE_PATTERN =
  /\b(clinical|guideline|trial|diagnosis|treatment|therapy|medication|dose|contraindication|prognosis|systematic review|meta-analysis|cdc|who|nejm|jama|lancet|bmj|pubmed)\b/i

const EXA_RESULT_SCHEMA = z.object({
  title: z.string().optional().default("Untitled result"),
  url: z.string().url(),
  text: z.string().optional().default(""),
  score: z.number().optional().default(0),
  publishedDate: z.string().optional().nullable(),
})

const cache = new Map<string, { expiresAt: number; value: WebSearchResponse }>()

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ")
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    parsed.searchParams.delete("utm_source")
    parsed.searchParams.delete("utm_medium")
    parsed.searchParams.delete("utm_campaign")
    parsed.searchParams.delete("utm_term")
    parsed.searchParams.delete("utm_content")
    return parsed.toString().replace(/\/$/, "")
  } catch {
    return url.trim()
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
}

function tokenOverlapScore(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query))
  if (queryTokens.size === 0) return 0
  const textTokens = new Set(tokenize(text))
  let overlap = 0
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap += 1
  }
  return overlap / queryTokens.size
}

function summarizeText(value: string, maxLength = 320): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

function isMedicalRelevant(result: WebSearchResult, query: string): boolean {
  const searchable = `${result.title} ${result.snippet} ${query}`
  return MEDICAL_RELEVANCE_PATTERN.test(searchable)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Web search timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function callExaWithRetry(
  query: string,
  options: Required<Pick<WebSearchOptions, "maxResults" | "timeoutMs" | "retries">> & {
    liveCrawl: LiveCrawlMode
  }
): Promise<{ rows: Array<z.infer<typeof EXA_RESULT_SCHEMA>>; retriesUsed: number }> {
  const exaApiKey = process.env.EXA_API_KEY
  if (!exaApiKey) {
    throw new Error("EXA_API_KEY is not configured")
  }

  const exa = new Exa(exaApiKey)
  let attempt = 0
  let lastError: unknown = null

  while (attempt <= options.retries) {
    try {
      const response = await withTimeout(
        exa.searchAndContents(query, {
          numResults: clamp(options.maxResults * 2, options.maxResults, 20),
          text: true,
          livecrawl: options.liveCrawl,
        }) as Promise<{ results?: unknown[] }>,
        options.timeoutMs
      )

      const rawRows = Array.isArray(response?.results) ? response.results : []
      const rows = rawRows
        .map((row) => EXA_RESULT_SCHEMA.safeParse(row))
        .filter((parsed): parsed is { success: true; data: z.infer<typeof EXA_RESULT_SCHEMA> } => parsed.success)
        .map((parsed) => parsed.data)

      return {
        rows,
        retriesUsed: attempt,
      }
    } catch (error) {
      lastError = error
      attempt += 1
      if (attempt > options.retries) break
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Web search failed")
}

export function hasWebSearchConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY)
}

export async function searchWeb(
  query: string,
  options: WebSearchOptions = {}
): Promise<WebSearchResponse> {
  const startedAt = performance.now()
  const normalizedQuery = normalizeQuery(query)
  const warnings: string[] = []
  const maxResults = clamp(
    options.maxResults ?? DEFAULT_MAX_RESULTS,
    1,
    MAX_RESULTS_LIMIT
  )
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = clamp(options.retries ?? DEFAULT_RETRIES, 0, 3)
  const medicalOnly = options.medicalOnly ?? false
  const liveCrawl = options.liveCrawl ?? "always"

  if (!normalizedQuery) {
    return {
      query: normalizedQuery,
      results: [],
      warnings: ["Search query is empty."],
      metrics: {
        cacheHit: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        retriesUsed: 0,
        totalCandidates: 0,
      },
    }
  }

  const cacheKey = JSON.stringify({ normalizedQuery, maxResults, medicalOnly, liveCrawl })
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      metrics: {
        ...cached.value.metrics,
        cacheHit: true,
      },
    }
  }

  if (!hasWebSearchConfigured()) {
    warnings.push("EXA_API_KEY is missing; web search is unavailable.")
    return {
      query: normalizedQuery,
      results: [],
      warnings,
      metrics: {
        cacheHit: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        retriesUsed: 0,
        totalCandidates: 0,
      },
    }
  }

  try {
    const { rows, retriesUsed } = await callExaWithRetry(normalizedQuery, {
      maxResults,
      timeoutMs,
      retries,
      liveCrawl,
    })

    const deduped = new Map<string, WebSearchResult>()
    for (const row of rows) {
      const url = normalizeUrl(row.url)
      const candidate: WebSearchResult = {
        title: row.title || "Untitled result",
        url,
        snippet: summarizeText(row.text || ""),
        score: Number.isFinite(row.score) ? Number(row.score) : 0,
        publishedDate: row.publishedDate ?? null,
      }

      const combinedScore =
        candidate.score * 0.55 +
        tokenOverlapScore(normalizedQuery, `${candidate.title} ${candidate.snippet}`) * 0.45
      const existing = deduped.get(url)
      if (!existing || combinedScore > existing.score) {
        deduped.set(url, { ...candidate, score: combinedScore })
      }
    }

    let ranked = Array.from(deduped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults * 2)

    if (medicalOnly) {
      ranked = ranked.filter((result) => isMedicalRelevant(result, normalizedQuery))
      if (ranked.length === 0) {
        warnings.push(
          "No medical-focused results met relevance threshold; returning top general results."
        )
        ranked = Array.from(deduped.values())
          .sort((a, b) => b.score - a.score)
          .slice(0, maxResults)
      }
    }

    const results = ranked.slice(0, maxResults)
    const response: WebSearchResponse = {
      query: normalizedQuery,
      results,
      warnings,
      metrics: {
        cacheHit: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        retriesUsed,
        totalCandidates: rows.length,
      },
    }

    cache.set(cacheKey, {
      value: response,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    return response
  } catch (error) {
    warnings.push(
      error instanceof Error ? error.message : "Web search request failed."
    )
    return {
      query: normalizedQuery,
      results: [],
      warnings,
      metrics: {
        cacheHit: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        retriesUsed: retries,
        totalCandidates: 0,
      },
    }
  }
}
