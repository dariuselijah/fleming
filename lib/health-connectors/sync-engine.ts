import { getHealthConnectorById } from "./catalog"
import { ensureConnectorAccessTokenForSync, readConnectorAccountAuth } from "./auth"
import {
  completeConnectorSyncJob,
  createConnectorSyncJob,
  failConnectorSyncJob,
  persistConnectorSyncResult,
} from "./data-store"
import { signedOAuth1aGetJson } from "./oauth1a"
import { listConnectorStatusesForUser, setConnectorStatusForUser } from "./server"
import type {
  ConnectorSyncResult,
  ConnectorSyncRunSummary,
  HealthClinicalRecordInput,
  HealthMetricSampleInput,
} from "./sync-types"
import type { HealthConnectorDefinition, HealthConnectorId } from "./types"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

function startDateIso(daysBack = 7): string {
  const date = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

function nowIso(): string {
  return new Date().toISOString()
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function metric(
  metricType: string,
  valueNumeric: number | null,
  unit: string | null,
  observedAt: string,
  source: string,
  payload: Record<string, unknown>
): HealthMetricSampleInput | null {
  if (valueNumeric === null) return null
  return {
    metricType,
    valueNumeric,
    unit,
    observedAt,
    source,
    payload,
  }
}

async function fetchJson(
  url: string,
  accessToken: string,
  method: "GET" | "POST" = "GET",
  body?: URLSearchParams
): Promise<{ ok: true; data: JsonValue } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? body.toString() : undefined,
      cache: "no-store",
    })
    const text = await response.text()
    let payload: JsonValue = text
    try {
      payload = JSON.parse(text) as JsonValue
    } catch {
      payload = { raw: text }
    }

    if (!response.ok) {
      const message =
        asRecord(payload)?.error_description ||
        asRecord(payload)?.error ||
        `HTTP ${response.status}`
      return {
        ok: false,
        error: typeof message === "string" ? message : `HTTP ${response.status}`,
      }
    }
    return { ok: true, data: payload }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    }
  }
}

function extractFitbitMetrics(payload: JsonValue, source: string): HealthMetricSampleInput[] {
  const metrics: HealthMetricSampleInput[] = []
  const root = asRecord(payload)
  if (!root) return metrics
  const observedAt = nowIso()

  const summary = asRecord(root.summary)
  if (summary) {
    const steps = metric("steps", toNumber(summary.steps), "count", observedAt, source, summary)
    if (steps) metrics.push(steps)
    const calories = metric(
      "calories",
      toNumber(summary.caloriesOut),
      "kcal",
      observedAt,
      source,
      summary
    )
    if (calories) metrics.push(calories)
  }

  const activitiesHeart = asArray(root["activities-heart"])
  const firstHeart = asRecord(activitiesHeart[0])
  const value = firstHeart ? asRecord(firstHeart.value) : null
  const restingHeartRate = metric(
    "resting_heart_rate",
    toNumber(value?.restingHeartRate),
    "bpm",
    observedAt,
    source,
    value || {}
  )
  if (restingHeartRate) metrics.push(restingHeartRate)

  const sleepSummary = asRecord(root.summary)
  const totalMinutesAsleep = metric(
    "sleep_hours",
    (() => {
      const minutes = toNumber(sleepSummary?.totalMinutesAsleep)
      return minutes === null ? null : Number((minutes / 60).toFixed(2))
    })(),
    "hours",
    observedAt,
    source,
    sleepSummary || {}
  )
  if (totalMinutesAsleep) metrics.push(totalMinutesAsleep)

  return metrics
}

function extractOuraMetrics(payload: JsonValue, source: string): HealthMetricSampleInput[] {
  const metrics: HealthMetricSampleInput[] = []
  const root = asRecord(payload)
  if (!root) return metrics
  const rows = asArray(root.data)
  for (const row of rows) {
    const item = asRecord(row)
    if (!item) continue
    const observedAt = toStringValue(item.day) ? `${item.day}T00:00:00.000Z` : nowIso()

    const score = metric("sleep_score", toNumber(item.score), "score", observedAt, source, item)
    if (score) metrics.push(score)
    const steps = metric("steps", toNumber(item.steps), "count", observedAt, source, item)
    if (steps) metrics.push(steps)
    const activeCalories = metric(
      "active_calories",
      toNumber(item.active_calories),
      "kcal",
      observedAt,
      source,
      item
    )
    if (activeCalories) metrics.push(activeCalories)
    const readiness = metric(
      "readiness_score",
      toNumber(item.score),
      "score",
      observedAt,
      source,
      item
    )
    if (readiness && source.includes("readiness")) metrics.push(readiness)
  }
  return metrics
}

