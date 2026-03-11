"use client"

import { cn } from "@/lib/utils"
import { CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useMemo } from "react"

type UploadLifecycleState = "sending" | "processing" | "completed" | "failed"

type AttachmentLike = {
  name?: string | null
  contentType?: string | null
  uploadState?: string | null
  uploadMessage?: string | null
}

type UserUploadSendActivityProps = {
  attachments: AttachmentLike[]
  className?: string
}

function normalizeAttachmentState(attachment: AttachmentLike): UploadLifecycleState {
  const state = String(attachment.uploadState || "").toLowerCase()
  if (state === "failed") return "failed"
  if (state === "sending") return "sending"
  if (state === "processing") return "processing"
  return "completed"
}

function aggregateState(attachments: AttachmentLike[]): UploadLifecycleState {
  const normalized = attachments.map(normalizeAttachmentState)
  if (normalized.some((state) => state === "failed")) return "failed"
  if (normalized.some((state) => state === "sending")) return "sending"
  if (normalized.some((state) => state === "processing")) return "processing"
  return "completed"
}

function statusLabel(state: UploadLifecycleState) {
  if (state === "sending") return "Sending"
  if (state === "processing") return "Processing"
  if (state === "failed") return "Failed"
  return "Completed"
}

function statusClassName(state: UploadLifecycleState) {
  if (state === "sending" || state === "processing") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
  }
  if (state === "failed") {
    return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

export function UserUploadSendActivity({
  attachments,
  className,
}: UserUploadSendActivityProps) {
  const displayState = useMemo(() => aggregateState(attachments), [attachments])

  const fileCount = attachments.length
  const previewNames = attachments
    .slice(0, 3)
    .map((attachment) => attachment.name || "Upload")

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("w-full max-w-[70%] self-end", className)}
    >
      <div className="rounded-xl border border-border/70 bg-background p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {displayState === "completed"
              ? "Files sent with your message"
              : "Sending files with your message"}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              statusClassName(displayState)
            )}
          >
            {displayState === "sending" || displayState === "processing" ? (
              <SpinnerGap className="size-3 animate-spin" />
            ) : displayState === "failed" ? (
              <WarningCircle className="size-3" weight="fill" />
            ) : (
              <CheckCircle className="size-3" weight="fill" />
            )}
            {statusLabel(displayState)}
          </span>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {fileCount} file{fileCount === 1 ? "" : "s"} attached
        </p>
        <div className="mt-2 space-y-1">
          {previewNames.map((name) => (
            <p key={name} className="truncate text-xs text-muted-foreground">
              {name}
            </p>
          ))}
          {fileCount > previewNames.length ? (
            <p className="text-xs text-muted-foreground">
              +{fileCount - previewNames.length} more
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

