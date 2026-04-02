/**
 * PubMed API utility for fetching publication details
 * Uses NCBI E-utilities API
 */

import {
  getPubMedCache,
  setPubMedCache,
  type PubMedCacheEntry,
} from "../cache/retrieval-cache"

export interface PubMedArticle {
  pmid: string
  pmcid?: string
  title: string
  authors: string[]
  journal: string
  year: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  abstract?: string
  url: string
}

export interface PubMedSearchResult {
  articles: PubMedArticle[]
  totalResults: number
}

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PUBMED_HTTP_TIMEOUT_MS || "8000", 10)
const PUBMED_MAX_RETRIES = Number.parseInt(process.env.PUBMED_HTTP_RETRIES || "2", 10)
const RETRY_BASE_DELAY_MS = 250
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000
const ARTICLE_CACHE_TTL_MS = 60 * 60 * 1000

const searchCache = new Map<string, CacheEntry<PubMedSearchResult>>()
const articleCache = new Map<string, CacheEntry<PubMedArticle | null>>()

function getNcbiApiKey(): string | null {
  const raw = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  return trimmed.length > 0 ? trimmed : null
}

function buildCacheKeyForSearch(query: string, maxResults: number): string {
  return `${query.trim().toLowerCase()}::${maxResults}`
}

function clonePubMedArticle(article: PubMedArticle): PubMedArticle {
  return {
    ...article,
    authors: Array.isArray(article.authors) ? [...article.authors] : [],
  }
}

function clonePubMedSearchResult(result: PubMedSearchResult): PubMedSearchResult {
  return {
    totalResults: result.totalResults,
    articles: result.articles.map(clonePubMedArticle),
  }
}

function getFromCache<T>(
  store: Map<string, CacheEntry<T>>,
  key: string
): { hit: boolean; value: T | null } {
  const cached = store.get(key)
  if (!cached) return { hit: false, value: null }
  if (Date.now() >= cached.expiresAt) {
    store.delete(key)
    return { hit: false, value: null }
  }
  return { hit: true, value: cached.value }
}

function setCache<T>(store: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function appendNcbiApiKey(url: URL): void {
  const apiKey = getNcbiApiKey()
  if (apiKey) {
    url.searchParams.set("api_key", apiKey)
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── NCBI Request Queue ─────────────────────────────────────────────────────
// Rate-limits outbound calls: 3 req/sec with API key, 1 req/sec without.
const NCBI_MAX_CONCURRENT = getNcbiApiKey() ? 3 : 1
const NCBI_MIN_INTERVAL_MS = getNcbiApiKey() ? 340 : 1050

let ncbiInFlight = 0
let ncbiLastRequestTime = 0
const ncbiQueue: Array<{ resolve: () => void }> = []

async function acquireNcbiSlot(): Promise<void> {
  while (ncbiInFlight >= NCBI_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => ncbiQueue.push({ resolve }))
  }
  const elapsed = Date.now() - ncbiLastRequestTime
  if (elapsed < NCBI_MIN_INTERVAL_MS) {
    await sleep(NCBI_MIN_INTERVAL_MS - elapsed)
  }
  ncbiInFlight++
  ncbiLastRequestTime = Date.now()
}

function releaseNcbiSlot(): void {
  ncbiInFlight--
  const next = ncbiQueue.shift()
  if (next) next.resolve()
}

async function safeFetch(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = PUBMED_MAX_RETRIES
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await acquireNcbiSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (response.ok) return response
      if (!shouldRetryStatus(response.status) || attempt >= retries) return null
    } catch {
      if (attempt >= retries) return null
    } finally {
      clearTimeout(timer)
      releaseNcbiSlot()
    }

    // Exponential backoff with full jitter: random(0, base * 2^attempt)
    const maxDelayMs = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, 8000)
    const jitteredMs = Math.floor(Math.random() * maxDelayMs)
    await sleep(jitteredMs)
  }
  return null
}

/**
 * Search PubMed by query string
 */