function extractWhoopMetrics(payload: JsonValue, source: string): HealthMetricSampleInput[] {
  const metrics: HealthMetricSampleInput[] = []
  const root = asRecord(payload)
  if (!root) return metrics
  const records = asArray(root.records || root.data)
  for (const row of records) {
    const item = asRecord(row)
    if (!item) continue
    const observedAt =
      toStringValue(item.updated_at) ||
      toStringValue(item.created_at) ||
      toStringValue(item.start) ||
      nowIso()

    const strain = metric("strain_score", toNumber(item.strain), "score", observedAt, source, item)
    if (strain) metrics.push(strain)
    const recovery = metric(
      "recovery_score",
      toNumber(item.score || item.recovery_score),
      "score",
      observedAt,
      source,
      item
    )
    if (recovery) metrics.push(recovery)
    const sleepPerformance = metric(
      "sleep_score",
      toNumber(item.sleep_performance_percentage || item.score),
      "score",
      observedAt,
      source,
      item
    )
    if (sleepPerformance && source.includes("sleep")) metrics.push(sleepPerformance)
  }
  return metrics
}

function extractGenericNumericMetrics(
  payload: JsonValue,
  prefix: string,
  source: string
): HealthMetricSampleInput[] {
  const metrics: HealthMetricSampleInput[] = []
  const observedAt = nowIso()

  function walk(value: JsonValue, path: string[]): void {
    if (metrics.length >= 40) return
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 10)) {
        walk(item as JsonValue, path)
      }
      return
    }
    const record = asRecord(value)
    if (record) {
      for (const [key, child] of Object.entries(record)) {
        if (["id", "user", "type", "status"].includes(key)) continue
        walk(child as JsonValue, [...path, key])
      }
      return
    }
    const numeric = toNumber(value)
    if (numeric === null) return
    const metricType = `${prefix}_${path.join("_").toLowerCase()}`
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 120)
    const point = metric(metricType, numeric, null, observedAt, source, {})
    if (point) metrics.push(point)
  }

  walk(payload, [])
  return metrics
}

async function syncWearableConnector(
  userId: string,
  connector: HealthConnectorDefinition,
  accessToken: string
): Promise<ConnectorSyncResult> {
  const metrics: HealthMetricSampleInput[] = []
  const warnings: string[] = []
  const clinicalRecords: HealthClinicalRecordInput[] = []

  const sinceDate = startDateIso(10)

  if (connector.id === "fitbit") {
    const urls = [
      `https://api.fitbit.com/1/user/-/activities/date/today.json`,
      `https://api.fitbit.com/1.2/user/-/sleep/date/today.json`,
      `https://api.fitbit.com/1/user/-/activities/heart/date/today/1d.json`,
    ]
    for (const url of urls) {
      const response = await fetchJson(url, accessToken)
      if (!response.ok) {
        warnings.push(`${connector.name}: ${response.error}`)
        continue
      }
      metrics.push(...extractFitbitMetrics(response.data, url))
    }
  } else if (connector.id === "oura") {
    const urls = [
      `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${sinceDate}`,
      `https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${sinceDate}`,
      `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${sinceDate}`,
    ]
    for (const url of urls) {
      const response = await fetchJson(url, accessToken)
      if (!response.ok) {
        warnings.push(`${connector.name}: ${response.error}`)
        continue
      }
      metrics.push(...extractOuraMetrics(response.data, url))
    }
  } else if (connector.id === "whoop") {
    const urls = [
      "https://api.prod.whoop.com/developer/v1/cycle?limit=20",
      "https://api.prod.whoop.com/developer/v1/recovery?limit=20",
      "https://api.prod.whoop.com/developer/v1/sleep?limit=20",
    ]
    for (const url of urls) {
      const response = await fetchJson(url, accessToken)
      if (!response.ok) {
        warnings.push(`${connector.name}: ${response.error}`)
        continue
      }
      metrics.push(...extractWhoopMetrics(response.data, url))
    }
  } else if (connector.id === "withings") {
    const withingsUrl = "https://wbsapi.withings.net/v2/measure"
    const body = new URLSearchParams()
    body.set("action", "getmeas")
    const response = await fetchJson(withingsUrl, accessToken, "POST", body)
    if (!response.ok) {
      warnings.push(`${connector.name}: ${response.error}`)
    } else {
      metrics.push(...extractGenericNumericMetrics(response.data, "withings", withingsUrl))
    }
  } else if (connector.id === "polar") {
    const urls = [
      "https://www.polaraccesslink.com/v3/users",
      "https://www.polaraccesslink.com/v3/exercises",
    ]
    for (const url of urls) {
      const response = await fetchJson(url, accessToken)
      if (!response.ok) {
        warnings.push(`${connector.name}: ${response.error}`)
        continue
      }
      metrics.push(...extractGenericNumericMetrics(response.data, "polar", url))
    }
  } else if (connector.id === "garmin") {
    const account = await readConnectorAccountAuth(userId, connector.id)
    const tokenSecret = account?.refreshToken
    if (!tokenSecret) {
      warnings.push("Garmin OAuth1a token secret is missing; reconnect Garmin.")
    } else {
      const urls = [
        "https://apis.garmin.com/wellness-api/rest/dailies",
        "https://apis.garmin.com/wellness-api/rest/sleeps",
      ]
      for (const url of urls) {
        const response = await signedOAuth1aGetJson({
          url,
          connectorId: connector.id,
          accessToken,
          tokenSecret,
        })
        if (!response.ok) {
          warnings.push(`${connector.name}: ${response.error}`)
          continue
        }
        metrics.push(...extractGenericNumericMetrics(response.data as JsonValue, "garmin", url))
      }
    }
  }

  return {
    connectorId: connector.id,
    metrics,
    clinicalRecords,
    warnings,
  }
}

