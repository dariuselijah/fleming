import type { UserUploadDetail, UserUploadListItem } from "./types"
import { createClient } from "@/lib/supabase/client"
import type {
  UploadBatchInitPayload,
  UploadBatchStatusPayload,
  UploadCollectionSummary,
} from "@/lib/student-workspace/types"

type UploadProgressCallback = (progress: number) => void
type UploadStateCallback = (upload: UserUploadListItem) => void
type BatchProgressCallback = (payload: {
  fileName: string
  fileProgress: number
  uploadedCount: number
  totalFiles: number
  overallProgress: number
}) => void
const REQUEST_TIMEOUT_MS = 20000
const STORAGE_UPLOAD_TIMEOUT_MS = 4 * 60 * 1000
const UPLOAD_LIST_CACHE_KEY = "fleming:uploads:list:v2"
const UPLOAD_LIST_MEMORY_MAX_AGE_MS = 60_000
const UPLOAD_LIST_STORAGE_MAX_AGE_MS = 10 * 60 * 1000
const UPLOAD_LIST_MAX_ITEMS = 120

type UploadListCachePayload = {
  savedAt: number
  uploads: UserUploadListItem[]
}

type ListUserUploadsOptions = {
  forceRefresh?: boolean
  allowStale?: boolean
  maxAgeMs?: number
  revalidateInBackground?: boolean
}

let uploadListMemoryCache: UploadListCachePayload | null = null
let uploadListRefreshPromise: Promise<UserUploadListItem[]> | null = null
const SUPABASE_STORAGE_OBJECT_LIMIT_MB = Number.parseInt(
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_OBJECT_LIMIT_MB || "50",
  10
)
const SUPABASE_STORAGE_OBJECT_LIMIT_BYTES =
  Number.isFinite(SUPABASE_STORAGE_OBJECT_LIMIT_MB) && SUPABASE_STORAGE_OBJECT_LIMIT_MB > 0
    ? SUPABASE_STORAGE_OBJECT_LIMIT_MB * 1024 * 1024
    : 50 * 1024 * 1024

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function listUserUploads(
  options: ListUserUploadsOptions = {}
): Promise<UserUploadListItem[]> {
  const {
    forceRefresh = false,
    allowStale = true,
    maxAgeMs = UPLOAD_LIST_MEMORY_MAX_AGE_MS,
    revalidateInBackground = false,
  } = options

  const cached = !forceRefresh ? readUploadListCache(maxAgeMs) : null
  if (cached) {
    if (revalidateInBackground) {
      void refreshUploadListCache().catch(() => {
        // Background refresh failures should not block cached reads.
      })
    }
    return cached.uploads
  }

  try {
    return await refreshUploadListCache()
  } catch (error) {
    if (allowStale) {
      const staleFallback = readUploadListCache(UPLOAD_LIST_STORAGE_MAX_AGE_MS)
      if (staleFallback) {
        return staleFallback.uploads
      }
    }
    const isAbort = error instanceof Error && error.name === "AbortError"
    throw new Error(isAbort ? "Uploads refresh timed out" : "Failed to fetch uploads")
  }
}

export function primeUploadListCache(uploads: UserUploadListItem[]) {
  writeUploadListCache(uploads)
}

export function invalidateUploadListCache() {
  uploadListMemoryCache = null
  uploadListRefreshPromise = null
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(UPLOAD_LIST_CACHE_KEY)
  } catch {
    // Ignore localStorage failures.
  }
}