export async function searchPubMed(
  query: string,
  maxResults: number = 10
): Promise<PubMedSearchResult> {
  // L0: in-process Map cache (fastest)
  const cacheKey = buildCacheKeyForSearch(query, maxResults)
  const cached = getFromCache(searchCache, cacheKey)
  if (cached.hit && cached.value) {
    return clonePubMedSearchResult(cached.value)
  }

  // L2: Redis cache (survives restarts, shared across instances)
  try {
    const redisEntry = await getPubMedCache(query, maxResults)
    if (redisEntry && redisEntry.articles.length > 0) {
      const restored: PubMedSearchResult = {
        articles: redisEntry.articles as PubMedArticle[],
        totalResults: redisEntry.totalResults,
      }
      setCache(searchCache, cacheKey, clonePubMedSearchResult(restored), SEARCH_CACHE_TTL_MS)
      return restored
    }
  } catch {
    // Redis miss or error – proceed to live fetch
  }

  try {
    const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi")
    searchUrl.searchParams.set("db", "pubmed")
    searchUrl.searchParams.set("term", query)
    searchUrl.searchParams.set("retmax", String(maxResults))
    searchUrl.searchParams.set("retmode", "json")
    searchUrl.searchParams.set("sort", "relevance")
    appendNcbiApiKey(searchUrl)
    
    const searchResponse = await safeFetch(searchUrl.toString())
    if (!searchResponse) {
      return { articles: [], totalResults: 0 }
    }
    const searchData = await searchResponse.json()
    
    const pmids = searchData.esearchresult?.idlist || []
    
    if (pmids.length === 0) {
      return { articles: [], totalResults: 0 }
    }
    
    const articles = await fetchPubMedArticles(pmids)

    const result: PubMedSearchResult = {
      articles,
      totalResults: parseInt(searchData.esearchresult?.count || '0', 10)
    }

    // Populate both cache tiers
    setCache(searchCache, cacheKey, clonePubMedSearchResult(result), SEARCH_CACHE_TTL_MS)
    setPubMedCache(query, maxResults, {
      pmids,
      totalResults: result.totalResults,
      articles: result.articles,
    }).catch(() => {})

    return result
  } catch {
    return { articles: [], totalResults: 0 }
  }
}

/**
 * Fetch article details by PMID
 */
export async function fetchPubMedArticle(pmid: string): Promise<PubMedArticle | null> {
  const cacheKey = pmid.trim()
  const cached = getFromCache(articleCache, cacheKey)
  if (cached.hit) {
    return cached.value ? clonePubMedArticle(cached.value) : null
  }

  const articles = await fetchPubMedArticles([pmid])
  const article = articles[0] || null
  setCache(articleCache, cacheKey, article ? clonePubMedArticle(article) : null, ARTICLE_CACHE_TTL_MS)
  return article
}

/**
 * Fetch multiple articles by PMIDs
 */
async function fetchPubMedArticles(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return []

  const normalizedPmids = Array.from(
    new Set(
      pmids
        .map((pmid) => pmid.trim())
        .filter((pmid) => pmid.length > 0)
    )
  )

  const cachedArticles: PubMedArticle[] = []
  const missingPmids: string[] = []
  for (const pmid of normalizedPmids) {
    const cached = getFromCache(articleCache, pmid)
    if (cached.hit) {
      if (cached.value) cachedArticles.push(clonePubMedArticle(cached.value))
      continue
    }
    missingPmids.push(pmid)
  }

  if (missingPmids.length === 0) {
    return cachedArticles
  }

  try {
    const fetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi")
    fetchUrl.searchParams.set("db", "pubmed")
    fetchUrl.searchParams.set("id", missingPmids.join(","))
    fetchUrl.searchParams.set("retmode", "xml")
    appendNcbiApiKey(fetchUrl)

    const response = await safeFetch(fetchUrl.toString())
    if (!response) {
      return cachedArticles
    }
    const xmlText = await response.text()
    
    // Parse XML (simplified parser - in production, use a proper XML parser)
    const fetchedArticles = parsePubMedXML(xmlText)
    const fetchedByPmid = new Map<string, PubMedArticle>()
    fetchedArticles.forEach((article) => {
      fetchedByPmid.set(article.pmid, article)
      setCache(articleCache, article.pmid, clonePubMedArticle(article), ARTICLE_CACHE_TTL_MS)
    })
    // Cache misses for a shorter period to avoid repeatedly hitting PubMed for bad PMIDs.
    missingPmids.forEach((pmid) => {
      if (!fetchedByPmid.has(pmid)) {
        setCache(articleCache, pmid, null, 5 * 60 * 1000)
      }
    })

    return [...cachedArticles, ...fetchedArticles]
  } catch {
    return cachedArticles
  }
}

