import type { ConnectorSearchRecord } from "./types"

const CMS_API_BASE = "https://api.coverage.cms.gov"
const DEFAULT_TIMEOUT_MS = 7_000

type CmsApiEnvelope<T> = {
  meta?: {
    status?: {
      id?: number
      message?: string
    }
    notes?: string
  }
  data?: T[]
  message?: string
}

type CmsLcdRecord = {
  lcd_id?: string | number
  display_id?: string
  title?: string
  determination_type_description?: string
  coding_information?: string
  effective_date?: string
  revision_date?: string
  contractor_name?: string
  contractor_number?: string
  primary_geo?: string
}

type CmsArticleRecord = {
  article_id?: string | number
  display_id?: string
  title?: string
  article_type_description?: string
  coding_information?: string
  effective_date?: string
  revision_date?: string
  contractor_name?: string
  contractor_number?: string
  primary_geo?: string
}

function toIsoDateCandidate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, 10)
}

function trimNumericId(value: string): string | null {
  const numeric = value.replace(/[^0-9]/g, "")
  return numeric.length > 0 ? numeric : null
}

function extractLcdIds(query: string): string[] {
  const matches = query.match(/\bL?\d{5,7}\b/gi) || []
  const ids = new Set<string>()
  for (const match of matches) {
    const numeric = trimNumericId(match)
    if (numeric) ids.add(numeric)
  }
  return Array.from(ids)
}

function extractArticleIds(query: string): string[] {
  const matches = query.match(/\bA?\d{5,7}\b/gi) || []
  const ids = new Set<string>()
  for (const match of matches) {
    const numeric = trimNumericId(match)
    if (numeric) ids.add(numeric)
  }
  return Array.from(ids)
}

function formatLcdUrl(displayId: string | null, lcdId: string): string {
  const preferred = displayId && displayId.trim().length > 0 ? displayId.trim() : `L${lcdId}`
  return `https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?LCDId=${encodeURIComponent(
    preferred
  )}`
}

function formatArticleUrl(displayId: string | null, articleId: string): string {
  const preferred =
    displayId && displayId.trim().length > 0 ? displayId.trim() : `A${articleId}`
  return `https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=${encodeURIComponent(
    preferred
  )}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CMS Coverage API timeout after ${timeoutMs}ms`)), timeoutMs)
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

