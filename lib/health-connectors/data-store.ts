import { createClient } from "@/lib/supabase/server"
import type { HealthConnectorId } from "./types"
import type {
  ConnectorSyncResult,
  HealthClinicalRecordInput,
  HealthMetricSampleInput,
} from "./sync-types"

const CONNECTOR_SYNC_JOBS_TABLE = "health_connector_sync_jobs"
const CONNECTOR_AUDIT_TABLE = "health_connector_audit_events"
const HEALTH_METRIC_SAMPLES_TABLE = "health_metric_samples"
const HEALTH_CLINICAL_RECORDS_TABLE = "health_clinical_records"

type SupabaseInsertResult = {
  error: { message?: string } | null
}

type SupabaseQueryResult<T> = {
  data: T | null
  error: { message?: string } | null
}

type SupabaseGateway = {
  from: (table: string) => {
    insert: (payload: unknown) => Promise<SupabaseInsertResult>
    upsert: (
      payload: unknown,
      options?: { onConflict?: string; ignoreDuplicates?: boolean }
    ) => Promise<SupabaseInsertResult>
    update: (payload: unknown) => {
      eq: (column: string, value: string) => Promise<SupabaseInsertResult>
    }
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options?: { ascending?: boolean }
        ) => {
          limit: (value: number) => Promise<SupabaseQueryResult<Record<string, unknown>[]>>
        }
      }
    }
  }
}

function gateway(client: unknown): SupabaseGateway {
  return client as SupabaseGateway
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /does not exist|42P01|health_connector_sync_jobs|health_metric_samples|health_clinical_records|health_connector_audit_events/i.test(
    message
  )
}

function normalizeMetricRows(
  userId: string,
  connectorId: HealthConnectorId,
  metrics: HealthMetricSampleInput[]
) {
  return metrics.map((metric) => ({
    user_id: userId,
    connector_id: connectorId,
    metric_type: metric.metricType,
    value_numeric: metric.valueNumeric,
    value_text: metric.valueText || null,
    unit: metric.unit || null,
    observed_at: metric.observedAt,
    source: metric.source || null,
    payload: metric.payload || {},
    updated_at: new Date().toISOString(),
  }))
}

function normalizeClinicalRows(
  userId: string,
  connectorId: HealthConnectorId,
  clinicalRecords: HealthClinicalRecordInput[]
) {
  return clinicalRecords.map((record) => ({
    user_id: userId,
    connector_id: connectorId,
    resource_type: record.resourceType,
    resource_id: record.resourceId,
    status: record.status || null,
    code: record.code || null,
    display: record.display || null,
    effective_at: record.effectiveAt || null,
    payload: record.payload,
    updated_at: new Date().toISOString(),
  }))
}

export async function createConnectorSyncJob(
  userId: string,
  connectorId: HealthConnectorId
): Promise<string | null> {
  const supabase = await createClient()
  if (!supabase) return null

  const jobId = crypto.randomUUID()
  const { error } = await gateway(supabase)
    .from(CONNECTOR_SYNC_JOBS_TABLE)
    .insert({
      id: jobId,
      user_id: userId,
      connector_id: connectorId,
      status: "pending",
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      result_summary: {},
    })

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || "Failed to create connector sync job")
  }

  return jobId
}

export async function completeConnectorSyncJob(
  jobId: string | null,
  summary: Record<string, unknown>
): Promise<void> {
  if (!jobId) return
  const supabase = await createClient()
  if (!supabase) return

  const { error } = await gateway(supabase)
    .from(CONNECTOR_SYNC_JOBS_TABLE)
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      result_summary: summary,
    })
    .eq("id", jobId)

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || "Failed to complete connector sync job")
  }
}

export async function failConnectorSyncJob(
  jobId: string | null,
  errorMessage: string
): Promise<void> {
  if (!jobId) return
  const supabase = await createClient()
  if (!supabase) return

  const { error } = await gateway(supabase)
    .from(CONNECTOR_SYNC_JOBS_TABLE)
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: errorMessage,
    })
    .eq("id", jobId)

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || "Failed to mark connector sync job failed")
  }
}

export async function persistConnectorSyncResult(
  userId: string,
  result: ConnectorSyncResult
): Promise<void> {
  const supabase = await createClient()
  if (!supabase) return

  const metricRows = normalizeMetricRows(userId, result.connectorId, result.metrics)
  if (metricRows.length > 0) {
    const { error } = await gateway(supabase)
      .from(HEALTH_METRIC_SAMPLES_TABLE)
      .upsert(metricRows, {
        onConflict: "user_id,connector_id,metric_type,observed_at,source",
      })
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || "Failed to persist metric samples")
    }
  }

  const clinicalRows = normalizeClinicalRows(
    userId,
    result.connectorId,
    result.clinicalRecords
  )
  if (clinicalRows.length > 0) {
    const { error } = await gateway(supabase)
      .from(HEALTH_CLINICAL_RECORDS_TABLE)
      .upsert(clinicalRows, {
        onConflict: "user_id,connector_id,resource_type,resource_id",
      })
    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || "Failed to persist clinical records")
    }
  }

  const { error: auditError } = await gateway(supabase)
    .from(CONNECTOR_AUDIT_TABLE)
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      connector_id: result.connectorId,
      event_type: "sync_completed",
      event_data: {
        metricsIngested: result.metrics.length,
        recordsIngested: result.clinicalRecords.length,
        warnings: result.warnings,
      },
      created_at: new Date().toISOString(),
    })
  if (auditError && !isMissingTableError(auditError)) {
    throw new Error(auditError.message || "Failed to persist connector audit event")
  }
}

export async function readHealthSummaryForUser(userId: string): Promise<{
  latestMetrics: Record<string, number>
  recentClinicalRecordCount: number
  metricSampleCount: number
}> {
  const supabase = await createClient()
  if (!supabase) {
    return {
      latestMetrics: {},
      recentClinicalRecordCount: 0,
      metricSampleCount: 0,
    }
  }

  const latestRowsResponse = await gateway(supabase)
    .from(HEALTH_METRIC_SAMPLES_TABLE)
    .select("metric_type,value_numeric,observed_at")
    .eq("user_id", userId)
    .order("observed_at", { ascending: false })
    .limit(300)

  if (latestRowsResponse.error) {
    if (isMissingTableError(latestRowsResponse.error)) {
      return {
        latestMetrics: {},
        recentClinicalRecordCount: 0,
        metricSampleCount: 0,
      }
    }
    throw new Error(latestRowsResponse.error.message || "Failed to read metric samples")
  }

  const rows = latestRowsResponse.data || []
  const latestByMetric = new Map<string, number>()
  for (const row of rows) {
    const metricType =
      typeof row.metric_type === "string" ? row.metric_type : null
    const valueNumeric =
      typeof row.value_numeric === "number" ? row.value_numeric : null
    if (!metricType || valueNumeric === null) continue
    if (!latestByMetric.has(metricType)) {
      latestByMetric.set(metricType, valueNumeric)
    }
  }

  const clinicalRowsResponse = await gateway(supabase)
    .from(HEALTH_CLINICAL_RECORDS_TABLE)
    .select("resource_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500)

  if (clinicalRowsResponse.error && !isMissingTableError(clinicalRowsResponse.error)) {
    throw new Error(
      clinicalRowsResponse.error.message || "Failed to read clinical records"
    )
  }

  return {
    latestMetrics: Object.fromEntries(latestByMetric.entries()),
    recentClinicalRecordCount: (clinicalRowsResponse.data || []).length,
    metricSampleCount: rows.length,
  }
}
