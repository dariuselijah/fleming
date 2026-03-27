import { searchGuidelines, searchClinicalTrials } from "@/lib/evidence/live-tools"
import { buildProvenance, type ProvenanceSourceType } from "@/lib/evidence/provenance"
import { searchPubMed } from "@/lib/pubmed"
import {
  hasWebSearchConfigured,
  searchWeb,
  type LiveCrawlMode,
} from "@/lib/web-search"
import { recordConnectorMetric } from "@/lib/clinical-agent/telemetry"
import type {
  ClinicalConnectorId,
  ConnectorAdapter,
  ConnectorSearchInput,
  ConnectorSearchPayload,
  ConnectorSearchRecord,
} from "./types"
import { searchBiorxivApi } from "./biorxiv-api"
import { searchScholarApi } from "./scholar-api"
import { searchCmsCoverageApi } from "./cms-coverage-api"

const CONNECTOR_RETRY_COUNT = 1
const CONNECTOR_CIRCUIT_FAIL_THRESHOLD = 3
const CONNECTOR_CIRCUIT_DEGRADED_THRESHOLD = 4
const CONNECTOR_CIRCUIT_OPEN_MS = 60_000
const CONNECTOR_WEB_DEFAULT_TIMEOUT_MS = 5_500

const CONNECTOR_WEB_TIMEOUT_MS_BY_ID: Partial<Record<ClinicalConnectorId, number>> = {
  scholar_gateway: 9_000,
  synapse: 10_000,
  biorender: 5_000,
  benchling: 5_000,
  cms_coverage: 5_000,
}

const CONNECTOR_WEB_RETRY_COUNT_BY_ID: Partial<Record<ClinicalConnectorId, number>> = {
  scholar_gateway: 1,
  synapse: 1,
}

/** Use cache when available for faster results. */
const CONNECTOR_WEB_LIVECRAWL_BY_ID: Partial<Record<ClinicalConnectorId, LiveCrawlMode>> = {}

/** Skip the second broader-query attempt on timeout to avoid long waits. */
const CONNECTOR_SKIP_TIMEOUT_RECOVERY_BY_ID: Partial<Record<ClinicalConnectorId, boolean>> = {}

const connectorCircuitState = new Map<
  ClinicalConnectorId,
  { failures: number; degraded: number; openedUntil: number }
>()

function nowIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function toIsoDateCandidate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildGuidelineFallbackQueries(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return []
  const variants = new Set<string>([normalized])

  const expanded = normalized
    .replace(/\bESC\b/gi, "European Society of Cardiology")
    .replace(/\bNICE\b/gi, "National Institute for Health and Care Excellence")
    .replace(/\bACC\b/gi, "American College of Cardiology")
    .replace(/\bAHA\b/gi, "American Heart Association")
    .replace(/\bHFpEF\b/gi, "heart failure with preserved ejection fraction")
    .replace(/\bHFrEF\b/gi, "heart failure with reduced ejection fraction")
    .replace(/\bSGLT2i\b/gi, "SGLT2 inhibitor")
  if (expanded !== normalized) {
    variants.add(expanded)
  }
  variants.add(`${expanded} guideline`)
  variants.add(`${expanded} guideline summary`)
  variants.add(`${expanded} recommendations`)
  variants.add("European Society of Cardiology guidelines SGLT2i")

  return Array.from(variants)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
}

function scoreFromResultCount(count: number): number {
  if (count <= 0) return 0.2
  if (count < 3) return 0.55
  if (count < 6) return 0.72
  return 0.82
}

function computeQualityScore(
  records: ConnectorSearchRecord[],
  warnings: string[],
  fallbackUsed: boolean
): number {
  const base = scoreFromResultCount(records.length)
  const warningPenalty = Math.min(warnings.length * 0.12, 0.45)
  const fallbackPenalty = fallbackUsed ? 0.08 : 0
  const urlCoverage =
    records.length > 0
      ? records.filter((record) => Boolean(record.url)).length / records.length
      : 0
  const urlBoost = Math.min(urlCoverage * 0.08, 0.08)
  return Math.max(0, Math.min(1, base - warningPenalty - fallbackPenalty + urlBoost))
}

