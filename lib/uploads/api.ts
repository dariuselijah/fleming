import type { UserUploadDetail, UserUploadListItem } from "./types"
import { createClient } from "@/lib/supabase/client"

type UploadProgressCallback = (progress: number) => void
type UploadStateCallback = (upload: UserUploadListItem) => void
const REQUEST_TIMEOUT_MS = 20000

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

export async function listUserUploads(): Promise<UserUploadListItem[]> {
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/uploads?ts=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError"
    throw new Error(isAbort ? "Uploads refresh timed out" : "Failed to fetch uploads")
  }

  if (!response.ok) {
    throw new Error("Failed to load uploads")
  }

  const result = await response.json()
  return result.uploads ?? []
}

export async function getUserUploadDetail(uploadId: string): Promise<UserUploadDetail> {
  let response: Response
  try {
    response = await fetchWithTimeout(`/api/uploads/${uploadId}?ts=${Date.now()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
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

export async function uploadKnowledgeFile(
  file: File,
  title?: string,
  options?: {
    onProgress?: UploadProgressCallback
    onUploadState?: UploadStateCallback
  }
): Promise<UserUploadListItem> {
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

  const stopPolling = startUploadPolling(pendingUpload.uploadId, options?.onUploadState)
  const response = await fetch(`/api/uploads/${pendingUpload.uploadId}/ingest`, {
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
    return result.upload as UserUploadListItem
  }

  const uploads = await listUserUploads()
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

  const result = await response.json()
  if (result?.upload) {
    return result.upload as UserUploadListItem
  }
  const uploads = await listUserUploads()
  const updated = uploads.find((item) => item.id === uploadId)
  if (updated) {
    return updated
  }
  throw new Error("Reprocess started, but upload list item was not found")
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
      const uploads = await listUserUploads()
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
      reject(new Error(errorMessage))
    }

    request.send(file)
  })
}
