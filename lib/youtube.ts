type YouTubeSafeSearch = "none" | "moderate" | "strict"

export type YouTubeSearchOptions = {
  maxResults?: number
  regionCode?: string
  relevanceLanguage?: string
  safeSearch?: YouTubeSafeSearch
  medicalOnly?: boolean
  cacheTtlMs?: number
}

export type YouTubeVideoResult = {
  videoId: string
  url: string
  title: string
  description: string
  channelTitle: string
  publishedAt: string | null
  thumbnailUrl: string | null
  duration?: string
  viewCount?: number
  trustedScore: number
}

export type YouTubeSearchResponse = {
  results: YouTubeVideoResult[]
  warnings: string[]
  metrics: {
    cacheHit: boolean
    elapsedMs: number
    searchCalls: number
    videosCalls: number
    quotaUnitsEstimate: number
  }
}

type YouTubeSearchListResponse = {
  items?: Array<{
    id?: {
      videoId?: string
    }
    snippet?: {
      title?: string
      description?: string
      channelTitle?: string
      publishedAt?: string
      thumbnails?: {
        high?: { url?: string }
        medium?: { url?: string }
        default?: { url?: string }
      }
    }
  }>
}

type YouTubeVideosListResponse = {
  items?: Array<{
    id?: string
    contentDetails?: {
      duration?: string
    }
    statistics?: {
      viewCount?: string
    }
  }>
}

type RankedYouTubeResult = YouTubeVideoResult & {
  score: number
  medicalScore: number
}

type CachedYouTubeSearch = {
  expiresAt: number
  value: YouTubeSearchResponse
}

const CACHE_KEY_PREFIX = "youtube-search-v1"
const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_RETRIES = 2
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 200

const youtubeSearchCache = new Map<string, CachedYouTubeSearch>()

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "what",
  "when",
  "where",
  "how",
  "show",
  "me",
  "do",
  "is",
  "are",
  "can",
  "you",
])

const TRUSTED_MEDICAL_CHANNEL_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /\bamerican heart association\b/i, score: 1.0 },
  { pattern: /\baha\b/i, score: 0.9 },
  { pattern: /\bred cross\b/i, score: 1.0 },
  { pattern: /\bworld health organization\b/i, score: 1.0 },
  { pattern: /\bwho\b/i, score: 0.8 },
  { pattern: /\bnational health service\b|\bnhs\b/i, score: 0.9 },
  { pattern: /\bnejm\b|\bnew england journal of medicine\b/i, score: 0.85 },
  { pattern: /\bjama\b/i, score: 0.85 },
  { pattern: /\bcdc\b/i, score: 0.9 },
  { pattern: /\bmayo clinic\b/i, score: 0.9 },
  { pattern: /\bcleveland clinic\b/i, score: 0.9 },
  { pattern: /\bjohns hopkins\b/i, score: 0.9 },
  { pattern: /\bmedscape\b/i, score: 0.75 },
  { pattern: /\bambu\b|\bresuscitation\b/i, score: 0.7 },
]

const MEDICAL_RELEVANCE_PATTERN =
  /\b(cpr|resuscitation|history taking|history-taking|osce|clinical|medical|medicine|patient|exam|procedure|emergency|airway|breathing|circulation|bls|acls|first aid|triage)\b/i

const EDUCATIONAL_PATTERN =
  /\b(tutorial|how to|walkthrough|demonstration|demo|step[- ]?by[- ]?step|guide|explained)\b/i

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function tokenize(text: string): string[] {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token))
}

function computeTokenOverlapScore(query: string, text: string): number {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return 0
  const haystack = new Set(tokenize(text))
  if (haystack.size === 0) return 0
  const overlap = queryTokens.filter((token) => haystack.has(token)).length
  return overlap / queryTokens.length
}

function computeTrustedChannelScore(channelTitle: string): number {
  if (!channelTitle) return 0
  for (const entry of TRUSTED_MEDICAL_CHANNEL_PATTERNS) {
    if (entry.pattern.test(channelTitle)) {
      return entry.score
    }
  }
  if (/\b(medical|medicine|health|hospital|clinic)\b/i.test(channelTitle)) {
    return 0.45
  }
  return 0
}

function computeMedicalScore(query: string, title: string, description: string, channelTitle: string): number {
  const querySuggestsMedical = MEDICAL_RELEVANCE_PATTERN.test(query)
  const text = `${title} ${description} ${channelTitle}`.trim()
  const explicitMedicalSignal = MEDICAL_RELEVANCE_PATTERN.test(text)
  if (!querySuggestsMedical && !explicitMedicalSignal) return 0.2
  if (explicitMedicalSignal) return 1
  return 0.35
}