function emptyPayload(
  input: ConnectorSearchInput,
  connectorId: ClinicalConnectorId,
  warning: string,
  retriesUsed = 0,
  circuitOpen = false
): ConnectorSearchPayload {
  return {
    connectorId,
    query: input.query,
    results: [],
    warnings: [warning],
    provenance: [],
    confidence: 0.2,
    licenseTier: "public",
    metrics: {
      elapsedMs: 0,
      retriesUsed,
      sourceCount: 0,
      fallbackUsed: false,
      cacheHit: false,
      circuitOpen,
      degraded: true,
      qualityScore: 0,
    },
  }
}

function isConnectorPayloadDegraded(payload: ConnectorSearchPayload): {
  degraded: boolean
  reason: string | null
} {
  const warnings = payload.warnings || []
  const hasHardWarning = warnings.some((warning) =>
    /timeout|failed|unavailable|disabled|no matching records|error/i.test(warning)
  )
  if (payload.results.length === 0) {
    return { degraded: true, reason: hasHardWarning ? "empty_with_warning" : "empty" }
  }
  if (hasHardWarning) {
    return { degraded: true, reason: "warning_heavy" }
  }
  if (payload.confidence < 0.45) {
    return { degraded: true, reason: "low_confidence" }
  }
  return { degraded: false, reason: null }
}

function sourceTypeForConnector(connectorId: ClinicalConnectorId): ProvenanceSourceType {
  const map: Record<ClinicalConnectorId, ProvenanceSourceType> = {
    pubmed: "pubmed",
    guideline: "guideline",
    clinical_trials: "clinical_trial",
    scholar_gateway: "scholar_gateway",
    biorxiv: "preprint",
    biorender: "visual_knowledge",
    npi_registry: "provider_registry",
    synapse: "research_dataset",
    cms_coverage: "coverage_policy",
    chembl: "chemical_database",
    benchling: "lab_workflow",
  }
  return map[connectorId]
}

function buildConnectorProvenance(
  connectorId: ClinicalConnectorId,
  record: ConnectorSearchRecord,
  index: number
) {
  const sourceName = record.sourceLabel || connectorId
  return buildProvenance({
    id: `${connectorId}_${index + 1}`,
    sourceType: sourceTypeForConnector(connectorId),
    sourceName,
    title: record.title,
    url: record.url,
    publishedAt: record.publishedAt,
    region: null,
    journal: sourceName,
    doi:
      typeof record.metadata?.doi === "string" ? (record.metadata.doi as string) : null,
    pmid:
      typeof record.metadata?.pmid === "string" ? (record.metadata.pmid as string) : null,
    evidenceLevel:
      typeof record.metadata?.evidenceLevel === "number"
        ? (record.metadata.evidenceLevel as number)
        : 3,
    studyType:
      typeof record.metadata?.studyType === "string"
        ? (record.metadata.studyType as string)
        : "Connector result",
    snippet: record.snippet,
  })
}

function normalizeConnectorPayload(
  input: ConnectorSearchInput,
  connectorId: ClinicalConnectorId,
  records: ConnectorSearchRecord[],
  warnings: string[],
  startedAt: number,
  retriesUsed: number,
  fallbackUsed: boolean,
  licenseTier: "public" | "licensed" | "mixed"
): ConnectorSearchPayload {
  const provenance = records.map((record, index) =>
    buildConnectorProvenance(connectorId, record, index)
  )
  const qualityScore = computeQualityScore(records, warnings, fallbackUsed)
  const degraded = records.length === 0 || qualityScore < 0.45
  return {
    connectorId,
    query: input.query,
    results: records,
    warnings,
    provenance,
    confidence: qualityScore,
    licenseTier,
    metrics: {
      elapsedMs: Math.round(performance.now() - startedAt),
      retriesUsed,
      sourceCount: records.length,
      fallbackUsed,
      cacheHit: false,
      circuitOpen: false,
      degraded,
      qualityScore,
    },
  }
}

