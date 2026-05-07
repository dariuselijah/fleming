import type { HealthConnectorId } from "./types"

export type HealthMetricSampleInput = {
  metricType: string
  valueNumeric: number | null
  valueText?: string | null
  unit?: string | null
  observedAt: string
  source?: string | null
  payload?: Record<string, unknown>
}

export type HealthClinicalRecordInput = {
  resourceType: string
  resourceId: string
  status?: string | null
  code?: string | null
  display?: string | null
  effectiveAt?: string | null
  payload: Record<string, unknown>
}

export type ConnectorSyncResult = {
  connectorId: HealthConnectorId
  metrics: HealthMetricSampleInput[]
  clinicalRecords: HealthClinicalRecordInput[]
  warnings: string[]
}

export type ConnectorSyncRunSummary = {
  connectorId: HealthConnectorId
  status: "ok" | "error" | "skipped"
  metricsIngested: number
  recordsIngested: number
  warningCount: number
  error?: string
}