function computeRecencyBoost(publishedAt: string | null): number {
  if (!publishedAt) return 0
  const publishedMs = Date.parse(publishedAt)
  if (!Number.isFinite(publishedMs)) return 0
  const ageMs = Date.now() - publishedMs
  if (ageMs < 0) return 0
  const yearMs = 365 * 24 * 60 * 60 * 1000
  if (ageMs <= yearMs) return 0.12
  if (ageMs <= 3 * yearMs) return 0.08
  if (ageMs <= 5 * yearMs) return 0.04
  return 0
}

function computePopularityBoost(viewCount?: number): number {
  if (!viewCount || !Number.isFinite(viewCount) || viewCount <= 0) return 0
  return Math.min(Math.log10(viewCount + 1) / 20, 0.08)
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === "AbortError") return true
  return /fetch|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN/i.test(
    error.message
  )
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return "Unknown YouTube API error."
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchJsonWithRetry<T>(
  url: string,
  options?: {
    timeoutMs?: number
    retries?: number
  }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options?.retries ?? DEFAULT_RETRIES

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "User-Agent": "fleming-youtube-client (gzip)",
        },
      })

      if (!response.ok) {
        const textBody = await response.text().catch(() => "")
        const message = `YouTube API request failed (${response.status}): ${textBody.slice(0, 220)}`
        if (attempt < retries && isRetryableStatus(response.status)) {
          const delayMs = 200 * Math.pow(2, attempt)
          await sleep(delayMs)
          continue
        }
        throw new Error(message)
      }

      return (await response.json()) as T
    } catch (error) {
      if (attempt < retries && isRetryableError(error)) {
        const delayMs = 200 * Math.pow(2, attempt)
        await sleep(delayMs)
        continue
      }
      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  throw new Error("Failed YouTube request after retries.")
}

function getBestThumbnailUrl(thumbnails?: {
  high?: { url?: string }
  medium?: { url?: string }
  default?: { url?: string }
}): string | null {
  return (
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    null
  )
}

function maybeTrimDescription(description: string): string {
  const normalized = normalizeWhitespace(description)
  return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized
}

function maybePruneCache(): void {
  if (youtubeSearchCache.size < MAX_CACHE_ENTRIES) return
  const now = Date.now()
  for (const [key, entry] of youtubeSearchCache.entries()) {
    if (entry.expiresAt <= now) {
      youtubeSearchCache.delete(key)
    }
  }
  if (youtubeSearchCache.size < MAX_CACHE_ENTRIES) return
  youtubeSearchCache.clear()
}

function cloneSearchResponse(value: YouTubeSearchResponse): YouTubeSearchResponse {
  return JSON.parse(JSON.stringify(value)) as YouTubeSearchResponse
}