async function runDomainScopedWebConnector(
  input: ConnectorSearchInput,
  connectorId: ClinicalConnectorId,
  label: string,
  scopeHint: string,
  medicalOnly = false
): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  if (!hasWebSearchConfigured()) {
    return emptyPayload(
      input,
      connectorId,
      `Connector ${label} requires EXA_API_KEY for fallback search.`
    )
  }
  const effectiveTimeoutMs =
    CONNECTOR_WEB_TIMEOUT_MS_BY_ID[connectorId] ?? CONNECTOR_WEB_DEFAULT_TIMEOUT_MS
  const effectiveRetryCount =
    CONNECTOR_WEB_RETRY_COUNT_BY_ID[connectorId] ?? CONNECTOR_RETRY_COUNT
  const effectiveMaxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 6)
  const effectiveLiveCrawl =
    CONNECTOR_WEB_LIVECRAWL_BY_ID[connectorId] ?? "always"
  const skipTimeoutRecovery =
    CONNECTOR_SKIP_TIMEOUT_RECOVERY_BY_ID[connectorId] ?? false

  const searchResponse = await searchWeb(`${input.query} ${scopeHint}`.trim(), {
    maxResults: effectiveMaxResults,
    retries: effectiveRetryCount,
    timeoutMs: effectiveTimeoutMs,
    medicalOnly,
    liveCrawl: effectiveLiveCrawl,
  })
  let finalResponse = searchResponse

  // Timeout recovery: if scoped query timed out and returned nothing, try a broader query once.
  const hasTimeoutWarning = (searchResponse.warnings || []).some((warning) =>
    /timeout/i.test(warning)
  )
  if (
    !skipTimeoutRecovery &&
    searchResponse.results.length === 0 &&
    hasTimeoutWarning
  ) {
    const broaderTimeoutMs = Math.min(effectiveTimeoutMs + 2_500, 13_000)
    const broaderResponse = await searchWeb(input.query.trim(), {
      maxResults: effectiveMaxResults,
      retries: 0,
      timeoutMs: broaderTimeoutMs,
      medicalOnly,
      liveCrawl: effectiveLiveCrawl,
    })
    finalResponse =
      broaderResponse.results.length > 0 || (broaderResponse.warnings || []).length > 0
        ? broaderResponse
        : searchResponse
  }
  const normalizedWarnings = (finalResponse.warnings || []).map((warning) => {
    if (/timeout/i.test(warning)) {
      const timeoutMatch = warning.match(/(\d+)\s*ms/i)
      const timeoutLabel = timeoutMatch?.[1] ? `${timeoutMatch[1]}ms` : `${effectiveTimeoutMs}ms`
      return `${label} search timed out after ${timeoutLabel}`
    }
    return warning
  })
  const records: ConnectorSearchRecord[] = finalResponse.results.map((item, index) => ({
    id: `${connectorId}_web_${index + 1}`,
    title: item.title,
    snippet: item.snippet,
    url: item.url || null,
    publishedAt: toIsoDateCandidate(item.publishedDate),
    sourceLabel: label,
  }))
  return normalizeConnectorPayload(
    input,
    connectorId,
    records,
    normalizedWarnings,
    startedAt,
    finalResponse.metrics.retriesUsed,
    true,
    "public"
  )
}

async function pubmedConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  const queries = [input.query, `${input.query} guideline`, `${input.query} treatment`]
  const seen = new Set<string>()
  const records: ConnectorSearchRecord[] = []
  const warnings: string[] = []

  for (const query of queries) {
    const result = await searchPubMed(query, Math.min(maxResults * 2, 20))
    for (const article of result.articles) {
      if (seen.has(article.pmid)) continue
      seen.add(article.pmid)
      records.push({
        id: `pubmed_${article.pmid}`,
        title: article.title,
        snippet: (article.abstract || "").slice(0, 360),
        url: article.url || null,
        publishedAt: toIsoDateCandidate(article.year),
        sourceLabel: "PubMed",
        metadata: {
          pmid: article.pmid,
          doi: article.doi || null,
          evidenceLevel: 2,
          studyType: "Literature record",
        },
      })
      if (records.length >= maxResults) break
    }
    if (records.length >= maxResults) break
  }

  if (records.length === 0) {
    warnings.push("PubMed connector returned no matching records.")
  }

  return normalizeConnectorPayload(
    input,
    "pubmed",
    records.slice(0, maxResults),
    warnings,
    startedAt,
    0,
    false,
    "public"
  )
}

