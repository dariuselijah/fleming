import { searchPubMed } from "../../../pubmed/api"
import type {
  GuidelineResult,
  GuidelineSearchContext,
  GuidelineSourceAdapter,
} from "../types"
import { normalizeWhitespace } from "../utils"

const GUIDELINE_TERMS =
  '(guideline OR consensus OR recommendation OR "practice guideline" OR "position statement")'

export const pubmedGuidelineAdapter: GuidelineSourceAdapter = {
  id: "pubmed_guidelines",
  name: "PubMed Guideline Filter",
  tier: "public",
  region: "GLOBAL",
  enabled() {
    return true
  },
  async search(context: GuidelineSearchContext): Promise<GuidelineResult[]> {
    const focused = `${context.query} AND ${GUIDELINE_TERMS}`
    const pubmed = await searchPubMed(focused, Math.max(context.maxResults * 2, 10))
    const guidelineLike = pubmed.articles
      .filter((article) =>
        /\b(guideline|consensus|recommendation|statement|practice)\b/i.test(
          `${article.title || ""} ${article.journal || ""}`
        )
      )
      .slice(0, context.maxResults)

    return guidelineLike.map((article) => ({
      source: "PubMed",
      sourceId: "pubmed_guidelines",
      title: article.title,
      url: article.url,
      date: article.year,
      summary: normalizeWhitespace(article.abstract?.slice(0, 400)),
      region: "GLOBAL",
      organization: article.journal || "PubMed",
      evidenceLevel: 2,
      studyType: "Guideline",
    }))
  },
}