function inferFhirBaseUrl(connector: HealthConnectorDefinition): string | null {
  const fhirEnv = connector.requiredCredentials.find((item) =>
    item.env.endsWith("FHIR_BASE_URL")
  )
  if (fhirEnv?.env && process.env[fhirEnv.env]) {
    return process.env[fhirEnv.env] as string
  }
  if (
    connector.id === "aggregator_1uphealth" &&
    process.env.AGG_1UPHEALTH_FHIR_BASE_URL
  ) {
    return process.env.AGG_1UPHEALTH_FHIR_BASE_URL
  }
  if (
    connector.id === "aggregator_health_gorilla" &&
    process.env.AGG_HEALTH_GORILLA_FHIR_BASE_URL
  ) {
    return process.env.AGG_HEALTH_GORILLA_FHIR_BASE_URL
  }
  if (connector.id === "aggregator_redox" && process.env.AGG_REDOX_FHIR_BASE_URL) {
    return process.env.AGG_REDOX_FHIR_BASE_URL
  }
  if (
    connector.id === "aggregator_particle" &&
    process.env.AGG_PARTICLE_FHIR_BASE_URL
  ) {
    return process.env.AGG_PARTICLE_FHIR_BASE_URL
  }
  return null
}

function normalizeFhirDate(resource: Record<string, unknown>): string | null {
  const fields = [
    resource.effectiveDateTime,
    resource.issued,
    resource.authoredOn,
    resource.recordedDate,
    resource.onsetDateTime,
    resource.date,
    resource.meta && asRecord(resource.meta)?.lastUpdated,
  ]
  for (const field of fields) {
    const value = toStringValue(field)
    if (value) return value
  }
  return null
}

function observationToMetrics(
  resource: Record<string, unknown>,
  connectorId: HealthConnectorId
): HealthMetricSampleInput[] {
  const metrics: HealthMetricSampleInput[] = []
  const observedAt = normalizeFhirDate(resource) || nowIso()
  const code = asRecord(resource.code)
  const coding = asArray(code?.coding)
  const primaryCoding = asRecord(coding[0])
  const display =
    toStringValue(primaryCoding?.display) || toStringValue(code?.text) || "observation"
  const normalizedDisplay = display.toLowerCase()

  const valueQuantity = asRecord(resource.valueQuantity)
  const valueNumeric = toNumber(valueQuantity?.value)
  const unit = toStringValue(valueQuantity?.unit)
  if (valueNumeric !== null) {
    let metricType = `observation_${normalizedDisplay.replace(/[^a-z0-9]+/g, "_")}`
    if (normalizedDisplay.includes("heart") && normalizedDisplay.includes("rate")) {
      metricType = "heart_rate"
    } else if (normalizedDisplay.includes("oxygen")) {
      metricType = "spo2"
    } else if (normalizedDisplay.includes("respiratory")) {
      metricType = "respiratory_rate"
    } else if (normalizedDisplay.includes("body weight")) {
      metricType = "weight"
    }
    const point = metric(metricType, valueNumeric, unit, observedAt, connectorId, resource)
    if (point) metrics.push(point)
  }

  const components = asArray(resource.component)
  for (const component of components) {
    const row = asRecord(component)
    if (!row) continue
    const componentCode = asRecord(row.code)
    const componentCoding = asRecord(asArray(componentCode?.coding)[0])
    const componentDisplay =
      toStringValue(componentCoding?.display) ||
      toStringValue(componentCode?.text) ||
      "component"
    const componentValue = asRecord(row.valueQuantity)
    const numericValue = toNumber(componentValue?.value)
    const componentUnit = toStringValue(componentValue?.unit)
    const metricType = `observation_${componentDisplay
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")}`
    const point = metric(metricType, numericValue, componentUnit, observedAt, connectorId, row)
    if (point) metrics.push(point)
  }

  return metrics
}