async function guidelineConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 6, 1), 10)
  const mergedByKey = new Map<string, ConnectorSearchRecord>()
  const mergedProvenance = new Map<string, ReturnType<typeof buildProvenance>>()
  const attemptedQueries: string[] = []
  const warnings: string[] = []

  const ingestGuidelineResult = (
    result: Awaited<ReturnType<typeof searchGuidelines>>,
    queryUsed: string
  ) => {
    attemptedQueries.push(queryUsed)
    result.results.forEach((item, index) => {
      const record: ConnectorSearchRecord = {
        id: `guideline_${index + 1}_${queryUsed.slice(0, 24)}`,
        title: item.title,
        snippet: item.summary || "",
        url: item.url || null,
        publishedAt: toIsoDateCandidate(item.date),
        sourceLabel: item.source,
        metadata: {
          evidenceLevel: item.evidenceLevel ?? 3,
          studyType: item.studyType || "Guideline",
        },
      }
      const key = `${record.url || ""}|${record.title.toLowerCase()}`
      if (!mergedByKey.has(key) && mergedByKey.size < maxResults) {
        mergedByKey.set(key, record)
      }
    })
    result.provenance.forEach((item) => {
      const key = item.id || `${item.url || ""}|${String(item.title || "").toLowerCase()}`
      if (!mergedProvenance.has(key)) {
        mergedProvenance.set(key, item)
      }
    })
  }

  // Tier 1: Exact/primary match.
  const primary = await searchGuidelines(input.query, maxResults, "US")
  ingestGuidelineResult(primary, input.query)
  const directMatches = primary.results.length

  // Tier 2: semantic expansion.
  if (directMatches === 0) {
    const expandedQueries = buildGuidelineFallbackQueries(input.query)
    for (const expandedQuery of expandedQueries) {
      if (mergedByKey.size >= maxResults) break
      if (expandedQuery.toLowerCase() === input.query.toLowerCase()) continue
      const expanded = await searchGuidelines(expandedQuery, maxResults, "GLOBAL")
      ingestGuidelineResult(expanded, expandedQuery)
    }
  }

  // Tier 3: broad scholarly guideline summaries.
  if (mergedByKey.size === 0) {
    const scholarQuery = `${input.query} Guideline Summaries`
    attemptedQueries.push(scholarQuery)
    try {
      const scholar = await searchScholarApi(scholarQuery, {
        maxResults,
      })
      scholar.records.forEach((record) => {
        const key = `${record.url || ""}|${record.title.toLowerCase()}`
        if (!mergedByKey.has(key) && mergedByKey.size < maxResults) {
          mergedByKey.set(key, {
            ...record,
            sourceLabel: record.sourceLabel || "Scholar Gateway",
            metadata: {
              ...(record.metadata || {}),
              studyType:
                typeof record.metadata?.studyType === "string"
                  ? (record.metadata.studyType as string)
                  : "Guideline summary",
            },
          })
        }
      })
      warnings.push(...scholar.warnings)
    } catch (error) {
      warnings.push(
        `Scholar Gateway fallback failed: ${error instanceof Error ? error.message : "unknown error"}`
      )
    }
  }

  const records = Array.from(mergedByKey.values()).slice(0, maxResults)
  if (records.length === 0) {
    warnings.push("No direct matches found in Guideline Index. Attempting query expansion...")
  } else if (directMatches === 0) {
    warnings.push("No direct matches found in Guideline Index. Attempting query expansion...")
  }
  if (attemptedQueries.length > 1) {
    warnings.push(
      `Guideline recursive retrieval attempted ${attemptedQueries.length} query variants.`
    )
  }
  const payload = normalizeConnectorPayload(
    input,
    "guideline",
    records,
    warnings,
    startedAt,
    0,
    false,
    "mixed"
  )
  // Preserve adapter-provided provenance details when available.
  payload.provenance = Array.from(mergedProvenance.values())
  return payload
}

