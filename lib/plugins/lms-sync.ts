/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "crypto"
import { decryptKey, encryptKey } from "@/lib/encryption"
import { createClient } from "@/lib/supabase/server"
import { UserUploadService } from "@/lib/uploads/server"
import { CanvasLmsClient } from "./canvas-client"
import { MoodleLmsClient } from "./moodle-client"
import type {
  LmsArtifact,
  LmsConnectionConfig,
  LmsCourse,
  LmsProvider,
  LmsSyncPayload,
  LmsSyncSummary,
} from "./lms-types"
import type { StudentPluginId } from "./types"

const LMS_COURSES_TABLE = "student_lms_courses"
const LMS_ARTIFACTS_TABLE = "student_lms_artifacts"
type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>

type StoredLmsConnectionMetadata = {
  provider: LmsProvider
  baseUrl: string
  accessTokenEncrypted: string
  accessTokenIv: string
  courseIds: string[]
  configuredAt: string
  lastValidatedAt?: string
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /student_lms_courses|student_lms_artifacts|does not exist|42P01/i.test(message)
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function sanitizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    return parsed.toString().replace(/\/+$/, "")
  } catch {
    return ""
  }
}

function mapPluginToProvider(pluginId: StudentPluginId): LmsProvider | null {
  if (pluginId === "lms_canvas") return "canvas"
  if (pluginId === "lms_moodle") return "moodle"
  return null
}

function makeClient(provider: LmsProvider, config: LmsConnectionConfig) {
  if (provider === "canvas") {
    return new CanvasLmsClient(config)
  }
  return new MoodleLmsClient(config)
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 120)
}

function buildArtifactHash(artifact: LmsArtifact): string {
  const payload = JSON.stringify({
    courseId: artifact.courseId,
    externalId: artifact.externalId,
    artifactType: artifact.artifactType,
    title: artifact.title,
    bodyText: artifact.bodyText,
    fileName: artifact.fileName || null,
    mimeType: artifact.mimeType || null,
    fileUrl: artifact.fileUrl || null,
    dueAt: artifact.dueAt || null,
    externalUpdatedAt: artifact.externalUpdatedAt || null,
  })
  return createHash("sha256").update(payload).digest("hex")
}

function buildTextArtifactDocument(artifact: LmsArtifact): { fileName: string; mimeType: string; buffer: Buffer } {
  const parts = [
    `# ${artifact.title}`,
    `Provider: ${artifact.provider}`,
    `Course: ${artifact.courseName} (${artifact.courseId})`,
    `Type: ${artifact.artifactType}`,
    artifact.dueAt ? `Due: ${artifact.dueAt}` : null,
    artifact.externalUpdatedAt ? `Updated: ${artifact.externalUpdatedAt}` : null,
    "",
    artifact.bodyText || "No body text available.",
  ]
  const content = parts.filter(Boolean).join("\n")
  const baseName = sanitizeFileName(`${artifact.courseName}-${artifact.title || artifact.externalId}`)
  const fileName = `${baseName || "lms-artifact"}.md`
  return {
    fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from(content, "utf8"),
  }
}

async function fetchBinaryArtifact(artifact: LmsArtifact, accessToken: string): Promise<{
  fileName: string
  mimeType: string
  buffer: Buffer
} | null> {
  if (!artifact.fileUrl) return null
  const response = await fetch(artifact.fileUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "*/*",
    },
    cache: "no-store",
  })
  if (!response.ok) {
    return null
  }
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (buffer.byteLength === 0) {
    return null
  }

  const fallbackName = sanitizeFileName(artifact.fileName || artifact.title || `${artifact.externalId}.bin`)
  const contentType = response.headers.get("content-type") || artifact.mimeType || "application/octet-stream"
  return {
    fileName: fallbackName,
    mimeType: contentType,
    buffer,
  }
}

