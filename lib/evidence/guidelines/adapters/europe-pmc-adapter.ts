import type {
  GuidelineResult,
  GuidelineSearchContext,
  GuidelineSourceAdapter,
} from "../types"
import { normalizeWhitespace } from "../utils"

const DEFAULT_EUROPE_PMC_URL =
  "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

export const europePmcGuidelineAdapter: GuidelineSourceAdapter = {
  id: "europe_pmc_guidelines",
  name: "Europe PMC Guideline Search",
  tier: "public",
  region: "GLOBAL",
  enabled() {
    return true
  },
  async search(context: GuidelineSearchContext): Promise<GuidelineResult[]> {
    const guidelineQuery = `${context.query} AND (guideline OR consensus OR recommendation)`
    const params = new URLSearchParams({
      query: guidelineQuery,
      pageSize: String(Math.min(Math.max(context.maxResults, 1), 20)),
      format: "json",
      resultType: "core",
      sort: "P_PDATE_D",
    })

    const response = await fetch(`${DEFAULT_EUROPE_PMC_URL}?${params.toString()}`)
    if (!response.ok) return []

    const data = await response.json()
    const list = (data?.resultList?.result || []) as Array<Record<string, unknown>>

    return list
      .map((item) => ({
        source: "Europe PMC",
        sourceId: "europe_pmc_guidelines",
        title: String(item.title || "Untitled"),
        url:
          item.fullTextUrlList &&
          Array.isArray((item.fullTextUrlList as any)?.fullTextUrl)
            ? String((item.fullTextUrlList as any).fullTextUrl[0]?.url || "")
            : String(item?.doi ? `https://doi.org/${item.doi}` : ""),
        date: String(item.firstPublicationDate || item.pubYear || ""),
        summary: normalizeWhitespace(String(item.abstractText || "").slice(0, 400)),
        region: "GLOBAL" as const,
        organization: "Europe PMC",
        evidenceLevel: 3,
        studyType: "Guideline",
      }))
      .filter((item) => item.title)
  },
}