async function clinicalTrialsConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  const result = await searchClinicalTrials(input.query, maxResults)
  const records: ConnectorSearchRecord[] = result.trials.map((trial) => ({
    id: `trial_${trial.nctId || trial.title}`,
    title: trial.title,
    snippet: [trial.status, trial.phase, ...(trial.conditions || [])]
      .filter(Boolean)
      .join(" | "),
    url: trial.url || null,
    publishedAt: null,
    sourceLabel: "ClinicalTrials.gov",
    metadata: {
      evidenceLevel: 3,
      studyType: trial.phase || "Clinical trial",
    },
  }))
  const warnings =
    records.length === 0 ? ["ClinicalTrials connector returned no matching records."] : []
  const payload = normalizeConnectorPayload(
    input,
    "clinical_trials",
    records,
    warnings,
    startedAt,
    0,
    false,
    "public"
  )
  payload.provenance = result.provenance
  return payload
}

async function npiRegistryConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  const endpoint = new URL("https://npiregistry.cms.hhs.gov/api/")
  endpoint.searchParams.set("version", "2.1")
  endpoint.searchParams.set("limit", String(maxResults))
  endpoint.searchParams.set("pretty", "false")
  if (/^\d{6,}$/.test(input.query.trim())) {
    endpoint.searchParams.set("number", input.query.trim())
  } else {
    endpoint.searchParams.set("organization_name", input.query.trim())
  }

  try {
    const response = await fetch(endpoint.toString())
    if (!response.ok) {
      return emptyPayload(
        input,
        "npi_registry",
        `NPI Registry request failed with status ${response.status}.`
      )
    }
    const data = (await response.json()) as {
      results?: Array<{
        number?: string
        basic?: {
          name?: string
          organization_name?: string
          enumeration_date?: string
        }
        addresses?: Array<{
          address_purpose?: string
          city?: string
          state?: string
          postal_code?: string
        }>
      }>
    }
    const records: ConnectorSearchRecord[] = (data.results || []).map((item, index) => {
      const basic = item.basic || {}
      const primaryAddress = (item.addresses || []).find(
        (address) => address.address_purpose === "LOCATION"
      )
      const npi = item.number || `unknown-${index + 1}`
      return {
        id: `npi_${npi}`,
        title: basic.organization_name || basic.name || `NPI ${npi}`,
        snippet: [primaryAddress?.city, primaryAddress?.state, primaryAddress?.postal_code]
          .filter(Boolean)
          .join(", "),
        url: `https://npiregistry.cms.hhs.gov/provider-view/${npi}`,
        publishedAt: toIsoDateCandidate(basic.enumeration_date),
        sourceLabel: "NPI Registry",
        metadata: {
          evidenceLevel: 4,
          studyType: "Provider registry",
        },
      }
    })
    return normalizeConnectorPayload(
      input,
      "npi_registry",
      records,
      records.length === 0 ? ["NPI Registry connector returned no matching records."] : [],
      startedAt,
      0,
      false,
      "public"
    )
  } catch (error) {
    return emptyPayload(
      input,
      "npi_registry",
      error instanceof Error ? error.message : "NPI Registry lookup failed."
    )
  }
}

async function chemblConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  const endpoint = `https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?q=${encodeURIComponent(input.query)}&limit=${maxResults}`
  try {
    const response = await fetch(endpoint)
    if (!response.ok) {
      return emptyPayload(
        input,
        "chembl",
        `ChEMBL request failed with status ${response.status}.`
      )
    }
    const data = (await response.json()) as {
      molecules?: Array<{
        molecule_chembl_id?: string
        pref_name?: string
        molecule_type?: string
        max_phase?: number
      }>
    }
    const records: ConnectorSearchRecord[] = (data.molecules || []).map((molecule, index) => ({
      id: molecule.molecule_chembl_id || `chembl_${index + 1}`,
      title:
        molecule.pref_name || molecule.molecule_chembl_id || `ChEMBL result ${index + 1}`,
      snippet: `Type: ${molecule.molecule_type || "Unknown"} | Max phase: ${
        typeof molecule.max_phase === "number" ? molecule.max_phase : "n/a"
      }`,
      url: molecule.molecule_chembl_id
        ? `https://www.ebi.ac.uk/chembl/compound_report_card/${molecule.molecule_chembl_id}/`
        : "https://www.ebi.ac.uk/chembl/",
      publishedAt: nowIsoDate(),
      sourceLabel: "ChEMBL",
      metadata: {
        evidenceLevel: 3,
        studyType: "Chemical database",
      },
    }))
    return normalizeConnectorPayload(
      input,
      "chembl",
      records,
      records.length === 0 ? ["ChEMBL connector returned no matching records."] : [],
      startedAt,
      0,
      false,
      "public"
    )
  } catch (error) {
    return emptyPayload(
      input,
      "chembl",
      error instanceof Error ? error.message : "ChEMBL lookup failed."
    )
  }
}