export async function searchYouTubeVideos(
  query: string,
  options?: YouTubeSearchOptions
): Promise<YouTubeSearchResponse> {
  const start = Date.now()
  const normalizedQuery = normalizeWhitespace(query)
  const maxResults = clampNumber(options?.maxResults ?? 8, 7, 9)
  const regionCode = (options?.regionCode || "US").toUpperCase()
  const relevanceLanguage = (options?.relevanceLanguage || "en").toLowerCase()
  const safeSearch = options?.safeSearch || "strict"
  const medicalOnly = options?.medicalOnly ?? true
  const cacheTtlMs = clampNumber(
    options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    10_000,
    15 * 60 * 1000
  )
  const warnings: string[] = []

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return {
      results: [],
      warnings: ["YouTube search query is too short."],
      metrics: {
        cacheHit: false,
        elapsedMs: Date.now() - start,
        searchCalls: 0,
        videosCalls: 0,
        quotaUnitsEstimate: 0,
      },
    }
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return {
      results: [],
      warnings: ["YOUTUBE_API_KEY is not configured; skipping YouTube search."],
      metrics: {
        cacheHit: false,
        elapsedMs: Date.now() - start,
        searchCalls: 0,
        videosCalls: 0,
        quotaUnitsEstimate: 0,
      },
    }
  }

  const cacheKey = [
    CACHE_KEY_PREFIX,
    normalizedQuery.toLowerCase(),
    maxResults,
    regionCode,
    relevanceLanguage,
    safeSearch,
    medicalOnly ? "medical-only" : "all",
  ].join("|")
  const now = Date.now()
  const cached = youtubeSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    const fromCache = cloneSearchResponse(cached.value)
    fromCache.metrics.cacheHit = true
    fromCache.metrics.elapsedMs = Date.now() - start
    return fromCache
  }

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: normalizedQuery,
    maxResults: String(maxResults),
    safeSearch,
    regionCode,
    relevanceLanguage,
    key: apiKey,
    fields:
      "items(id/videoId,snippet/title,snippet/description,snippet/channelTitle,snippet/publishedAt,snippet/thumbnails/default/url,snippet/thumbnails/medium/url,snippet/thumbnails/high/url)",
  })

  let searchCalls = 0
  let videosCalls = 0

  try {
    const searchResponse = await fetchJsonWithRetry<YouTubeSearchListResponse>(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`
    )
    searchCalls += 1
    const searchItems = searchResponse.items || []

    if (searchItems.length === 0) {
      return {
        results: [],
        warnings: ["No YouTube videos found for this query."],
        metrics: {
          cacheHit: false,
          elapsedMs: Date.now() - start,
          searchCalls,
          videosCalls,
          quotaUnitsEstimate: searchCalls * 100 + videosCalls,
        },
      }
    }

    const seedResults: YouTubeVideoResult[] = searchItems
      .map((item) => {
        const videoId = item.id?.videoId || ""
        const snippet = item.snippet
        if (!videoId || !snippet?.title) return null
        return {
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: normalizeWhitespace(snippet.title),
          description: maybeTrimDescription(snippet.description || ""),
          channelTitle: normalizeWhitespace(snippet.channelTitle || "Unknown channel"),
          publishedAt: snippet.publishedAt || null,
          thumbnailUrl: getBestThumbnailUrl(snippet.thumbnails),
          trustedScore: Number(
            computeTrustedChannelScore(snippet.channelTitle || "").toFixed(2)
          ),
        }
      })
      .filter((item): item is YouTubeVideoResult => Boolean(item))

    const videoIds = seedResults.map((result) => result.videoId).filter(Boolean)
    const detailsById = new Map<string, { duration?: string; viewCount?: number }>()
    if (videoIds.length > 0) {
      const videosParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: videoIds.join(","),
        key: apiKey,
        fields: "items/id,items/contentDetails/duration,items/statistics/viewCount",
      })
      const videosResponse = await fetchJsonWithRetry<YouTubeVideosListResponse>(
        `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`,
        { timeoutMs: 3500 }
      )
      videosCalls += 1
      for (const item of videosResponse.items || []) {
        const id = item.id
        if (!id) continue
        const rawViewCount = Number(item.statistics?.viewCount || NaN)
        detailsById.set(id, {
          duration: item.contentDetails?.duration,
          viewCount: Number.isFinite(rawViewCount) ? rawViewCount : undefined,
        })
      }
    }

    const ranked: RankedYouTubeResult[] = seedResults.map((result) => {
      const details = detailsById.get(result.videoId)
      const titleAndDescription = `${result.title} ${result.description}`.trim()
      const relevanceScore = computeTokenOverlapScore(normalizedQuery, titleAndDescription)
      const trustedScore = computeTrustedChannelScore(result.channelTitle)
      const medicalScore = computeMedicalScore(
        normalizedQuery,
        result.title,
        result.description,
        result.channelTitle
      )
      const educationalBoost = EDUCATIONAL_PATTERN.test(titleAndDescription) ? 0.1 : 0
      const recencyBoost = computeRecencyBoost(result.publishedAt)
      const popularityBoost = computePopularityBoost(details?.viewCount)
      const score =
        relevanceScore * 0.58 +
        medicalScore * 0.18 +
        trustedScore * 0.14 +
        educationalBoost +
        recencyBoost +
        popularityBoost

      return {
        ...result,
        duration: details?.duration,
        viewCount: details?.viewCount,
        trustedScore: Number(trustedScore.toFixed(2)),
        medicalScore,
        score,
      }
    })

    const rankedSorted = ranked.sort((a, b) => b.score - a.score)
    const medicalFiltered = medicalOnly
      ? rankedSorted.filter(
          (item) =>
            item.medicalScore >= 0.4 ||
            item.trustedScore >= 0.6 ||
            item.score >= 0.5
        )
      : rankedSorted
    const selected = (medicalFiltered.length > 0 ? medicalFiltered : rankedSorted).slice(
      0,
      maxResults
    )

    if (medicalOnly && medicalFiltered.length === 0 && rankedSorted.length > 0) {
      warnings.push("No strongly medical matches found; returned best general matches.")
    }

    const response: YouTubeSearchResponse = {
      results: selected.map((item) => ({
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        description: item.description,
        channelTitle: item.channelTitle,
        publishedAt: item.publishedAt,
        thumbnailUrl: item.thumbnailUrl,
        duration: item.duration,
        viewCount: item.viewCount,
        trustedScore: item.trustedScore,
      })),
      warnings,
      metrics: {
        cacheHit: false,
        elapsedMs: Date.now() - start,
        searchCalls,
        videosCalls,
        quotaUnitsEstimate: searchCalls * 100 + videosCalls,
      },
    }

    maybePruneCache()
    youtubeSearchCache.set(cacheKey, {
      expiresAt: now + cacheTtlMs,
      value: cloneSearchResponse(response),
    })

    return response
  } catch (error) {
    return {
      results: [],
      warnings: [`YouTube lookup failed: ${toSafeErrorMessage(error)}`],
      metrics: {
        cacheHit: false,
        elapsedMs: Date.now() - start,
        searchCalls,
        videosCalls,
        quotaUnitsEstimate: searchCalls * 100 + videosCalls,
      },
    }
  }
}
