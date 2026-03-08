export type UploadStatus = "pending" | "processing" | "completed" | "failed"
export type UploadKind = "pdf" | "pptx" | "docx" | "image" | "text" | "other"
export type UploadProgressStage =
  | "queued"
  | "uploading"
  | "extracting_pages"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed"

export interface UploadJobSummary {
  id: string
  status: UploadStatus
  attemptCount: number
  errorMessage?: string | null
  updatedAt: string
  progressStage?: UploadProgressStage | null
  progressPercent?: number | null
}

export interface UserUploadListItem {
  id: string
  title: string
  description?: string | null
  fileName: string
  mimeType: string
  fileSize: number
  uploadKind: UploadKind
  status: UploadStatus
  createdAt: string
  updatedAt: string
  lastError?: string | null
  previewUrl?: string | null
  previewLabel?: string | null
  sourceUnitCount: number
  figureCount: number
  latestJob?: UploadJobSummary | null
}

export interface UploadChunkDetail {
  id: string
  chunkIndex: number
  chunkText: string
  sourceOffsetStart?: number | null
  sourceOffsetEnd?: number | null
  metadata?: Record<string, unknown>
}

export interface UploadSourceUnitDetail {
  id: string
  unitType: "page" | "slide" | "image" | "section"
  unitNumber: number
  title?: string | null
  extractedText: string
  ocrStatus?: "not_required" | "pending" | "completed" | "failed" | null
  previewUrl?: string | null
  previewBucket?: string | null
  previewPath?: string | null
  previewMimeType?: string | null
  width?: number | null
  height?: number | null
  chunks: UploadChunkDetail[]
}

export interface UserUploadDetail {
  id: string
  title: string
  fileName: string
  mimeType: string
  uploadKind: UploadKind
  status: UploadStatus
  createdAt: string
  updatedAt: string
  sourceUnitCount: number
  figureCount: number
  originalFilePath: string
  originalFileUrl?: string | null
  storageBucket: string
  sourceUnits: UploadSourceUnitDetail[]
}
