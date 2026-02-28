import type {
  GuidelineRegion,
  GuidelineResult,
  GuidelineSearchContext,
  GuidelineSourceAdapter,
} from "../types"
import { normalizeWhitespace } from "../utils"

type LicensedAdapterConfig = {
  id: string
  name: string
  sourceLabel: string
  region: GuidelineRegion
  endpointEnvVar: string
  apiKeyEnvVar: string
}

function mapLicensedPayloadToGuidelines(
  payload: any,
  sourceId: string,
  sourceLabel: string,
  region: GuidelineRegion,
  maxResults: number
): GuidelineResult[] {
  const records = (payload?.results ||
    payload?.items ||
    payload?.guidelines ||
    payload?.data ||
    []) as Array<Record<string, unknown>>

  return records
    .slice(0, maxResults)
    .map((item) => ({
      source: sourceLabel,
      sourceId,
      title: String(item.title || item.name || item.headline || "Untitled"),
      url: String(item.url || item.webUrl || item.link || ""),
      date: String(item.updatedAt || item.publishedAt || item.date || ""),
      summary: normalizeWhitespace(
        String(item.summary || item.description || item.abstract || "").slice(0, 400)
      ),
      region,
      organization: sourceLabel,
      evidenceLevel: 2,
      studyType: "Guideline",
    }))
    .filter((item) => item.title)
}

export function createLicensedHttpGuidelineAdapter(
  config: LicensedAdapterConfig
): GuidelineSourceAdapter {
  return {
    id: config.id,
    name: config.name,
    tier: "licensed",
    region: config.region,
    enabled() {
      return Boolean(
        process.env[config.endpointEnvVar] && process.env[config.apiKeyEnvVar]
      )
    },
    async search(context: GuidelineSearchContext): Promise<GuidelineResult[]> {
      const endpoint = process.env[config.endpointEnvVar]
      const apiKey = process.env[config.apiKeyEnvVar]
      if (!endpoint || !apiKey) return []

      const params = new URLSearchParams({
        q: context.query,
        limit: String(Math.min(Math.max(context.maxResults, 1), 20)),
      })

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) return []
      const payload = await response.json()
      return mapLicensedPayloadToGuidelines(
        payload,
        config.id,
        config.sourceLabel,
        config.region,
        context.maxResults
      )
    },
  }
}
