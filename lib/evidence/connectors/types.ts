import type { SourceProvenance } from "@/lib/evidence/provenance"

export type ClinicalConnectorId =
  | "pubmed"
  | "guideline"
  | "clinical_trials"
  | "scholar_gateway"
  | "biorxiv"
  | "biorender"
  | "npi_registry"
  | "synapse"
  | "cms_coverage"
  | "chembl"
  | "benchling"

export type ConnectorLicenseTier = "public" | "licensed" | "mixed"

export type ConnectorSearchRecord = {
  id: string
  title: string
  snippet: string
  url: string | null
  publishedAt: string | null
  sourceLabel: string
  metadata?: Record<string, unknown>
}

export type ConnectorSearchMetrics = {
  elapsedMs: number
  retriesUsed: number
  sourceCount: number
  fallbackUsed: boolean
  cacheHit: boolean
  circuitOpen: boolean
}

export type ConnectorSearchPayload = {
  connectorId: ClinicalConnectorId
  query: string
  results: ConnectorSearchRecord[]
  warnings: string[]
  provenance: SourceProvenance[]
  confidence: number
  licenseTier: ConnectorLicenseTier
  metrics: ConnectorSearchMetrics
}

export type ConnectorSearchInput = {
  connectorId: ClinicalConnectorId
  query: string
  maxResults?: number
  region?: string
  medicalOnly?: boolean
}

export type ConnectorAdapter = {
  id: ClinicalConnectorId
  label: string
  licenseTier: ConnectorLicenseTier
  enabled: () => boolean
  search: (input: ConnectorSearchInput) => Promise<ConnectorSearchPayload>
}
