#!/usr/bin/env npx ts-node

import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import {
  getGuidelineAdapterCatalog,
  getGuidelineAdapters,
  searchGuidelineAdapters,
} from "../lib/evidence/guidelines/registry"
import { searchGuidelines } from "../lib/evidence/live-tools"
import type { GuidelineRegion } from "../lib/evidence/guidelines/types"
import { evaluateProvenanceQuality } from "../lib/evidence/provenance"

type AdapterProbeResult = {
  id: string
  name: string
  tier: string
  region: string
  enabled: boolean
  elapsedMs: number
  status: "ok" | "disabled" | "error" | "timeout"
  resultCount: number
  topTitles: string[]
  error?: string
}

function loadEnv() {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  const envPath = resolve(process.cwd(), ".env")
  if (existsSync(envLocalPath)) config({ path: envLocalPath })
  if (existsSync(envPath)) config({ path: envPath })
}

function parseArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (found) return found.slice(prefix.length)
  return fallback
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name)
  const parsed = Number.parseInt(raw || "", 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseRegionArg(value?: string): GuidelineRegion {
  const normalized = (value || "US").toUpperCase()
  if (normalized === "US" || normalized === "UK" || normalized === "EU" || normalized === "GLOBAL") {
    return normalized
  }
  return "US"
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
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

async function main() {
  loadEnv()

  const query =
    parseArg(
      "query",
      "first-line antihypertensive treatment adults with diabetes guideline ACE inhibitor ARB thiazide calcium channel blocker"
    ) || ""
  const maxResults = Math.min(Math.max(parseIntArg("maxResults", 6), 1), 12)
  const region = parseRegionArg(parseArg("region", "US"))
  const adapterTimeoutMs = parseIntArg("adapterTimeoutMs", 18_000)

  const envPresence = {
    NICE_API_KEY: Boolean(process.env.NICE_API_KEY),
    UPTODATE_GUIDELINE_API_URL: Boolean(process.env.UPTODATE_GUIDELINE_API_URL),
    UPTODATE_GUIDELINE_API_KEY: Boolean(process.env.UPTODATE_GUIDELINE_API_KEY),
    DYNAMED_GUIDELINE_API_URL: Boolean(process.env.DYNAMED_GUIDELINE_API_URL),
    DYNAMED_GUIDELINE_API_KEY: Boolean(process.env.DYNAMED_GUIDELINE_API_KEY),
    NCCN_GUIDELINE_API_URL: Boolean(process.env.NCCN_GUIDELINE_API_URL),
    NCCN_GUIDELINE_API_KEY: Boolean(process.env.NCCN_GUIDELINE_API_KEY),
  }

  const catalog = getGuidelineAdapterCatalog()
  const enabledByRegion: Record<GuidelineRegion, string[]> = {
    US: getGuidelineAdapters("US").map((a) => a.id),
    GLOBAL: getGuidelineAdapters("GLOBAL").map((a) => a.id),
    UK: getGuidelineAdapters("UK").map((a) => a.id),
    EU: getGuidelineAdapters("EU").map((a) => a.id),
  }

  const adapterProbes: AdapterProbeResult[] = []
  for (const adapter of catalog) {
    const enabled = adapter.enabled()
    if (!enabled) {
      adapterProbes.push({
        id: adapter.id,
        name: adapter.name,
        tier: adapter.tier,
        region: adapter.region,
        enabled,
        elapsedMs: 0,
        status: "disabled",
        resultCount: 0,
        topTitles: [],
      })
      continue
    }

    const startedAt = performance.now()
    try {
      const results = await withTimeout(
        adapter.search({ query, maxResults, regionPriority: region }),
        adapterTimeoutMs
      )
      adapterProbes.push({
        id: adapter.id,
        name: adapter.name,
        tier: adapter.tier,
        region: adapter.region,
        enabled,
        elapsedMs: Math.round(performance.now() - startedAt),
        status: "ok",
        resultCount: results.length,
        topTitles: results.slice(0, 3).map((row) => row.title),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      adapterProbes.push({
        id: adapter.id,
        name: adapter.name,
        tier: adapter.tier,
        region: adapter.region,
        enabled,
        elapsedMs: Math.round(performance.now() - startedAt),
        status: /timeout/i.test(message) ? "timeout" : "error",
        resultCount: 0,
        topTitles: [],
        error: message,
      })
    }
  }

  const aggregateStarted = performance.now()
  const aggregate = await searchGuidelineAdapters(query, maxResults, region)
  const aggregateElapsedMs = Math.round(performance.now() - aggregateStarted)

  const enrichedStarted = performance.now()
  const enriched = await searchGuidelines(query, maxResults, region)
  const enrichedElapsedMs = Math.round(performance.now() - enrichedStarted)

  const qualityEvaluations = enriched.provenance.map((item) => evaluateProvenanceQuality(item, query))
  const qualityPassCount = qualityEvaluations.filter((result) => result.passed).length
  const qualityFailReasonCounts = qualityEvaluations
    .filter((result) => !result.passed)
    .flatMap((result) => result.reasons)
    .reduce<Record<string, number>>((acc, reason) => {
      acc[reason] = (acc[reason] || 0) + 1
      return acc
    }, {})

  const summaryFlags = {
    noAdaptersEnabled: adapterProbes.every((probe) => !probe.enabled),
    allEnabledAdaptersFailed:
      adapterProbes.filter((probe) => probe.enabled).length > 0 &&
      adapterProbes.filter((probe) => probe.enabled).every((probe) => probe.status !== "ok"),
    aggregateEmpty: aggregate.results.length === 0,
    enrichedEmpty: enriched.results.length === 0,
    qualityGateFilteredAll: enriched.provenance.length > 0 && qualityPassCount === 0,
  }

  const output = {
    query,
    maxResults,
    region,
    timestamp: new Date().toISOString(),
    envPresence,
    enabledByRegion,
    adapterProbes,
    aggregate: {
      elapsedMs: aggregateElapsedMs,
      resultCount: aggregate.results.length,
      sourcesUsed: aggregate.sourcesUsed,
      topTitles: aggregate.results.slice(0, 5).map((row) => row.title),
    },
    enriched: {
      elapsedMs: enrichedElapsedMs,
      resultCount: enriched.results.length,
      sourcesUsed: enriched.sourcesUsed,
      provenanceCount: enriched.provenance.length,
      topTitles: enriched.results.slice(0, 5).map((row) => row.title),
    },
    quality: {
      passCount: qualityPassCount,
      failCount: qualityEvaluations.length - qualityPassCount,
      failReasonCounts: qualityFailReasonCounts,
    },
    connector: {
      skipped: true,
      reason:
        "Connector probe intentionally skipped in this script to avoid ts-node alias resolution issues; use in-route diagnostics for connector fallback path.",
    },
    summaryFlags,
  }

  console.log(JSON.stringify(output, null, 2))

  const hasHardFailure =
    summaryFlags.noAdaptersEnabled ||
    (summaryFlags.aggregateEmpty && summaryFlags.enrichedEmpty)
  if (hasHardFailure) {
    console.warn(
      "[guideline-diagnostics] no guideline results were retrieved; inspect summaryFlags and adapterProbes."
    )
  }
}

main().catch((error) => {
  console.error("Guideline diagnostics failed:", error)
  process.exit(1)
})
