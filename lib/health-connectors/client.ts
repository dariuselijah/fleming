"use client"

import { fetchClient } from "@/lib/fetch"
import type {
  HealthConnectorConnectResponse,
  HealthConnectorDefinition,
  HealthConnectorStatusRecord,
} from "./types"
import type { ConnectorSyncRunSummary } from "./sync-types"

export async function fetchHealthConnectorCatalog(): Promise<HealthConnectorDefinition[]> {
  const response = await fetch("/api/health-connectors/catalog", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch connector catalog")
  }
  const payload = (await response.json()) as { connectors?: HealthConnectorDefinition[] }
  return payload.connectors || []
}

export async function fetchHealthConnectorStatuses(): Promise<
  Record<string, HealthConnectorStatusRecord>
> {
  const response = await fetch("/api/health-connectors/status", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch connector statuses")
  }
  const payload = (await response.json()) as {
    statuses?: Record<string, HealthConnectorStatusRecord>
  }
  return payload.statuses || {}
}

export async function connectHealthConnector(
  connectorId: string
): Promise<HealthConnectorConnectResponse> {
  const response = await fetchClient("/api/health-connectors/connect", {
    method: "POST",
    body: JSON.stringify({ connectorId }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      details?: string
    }
    throw new Error(payload.error || payload.details || "Failed to start connector connection")
  }
  return (await response.json()) as HealthConnectorConnectResponse
}

export async function syncHealthConnector(
  connectorId: string
): Promise<ConnectorSyncRunSummary> {
  const response = await fetchClient("/api/health-connectors/sync", {
    method: "POST",
    body: JSON.stringify({ connectorId, all: false }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      details?: string
    }
    throw new Error(payload.error || payload.details || "Failed to sync connector")
  }
  const payload = (await response.json()) as {
    summary?: ConnectorSyncRunSummary
  }
  if (!payload.summary) {
    throw new Error("Sync response was missing summary payload")
  }
  return payload.summary
}

export async function syncAllConnectedHealthConnectors(): Promise<ConnectorSyncRunSummary[]> {
  const response = await fetchClient("/api/health-connectors/sync", {
    method: "POST",
    body: JSON.stringify({ all: true }),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      details?: string
    }
    throw new Error(payload.error || payload.details || "Failed to sync connectors")
  }
  const payload = (await response.json()) as {
    summaries?: ConnectorSyncRunSummary[]
  }
  return payload.summaries || []
}

export type HealthConnectorSummaryPayload = {
  readinessScore: number
  sleepScore: number
  activityScore: number
  steps: number
  sleepHours: number
  readinessSignal: number
  latestMetrics: Record<string, number>
  metricSampleCount: number
  recentClinicalRecordCount: number
}

export async function fetchHealthConnectorSummary(): Promise<HealthConnectorSummaryPayload | null> {
  const response = await fetch("/api/health-connectors/summary", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("Failed to fetch health connector summary")
  }
  const payload = (await response.json()) as {
    summary?: HealthConnectorSummaryPayload | null
  }
  return payload.summary || null
}
