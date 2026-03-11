import { searchGuidelines, searchClinicalTrials } from "@/lib/evidence/live-tools"
import { buildProvenance, type ProvenanceSourceType } from "@/lib/evidence/provenance"
import { searchPubMed } from "@/lib/pubmed"
import { hasWebSearchConfigured, searchWeb } from "@/lib/web-search"
import { recordConnectorMetric } from "@/lib/clinical-agent/telemetry"
import type {
  ClinicalConnectorId,
  ConnectorAdapter,
  ConnectorSearchInput,
  ConnectorSearchPayload,
  ConnectorSearchRecord,
} from "./types"

const CONNECTOR_RETRY_COUNT = 1
const CONNECTOR_CIRCUIT_FAIL_THRESHOLD = 3
const CONNECTOR_CIRCUIT_OPEN_MS = 60_000
const CONNECTOR_WEB_DEFAULT_TIMEOUT_MS = 5_500

const CONNECTOR_WEB_TIMEOUT_MS_BY_ID: Partial<Record<ClinicalConnectorId, number>> = {
  scholar_gateway: 9_000,
  biorxiv: 8_000,
  synapse: 10_000,
  biorender: 5_000,
  benchling: 5_000,
  cms_coverage: 5_000,
}

const CONNECTOR_WEB_RETRY_COUNT_BY_ID: Partial<Record<ClinicalConnectorId, number>> = {
  // One retry gives these slower sources a chance without over-looping.
  scholar_gateway: 1,
  biorxiv: 1,
  synapse: 1,
}

const connectorCircuitState = new Map<
  ClinicalConnectorId,
  { failures: number; openedUntil: number }
>()

function nowIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function toIsoDateCandidate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function scoreFromResultCount(count: number): number {
  if (count <= 0) return 0.2
  if (count < 3) return 0.55
  if (count < 6) return 0.72
  return 0.82
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
    },
  }
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
  return {
    connectorId,
    query: input.query,
    results: records,
    warnings,
    provenance,
    confidence: scoreFromResultCount(records.length),
    licenseTier,
    metrics: {
      elapsedMs: Math.round(performance.now() - startedAt),
      retriesUsed,
      sourceCount: records.length,
      fallbackUsed,
      cacheHit: false,
      circuitOpen: false,
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

  const searchResponse = await searchWeb(`${input.query} ${scopeHint}`.trim(), {
    maxResults: effectiveMaxResults,
    retries: effectiveRetryCount,
    timeoutMs: effectiveTimeoutMs,
    medicalOnly,
  })
  let finalResponse = searchResponse

  // Timeout recovery: if scoped query timed out and returned nothing, try a broader query once.
  const hasTimeoutWarning = (searchResponse.warnings || []).some((warning) =>
    /timeout/i.test(warning)
  )
  if (searchResponse.results.length === 0 && hasTimeoutWarning) {
    const broaderTimeoutMs = Math.min(effectiveTimeoutMs + 2_500, 13_000)
    const broaderResponse = await searchWeb(input.query.trim(), {
      maxResults: effectiveMaxResults,
      retries: 0,
      timeoutMs: broaderTimeoutMs,
      medicalOnly,
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
  const result = await searchGuidelines(input.query, maxResults, "US")
  const records: ConnectorSearchRecord[] = result.results.map((item, index) => ({
    id: `guideline_${index + 1}`,
    title: item.title,
    snippet: item.summary || "",
    url: item.url || null,
    publishedAt: toIsoDateCandidate(item.date),
    sourceLabel: item.source,
    metadata: {
      evidenceLevel: item.evidenceLevel ?? 3,
      studyType: item.studyType || "Guideline",
    },
  }))
  const warnings =
    records.length === 0 ? ["Guideline connector returned no matching records."] : []
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
  payload.provenance = result.provenance
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
    enabled: () => true,
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
  scholar_gateway: createWebBackedAdapter(
    "scholar_gateway",
    "Scholar Gateway",
    "scholarly evidence systematic review site:scholar.google.com"
  ),
  biorxiv: createWebBackedAdapter(
    "biorxiv",
    "bioRxiv",
    "preprint site:biorxiv.org",
    false
  ),
  biorender: createWebBackedAdapter(
    "biorender",
    "BioRender",
    "scientific illustration template site:biorender.com",
    false
  ),
  npi_registry: {
    id: "npi_registry",
    label: "NPI Registry",
    licenseTier: "public",
    enabled: () => true,
    search: npiRegistryConnector,
  },
  synapse: createWebBackedAdapter(
    "synapse",
    "Synapse",
    "scientific dataset metadata site:synapse.org",
    false
  ),
  cms_coverage: createWebBackedAdapter(
    "cms_coverage",
    "CMS Coverage",
    "coverage policy LCD NCD site:cms.gov"
  ),
  chembl: {
    id: "chembl",
    label: "ChEMBL",
    licenseTier: "public",
    enabled: () => true,
    search: chemblConnector,
  },
  benchling: createWebBackedAdapter(
    "benchling",
    "Benchling",
    "lab notebook protocol site:benchling.com",
    false
  ),
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
  for (let attempt = 0; attempt <= CONNECTOR_RETRY_COUNT; attempt += 1) {
    try {
      const payload = await adapter.search(input)
      connectorCircuitState.set(adapter.id, { failures: 0, openedUntil: 0 })
      recordConnectorMetric(adapter.id, true)
      return payload
    } catch (error) {
      lastError = error
      if (attempt >= CONNECTOR_RETRY_COUNT) break
    }
  }

  const failures = (currentState?.failures || 0) + 1
  const shouldOpenCircuit = failures >= CONNECTOR_CIRCUIT_FAIL_THRESHOLD
  connectorCircuitState.set(adapter.id, {
    failures,
    openedUntil: shouldOpenCircuit ? Date.now() + CONNECTOR_CIRCUIT_OPEN_MS : 0,
  })
  recordConnectorMetric(adapter.id, false)

  return emptyPayload(
    input,
    adapter.id,
    lastError instanceof Error ? lastError.message : `${adapter.label} connector failed.`,
    CONNECTOR_RETRY_COUNT,
    shouldOpenCircuit
  )
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
