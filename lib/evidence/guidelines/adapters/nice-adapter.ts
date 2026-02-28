import type {
  GuidelineResult,
  GuidelineSearchContext,
  GuidelineSourceAdapter,
} from "../types"
import { normalizeWhitespace } from "../utils"

const DEFAULT_NICE_BASE_URL = "https://api.nice.org.uk/services/content/search"

export const niceGuidelineAdapter: GuidelineSourceAdapter = {
  id: "nice_guidelines",
  name: "NICE Guideline Search",
  tier: "licensed",
  region: "UK",
  enabled() {
    return Boolean(process.env.NICE_API_KEY)
  },
  async search(context: GuidelineSearchContext): Promise<GuidelineResult[]> {
    const apiKey = process.env.NICE_API_KEY
    if (!apiKey) return []

    const params = new URLSearchParams({
      searchTerm: context.query,
      page: "1",
      pageSize: String(Math.min(Math.max(context.maxResults, 1), 20)),
    })

    const response = await fetch(`${DEFAULT_NICE_BASE_URL}?${params.toString()}`, {
      headers: {
        "API-Key": apiKey,
        Accept: "application/vnd.nice.syndication.services+json",
      },
    })

    if (!response.ok) return []

    const data = await response.json()
    const items = (data?.results || data?.items || []) as Array<Record<string, unknown>>

    return items
      .map((item) => ({
        source: "NICE",
        sourceId: "nice_guidelines",
        title: String(item.title || item.name || "Untitled"),
        url: String(item.url || item.webUrl || ""),
        date: String(item.lastModifiedDate || item.publishedDate || ""),
        summary: normalizeWhitespace(
          String(item.summary || item.description || "").slice(0, 400)
        ),
        region: "UK" as const,
        organization: "NICE",
        evidenceLevel: 2,
        studyType: "Guideline",
      }))
      .filter((item) => item.title)
  },
}