export async function getUserUploadDetail(uploadId: string): Promise<UserUploadDetail> {
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/uploads/${uploadId}`, {
      method: "GET",
      credentials: "include",
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError"
    throw new Error(isAbort ? "Document fetch timed out" : "Failed to fetch upload detail")
  }

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to load upload detail")
  }

  const result = await response.json()
  return result.upload
}

export type PendingKnowledgeUpload = {
  uploadId: string
  bucket: string
  filePath: string
  fileName: string
  mimeType: string
  fileSize: number
  title?: string
}

export async function initKnowledgeUpload(
  file: File,
  title?: string
): Promise<PendingKnowledgeUpload> {
  invalidateUploadListCache()
  if (file.size > SUPABASE_STORAGE_OBJECT_LIMIT_BYTES) {
    const limitMb = Math.round(SUPABASE_STORAGE_OBJECT_LIMIT_BYTES / (1024 * 1024))
    const sizeMb = Math.round(file.size / (1024 * 1024))
    throw new Error(
      `This file is too large for direct upload (${sizeMb}MB). Maximum supported size is ${limitMb}MB.`
    )
  }

  const initResponse = await fetch("/api/uploads/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      title,
    }),
    credentials: "include",
  })

  if (!initResponse.ok) {
    const payload = await safeJson(initResponse)
    throw new Error(payload?.error || "Upload initialization failed")
  }

  const initResult = await initResponse.json()
  const pendingUpload = initResult.upload as {
    uploadId: string
    bucket: string
    filePath: string
  }

  return {
    uploadId: pendingUpload.uploadId,
    bucket: pendingUpload.bucket,
    filePath: pendingUpload.filePath,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    title,
  }
}

export async function uploadKnowledgeFileData(
  pendingUpload: PendingKnowledgeUpload,
  file: File,
  options?: {
    onProgress?: UploadProgressCallback
  }
): Promise<void> {
  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase is not available in this environment")
  }

  await uploadFileToStorageWithProgress(
    supabase,
    pendingUpload.bucket,
    pendingUpload.filePath,
    file,
    options?.onProgress
  )
}

export async function startKnowledgeIngest(
  uploadId: string,
  options?: {
    onUploadState?: UploadStateCallback
  }
): Promise<UserUploadListItem | null> {
  const stopPolling = startUploadPolling(uploadId, options?.onUploadState)
  const response = await fetch(`/api/uploads/${uploadId}/ingest`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
  })

  if (!response.ok) {
    stopPolling()
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Upload failed")
  }

  const result = await response.json()
  if (result?.upload) {
    void refreshUploadListCache().catch(() => {
      // Keep this non-blocking. Polling/UI refresh will still update state.
    })
    return result.upload as UserUploadListItem
  }

  return null
}

export async function uploadKnowledgeFile(
  file: File,
  title?: string,
  options?: {
    onProgress?: UploadProgressCallback
    onUploadState?: UploadStateCallback
  }
): Promise<UserUploadListItem> {
  const pendingUpload = await initKnowledgeUpload(file, title)
  await uploadKnowledgeFileData(pendingUpload, file, {
    onProgress: options?.onProgress,
  })
  const result = await startKnowledgeIngest(pendingUpload.uploadId, {
    onUploadState: options?.onUploadState,
  })
  if (result) {
    return result
  }

  const uploads = await listUserUploads({ forceRefresh: true })
  const created = uploads.find((item) => item.id === pendingUpload.uploadId)
  if (created) {
    return created
  }
  throw new Error("Upload started, but upload list item was not found")
}

export async function deleteKnowledgeFile(uploadId: string) {
  const response = await fetch(`/api/uploads/${uploadId}`, {
    method: "DELETE",
    credentials: "include",
  })

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to delete upload")
  }
  invalidateUploadListCache()
}

export async function reprocessKnowledgeFile(uploadId: string): Promise<UserUploadListItem> {
  const response = await fetch(`/api/uploads/${uploadId}/reprocess`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
  })

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to reprocess upload")
  }

  invalidateUploadListCache()
  const result = await response.json()
  if (result?.upload) {
    void refreshUploadListCache().catch(() => {
      // Reprocess state is eventually refreshed by polling.
    })
    return result.upload as UserUploadListItem
  }
  const uploads = await listUserUploads({ forceRefresh: true })
  const updated = uploads.find((item) => item.id === uploadId)
  if (updated) {
    return updated
  }
  throw new Error("Reprocess started, but upload list item was not found")
}

export async function listUploadCollections(): Promise<UploadCollectionSummary[]> {
  let response: Response
  try {
    response = await fetchWithTimeout("/api/uploads/collections", {
      method: "GET",
      credentials: "include",
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError"
    throw new Error(isAbort ? "Collection fetch timed out" : "Failed to load upload collections")
  }

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to load upload collections")
  }
  const result = await response.json()
  return Array.isArray(result.collections) ? (result.collections as UploadCollectionSummary[]) : []
}

export async function initUploadBatch(
  files: File[],
  options?: {
    collectionName?: string
    description?: string
    maxConcurrency?: number
  }
): Promise<UploadBatchInitPayload> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("At least one file is required to initialize a batch upload")
  }

  const response = await fetch("/api/uploads/batch/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      collectionName: options?.collectionName,
      description: options?.description,
      maxConcurrency: options?.maxConcurrency,
      files: files.map((file) => ({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      })),
    }),
  })

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Batch initialization failed")
  }

  return (await response.json()) as UploadBatchInitPayload
}

export async function startUploadBatchIngest(
  batchId: string,
  options?: {
    maxConcurrency?: number
    reprocessFailed?: boolean
  }
): Promise<UploadBatchStatusPayload> {
  const response = await fetch(`/api/uploads/batch/${batchId}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({
      maxConcurrency: options?.maxConcurrency,
      reprocessFailed: options?.reprocessFailed,
    }),
  })

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to start batch ingest")
  }
  return (await response.json()) as UploadBatchStatusPayload
}