async function biorxivConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  try {
    const { records, warnings } = await searchBiorxivApi(input.query, {
      maxResults,
      medicalOnly: input.medicalOnly ?? false,
      timeoutMs: 6_000,
    })
    if (records.length > 0) {
      return normalizeConnectorPayload(
        input,
        "biorxiv",
        records,
        warnings,
        startedAt,
        0,
        false,
        "public"
      )
    }
    const apiFailed =
      warnings.some((w) =>
        /503|502|504|timeout|unavailable|API error/i.test(w)
      )
    if (apiFailed && hasWebSearchConfigured()) {
      const fallback = await runDomainScopedWebConnector(
        input,
        "biorxiv",
        "bioRxiv",
        "preprint site:biorxiv.org",
        false
      )
      if (fallback.results.length > 0) {
        return {
          ...fallback,
          warnings: [
            ...fallback.warnings,
            "bioRxiv API was unavailable; results from web search.",
          ],
          metrics: {
            ...fallback.metrics,
            fallbackUsed: true,
          },
        }
      }
    }
    return normalizeConnectorPayload(
      input,
      "biorxiv",
      records,
      warnings,
      startedAt,
      0,
      false,
      "public"
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "bioRxiv API failed."
    if (hasWebSearchConfigured() && /503|502|504|timeout/i.test(message)) {
      try {
        const fallback = await runDomainScopedWebConnector(
          input,
          "biorxiv",
          "bioRxiv",
          "preprint site:biorxiv.org",
          false
        )
        if (fallback.results.length > 0) {
          return {
            ...fallback,
            warnings: [
              ...fallback.warnings,
              "bioRxiv API was unavailable; results from web search.",
            ],
            metrics: { ...fallback.metrics, fallbackUsed: true },
          }
        }
      } catch {
        // ignore fallback failure
      }
    }
    return emptyPayload(input, "biorxiv", message)
  }
}

async function scholarGatewayConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  try {
    const { records, warnings } = await searchScholarApi(input.query, {
      maxResults,
      timeoutMs: 6_500,
    })
    if (records.length > 0) {
      return normalizeConnectorPayload(
        input,
        "scholar_gateway",
        records,
        warnings,
        startedAt,
        0,
        false,
        "public"
      )
    }

    if (hasWebSearchConfigured()) {
      const fallback = await runDomainScopedWebConnector(
        input,
        "scholar_gateway",
        "Scholar Gateway",
        "scholarly evidence systematic review site:scholar.google.com OR site:openalex.org OR site:europepmc.org",
        true
      )
      if (fallback.results.length > 0) {
        return {
          ...fallback,
          warnings: [
            ...warnings,
            ...fallback.warnings,
            "Scholar native APIs returned sparse results; using web fallback.",
          ],
          metrics: {
            ...fallback.metrics,
            fallbackUsed: true,
          },
        }
      }
    }

    return normalizeConnectorPayload(
      input,
      "scholar_gateway",
      records,
      warnings,
      startedAt,
      0,
      false,
      "public"
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scholar native API lookup failed."
    if (hasWebSearchConfigured()) {
      try {
        const fallback = await runDomainScopedWebConnector(
          input,
          "scholar_gateway",
          "Scholar Gateway",
          "scholarly evidence systematic review site:scholar.google.com OR site:openalex.org OR site:europepmc.org",
          true
        )
        if (fallback.results.length > 0) {
          return {
            ...fallback,
            warnings: [
              ...fallback.warnings,
              "Scholar native APIs were unavailable; using web fallback.",
            ],
            metrics: {
              ...fallback.metrics,
              fallbackUsed: true,
            },
          }
        }
      } catch {
        // ignore fallback failure
      }
    }
    return emptyPayload(input, "scholar_gateway", message)
  }
}

