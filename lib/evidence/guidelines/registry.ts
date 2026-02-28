import { createLicensedHttpGuidelineAdapter } from "./adapters/licensed-http-adapter"
import { europePmcGuidelineAdapter } from "./adapters/europe-pmc-adapter"
import { niceGuidelineAdapter } from "./adapters/nice-adapter"
import { pubmedGuidelineAdapter } from "./adapters/pubmed-guideline-adapter"
import type {
  GuidelineRegion,
  GuidelineResult,
  GuidelineSearchContext,
  GuidelineSourceAdapter,
} from "./types"
import { dedupeGuidelineResults, toYear } from "./utils"

const licensedUsAdapters: GuidelineSourceAdapter[] = [
  createLicensedHttpGuidelineAdapter({
    id: "uptodate_guidelines",
    name: "UpToDate Guideline API",
    sourceLabel: "UpToDate",
    region: "US",
    endpointEnvVar: "UPTODATE_GUIDELINE_API_URL",
    apiKeyEnvVar: "UPTODATE_GUIDELINE_API_KEY",
  }),
  createLicensedHttpGuidelineAdapter({
    id: "dynamed_guidelines",
    name: "DynaMed Guideline API",
    sourceLabel: "DynaMed",
    region: "US",
    endpointEnvVar: "DYNAMED_GUIDELINE_API_URL",
    apiKeyEnvVar: "DYNAMED_GUIDELINE_API_KEY",
  }),
  createLicensedHttpGuidelineAdapter({
    id: "nccn_guidelines",
    name: "NCCN Guideline API",
    sourceLabel: "NCCN",
    region: "US",
    endpointEnvVar: "NCCN_GUIDELINE_API_URL",
    apiKeyEnvVar: "NCCN_GUIDELINE_API_KEY",
  }),
]

const publicAdapters: GuidelineSourceAdapter[] = [
  pubmedGuidelineAdapter,
  europePmcGuidelineAdapter,
  niceGuidelineAdapter,
]

export function getGuidelineAdapters(regionPriority: GuidelineRegion): GuidelineSourceAdapter[] {
  const ranked = [...licensedUsAdapters, ...publicAdapters]
    .filter((adapter) => adapter.enabled())
    .sort((a, b) => {
      const regionDelta = Number(b.region === regionPriority) - Number(a.region === regionPriority)
      if (regionDelta !== 0) return regionDelta
      const tierDelta = Number(a.tier === "licensed") - Number(b.tier === "licensed")
      if (tierDelta !== 0) return -tierDelta
      return a.name.localeCompare(b.name)
    })

  return ranked
}

function guidelineRankingScore(result: GuidelineResult, regionPriority: GuidelineRegion): number {
  const regionBoost =
    result.region === regionPriority ? 3 : result.region === "GLOBAL" ? 1 : 0
  const sourceBoost = result.sourceId.includes("guideline") ? 1 : 0
  const yearBoost = toYear(result.date) / 1000
  const guidelineTypeBoost = /guideline|recommendation|statement/i.test(
    result.studyType || ""
  )
    ? 1
    : 0
  return regionBoost + sourceBoost + guidelineTypeBoost + yearBoost
}

export async function searchGuidelineAdapters(
  query: string,
  maxResults: number,
  regionPriority: GuidelineRegion = "US"
): Promise<{ results: GuidelineResult[]; sourcesUsed: string[] }> {
  const adapters = getGuidelineAdapters(regionPriority)
  const context: GuidelineSearchContext = { query, maxResults, regionPriority }
  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.search(context))
  )

  const combined = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  )
  const ranked = dedupeGuidelineResults(combined)
    .sort(
      (a, b) =>
        guidelineRankingScore(b, regionPriority) -
        guidelineRankingScore(a, regionPriority)
    )
    .slice(0, maxResults)

  return {
    results: ranked,
    sourcesUsed: Array.from(new Set(ranked.map((item) => item.source))),
  }
}
