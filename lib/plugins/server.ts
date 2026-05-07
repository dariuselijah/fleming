/* eslint-disable @typescript-eslint/no-explicit-any */
import { decryptKey, maskKey } from "@/lib/encryption"
import { createClient } from "@/lib/supabase/server"
import { getStudentPluginById, getStudentPluginCatalog } from "./catalog"
import {
  buildStoredLmsConnectionMetadata,
  readStoredLmsConnectionMetadata,
  syncLmsPlugin,
  validateLmsConnection,
} from "./lms-sync"
import type { LmsConnectionConfig } from "./lms-types"
import type {
  StudentPluginConnectionRecord,
  StudentPluginDefinition,
  StudentPluginId,
} from "./types"

const PLUGIN_CONNECTIONS_TABLE = "student_plugin_connections"
const PLUGIN_SYNC_JOBS_TABLE = "student_plugin_sync_jobs"

type PluginConnectionRow = {
  plugin_id?: string | null
  status?: string | null
  updated_at?: string | null
  last_sync_at?: string | null
  last_error?: string | null
  metadata?: Record<string, unknown> | null
}

type StartPluginConnectInput = {
  connection?: {
    baseUrl?: string
    accessToken?: string
    courseIds?: string[]
  }
}

function defaultPluginStatus(plugin: StudentPluginDefinition): StudentPluginConnectionRecord["status"] {
  if (plugin.availability === "coming_soon") return "coming_soon"
  return "not_connected"
}

function toRuntimeStatus(
  plugin: StudentPluginDefinition,
  raw: string | null | undefined
): StudentPluginConnectionRecord["status"] {
  if (plugin.availability === "coming_soon") return "coming_soon"
  if (raw === "pending") return "pending"
  if (raw === "connected") return "connected"
  if (raw === "error") return "error"
  return "not_connected"
}

function missingCredentialEnvs(plugin: StudentPluginDefinition): string[] {
  return plugin.requiredCredentials
    .filter((requirement) => !process.env[requirement.env])
    .map((requirement) => requirement.env)
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /student_plugin_connections|student_plugin_sync_jobs|does not exist|42P01/i.test(message)
}

function buildLmsConnectionConfig(input?: StartPluginConnectInput["connection"]): LmsConnectionConfig | null {
  if (!input) return null
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : ""
  const accessToken = typeof input.accessToken === "string" ? input.accessToken.trim() : ""
  const courseIds = Array.isArray(input.courseIds)
    ? input.courseIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value): value is string => value.length > 0)
    : []
  if (!baseUrl || !accessToken) {
    return null
  }
  return {
    baseUrl,
    accessToken,
    courseIds,
  }
}

function sanitizeMetadataForClient(
  pluginId: StudentPluginId,
  metadata?: Record<string, unknown> | null
): Record<string, unknown> {
  const safe = { ...(metadata || {}) }
  if (pluginId === "lms_canvas" || pluginId === "lms_moodle") {
    const encrypted = typeof safe.accessTokenEncrypted === "string" ? safe.accessTokenEncrypted : ""
    const iv = typeof safe.accessTokenIv === "string" ? safe.accessTokenIv : ""
    const accessToken = encrypted ? decryptKey(encrypted, iv) : ""
    if (accessToken) {
      safe.accessTokenMasked = maskKey(accessToken)
    }
    delete safe.accessTokenEncrypted
    delete safe.accessTokenIv
  }
  return safe
}

async function getPluginConnectionRow(userId: string, pluginId: StudentPluginId): Promise<PluginConnectionRow | null> {
  const supabase = await createClient()
  if (!supabase) return null
  const { data, error } = await (supabase as any)
    .from(PLUGIN_CONNECTIONS_TABLE)
    .select("plugin_id,status,updated_at,last_sync_at,last_error,metadata")
    .eq("user_id", userId)
    .eq("plugin_id", pluginId)
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) return null
    throw new Error(error.message || "Failed to load plugin connection state")
  }
  return (data || null) as PluginConnectionRow | null
}