async function cmsCoverageConnector(input: ConnectorSearchInput): Promise<ConnectorSearchPayload> {
  const startedAt = performance.now()
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 10)
  try {
    const { records, warnings } = await searchCmsCoverageApi(input.query, {
      maxResults,
      timeoutMs: 7_000,
    })
    if (records.length > 0) {
      return normalizeConnectorPayload(
        input,
        "cms_coverage",
        records,
        warnings,
        startedAt,
        0,
        false,
        "public"
      )
    }

    if (hasWebSearchConfigured()) {
      const fallback = await runDomainScopedWebConnector(
        input,
        "cms_coverage",
        "CMS Coverage",
        "coverage policy LCD NCD site:cms.gov",
        true
      )
      if (fallback.results.length > 0) {
        return {
          ...fallback,
          warnings: [
            ...warnings,
            ...fallback.warnings,
            "CMS native API returned no direct ID match; using web fallback.",
          ],
          metrics: {
            ...fallback.metrics,
            fallbackUsed: true,
          },
        }
      }
    }

    return normalizeConnectorPayload(
      input,
      "cms_coverage",
      records,
      warnings,
      startedAt,
      0,
      false,
      "public"
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CMS coverage native lookup failed."
    if (hasWebSearchConfigured()) {
      try {
        const fallback = await runDomainScopedWebConnector(
          input,
          "cms_coverage",
          "CMS Coverage",
          "coverage policy LCD NCD site:cms.gov",
          true
        )
        if (fallback.results.length > 0) {
          return {
            ...fallback,
            warnings: [...fallback.warnings, "CMS native API was unavailable; using web fallback."],
            metrics: {
              ...fallback.metrics,
              fallbackUsed: true,
            },
          }
        }
      } catch {
        // ignore fallback failure
      }
    }
    return emptyPayload(input, "cms_coverage", message)
  }
}

function createWebBackedAdapter(
  id: ClinicalConnectorId,
  label: string,
  scopeHint: string,
  medicalOnly = true
): ConnectorAdapter {
  return {
    id,
    label,
    licenseTier: "public",
    enabled: () => hasWebSearchConfigured(),
    search: async (input) =>
      runDomainScopedWebConnector(input, id, label, scopeHint, medicalOnly),
  }
}

const connectorAdapters: Record<ClinicalConnectorId, ConnectorAdapter> = {
  pubmed: {
    id: "pubmed",
    label: "PubMed",
    licenseTier: "public",
    enabled: () => true,
    search: pubmedConnector,
  },
  guideline: {
    id: "guideline",
    label: "Guideline Search",
    licenseTier: "mixed",
    enabled: () => true,
    search: guidelineConnector,
  },
  clinical_trials: {
    id: "clinical_trials",
    label: "ClinicalTrials.gov",
    licenseTier: "public",
    enabled: () => true,
    search: clinicalTrialsConnector,
  },
  scholar_gateway: {
    id: "scholar_gateway",
    label: "Scholar Gateway",
    licenseTier: "public",
    enabled: () => true,
    search: scholarGatewayConnector,
  },
  biorxiv: {
    id: "biorxiv",
    label: "bioRxiv",
    licenseTier: "public",
    enabled: () => true,
    search: biorxivConnector,
  },
  biorender: {
    id: "biorender",
    label: "BioRender",
    licenseTier: "public",
    enabled: () => false,
    search: async (input) =>
      runDomainScopedWebConnector(
        input,
        "biorender",
        "BioRender",
        "scientific illustration template site:biorender.com",
        false
      ),
  },
  npi_registry: {
    id: "npi_registry",
    label: "NPI Registry",
    licenseTier: "public",
    enabled: () => true,
    search: npiRegistryConnector,
  },
  synapse: {
    id: "synapse",
    label: "Synapse",
    licenseTier: "public",
    enabled: () => false,
    search: async (input) =>
      runDomainScopedWebConnector(
        input,
        "synapse",
        "Synapse",
        "scientific dataset metadata site:synapse.org",
        false
      ),
  },
  cms_coverage: {
    id: "cms_coverage",
    label: "CMS Coverage",
    licenseTier: "public",
    enabled: () => true,
    search: cmsCoverageConnector,
  },
  chembl: {
    id: "chembl",
    label: "ChEMBL",
    licenseTier: "public",
    enabled: () => true,
    search: chemblConnector,
  },
  benchling: {
    id: "benchling",
    label: "Benchling",
    licenseTier: "public",
    enabled: () => false,
    search: async (input) =>
      runDomainScopedWebConnector(
        input,
        "benchling",
        "Benchling",
        "lab notebook protocol site:benchling.com",
        false
      ),
  },
}

