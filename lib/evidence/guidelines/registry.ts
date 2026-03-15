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

const ENABLE_GUIDELINE_DIAGNOSTICS = process.env.GUIDELINE_DIAGNOSTICS === "true"

function logGuidelineDiagnostics(event: string, payload: Record<string, unknown>) {
  if (!ENABLE_GUIDELINE_DIAGNOSTICS) return
  console.log(`[GUIDELINE_DIAGNOSTICS] ${event}`, payload)
}

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

export function getGuidelineAdapterCatalog(): GuidelineSourceAdapter[] {
  return [...licensedUsAdapters, ...publicAdapters]
}

export function getGuidelineAdapters(regionPriority: GuidelineRegion): GuidelineSourceAdapter[] {
  const ranked = getGuidelineAdapterCatalog()
    .filter((adapter) => adapter.enabled())
    .sort((a, b) => {
      const regionDelta = Number(b.region === regionPriority) - Number(a.region === regionPriority)
      if (regionDelta !== 0) return regionDelta
      const tierDelta = Number(a.tier === "licensed") - Number(b.tier === "licensed")
      if (tierDelta !== 0) return -tierDelta
      return a.name.localeCompare(b.name)
    })

  logGuidelineDiagnostics("adapter_enablement", {
    regionPriority,
    adapters: getGuidelineAdapterCatalog().map((adapter) => ({
      id: adapter.id,
      tier: adapter.tier,
      region: adapter.region,
      enabled: adapter.enabled(),
    })),
    enabledAdapterIds: ranked.map((adapter) => adapter.id),
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
  const startedAt = performance.now()
  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.search(context))
  )

  const adapterOutcomes = settled.map((result, index) => {
    const adapter = adapters[index]
    if (!adapter) {
      return {
        id: "unknown",
        status: "error",
        count: 0,
        error: "Missing adapter index mapping",
      }
    }
    if (result.status === "fulfilled") {
      return {
        id: adapter.id,
        status: "fulfilled",
        count: result.value.length,
      }
    }
    return {
      id: adapter.id,
      status: "rejected",
      count: 0,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }
  })

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

  logGuidelineDiagnostics("adapter_search", {
    query,
    regionPriority,
    maxResults,
    elapsedMs: Math.round(performance.now() - startedAt),
    adapterOutcomes,
    combinedCount: combined.length,
    rankedCount: ranked.length,
    sourcesUsed: Array.from(new Set(ranked.map((item) => item.source))),
  })

  return {
    results: ranked,
    sourcesUsed: Array.from(new Set(ranked.map((item) => item.source))),
  }
}
