"use client"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { useUser } from "@/lib/user-store/provider"
import {
  deleteKnowledgeFile,
  listUserUploads,
  reprocessKnowledgeFile,
  uploadKnowledgeFile,
} from "@/lib/uploads/api"
import { buildUploadReferenceTokens } from "@/lib/uploads/reference-tokens"
import type { UploadProgressStage, UserUploadListItem } from "@/lib/uploads/types"
import { getUploadStatusLabel } from "@/lib/uploads/status-label"
import {
  ArrowClockwise,
  CheckCircle,
  FileArrowUp,
  FileDoc,
  FilePdf,
  FilePpt,
  FileText,
  FolderOpen,
  ImageSquare,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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

const PIPELINE_STAGE_SEQUENCE: Array<{
  key: ActiveUploadState["stage"]
  label: string
  min: number
  max: number
}> = [
  { key: "uploading", label: "Uploading", min: 0, max: 100 },
  { key: "extracting_pages", label: "Extracting pages", min: 12, max: 33 },
  { key: "chunking", label: "Chunking", min: 34, max: 81 },
  { key: "embedding", label: "Embedding", min: 82, max: 99 },
  { key: "ready", label: "Ready", min: 100, max: 100 },
]

type ActiveUploadState = {
  name: string
  size: number
  uploadProgress: number
  stage: "uploading" | UploadProgressStage
  ingestProgress: number
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(kind: UserUploadListItem["uploadKind"]) {
  if (kind === "pdf") return FilePdf
  if (kind === "pptx") return FilePpt
  if (kind === "docx") return FileDoc
  if (kind === "image") return ImageSquare
  if (kind === "text") return FileText
  return FolderOpen
}

function UploadPipelineCard({ state }: { state: ActiveUploadState }) {
  const activeStageIndex = PIPELINE_STAGE_SEQUENCE.findIndex((item) => item.key === state.stage)
  const globalProgress =
    state.stage === "uploading"
      ? Math.max(1, Math.min(100, Math.round(state.uploadProgress * 0.72)))
      : Math.max(1, Math.min(100, state.ingestProgress || 1))

  const getStagePercent = (stageKey: ActiveUploadState["stage"], index: number) => {
    if (state.stage === "ready") {
      return 100
    }
    if (index < activeStageIndex) {
      return 100
    }
    if (index > activeStageIndex) {
      return 0
    }
    if (stageKey === "uploading") {
      return Math.max(0, Math.min(100, state.uploadProgress))
    }
    if (stageKey === "ready") {
      return 0
    }

    const stageMeta = PIPELINE_STAGE_SEQUENCE.find((item) => item.key === stageKey)
    if (!stageMeta) return 0
    const range = Math.max(1, stageMeta.max - stageMeta.min)
    const normalized = ((state.ingestProgress - stageMeta.min) / range) * 100
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border/60 bg-background p-5 shadow-xs"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{state.name}</p>
          <p className="text-muted-foreground text-xs">{formatBytes(state.size)}</p>
        </div>
        <div className="rounded-full border border-border px-3 py-1 text-xs font-medium">
          {state.stage === "ready" ? "Ready" : `${globalProgress}%`}
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-foreground/80"
          animate={{ width: `${globalProgress}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>

      <div className="mt-4 grid gap-2">
        {PIPELINE_STAGE_SEQUENCE.map((stage, index) => {
          const isComplete = state.stage === "ready" ? true : activeStageIndex >= 0 && index < activeStageIndex
          const isActive = state.stage === stage.key
          const stagePercent = getStagePercent(stage.key, index)

          return (
            <div
              key={stage.key}
              className={cn(
                "rounded-2xl border px-3 py-2.5",
                isActive ? "border-foreground/20 bg-muted/30" : "border-border/70 bg-background"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  {isComplete ? (
                    <CheckCircle className="size-4 text-foreground/80" weight="fill" />
                  ) : isActive ? (
                    <SpinnerGap className="size-4 animate-spin text-foreground/80" />
                  ) : (
                    <span className="size-2 rounded-full bg-border" />
                  )}
                  <span className="text-xs font-medium">{stage.label}</span>
                </div>
                <span className="text-muted-foreground text-[11px]">
                  {isComplete ? "Done" : isActive ? `${stagePercent}%` : "Waiting"}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/80">
                <motion.div
                  className="h-full rounded-full bg-foreground/70"
                  animate={{ width: `${isComplete ? 100 : stagePercent}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

export function UploadsWorkspace() {
  const { user } = useUser()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<UserUploadListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeUpload, setActiveUpload] = useState<ActiveUploadState | null>(null)
  const [busyUploadId, setBusyUploadId] = useState<string | null>(null)
  const isAuthenticated = Boolean(user?.id)

  const refreshUploads = useCallback(async () => {
    try {
      const items = await listUserUploads({ forceRefresh: true, allowStale: true })
      setUploads(items)
    } catch (error) {
      console.warn(
        "[Uploads] Refresh failed:",
        error instanceof Error ? error.message : "Unknown refresh error"
      )
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setUploads([])
      return
    }

    let cancelled = false
    setIsLoading(true)
    listUserUploads({
      allowStale: true,
      maxAgeMs: 30_000,
      revalidateInBackground: true,
    })
      .then((items) => {
        if (!cancelled) setUploads(items)
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
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  const hasProcessingUploads = useMemo(
    () => uploads.some((upload) => upload.status === "processing" || upload.status === "pending"),
    [uploads]
  )

  useEffect(() => {
    if (!isAuthenticated || !hasProcessingUploads) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      await refreshUploads()
      if (cancelled) return
      timeoutId = setTimeout(poll, 2500)
    }

    timeoutId = setTimeout(poll, 600)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [hasProcessingUploads, isAuthenticated, refreshUploads])

  const completedCount = useMemo(
    () => uploads.filter((upload) => upload.status === "completed").length,
    [uploads]
  )

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      let uploadFailed = false
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
            setUploads((current) => [upload, ...current.filter((item) => item.id !== upload.id)])
            if (upload.status === "completed" || upload.status === "failed") {
              setActiveUpload(null)
            }
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
        uploadFailed = true
        toast({
          title: error instanceof Error ? error.message : `Failed to upload ${file.name}`,
          status: "error",
        })
      } finally {
        if (uploadFailed) {
          setActiveUpload(null)
        }
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

  const openUploadViewer = useCallback(
    (upload: UserUploadListItem) => {
      if (upload.uploadKind !== "pdf") {
        toast({
          title: "PDF viewer only",
          description: "In-app document viewing is currently available for PDF uploads.",
          status: "info",
        })
        return
      }
      router.push(`/uploads/${upload.id}`)
    },
    [router]
  )

  const openInChatWithArtifact = useCallback(
    (upload: UserUploadListItem) => {
      const tokenString = buildUploadReferenceTokens([upload.id])
      const intent: "quiz" = "quiz"
      const basePrompt =
        "Generate an interactive multiple-choice quiz from this upload with answer explanations."
      const composedPrompt = `${basePrompt}\n\nSelected uploads: ${upload.title || upload.fileName}\n\n${tokenString}`
      const params = new URLSearchParams({
        prompt: composedPrompt,
        artifactIntent: intent,
      })
      router.push(`/?${params.toString()}`)
      toast({
        title: "Quiz generation primed",
        description: "Review the prompt in chat and press send.",
        status: "info",
      })
    },
    [router]
  )

  return (
    <div className="mx-auto mt-16 w-full max-w-7xl px-4 pb-8 sm:px-6">
      <div className="rounded-3xl border border-border/60 bg-background p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">Knowledge Uploads</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Your private library</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Upload PDFs, decks, docs, notes, and images. Everything is indexed for retrieval in chat.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-2 text-center">
              <p className="text-lg font-semibold">{completedCount}</p>
              <p className="text-muted-foreground text-xs">Ready</p>
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
              className="h-10 rounded-full px-4"
              disabled={!isAuthenticated || Boolean(activeUpload)}
              onClick={() => inputRef.current?.click()}
            >
              {activeUpload ? (
                <SpinnerGap className="mr-2 size-4 animate-spin" />
              ) : (
                <FileArrowUp className="mr-2 size-4" />
              )}
              Add files
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {activeUpload ? <UploadPipelineCard state={activeUpload} /> : null}

        {!isAuthenticated ? (
          <div className="text-muted-foreground rounded-2xl border border-dashed border-border px-4 py-5 text-sm">
            Sign in to upload textbooks, lecture decks, notes, and images.
          </div>
        ) : isLoading ? (
          <div className="text-muted-foreground rounded-2xl border border-dashed border-border px-4 py-5 text-sm">
            Loading uploads...
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-muted-foreground rounded-2xl border border-dashed border-border px-4 py-5 text-sm">
            No uploads yet. Add a PDF, PPTX, DOCX, text file, or image to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {uploads.map((upload) => {
              const isBusy = busyUploadId === upload.id
              const isFailed = upload.status === "failed"
              const isProcessing = upload.status === "processing"
              const Icon = fileIcon(upload.uploadKind)
              const stageProgress = upload.latestJob?.progressPercent ?? null

              return (
                <motion.div
                  key={upload.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => openUploadViewer(upload)}
                    className="block w-full text-left"
                  >
                    <div className="relative h-44 bg-muted/40">
                      {upload.uploadKind === "pdf" && upload.previewUrl ? (
                        <iframe
                          title={`${upload.title} cover`}
                          src={`${upload.previewUrl}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                          className="h-full w-full border-0"
                        />
                      ) : upload.previewUrl ? (
                        <Image
                          src={upload.previewUrl}
                          alt={upload.previewLabel || upload.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                          <Icon className="size-10" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3 rounded-full border border-black/10 bg-black/50 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                        {upload.uploadKind.toUpperCase()}
                      </div>
                    </div>
                  </button>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openUploadViewer(upload)}
                          className="line-clamp-1 text-left text-sm font-semibold hover:underline"
                        >
                          {upload.title}
                        </button>
                        <p className="text-muted-foreground line-clamp-1 text-xs">{upload.fileName}</p>
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
                        {getUploadStatusLabel(upload)}
                      </span>
                    </div>

                    <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
                      <span>{formatBytes(upload.fileSize)}</span>
                      <span>{upload.sourceUnitCount} units</span>
                      <span>{upload.figureCount} figures</span>
                    </div>

                    {isProcessing && typeof stageProgress === "number" ? (
                      <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground/75"
                            style={{ width: `${Math.max(4, Math.min(100, stageProgress))}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {upload.lastError ? (
                      <p className="mt-2 line-clamp-2 text-xs text-red-600 dark:text-red-300">
                        {upload.lastError}
                      </p>
                    ) : null}

                    <div className="mt-3 flex items-center justify-end gap-1">
                      {upload.status === "completed" ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-full border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            onClick={() => openInChatWithArtifact(upload)}
                          >
                            Generate Quiz
                          </button>
                        </>
                      ) : null}
                      {isFailed ? (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-full"
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
                        className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-full"
                        disabled={isBusy}
                        onClick={() => handleDelete(upload.id)}
                        aria-label="Delete upload"
                      >
                        {isBusy ? <SpinnerGap className="size-4 animate-spin" /> : <Trash className="size-4" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