export async function getUploadBatchStatus(batchId: string): Promise<UploadBatchStatusPayload> {
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/uploads/batch/${batchId}`, {
      method: "GET",
      credentials: "include",
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError"
    throw new Error(isAbort ? "Batch status request timed out" : "Failed to fetch batch status")
  }

  if (!response.ok) {
    const payload = await safeJson(response)
    throw new Error(payload?.error || "Failed to fetch batch status")
  }

  return (await response.json()) as UploadBatchStatusPayload
}

export async function uploadKnowledgeFilesBatch(
  files: File[],
  options?: {
    collectionName?: string
    description?: string
    maxConcurrency?: number
    onProgress?: BatchProgressCallback
    pollIntervalMs?: number
    pollTimeoutMs?: number
  }
): Promise<UploadBatchStatusPayload> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("No files selected for batch upload")
  }
  invalidateUploadListCache()

  const oversized = files.find((file) => file.size > SUPABASE_STORAGE_OBJECT_LIMIT_BYTES)
  if (oversized) {
    const limitMb = Math.round(SUPABASE_STORAGE_OBJECT_LIMIT_BYTES / (1024 * 1024))
    throw new Error(`"${oversized.name}" exceeds the storage object limit (${limitMb}MB)`)
  }

  const initPayload = await initUploadBatch(files, {
    collectionName: options?.collectionName,
    description: options?.description,
    maxConcurrency: options?.maxConcurrency,
  })

  const supabase = createClient()
  if (!supabase) {
    throw new Error("Supabase is not available in this environment")
  }

  const perFileProgress = new Array(files.length).fill(0)
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const token = initPayload.uploads[index]
    if (!token) {
      throw new Error("Batch initialization token mismatch")
    }
    await uploadFileToStorageWithProgress(
      supabase,
      token.bucket,
      token.filePath,
      file,
      (progress) => {
        perFileProgress[index] = progress
        const uploadedCount = perFileProgress.filter((value) => value >= 100).length
        const overallProgress = Math.round(
          perFileProgress.reduce((sum, value) => sum + value, 0) / Math.max(1, files.length)
        )
        options?.onProgress?.({
          fileName: file.name,
          fileProgress: progress,
          uploadedCount,
          totalFiles: files.length,
          overallProgress,
        })
      }
    )
  }

  const accepted = await startUploadBatchIngest(initPayload.batch.id, {
    maxConcurrency: options?.maxConcurrency,
  })

  const pollIntervalMs = Math.max(1000, options?.pollIntervalMs ?? 2000)
  const pollTimeoutMs = Math.max(20_000, options?.pollTimeoutMs ?? 10 * 60_000)
  const deadline = Date.now() + pollTimeoutMs

  let lastStatus: UploadBatchStatusPayload = accepted
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const status = await getUploadBatchStatus(initPayload.batch.id)
    lastStatus = status
    if (
      status.batch.status === "completed" ||
      status.batch.status === "partial" ||
      status.batch.status === "failed" ||
      status.batch.status === "cancelled"
    ) {
      break
    }
  }

  void refreshUploadListCache().catch(() => {
    // Non-blocking refresh after batch ingest.
  })

  return lastStatus
}

async function safeJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function startUploadPolling(uploadId: string, onUploadState?: UploadStateCallback) {
  if (!onUploadState) {
    return () => {}
  }

  let active = true
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const poll = async () => {
    if (!active) return
    try {
      const uploads = await listUserUploads({
        forceRefresh: true,
        allowStale: true,
      })
      const upload = uploads.find((item) => item.id === uploadId)
      if (upload) {
        onUploadState(upload)
        if (upload.status === "completed" || upload.status === "failed") {
          active = false
          return
        }
      }
    } catch {
      // Ignore polling failures; the ingest request will still resolve or fail.
    }

    if (active) {
      timeoutId = setTimeout(poll, 1500)
    }
  }

  timeoutId = setTimeout(poll, 250)

  return () => {
    active = false
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function readUploadListCache(maxAgeMs: number): UploadListCachePayload | null {
  const now = Date.now()
  if (uploadListMemoryCache && now - uploadListMemoryCache.savedAt <= maxAgeMs) {
    return uploadListMemoryCache
  }

  const fromStorage = readUploadListCacheFromStorage()
  if (fromStorage && now - fromStorage.savedAt <= maxAgeMs) {
    uploadListMemoryCache = fromStorage
    return fromStorage
  }
  return null
}

function readUploadListCacheFromStorage(): UploadListCachePayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(UPLOAD_LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UploadListCachePayload
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.uploads)
    ) {
      return null
    }
    if (Date.now() - parsed.savedAt > UPLOAD_LIST_STORAGE_MAX_AGE_MS) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeUploadListCache(uploads: UserUploadListItem[]) {
  const payload: UploadListCachePayload = {
    savedAt: Date.now(),
    uploads: uploads.slice(0, UPLOAD_LIST_MAX_ITEMS),
  }
  uploadListMemoryCache = payload
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(UPLOAD_LIST_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore localStorage failures.
  }
}

async function refreshUploadListCache(): Promise<UserUploadListItem[]> {
  if (uploadListRefreshPromise) {
    return uploadListRefreshPromise
  }
  uploadListRefreshPromise = (async () => {
    const response = await fetchWithTimeout("/api/uploads", {
      method: "GET",
      credentials: "include",
    })
    if (!response.ok) {
      throw new Error("Failed to load uploads")
    }
    const result = await response.json()
    const uploads = Array.isArray(result.uploads) ? (result.uploads as UserUploadListItem[]) : []
    writeUploadListCache(uploads)
    return uploads
  })()

  try {
    return await uploadListRefreshPromise
  } finally {
    uploadListRefreshPromise = null
  }
}

async function uploadFileToStorageWithProgress(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  bucket: string,
  filePath: string,
  file: File,
  onProgress?: UploadProgressCallback
) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session?.access_token) {
    throw new Error("Could not get an authenticated upload session")
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!projectUrl || !anonKey) {
    throw new Error("Supabase client environment is incomplete")
  }

  const encodedPath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  const uploadUrl = `${projectUrl}/storage/v1/object/${bucket}/${encodedPath}`

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", uploadUrl)
    request.timeout = STORAGE_UPLOAD_TIMEOUT_MS
    request.setRequestHeader("Authorization", `Bearer ${session.access_token}`)
    request.setRequestHeader("apikey", anonKey)
    request.setRequestHeader("x-upsert", "true")
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream")

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return
      const progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      onProgress(progress)
    }

    request.onerror = () => {
      reject(new Error("Failed to upload file to storage"))
    }

    request.ontimeout = () => {
      reject(new Error("Upload timed out while sending to storage"))
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100)
        resolve()
        return
      }

      let errorMessage = "Failed to upload file to storage"
      try {
        const payload = JSON.parse(request.responseText)
        errorMessage = payload.message || payload.error || errorMessage
      } catch {
        if (request.responseText) {
          errorMessage = request.responseText
        }
      }
      if (/maximum allowed size|object exceeded/i.test(errorMessage)) {
        const limitMb = Math.round(SUPABASE_STORAGE_OBJECT_LIMIT_BYTES / (1024 * 1024))
        errorMessage = `This file exceeds the storage object limit (${limitMb}MB).`
      }
      reject(new Error(errorMessage))
    }

    request.send(file)
  })
}
