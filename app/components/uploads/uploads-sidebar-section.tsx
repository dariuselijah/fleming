"use client"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { deleteKnowledgeFile, listUserUploads, reprocessKnowledgeFile, uploadKnowledgeFile } from "@/lib/uploads/api"
import type { UploadProgressStage, UserUploadListItem } from "@/lib/uploads/types"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import {
  ArrowClockwise,
  CheckCircle,
  FileArrowUp,
  FolderOpen,
  Scan,
  SpinnerGap,
  Trash,
  Waveform,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"

const ACCEPTED_KNOWLEDGE_UPLOADS = [
  ".pdf",
  ".pptx",
  ".docx",
  ".txt",
  ".md",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
].join(",")

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const INGESTION_STAGES: Array<{
  key: UploadProgressStage
  label: string
  icon: typeof Scan
}> = [
  { key: "extracting_pages", label: "Extracting pages", icon: Scan },
  { key: "chunking", label: "Chunking", icon: Waveform },
  { key: "embedding", label: "Embedding", icon: Waveform },
  { key: "ready", label: "Ready", icon: CheckCircle },
]

type ActiveUploadState = {
  name: string
  size: number
  uploadProgress: number
  stage: "uploading" | UploadProgressStage
  ingestProgress: number
}

function SleekUploadProgressCard({ state }: { state: ActiveUploadState }) {
  const activeStageIndex = INGESTION_STAGES.findIndex((item) => item.key === state.stage)
  const combinedProgress =
    state.stage === "uploading"
      ? Math.max(4, Math.min(72, Math.round(state.uploadProgress * 0.72)))
      : Math.max(72, state.ingestProgress || 72)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 p-3 shadow-sm"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.14),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.10),transparent_34%)]" />
      <div className="relative">
        <div className="flex items-start gap-3">
          <motion.div
            animate={{
              boxShadow: [
                "0 0 0 rgba(59,130,246,0.0)",
                "0 0 0 8px rgba(59,130,246,0.10)",
                "0 0 0 rgba(59,130,246,0.0)",
              ],
            }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15"
          >
            {state.stage === "ready" ? (
              <CheckCircle className="size-5 text-emerald-500" weight="fill" />
            ) : (
              <FileArrowUp className="size-5 text-primary" />
            )}
          </motion.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold">{state.name}</p>
                <p className="text-muted-foreground text-[11px]">{formatBytes(state.size)}</p>
              </div>
              <motion.div
                key={`${state.stage}-${state.uploadProgress}-${state.ingestProgress}`}
                initial={{ opacity: 0.55, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-[10px] font-semibold text-primary"
              >
                {state.stage === "uploading" ? `${state.uploadProgress}%` : state.stage === "ready" ? "Ready" : `${state.ingestProgress}%`}
              </motion.div>
            </div>

            <div className="mt-3">
              <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/90">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-blue-500 to-violet-500"
                  initial={{ width: "4%" }}
                  animate={{ width: `${combinedProgress}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                />
                <motion.div
                  className="absolute inset-y-0 w-20 bg-white/30 blur-md"
                  animate={{ x: ["-30%", "540%"] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px]">
              <span className="text-foreground font-medium">
                {state.stage === "uploading"
                  ? `Uploading ${state.uploadProgress}%`
                  : INGESTION_STAGES.find((item) => item.key === state.stage)?.label || "Processing"}
              </span>
              <span className="text-muted-foreground">
                {state.stage === "uploading"
                  ? "Streaming directly to storage"
                  : state.stage === "ready"
                    ? "Indexed and ready for chat"
                    : "Building retrieval-ready knowledge"}
              </span>
            </div>

            <div className="mt-3 grid gap-2">
              {INGESTION_STAGES.map((stage, index) => {
                const Icon = stage.icon
                const isComplete =
                  state.stage === "ready"
                    ? true
                    : activeStageIndex >= 0 && index < activeStageIndex
                const isActive = state.stage === stage.key

                return (
                  <motion.div
                    key={stage.key}
                    animate={{
                      opacity: isActive || isComplete ? 1 : 0.45,
                      x: isActive ? 0 : 0,
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors",
                      isActive && "bg-primary/8",
                      isComplete && !isActive && "bg-emerald-500/7"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border",
                        isComplete
                          ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-500"
                          : isActive
                            ? "border-primary/20 bg-primary/12 text-primary"
                            : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle className="size-3.5" weight="fill" />
                      ) : isActive ? (
                        <SpinnerGap className="size-3.5 animate-spin" />
                      ) : (
                        <Icon className="size-3.5" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[11px]",
                        isActive || isComplete ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {stage.label}
                    </span>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function UploadsSidebarSection() {
  const { user } = useUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<UserUploadListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeUpload, setActiveUpload] = useState<ActiveUploadState | null>(null)
  const [busyUploadId, setBusyUploadId] = useState<string | null>(null)

  const isAuthenticated = Boolean(user?.id)
  const completedUploads = useMemo(
    () => uploads.filter((upload) => upload.status === "completed"),
    [uploads]
  )

  useEffect(() => {
    if (!isAuthenticated) {
      setUploads([])
      return
    }

    let cancelled = false
    setIsLoading(true)
    listUserUploads()
      .then((items) => {
        if (!cancelled) {
          setUploads(items)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast({
            title: error instanceof Error ? error.message : "Failed to load uploads",
            status: "error",
          })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const selectedFiles = Array.from(files)
    for (const file of selectedFiles) {
      try {
        setActiveUpload({
          name: file.name,
          size: file.size,
          uploadProgress: 0,
          stage: "uploading",
          ingestProgress: 72,
        })
        const created = await uploadKnowledgeFile(file, undefined, {
          onProgress: (progress) => {
            setActiveUpload((current) =>
              current
                ? {
                    ...current,
                    uploadProgress: progress,
                    stage: progress >= 100 ? "extracting_pages" : "uploading",
                    ingestProgress: progress >= 100 ? 72 : current.ingestProgress,
                  }
                : current
            )
          },
          onUploadState: (upload) => {
            const stage = upload.latestJob?.progressStage
            const ingestProgress = upload.latestJob?.progressPercent ?? 72
            if (!stage || stage === "queued") return
            setActiveUpload((current) =>
              current
                ? {
                    ...current,
                    name: upload.title,
                    size: upload.fileSize,
                    stage,
                    ingestProgress,
                  }
                : current
            )
          },
        })
        setUploads((current) => [created, ...current.filter((item) => item.id !== created.id)])
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : `Failed to upload ${file.name}`,
          status: "error",
        })
      } finally {
        setActiveUpload(null)
      }
    }

    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  const handleDelete = async (uploadId: string) => {
    try {
      setBusyUploadId(uploadId)
      await deleteKnowledgeFile(uploadId)
      setUploads((current) => current.filter((upload) => upload.id !== uploadId))
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to delete upload",
        status: "error",
      })
    } finally {
      setBusyUploadId(null)
    }
  }

  const handleReprocess = async (uploadId: string) => {
    try {
      setBusyUploadId(uploadId)
      const updated = await reprocessKnowledgeFile(uploadId)
      setUploads((current) => current.map((upload) => (upload.id === updated.id ? updated : upload)))
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to reprocess upload",
        status: "error",
      })
    } finally {
      setBusyUploadId(null)
    }
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between px-2">
        <div>
          <h3 className="text-xs font-semibold">Uploads</h3>
          <p className="text-muted-foreground text-[11px]">
            Private study materials for retrieval
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_KNOWLEDGE_UPLOADS}
          multiple
          onChange={(event) => handleFileSelection(event.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 rounded-full"
          disabled={!isAuthenticated || Boolean(activeUpload)}
          onClick={() => inputRef.current?.click()}
        >
          {activeUpload ? (
            <SpinnerGap className="mr-1.5 size-4 animate-spin" />
          ) : (
            <FileArrowUp className="mr-1.5 size-4" />
          )}
          Add
        </Button>
      </div>

      {!isAuthenticated ? (
        <div className="text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3 text-xs">
          Sign in to upload textbooks, lecture decks, notes, and images.
        </div>
      ) : isLoading ? (
        <div className="text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3 text-xs">
          Loading uploads...
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {activeUpload ? <SleekUploadProgressCard state={activeUpload} /> : null}
          </AnimatePresence>
          {uploads.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3 text-xs">
              Upload a PDF, PPTX, DOCX, or image to make it searchable in chat.
            </div>
          ) : null}
          {uploads.map((upload) => {
            const isBusy = busyUploadId === upload.id
            const isFailed = upload.status === "failed"
            const isProcessing =
              upload.status === "processing" || activeUpload?.name === upload.fileName

            return (
              <div
                key={upload.id}
                className="rounded-xl border border-border bg-background/70 p-2.5"
              >
                <div className="flex gap-2">
                  <div className="bg-muted flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                    {upload.previewUrl ? (
                      <Image
                        src={upload.previewUrl}
                        alt={upload.previewLabel || upload.title}
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <FolderOpen className="text-muted-foreground size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium">{upload.title}</p>
                        <p className="text-muted-foreground line-clamp-1 text-[11px]">
                          {upload.fileName}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          upload.status === "completed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                          upload.status === "processing" && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                          upload.status === "failed" && "bg-red-500/10 text-red-700 dark:text-red-300",
                          upload.status === "pending" && "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        )}
                      >
                        {upload.status}
                      </span>
                    </div>

                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-[11px]">
                      <span>{upload.uploadKind.toUpperCase()}</span>
                      <span>{formatBytes(upload.fileSize)}</span>
                      <span>{upload.sourceUnitCount} units</span>
                      <span>{upload.figureCount} figures</span>
                    </div>

                    {upload.lastError ? (
                      <p className="mt-1 line-clamp-2 text-[11px] text-red-600 dark:text-red-300">
                        {upload.lastError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <p className="text-muted-foreground text-[11px]">
                    {completedUploads.length} ready for chat
                  </p>
                  <div className="flex items-center gap-1">
                    {isFailed ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-full"
                        disabled={isBusy}
                        onClick={() => handleReprocess(upload.id)}
                        aria-label="Reprocess upload"
                      >
                        {isBusy ? (
                          <SpinnerGap className="size-4 animate-spin" />
                        ) : (
                          <ArrowClockwise className="size-4" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-full"
                      disabled={isBusy || isProcessing}
                      onClick={() => handleDelete(upload.id)}
                      aria-label="Delete upload"
                    >
                      {isBusy ? (
                        <SpinnerGap className="size-4 animate-spin" />
                      ) : (
                        <Trash className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