export function buildStoredLmsConnectionMetadata(
  pluginId: StudentPluginId,
  config: LmsConnectionConfig,
  extra?: Record<string, unknown>
): StoredLmsConnectionMetadata & Record<string, unknown> {
  const provider = mapPluginToProvider(pluginId)
  if (!provider) {
    throw new Error("Plugin is not an LMS provider")
  }
  const encrypted = encryptKey(config.accessToken)
  return {
    provider,
    baseUrl: sanitizeBaseUrl(config.baseUrl),
    accessTokenEncrypted: encrypted.encrypted,
    accessTokenIv: encrypted.iv,
    courseIds: uniqueStrings(config.courseIds || []),
    configuredAt: new Date().toISOString(),
    ...(extra || {}),
  }
}

export function readStoredLmsConnectionMetadata(
  pluginId: StudentPluginId,
  metadata: Record<string, unknown> | null | undefined
): LmsConnectionConfig | null {
  const provider = mapPluginToProvider(pluginId)
  if (!provider || !metadata) return null
  const baseUrl = toText(metadata.baseUrl)
  const accessTokenEncrypted = toText(metadata.accessTokenEncrypted)
  const accessTokenIv = toText(metadata.accessTokenIv)
  const accessToken = decryptKey(accessTokenEncrypted, accessTokenIv)
  const courseIds = Array.isArray(metadata.courseIds)
    ? metadata.courseIds
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

export async function validateLmsConnection(
  pluginId: StudentPluginId,
  config: LmsConnectionConfig
): Promise<{ ok: true; provider: LmsProvider; courseCount: number } | { ok: false; error: string }> {
  const provider = mapPluginToProvider(pluginId)
  if (!provider) {
    return { ok: false, error: "Plugin is not an LMS integration." }
  }
  if (!sanitizeBaseUrl(config.baseUrl)) {
    return { ok: false, error: "A valid LMS base URL is required." }
  }
  if (!toText(config.accessToken)) {
    return { ok: false, error: "An LMS access token is required." }
  }

  try {
    const client = makeClient(provider, {
      ...config,
      baseUrl: sanitizeBaseUrl(config.baseUrl),
      courseIds: uniqueStrings(config.courseIds || []),
    })
    const courses = await client.listCourses()
    return {
      ok: true,
      provider,
      courseCount: courses.length,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to validate LMS connection.",
    }
  }
}

async function upsertLmsCourses(
  supabase: SupabaseClient,
  userId: string,
  pluginId: StudentPluginId,
  provider: LmsProvider,
  courses: LmsCourse[]
) {
  if (courses.length === 0) return
  const payload = courses.map((course) => ({
    user_id: userId,
    plugin_id: pluginId,
    provider,
    external_course_id: course.id,
    course_name: course.name,
    course_code: course.code || null,
    term_name: course.term || null,
    metadata: course.metadata || {},
    last_synced_at: new Date().toISOString(),
  }))
  const { error } = await (supabase as any)
    .from(LMS_COURSES_TABLE)
    .upsert(payload, { onConflict: "user_id,plugin_id,external_course_id" })
  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to upsert LMS courses: ${error.message}`)
  }
}

async function loadExistingArtifacts(
  supabase: SupabaseClient,
  userId: string,
  pluginId: StudentPluginId
): Promise<Map<string, { contentHash: string | null; uploadId: string | null }>> {
  const { data, error } = await (supabase as any)
    .from(LMS_ARTIFACTS_TABLE)
    .select("external_id, course_id, artifact_type, content_hash, upload_id")
    .eq("user_id", userId)
    .eq("plugin_id", pluginId)
  if (error) {
    if (isMissingTableError(error)) return new Map()
    throw new Error(`Failed to load LMS artifacts: ${error.message}`)
  }
  const map = new Map<string, { contentHash: string | null; uploadId: string | null }>()
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const externalId = toText(row.external_id)
    const courseId = toText(row.course_id)
    const artifactType = toText(row.artifact_type)
    if (!externalId || !courseId || !artifactType) continue
    map.set(`${courseId}|${artifactType}|${externalId}`, {
      contentHash: toText(row.content_hash) || null,
      uploadId: toText(row.upload_id) || null,
    })
  }
  return map
}

async function upsertArtifactRow(
  supabase: SupabaseClient,
  input: {
    userId: string
    pluginId: StudentPluginId
    provider: LmsProvider
    artifact: LmsArtifact
    contentHash: string
    uploadId: string | null
  }
) {
  const { artifact } = input
  const { error } = await (supabase as any)
    .from(LMS_ARTIFACTS_TABLE)
    .upsert(
      {
        user_id: input.userId,
        plugin_id: input.pluginId,
        provider: input.provider,
        course_id: artifact.courseId,
        course_name: artifact.courseName,
        external_id: artifact.externalId,
        artifact_type: artifact.artifactType,
        title: artifact.title,
        body_text: artifact.bodyText,
        due_at: artifact.dueAt || null,
        external_updated_at: artifact.externalUpdatedAt || null,
        file_name: artifact.fileName || null,
        mime_type: artifact.mimeType || null,
        file_url: artifact.fileUrl || null,
        content_hash: input.contentHash,
        upload_id: input.uploadId,
        metadata: artifact.metadata || {},
        synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plugin_id,course_id,artifact_type,external_id" }
    )
  if (error && !isMissingTableError(error)) {
    throw new Error(`Failed to upsert LMS artifact row: ${error.message}`)
  }
}

async function ingestArtifactAsUpload(input: {
  supabase: SupabaseClient
  uploadService: UserUploadService
  userId: string
  artifact: LmsArtifact
  accessToken: string
  warnings: string[]
}): Promise<string | null> {
  const document =
    input.artifact.artifactType === "file"
      ? await fetchBinaryArtifact(input.artifact, input.accessToken)
      : buildTextArtifactDocument(input.artifact)

  if (!document) {
    if (input.artifact.artifactType === "file") {
      input.warnings.push(`Could not download file artifact "${input.artifact.title}".`)
    }
    const fallback = buildTextArtifactDocument(input.artifact)
    return ingestBinaryDocument({
      supabase: input.supabase,
      uploadService: input.uploadService,
      userId: input.userId,
      artifact: input.artifact,
      fileName: fallback.fileName,
      mimeType: fallback.mimeType,
      buffer: fallback.buffer,
    })
  }

  return ingestBinaryDocument({
    supabase: input.supabase,
    uploadService: input.uploadService,
    userId: input.userId,
    artifact: input.artifact,
    fileName: document.fileName,
    mimeType: document.mimeType,
    buffer: document.buffer,
  })
}

async function ingestBinaryDocument(input: {
  supabase: SupabaseClient
  uploadService: UserUploadService
  userId: string
  artifact: LmsArtifact
  fileName: string
  mimeType: string
  buffer: Buffer
}): Promise<string | null> {
  const pending = await input.uploadService.createPendingUpload({
    userId: input.userId,
    fileName: input.fileName || "lms-artifact.txt",
    mimeType: input.mimeType || "application/octet-stream",
    fileSize: input.buffer.byteLength,
    title: input.artifact.title,
  })
  await (input.supabase as any)
    .from("user_uploads")
    .update({
      metadata: {
        source: "lms",
        lms: {
          provider: input.artifact.provider,
          courseId: input.artifact.courseId,
          courseName: input.artifact.courseName,
          artifactType: input.artifact.artifactType,
          externalId: input.artifact.externalId,
          title: input.artifact.title,
        },
      },
    })
    .eq("id", pending.uploadId)
    .eq("user_id", input.userId)
  const { error: storageError } = await input.supabase.storage
    .from(pending.bucket)
    .upload(pending.filePath, input.buffer, {
      contentType: input.mimeType || "application/octet-stream",
      upsert: true,
    })
  if (storageError) {
    throw new Error(`Failed to upload LMS artifact binary: ${storageError.message}`)
  }
  await input.uploadService.ingestStoredUpload(input.userId, pending.uploadId)

  return pending.uploadId
}

function mergeCoursePayload(payloads: LmsSyncPayload[]): LmsSyncPayload {
  const coursesMap = new Map<string, LmsCourse>()
  const artifactMap = new Map<string, LmsArtifact>()

  for (const payload of payloads) {
    for (const course of payload.courses) {
      coursesMap.set(course.id, course)
    }
    for (const artifact of payload.artifacts) {
      const key = `${artifact.courseId}|${artifact.artifactType}|${artifact.externalId}`
      artifactMap.set(key, artifact)
    }
  }

  return {
    courses: [...coursesMap.values()],
    artifacts: [...artifactMap.values()],
  }
}

export async function syncLmsPlugin(input: {
  userId: string
  pluginId: StudentPluginId
  connection: LmsConnectionConfig
  options?: {
    courseIds?: string[]
    maxArtifacts?: number
  }
}): Promise<LmsSyncSummary> {
  const provider = mapPluginToProvider(input.pluginId)
  if (!provider) {
    throw new Error("Requested plugin is not an LMS provider.")
  }
  const supabaseClient = await createClient()
  if (!supabaseClient) {
    throw new Error("Supabase unavailable")
  }
  const supabase = supabaseClient as SupabaseClient
  const uploadService = new UserUploadService(supabase)
  const warnings: string[] = []
  const normalizedConnection: LmsConnectionConfig = {
    baseUrl: sanitizeBaseUrl(input.connection.baseUrl),
    accessToken: input.connection.accessToken,
    courseIds: uniqueStrings(input.connection.courseIds || []),
  }
  if (!normalizedConnection.baseUrl || !normalizedConnection.accessToken) {
    throw new Error("Missing LMS baseUrl or accessToken.")
  }

  const client = makeClient(provider, normalizedConnection)
  const allCourses = await client.listCourses()
  const requestedCourseIds = uniqueStrings([
    ...(input.options?.courseIds || []),
    ...(normalizedConnection.courseIds || []),
  ])
  const selectedCourses =
    requestedCourseIds.length > 0
      ? allCourses.filter((course) => requestedCourseIds.includes(course.id))
      : allCourses

  const payloads: LmsSyncPayload[] = []
  for (const course of selectedCourses) {
    try {
      const payload = await client.fetchCoursePayload(course)
      payloads.push(payload)
    } catch (error) {
      warnings.push(
        `Failed to sync course "${course.name}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  const merged = mergeCoursePayload(payloads)
  const maxArtifacts = Math.max(20, Math.min(600, input.options?.maxArtifacts ?? 240))
  const artifacts = merged.artifacts.slice(0, maxArtifacts)

  await upsertLmsCourses(supabase, input.userId, input.pluginId, provider, merged.courses)
  const existingMap = await loadExistingArtifacts(supabase, input.userId, input.pluginId)

  let uploadedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const artifact of artifacts) {
    const key = `${artifact.courseId}|${artifact.artifactType}|${artifact.externalId}`
    const contentHash = buildArtifactHash(artifact)
    const previous = existingMap.get(key)
    let uploadId = previous?.uploadId || null

    try {
      const shouldIngest = !previous || previous.contentHash !== contentHash || !previous.uploadId
      if (shouldIngest) {
        uploadId = await ingestArtifactAsUpload({
          supabase,
          uploadService,
          userId: input.userId,
          artifact,
          accessToken: normalizedConnection.accessToken,
          warnings,
        })
        if (uploadId) {
          uploadedCount += 1
        } else {
          skippedCount += 1
        }
      } else {
        skippedCount += 1
      }

      await upsertArtifactRow(supabase, {
        userId: input.userId,
        pluginId: input.pluginId,
        provider,
        artifact,
        contentHash,
        uploadId,
      })
    } catch (error) {
      failedCount += 1
      warnings.push(
        `Failed to ingest artifact "${artifact.title}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      try {
        await upsertArtifactRow(supabase, {
          userId: input.userId,
          pluginId: input.pluginId,
          provider,
          artifact,
          contentHash,
          uploadId: null,
        })
      } catch {
        // keep sync resilient
      }
    }
  }

  return {
    provider,
    courseCount: merged.courses.length,
    artifactCount: artifacts.length,
    uploadedCount,
    skippedCount,
    failedCount,
    warnings,
  }
}
