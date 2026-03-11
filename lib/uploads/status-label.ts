import type {
  UploadProgressStage,
  UploadStatus,
  UserUploadListItem,
} from "@/lib/uploads/types"

export const UPLOAD_PROGRESS_STAGE_LABELS: Record<UploadProgressStage, string> = {
  queued: "Queued",
  uploading: "Uploading",
  extracting_pages: "Extracting pages",
  chunking: "Chunking",
  embedding: "Embedding",
  ready: "Ready",
  failed: "Failed",
}

export function getUploadProgressStageLabel(
  stage: UploadProgressStage | null | undefined
): string | null {
  if (!stage) return null
  return UPLOAD_PROGRESS_STAGE_LABELS[stage] || null
}

export function getUploadStatusLabel(
  upload: Pick<UserUploadListItem, "status" | "latestJob">
): string {
  const stage = upload.latestJob?.progressStage
  if (upload.status === "processing" && stage && stage !== "queued") {
    return getUploadProgressStageLabel(stage) || "Processing"
  }
  return upload.status
}

export function getUploadStatusTone(status: UploadStatus): "neutral" | "success" | "warning" | "error" {
  if (status === "completed") return "success"
  if (status === "failed") return "error"
  if (status === "pending") return "warning"
  return "neutral"
}
