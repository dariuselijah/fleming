export type UploadStatus = "pending" | "processing" | "completed" | "failed"
export type UploadKind = "pdf" | "pptx" | "docx" | "image" | "text" | "video" | "other"
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

export type UploadCollectionStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "archived"

export type UploadBatchStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"

export interface UploadCollectionSummary {
  id: string
  name: string
  description?: string | null
  status: UploadCollectionStatus
  totalFiles: number
  completedFiles: number
  failedFiles: number
  processingFiles: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
  latestBatch?: UploadBatchSummary | null
}

export interface UploadBatchSummary {
  id: string
  collectionId: string
  status: UploadBatchStatus
  maxConcurrency: number
  totalFiles: number
  processedFiles: number
  completedFiles: number
  failedFiles: number
  progressPercent: number
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface UploadBatchFileState {
  uploadId: string
  title: string
  fileName: string
  status: UploadStatus
  latestJobStage?: UploadProgressStage | null
  latestJobProgress?: number | null
  lastError?: string | null
}

export interface UploadBatchStatusPayload {
  collection: UploadCollectionSummary
  batch: UploadBatchSummary
  files: UploadBatchFileState[]
}

export interface BatchUploadFileInput {
  fileName: string
  mimeType: string
  fileSize: number
  title?: string
}

export interface BatchUploadInitToken {
  uploadId: string
  bucket: string
  filePath: string
  fileName: string
  title: string
}

export interface UploadBatchInitPayload {
  collection: UploadCollectionSummary
  batch: UploadBatchSummary
  uploads: BatchUploadInitToken[]
}