async function getCmsLicenseToken(timeoutMs: number): Promise<string> {
  const endpoint = `${CMS_API_BASE}/v1/metadata/license-agreement`
  const response = await withTimeout(fetch(endpoint), timeoutMs)
  if (!response.ok) {
    throw new Error(`CMS license endpoint ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as CmsApiEnvelope<{ Token?: string }>
  const token = data.data?.[0]?.Token
  if (!token || token.trim().length === 0) {
    throw new Error("CMS license token missing from metadata/license-agreement response.")
  }
  return token.trim()
}

async function fetchLcdById(
  lcdId: string,
  token: string,
  timeoutMs: number
): Promise<CmsLcdRecord[]> {
  const endpoint = new URL(`${CMS_API_BASE}/v1/data/lcd`)
  endpoint.searchParams.set("lcdid", lcdId)
  const response = await withTimeout(
    fetch(endpoint.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }),
    timeoutMs
  )
  if (!response.ok) {
    throw new Error(`CMS LCD lookup ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as CmsApiEnvelope<CmsLcdRecord>
  const statusId = data.meta?.status?.id
  if (statusId && statusId !== 200) {
    throw new Error(`CMS LCD lookup error: ${data.meta?.status?.message || "unknown status"}`)
  }
  return data.data || []
}

async function fetchArticleById(
  articleId: string,
  token: string,
  timeoutMs: number
): Promise<CmsArticleRecord[]> {
  const endpoint = new URL(`${CMS_API_BASE}/v1/data/article`)
  endpoint.searchParams.set("articleid", articleId)
  const response = await withTimeout(
    fetch(endpoint.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }),
    timeoutMs
  )
  if (!response.ok) {
    throw new Error(`CMS Article lookup ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as CmsApiEnvelope<CmsArticleRecord>
  const statusId = data.meta?.status?.id
  if (statusId && statusId !== 200) {
    throw new Error(`CMS Article lookup error: ${data.meta?.status?.message || "unknown status"}`)
  }
  return data.data || []
}

function toLcdRecord(item: CmsLcdRecord, index: number): ConnectorSearchRecord | null {
  const lcdId = trimNumericId(String(item.lcd_id || ""))
  if (!lcdId) return null
  const title = (item.title || "").trim() || `CMS LCD ${lcdId}`
  const snippet = [
    item.determination_type_description,
    item.contractor_name,
    item.contractor_number ? `Contractor ${item.contractor_number}` : null,
    item.primary_geo,
  ]
    .filter(Boolean)
    .join(" | ")
  return {
    id: `cms_lcd_${lcdId}_${index + 1}`,
    title,
    snippet: snippet || "CMS Local Coverage Determination",
    url: formatLcdUrl(item.display_id || null, lcdId),
    publishedAt: toIsoDateCandidate(item.revision_date || item.effective_date || null),
    sourceLabel: "CMS Coverage API",
    metadata: {
      evidenceLevel: 2,
      studyType: "Coverage determination",
      lcdId,
      displayId: item.display_id || null,
    },
  }
}

function toArticleRecord(item: CmsArticleRecord, index: number): ConnectorSearchRecord | null {
  const articleId = trimNumericId(String(item.article_id || ""))
  if (!articleId) return null
  const title = (item.title || "").trim() || `CMS Article ${articleId}`
  const snippet = [
    item.article_type_description,
    item.contractor_name,
    item.contractor_number ? `Contractor ${item.contractor_number}` : null,
    item.primary_geo,
  ]
    .filter(Boolean)
    .join(" | ")
  return {
    id: `cms_article_${articleId}_${index + 1}`,
    title,
    snippet: snippet || "CMS coverage article",
    url: formatArticleUrl(item.display_id || null, articleId),
    publishedAt: toIsoDateCandidate(item.revision_date || item.effective_date || null),
    sourceLabel: "CMS Coverage API",
    metadata: {
      evidenceLevel: 2,
      studyType: "Coverage article",
      articleId,
      displayId: item.display_id || null,
    },
  }
}

export async function searchCmsCoverageApi(
  query: string,
  options: { maxResults?: number; timeoutMs?: number } = {}
): Promise<{ records: ConnectorSearchRecord[]; warnings: string[] }> {
  const maxResults = Math.min(Math.max(options.maxResults ?? 5, 1), 10)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const warnings: string[] = []

  const lcdIds = extractLcdIds(query)
  const articleIds = extractArticleIds(query)
  if (lcdIds.length === 0 && articleIds.length === 0) {
    return {
      records: [],
      warnings: [
        "CMS native lookup requires an LCD/Article identifier in query (e.g., L33394 or A59233).",
      ],
    }
  }

  try {
    const token = await getCmsLicenseToken(timeoutMs)

    const records: ConnectorSearchRecord[] = []
    const perTypeLimit = Math.max(1, Math.ceil(maxResults / 2))
    const lcdTargets = lcdIds.slice(0, perTypeLimit)
    const articleTargets = articleIds.slice(0, perTypeLimit)

    for (const lcdId of lcdTargets) {
      try {
        const rows = await fetchLcdById(lcdId, token, timeoutMs)
        for (const row of rows) {
          const record = toLcdRecord(row, records.length)
          if (record) records.push(record)
          if (records.length >= maxResults) break
        }
      } catch (error) {
        warnings.push(
          `CMS LCD ${lcdId} lookup failed: ${error instanceof Error ? error.message : "unknown error"}`
        )
      }
      if (records.length >= maxResults) break
    }

    if (records.length < maxResults) {
      for (const articleId of articleTargets) {
        try {
          const rows = await fetchArticleById(articleId, token, timeoutMs)
          for (const row of rows) {
            const record = toArticleRecord(row, records.length)
            if (record) records.push(record)
            if (records.length >= maxResults) break
          }
        } catch (error) {
          warnings.push(
            `CMS Article ${articleId} lookup failed: ${
              error instanceof Error ? error.message : "unknown error"
            }`
          )
        }
        if (records.length >= maxResults) break
      }
    }

    if (records.length === 0 && warnings.length === 0) {
      warnings.push("CMS Coverage API returned no matching records for supplied IDs.")
    }

    return { records: records.slice(0, maxResults), warnings }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "CMS Coverage API lookup failed.")
    return { records: [], warnings }
  }
}