async function withReliabilityGuard(
  adapter: ConnectorAdapter,
  input: ConnectorSearchInput
): Promise<ConnectorSearchPayload> {
  const currentState = connectorCircuitState.get(adapter.id)
  if (currentState && currentState.openedUntil > Date.now()) {
    return emptyPayload(
      input,
      adapter.id,
      `${adapter.label} connector is temporarily paused after repeated failures.`,
      0,
      true
    )
  }

  let lastError: unknown = null
  let lastDegradedReason: string | null = null
  for (let attempt = 0; attempt <= CONNECTOR_RETRY_COUNT; attempt += 1) {
    try {
      const payload = await adapter.search(input)
      const degradedState = isConnectorPayloadDegraded(payload)
      if (!degradedState.degraded) {
        connectorCircuitState.set(adapter.id, { failures: 0, degraded: 0, openedUntil: 0 })
        recordConnectorMetric(adapter.id, "success", {
          fallbackUsed: payload.metrics.fallbackUsed,
          sourceCount: payload.results.length,
        })
        return payload
      }

      lastDegradedReason = degradedState.reason
      if (attempt >= CONNECTOR_RETRY_COUNT) {
        break
      }
      continue
    } catch (error) {
      lastError = error
      if (attempt >= CONNECTOR_RETRY_COUNT) break
    }
  }

  const nextFailures =
    lastError != null ? (currentState?.failures || 0) + 1 : (currentState?.failures || 0)
  const nextDegraded =
    lastError == null ? (currentState?.degraded || 0) + 1 : (currentState?.degraded || 0)
  const shouldOpenCircuit =
    nextFailures >= CONNECTOR_CIRCUIT_FAIL_THRESHOLD ||
    nextDegraded >= CONNECTOR_CIRCUIT_DEGRADED_THRESHOLD
  connectorCircuitState.set(adapter.id, {
    failures: nextFailures,
    degraded: nextDegraded,
    openedUntil: shouldOpenCircuit ? Date.now() + CONNECTOR_CIRCUIT_OPEN_MS : 0,
  })

  if (lastError != null) {
    recordConnectorMetric(adapter.id, "failure", {
      sourceCount: 0,
      reason: "exception",
    })
    return emptyPayload(
      input,
      adapter.id,
      lastError instanceof Error ? lastError.message : `${adapter.label} connector failed.`,
      CONNECTOR_RETRY_COUNT,
      shouldOpenCircuit
    )
  }

  recordConnectorMetric(adapter.id, "degraded", {
    sourceCount: 0,
    reason: lastDegradedReason || "degraded",
  })
  const degradedPayload = emptyPayload(
    input,
    adapter.id,
    `${adapter.label} connector returned low-utility results.`,
    CONNECTOR_RETRY_COUNT,
    shouldOpenCircuit
  )
  return degradedPayload
}

export function getRegisteredConnectorIds(): ClinicalConnectorId[] {
  return Object.keys(connectorAdapters) as ClinicalConnectorId[]
}

export function isConnectorEnabled(connectorId: ClinicalConnectorId): boolean {
  const adapter = connectorAdapters[connectorId]
  return Boolean(adapter && adapter.enabled())
}

export async function runConnectorSearch(
  input: ConnectorSearchInput
): Promise<ConnectorSearchPayload> {
  const adapter = connectorAdapters[input.connectorId]
  if (!adapter) {
    return emptyPayload(input, input.connectorId, "Connector is not registered.")
  }
  if (!adapter.enabled()) {
    return emptyPayload(
      input,
      input.connectorId,
      `${adapter.label} connector is disabled by configuration.`
    )
  }
  return withReliabilityGuard(adapter, input)
}