function resourceToClinicalRecord(resource: Record<string, unknown>): HealthClinicalRecordInput {
  const resourceType = toStringValue(resource.resourceType) || "Resource"
  const resourceId = toStringValue(resource.id) || crypto.randomUUID()
  const code = asRecord(resource.code)
  const coding = asArray(code?.coding)
  const primaryCoding = asRecord(coding[0])

  return {
    resourceType,
    resourceId,
    status: toStringValue(resource.status),
    code: toStringValue(primaryCoding?.code),
    display:
      toStringValue(primaryCoding?.display) ||
      toStringValue(code?.text) ||
      `${resourceType} record`,
    effectiveAt: normalizeFhirDate(resource),
    payload: resource,
  }
}

async function syncFhirConnector(
  connector: HealthConnectorDefinition,
  accessToken: string
): Promise<ConnectorSyncResult> {
  const fhirBaseUrl = inferFhirBaseUrl(connector)
  if (!fhirBaseUrl) {
    return {
      connectorId: connector.id,
      metrics: [],
      clinicalRecords: [],
      warnings: [
        `Missing FHIR base URL configuration for ${connector.name}. Add the provider FHIR base URL env var.`,
      ],
    }
  }

  const resources = [
    "Patient",
    "Condition",
    "MedicationRequest",
    "AllergyIntolerance",
    "Observation",
    "DiagnosticReport",
    "Encounter",
    "Procedure",
  ]
  const clinicalRecords: HealthClinicalRecordInput[] = []
  const metrics: HealthMetricSampleInput[] = []
  const warnings: string[] = []

  for (const resourceType of resources) {
    const url = `${fhirBaseUrl.replace(/\/$/, "")}/${resourceType}?_count=50`
    const response = await fetchJson(url, accessToken)
    if (!response.ok) {
      warnings.push(`${resourceType}: ${response.error}`)
      continue
    }
    const bundle = asRecord(response.data)
    const entries = asArray(bundle?.entry)
    for (const item of entries) {
      const entry = asRecord(item)
      const resource = entry ? asRecord(entry.resource) : null
      if (!resource) continue
      clinicalRecords.push(resourceToClinicalRecord(resource))
      if (resourceType === "Observation") {
        metrics.push(...observationToMetrics(resource, connector.id))
      }
    }
  }

  return {
    connectorId: connector.id,
    metrics,
    clinicalRecords,
    warnings,
  }
}

export async function syncConnectorForUser(
  userId: string,
  connectorId: HealthConnectorId
): Promise<ConnectorSyncRunSummary> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    return {
      connectorId,
      status: "error",
      metricsIngested: 0,
      recordsIngested: 0,
      warningCount: 0,
      error: "Unknown connector",
    }
  }

  if (connector.availability === "coming_soon") {
    return {
      connectorId: connector.id,
      status: "skipped",
      metricsIngested: 0,
      recordsIngested: 0,
      warningCount: 1,
      error: connector.comingSoonReason || "Connector is coming soon.",
    }
  }

  const jobId = await createConnectorSyncJob(userId, connector.id)
  try {
    const accessToken = await ensureConnectorAccessTokenForSync(userId, connector.id)
    const result =
      connector.category === "medical_records"
        ? await syncFhirConnector(connector, accessToken)
        : await syncWearableConnector(userId, connector, accessToken)

    await persistConnectorSyncResult(userId, result)
    await setConnectorStatusForUser(userId, connector.id, "connected", {
      metadata: {
        lastSyncAt: new Date().toISOString(),
        warningCount: result.warnings.length,
      },
    })

    const summary = {
      connectorId: connector.id,
      status: "ok" as const,
      metricsIngested: result.metrics.length,
      recordsIngested: result.clinicalRecords.length,
      warningCount: result.warnings.length,
    }

    await completeConnectorSyncJob(jobId, {
      ...summary,
      warnings: result.warnings,
    })
    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed"
    await setConnectorStatusForUser(userId, connector.id, "error", {
      lastError: message,
      metadata: {
        failedSyncAt: new Date().toISOString(),
      },
    })
    await failConnectorSyncJob(jobId, message)
    return {
      connectorId: connector.id,
      status: "error",
      metricsIngested: 0,
      recordsIngested: 0,
      warningCount: 0,
      error: message,
    }
  }
}

export async function syncAllConnectedConnectorsForUser(
  userId: string
): Promise<ConnectorSyncRunSummary[]> {
  const statuses = await listConnectorStatusesForUser(userId)
  const connectorIds = Object.values(statuses)
    .filter((record) => record.status === "connected")
    .map((record) => record.connectorId)

  const summaries: ConnectorSyncRunSummary[] = []
  for (const connectorId of connectorIds) {
    summaries.push(await syncConnectorForUser(userId, connectorId))
  }
  return summaries
}