/**
 * Parse PubMed XML response
 */
function parsePubMedXML(xmlText: string): PubMedArticle[] {
  const articles: PubMedArticle[] = []
  
  // Simple regex-based parsing (for production, use DOMParser or xml2js)
  const articleMatches = xmlText.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)
  
  for (const match of articleMatches) {
    const articleXml = match[1]
    
    const pmid = extractXMLValue(articleXml, 'PMID')
    const title = extractXMLValue(articleXml, 'ArticleTitle')
    const journal = extractXMLValue(articleXml, 'Title') || extractXMLValue(articleXml, 'MedlineTA')
    const year = extractXMLValue(articleXml, 'Year') || extractXMLValue(articleXml, 'PubDate', 'Year')
    const volume = extractXMLValue(articleXml, 'Volume')
    const issue = extractXMLValue(articleXml, 'Issue')
    const pages = extractXMLValue(articleXml, 'MedlinePgn') || extractXMLValue(articleXml, 'Pages')
    
    // Extract DOI - can be in ELocationID with EIdType="doi" or in ArticleIdList
    let doi = extractXMLValue(articleXml, 'ELocationID')
    if (!doi || !doi.toLowerCase().includes('doi')) {
      // Try ArticleIdList
      const articleIdMatches = articleXml.matchAll(/<ArticleId[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/gi)
      for (const match of articleIdMatches) {
        doi = match[1].trim()
        break
      }
    }
    // Clean DOI if it contains "doi:" prefix
    if (doi) {
      doi = doi.replace(/^doi:/i, '').trim()
    }

    const pmcidMatch = articleXml.match(
      /<ArticleId[^>]*IdType="pmc"[^>]*>([\s\S]*?)<\/ArticleId>/i
    )
    const pmcid = pmcidMatch?.[1] ? cleanXMLText(pmcidMatch[1]) : undefined
    
    const abstract = extractXMLValue(articleXml, 'AbstractText')
    
    // Extract authors
    const authors: string[] = []
    const authorMatches = articleXml.matchAll(/<Author>([\s\S]*?)<\/Author>/g)
    for (const authorMatch of authorMatches) {
      const authorXml = authorMatch[1]
      const lastName = extractXMLValue(authorXml, 'LastName')
      const firstName = extractXMLValue(authorXml, 'ForeName')
      const initials = extractXMLValue(authorXml, 'Initials')
      
      if (lastName) {
        const authorName = firstName 
          ? `${lastName} ${initials || firstName.charAt(0)}`
          : lastName
        authors.push(authorName)
      }
    }
    
    if (pmid && title) {
      articles.push({
        pmid,
        title: cleanXMLText(title),
        authors,
        journal: cleanXMLText(journal || ''),
        year: year || '',
        volume,
        issue,
        pages,
        doi,
        pmcid,
        abstract: abstract ? cleanXMLText(abstract) : undefined,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
      })
    }
  }
  
  return articles
}

/**
 * Extract value from XML by tag name
 */
function extractXMLValue(xml: string, tagName: string, ...parentTags: string[]): string | undefined {
  let searchXml = xml
  
  // Navigate through parent tags if provided
  for (const parentTag of parentTags) {
    const parentMatch = searchXml.match(new RegExp(`<${parentTag}[^>]*>([\\s\\S]*?)</${parentTag}>`, 'i'))
    if (parentMatch) {
      searchXml = parentMatch[1]
    }
  }
  
  const match = searchXml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'))
  return match ? match[1].trim() : undefined
}

/**
 * Clean XML text (remove CDATA, decode entities, etc.)
 */
function cleanXMLText(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/**
 * Search PubMed by DOI
 */
export async function searchPubMedByDOI(doi: string): Promise<PubMedArticle | null> {
  // Remove 'doi:' prefix if present
  const cleanDOI = doi.replace(/^doi:/i, '').trim()
  const query = `${cleanDOI}[DOI]`
  const result = await searchPubMed(query, 1)
  return result.articles[0] || null
}

/**
 * Search PubMed by title (fuzzy match)
 */
export async function searchPubMedByTitle(title: string): Promise<PubMedArticle | null> {
  const query = `"${title}"[Title]`
  const result = await searchPubMed(query, 1)
  return result.articles[0] || null
}