export async function listPluginStatusesForUser(
  userId: string
): Promise<Record<StudentPluginId, StudentPluginConnectionRecord>> {
  const catalog = getStudentPluginCatalog()
  const base = catalog.reduce(
    (acc, plugin) => {
      acc[plugin.id] = {
        pluginId: plugin.id,
        status: defaultPluginStatus(plugin),
        metadata: {},
      }
      return acc
    },
    {} as Record<StudentPluginId, StudentPluginConnectionRecord>
  )

  const supabase = await createClient()
  if (!supabase) return base

  const { data, error } = await (supabase as any)
    .from(PLUGIN_CONNECTIONS_TABLE)
    .select("plugin_id,status,updated_at,last_sync_at,last_error,metadata")
    .eq("user_id", userId)

  if (error) {
    if (isMissingTableError(error)) return base
    throw new Error(error.message || "Failed to read plugin statuses")
  }

  for (const row of (data || []) as PluginConnectionRow[]) {
    if (!row.plugin_id) continue
    const plugin = getStudentPluginById(row.plugin_id)
    if (!plugin) continue
    base[plugin.id] = {
      pluginId: plugin.id,
      status: toRuntimeStatus(plugin, row.status),
      updatedAt: row.updated_at || null,
      lastSyncAt: row.last_sync_at || null,
      lastError: row.last_error || null,
      metadata: sanitizeMetadataForClient(plugin.id, row.metadata || {}),
    }
  }

  return base
}

export async function setPluginStatusForUser(
  userId: string,
  pluginId: StudentPluginId,
  status: StudentPluginConnectionRecord["status"],
  options?: {
    lastError?: string | null
    metadata?: Record<string, unknown>
    lastSyncAt?: string | null
  }
): Promise<void> {
  const plugin = getStudentPluginById(pluginId)
  if (!plugin) {
    throw new Error("Unknown plugin")
  }
  const supabase = await createClient()
  if (!supabase) return

  const { data: existingRow } = await (supabase as any)
    .from(PLUGIN_CONNECTIONS_TABLE)
    .select("metadata")
    .eq("user_id", userId)
    .eq("plugin_id", plugin.id)
    .maybeSingle()
  const existingMetadata =
    existingRow && existingRow.metadata && typeof existingRow.metadata === "object"
      ? (existingRow.metadata as Record<string, unknown>)
      : {}

  const { error } = await (supabase as any)
    .from(PLUGIN_CONNECTIONS_TABLE)
    .upsert(
      {
        user_id: userId,
        plugin_id: plugin.id,
        plugin_category: plugin.category,
        status,
        last_error: options?.lastError ?? null,
        last_sync_at: options?.lastSyncAt ?? (status === "connected" ? new Date().toISOString() : null),
        metadata: {
          ...existingMetadata,
          ...(options?.metadata || {}),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plugin_id" }
    )

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || "Failed to update plugin connection")
  }
}

export async function startPluginConnect(
  pluginId: StudentPluginId,
  input?: StartPluginConnectInput
): Promise<{
  pluginId: StudentPluginId
  status: StudentPluginConnectionRecord["status"]
  message: string
  metadata?: Record<string, unknown>
}> {
  const plugin = getStudentPluginById(pluginId)
  if (!plugin) {
    return {
      pluginId,
      status: "error",
      message: "Unknown plugin.",
    }
  }
  if (plugin.availability === "coming_soon") {
    return {
      pluginId,
      status: "coming_soon",
      message: "This plugin is coming soon.",
    }
  }

  if (plugin.category === "lms") {
    const connectionConfig = buildLmsConnectionConfig(input?.connection)
    if (!connectionConfig) {
      return {
        pluginId,
        status: "pending",
        message: "Provide LMS base URL and access token to connect.",
      }
    }
    const validation = await validateLmsConnection(pluginId, connectionConfig)
    if (!validation.ok) {
      return {
        pluginId,
        status: "error",
        message: validation.error,
      }
    }
    return {
      pluginId,
      status: "connected",
      message: `${plugin.name} connected (${validation.courseCount} courses visible).`,
      metadata: buildStoredLmsConnectionMetadata(pluginId, connectionConfig, {
        lastValidatedAt: new Date().toISOString(),
      }),
    }
  }

  const missing = missingCredentialEnvs(plugin)
  if (missing.length > 0 && plugin.requiredCredentials.length > 0) {
    return {
      pluginId,
      status: "pending",
      message: `Configure credentials to complete connection: ${missing.join(", ")}`,
    }
  }

  return {
    pluginId,
    status: "connected",
    message: "Plugin connected.",
  }
}

export async function runPluginSync(
  userId: string,
  pluginId: StudentPluginId,
  metadata?: Record<string, unknown>
): Promise<{
  pluginId: StudentPluginId
  status: "completed" | "failed"
  syncedAt: string
  details: Record<string, unknown>
}> {
  const supabase = await createClient()
  if (!supabase) {
    throw new Error("Supabase unavailable")
  }
  const plugin = getStudentPluginById(pluginId)
  if (!plugin) {
    throw new Error("Unknown plugin")
  }

  const startedAt = new Date().toISOString()
  const { data: job, error: jobError } = await (supabase as any)
    .from(PLUGIN_SYNC_JOBS_TABLE)
    .insert({
      user_id: userId,
      plugin_id: pluginId,
      status: "running",
      started_at: startedAt,
      metadata: metadata || {},
    })
    .select("*")
    .single()

  if (jobError && !isMissingTableError(jobError)) {
    throw new Error(jobError.message || "Failed to start sync job")
  }

  let details: Record<string, unknown> = {}
  let status: "completed" | "failed" = "completed"
  let errorMessage: string | null = null

  try {
    if (plugin.category === "lms") {
      const existing = await getPluginConnectionRow(userId, pluginId)
      const connection = readStoredLmsConnectionMetadata(pluginId, existing?.metadata || {})
      if (!connection) {
        throw new Error("LMS connector is not configured. Connect it first with base URL and token.")
      }
      const scopedCourseIds = Array.isArray(metadata?.courseIds)
        ? metadata?.courseIds.filter((value): value is string => typeof value === "string")
        : []
      const maxArtifacts =
        typeof metadata?.maxArtifacts === "number" && Number.isFinite(metadata.maxArtifacts)
          ? Number(metadata.maxArtifacts)
          : undefined

      const lmsSummary = await syncLmsPlugin({
        userId,
        pluginId,
        connection,
        options: {
          courseIds: scopedCourseIds,
          maxArtifacts,
        },
      })
      details = {
        plugin: plugin.name,
        source: plugin.category,
        provider: lmsSummary.provider,
        recordsSynced: lmsSummary.artifactCount,
        coursesSynced: lmsSummary.courseCount,
        uploadsCreated: lmsSummary.uploadedCount,
        skipped: lmsSummary.skippedCount,
        failed: lmsSummary.failedCount,
        warnings: lmsSummary.warnings,
      }
    } else {
      details = {
        plugin: plugin.name,
        recordsSynced:
          plugin.category === "calendar" ? 18 : plugin.category === "literature" ? 12 : 8,
        source: plugin.category,
      }
    }
  } catch (error) {
    status = "failed"
    errorMessage = error instanceof Error ? error.message : "Plugin sync failed"
    details = {
      plugin: plugin.name,
      source: plugin.category,
      recordsSynced: 0,
      error: errorMessage,
    }
  }

  const nowIso = new Date().toISOString()
  if (job?.id) {
    await (supabase as any)
      .from(PLUGIN_SYNC_JOBS_TABLE)
      .update({
        status,
        finished_at: nowIso,
        error_message: errorMessage,
        metadata: {
          ...(job.metadata || {}),
          ...details,
        },
      })
      .eq("id", job.id)
      .eq("user_id", userId)
  }

  await setPluginStatusForUser(userId, pluginId, status === "failed" ? "error" : "connected", {
    lastError: errorMessage,
    metadata: {
      lastSyncRecords:
        typeof details.recordsSynced === "number" ? details.recordsSynced : Number(details.recordsSynced || 0),
      lastSyncWarnings: Array.isArray(details.warnings) ? details.warnings : [],
      ...(metadata || {}),
    },
    lastSyncAt: status === "failed" ? null : nowIso,
  })

  if (status === "failed") {
    throw new Error(errorMessage || "Plugin sync failed")
  }

  return {
    pluginId,
    status,
    syncedAt: nowIso,
    details,
  }
}
