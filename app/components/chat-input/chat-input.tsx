"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowUpIcon,
  FileDoc,
  FilePdf,
  FilePpt,
  FileText,
  FolderOpen,
  ImageSquare,
  SpinnerGap,
  StopIcon,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import {
  CLINICIAN_MODE_PLACEHOLDERS,
  DEFAULT_CLINICIAN_WORKFLOW_MODE,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import { getModelInfo } from "@/lib/models"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { listUserUploads } from "@/lib/uploads/api"
import type { UserUploadListItem } from "@/lib/uploads/types"
import { buildUploadReferenceTokens } from "@/lib/uploads/reference-tokens"
import type { MedicalStudentLearningMode } from "@/lib/medical-student-learning"
import type { CitationStyle } from "@/lib/citations/formatters"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input"
import { Button } from "@/components/ui/button"
import { PromptSystem } from "../suggestions/prompt-system"
import { ModelSelector } from "@/components/common/model-selector/base"
import { ButtonFileUpload } from "./button-file-upload"
import { ButtonSearch } from "./button-search"
import { ClinicianWorkflowPanel } from "./clinician-workflow-panel"
import { ClinicianModeSelector } from "./clinician-mode-selector"
import { FileList } from "./file-list"
import { LearningModeSelector } from "./learning-mode-selector"
import type { FileUploadSummary, FileUploadStatus } from "../chat/use-file-upload"

// Fleming 3.5 has been removed - only Fleming 4 is available

const UPLOADS_CACHE_KEY = "fleming:uploads:list:v1"
const UPLOADS_CACHE_MAX_AGE_MS = 10 * 60 * 1000

type UploadsCachePayload = {
  savedAt: number
  uploads: UserUploadListItem[]
}

function readCachedUploads(): UploadsCachePayload | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(UPLOADS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UploadsCachePayload
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.uploads)
    ) {
      return null
    }
    if (Date.now() - parsed.savedAt > UPLOADS_CACHE_MAX_AGE_MS) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCachedUploads(uploads: UserUploadListItem[]) {
  if (typeof window === "undefined") return
  try {
    const payload: UploadsCachePayload = {
      savedAt: Date.now(),
      uploads: uploads.slice(0, 80),
    }
    window.localStorage.setItem(UPLOADS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Cache failures should never block chat input behavior.
  }
}

type ChatInputProps = {
  value: string
  onValueChange: (value: string) => void
  onSend: (overrideInput?: string) => void
  isSubmitting?: boolean
  hasMessages?: boolean
  files: File[]
  fileUploadSummary?: FileUploadSummary
  getFileStatus?: (file: File) => FileUploadStatus | undefined
  onFileUpload: (files: File[]) => void
  onFileRemove: (file: File) => void
  onSuggestion: (suggestion: string) => void
  hasSuggestions?: boolean
  onSelectModel: (model: string) => void
  selectedModel: string
  isUserAuthenticated: boolean
  stop: () => void
  status?: "submitted" | "streaming" | "ready" | "error"
  setEnableSearch: (enabled: boolean) => void
  enableSearch: boolean
  setEnableEvidence?: (enabled: boolean) => void
  enableEvidence?: boolean
  learningMode: MedicalStudentLearningMode
  onLearningModeChange: (mode: MedicalStudentLearningMode) => void
  clinicianMode?: ClinicianWorkflowMode
  onClinicianModeChange?: (mode: ClinicianWorkflowMode) => void
  artifactIntent?: "none" | "quiz"
  citationStyle?: CitationStyle
  onArtifactIntentChange?: (intent: "none" | "quiz") => void
  onCitationStyleChange?: (style: CitationStyle) => void
}

export function ChatInput({
  value,
  onValueChange,
  onSend,
  isSubmitting,
  hasMessages = false,
  files,
  fileUploadSummary,
  getFileStatus,
  onFileUpload,
  onFileRemove,
  onSuggestion,
  hasSuggestions,
  onSelectModel,
  selectedModel,
  isUserAuthenticated,
  stop,
  status,
  setEnableSearch,
  enableSearch,
  setEnableEvidence,
  enableEvidence = false,
  learningMode,
  onLearningModeChange,
  clinicianMode = DEFAULT_CLINICIAN_WORKFLOW_MODE,
  onClinicianModeChange,
  artifactIntent = "none",
  citationStyle: _citationStyle = "harvard",
  onArtifactIntentChange,
  onCitationStyleChange: _onCitationStyleChange,
}: ChatInputProps) {
  const { models } = useModel()
  const { preferences } = useUserPreferences()
  const [isButtonDisabled, setIsButtonDisabled] = useState(true)
  const [tabsDismissed, setTabsDismissed] = useState(false)
  const [isUploadsPickerOpen, setIsUploadsPickerOpen] = useState(false)
  const [isUploadsLoading, setIsUploadsLoading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UserUploadListItem[]>([])
  const [selectedUploads, setSelectedUploads] = useState<UserUploadListItem[]>([])
  const [selectedUploadIndex, setSelectedUploadIndex] = useState(0)
  const [uploadsLoadedAt, setUploadsLoadedAt] = useState(0)

  // Migrate old model aliases to the default model id.
  const effectiveModelId = useMemo(() => {
    if (selectedModel === 'grok-4' || selectedModel === 'grok-4-fast-reasoning' || selectedModel === 'fleming-3.5') {
      return 'fleming-4'
    }
    return selectedModel || 'fleming-4'
  }, [selectedModel])

  const selectModelConfig = getModelInfo(effectiveModelId)
  const hasSearchSupport = Boolean(selectModelConfig?.webSearch)
  const isOnlyWhitespace = (text: string | undefined | null) => {
    if (!text) return true
    return !/[^\s]/.test(text)
  }

  const slashCommandMatch = useMemo(() => {
    const trimmed = value.replace(/^\s+/, "")
    if (!trimmed.startsWith("/")) return null
    const firstLine = trimmed.split("\n")[0] || ""
    return firstLine.startsWith("/") ? firstLine.slice(1).trim() : null
  }, [value])

  const isSlashUploadsMode = slashCommandMatch !== null
  const slashUploadsQuery = (slashCommandMatch || "").toLowerCase()

  const filteredUploads = useMemo(() => {
    if (uploadResults.length === 0) return []
    const ranked = [...uploadResults].sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return -1
      if (a.status !== "completed" && b.status === "completed") return 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    if (!slashUploadsQuery) return ranked.slice(0, 8)
    return ranked
      .filter((upload) => {
        const haystack = `${upload.title} ${upload.fileName}`.toLowerCase()
        return haystack.includes(slashUploadsQuery)
      })
      .slice(0, 8)
  }, [uploadResults, slashUploadsQuery])

  const getUploadIcon = useCallback((kind: UserUploadListItem["uploadKind"]) => {
    if (kind === "pdf") return FilePdf
    if (kind === "pptx") return FilePpt
    if (kind === "docx") return FileDoc
    if (kind === "image") return ImageSquare
    if (kind === "text") return FileText
    return FolderOpen
  }, [])

  const applyUploadReference = useCallback(
    (upload: UserUploadListItem) => {
      if (upload.status !== "completed") {
        return
      }
      setSelectedUploads((prev) => {
        if (prev.some((item) => item.id === upload.id)) return prev
        return [...prev, upload].slice(-4)
      })
      if (isSlashUploadsMode) {
        onValueChange("")
      }
      setIsUploadsPickerOpen(false)
    },
    [isSlashUploadsMode, onValueChange]
  )

  const removeSelectedUpload = useCallback((uploadId: string) => {
    setSelectedUploads((prev) => prev.filter((upload) => upload.id !== uploadId))
  }, [])

  const artifactInstruction = useMemo(() => {
    if (artifactIntent === "quiz") {
      return "Generate an interactive multiple-choice quiz from my selected uploads."
    }
    return ""
  }, [artifactIntent])

  useEffect(() => {
    const normalized = value.trim().toLowerCase()
    if (!normalized) {
      onArtifactIntentChange?.("none")
      return
    }
    const quizPattern =
      /\b(generate|create|make|build|draft|prepare)?\s*(a\s+)?(quiz|mcq|multiple[-\s]?choice)\b/

    if (quizPattern.test(normalized)) {
      onArtifactIntentChange?.("quiz")
      return
    }
    onArtifactIntentChange?.("none")
  }, [value, onArtifactIntentChange])

  const handleSend = useCallback(() => {
    if (isSubmitting) return

    if (isSlashUploadsMode && isUploadsPickerOpen) {
      const selected = filteredUploads[selectedUploadIndex]
      if (selected) {
        applyUploadReference(selected)
      }
      return
    }

    if (status === "streaming") {
      stop()
      return
    }

    const hasUploadReferences = selectedUploads.length > 0
    const hasArtifactIntent = artifactIntent !== "none"
    if (hasUploadReferences) {
      const tokenString = buildUploadReferenceTokens(
        selectedUploads.map((upload) => upload.id)
      )
      const uploadLabelLine = `Selected uploads: ${selectedUploads
        .map((upload) => upload.title || upload.fileName || "Upload")
        .join(", ")}`
      const baseValue = value.trim()
      const withArtifactInstruction =
        baseValue.length === 0 && hasArtifactIntent && artifactInstruction
          ? artifactInstruction
          : baseValue
      const promptWithSelection =
        withArtifactInstruction.length > 0
          ? `${withArtifactInstruction}\n\n${uploadLabelLine}`
          : `${uploadLabelLine}\n\nUse my selected uploads as context and provide a concise overview.`
      const composedValue = `${promptWithSelection}\n\n${tokenString}`.trim()
      onSend(composedValue)
      setSelectedUploads([])
      return
    }

    if (hasArtifactIntent && !value.trim() && artifactInstruction) {
      onSend(artifactInstruction)
      return
    }

    onSend()
  }, [
    artifactInstruction,
    artifactIntent,
    applyUploadReference,
    selectedUploads,
    value,
    onValueChange,
    filteredUploads,
    isSlashUploadsMode,
    isSubmitting,
    isUploadsPickerOpen,
    onSend,
    selectedUploadIndex,
    status,
    stop,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSlashUploadsMode && isUploadsPickerOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          if (filteredUploads.length === 0) return
          setSelectedUploadIndex((prev) =>
            prev + 1 >= filteredUploads.length ? 0 : prev + 1
          )
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          if (filteredUploads.length === 0) return
          setSelectedUploadIndex((prev) =>
            prev - 1 < 0 ? filteredUploads.length - 1 : prev - 1
          )
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          onValueChange(value.replace(/^\s*\//, ""))
          setIsUploadsPickerOpen(false)
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          const selected = filteredUploads[selectedUploadIndex]
          if (selected) {
            applyUploadReference(selected)
          }
          return
        }
      }

      if (isSubmitting) {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && status === "streaming") {
        e.preventDefault()
        return
      }

      if (e.key === "Enter" && !e.shiftKey) {
        const hasMessageText = Boolean(value && !isOnlyWhitespace(value))
        const hasAttachedFiles = files.length > 0
        const hasUploadReferences = selectedUploads.length > 0
        const hasArtifactIntent = artifactIntent !== "none"
        if (!hasMessageText && !hasAttachedFiles && !hasUploadReferences && !hasArtifactIntent) {
          return
        }

        e.preventDefault()
        handleSend()
      }
    },
    [
      applyUploadReference,
      files.length,
      handleSend,
      filteredUploads,
      isSlashUploadsMode,
      isSubmitting,
      isUploadsPickerOpen,
      onSend,
      onValueChange,
      artifactIntent,
      selectedUploads.length,
      selectedUploadIndex,
      status,
      value,
    ]
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const hasImageContent = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      )

      if (!isUserAuthenticated && hasImageContent) {
        e.preventDefault()
        return
      }

      if (isUserAuthenticated && hasImageContent) {
        const imageFiles: File[] = []

        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile()
            if (file) {
              const newFile = new File(
                [file],
                `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                { type: file.type }
              )
              imageFiles.push(newFile)
            }
          }
        }

        if (imageFiles.length > 0) {
          onFileUpload(imageFiles)
        }
      }
    },
    [isUserAuthenticated, onFileUpload]
  )

  useEffect(() => {
    if (!hasSearchSupport && enableSearch) {
      setEnableSearch?.(false)
    }
  }, [hasSearchSupport, enableSearch, setEnableSearch])

  useEffect(() => {
    if (!isSlashUploadsMode) {
      setIsUploadsPickerOpen(false)
      return
    }
    setIsUploadsPickerOpen(true)
  }, [isSlashUploadsMode])

  useEffect(() => {
    if (!isUserAuthenticated) return
    if (uploadResults.length > 0) return
    const cached = readCachedUploads()
    if (!cached || cached.uploads.length === 0) return
    setUploadResults(cached.uploads)
    setUploadsLoadedAt(cached.savedAt)
  }, [isUserAuthenticated, uploadResults.length])

  useEffect(() => {
    if (!isUserAuthenticated) return
    if (uploadResults.length > 0 && Date.now() - uploadsLoadedAt < 60_000) return

    let active = true
    listUserUploads()
      .then((uploads) => {
        if (!active) return
        setUploadResults(uploads)
        setUploadsLoadedAt(Date.now())
        writeCachedUploads(uploads)
      })
      .catch(() => {
        if (!active) return
      })

    return () => {
      active = false
    }
  }, [isUserAuthenticated, uploadResults.length, uploadsLoadedAt])

  useEffect(() => {
    if (!isUploadsPickerOpen || !isUserAuthenticated) return
    const isStale = Date.now() - uploadsLoadedAt > 20_000
    if (!isStale && uploadResults.length > 0) return

    let active = true
    setIsUploadsLoading(true)
    listUserUploads()
      .then((uploads) => {
        if (!active) return
        setUploadResults(uploads)
        setUploadsLoadedAt(Date.now())
        writeCachedUploads(uploads)
      })
      .catch(() => {
        if (!active) return
        // Keep any cached/previous results if refresh fails.
      })
      .finally(() => {
        if (!active) return
        setIsUploadsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isUploadsPickerOpen, isUserAuthenticated, uploadResults.length, uploadsLoadedAt])

  useEffect(() => {
    setSelectedUploadIndex(0)
  }, [slashUploadsQuery])

  useEffect(() => {
    // Button should be enabled when:
    // 1. Streaming (so user can stop)
    // 2. Has input and not submitting
    // Button should be disabled when:
    // 1. No input and not streaming
    // 2. Submitting (but not streaming)
    const hasValidInput = value && !isOnlyWhitespace(value);
    const hasAttachedFiles = files.length > 0
    const hasUploadReferences = selectedUploads.length > 0
    const hasArtifactIntent = artifactIntent !== "none"
    const isStreaming = status === "streaming";
    const isSubmittingButNotStreaming = isSubmitting && !isStreaming;
    
    const shouldDisable = !isStreaming && ((!hasValidInput && !hasAttachedFiles && !hasUploadReferences && !hasArtifactIntent) || isSubmittingButNotStreaming);
    setIsButtonDisabled(Boolean(shouldDisable));
  }, [files.length, value, selectedUploads.length, artifactIntent, isSubmitting, status])

  // Reset tabs-dismissed when conversation has no messages (e.g. new chat)
  useEffect(() => {
    if (!hasMessages) setTabsDismissed(false)
  }, [hasMessages])

  const placeholderByMode: Record<MedicalStudentLearningMode, string> = {
    ask: "Ask Fleming anything...",
    simulate: "Start a clinical simulation (e.g., chest pain in ED)...",
    guideline: "Ask for a guideline snapshot (e.g., HF GDMT updates)...",
  }

  const isMedicalStudent = preferences.userRole === "medical_student"
  const isDoctor = preferences.userRole === "doctor"
  const showClinicianWorkflowPanel =
    isDoctor &&
    !hasMessages &&
    !tabsDismissed &&
    clinicianMode !== "open_search"
  const shouldShowInlineSuggestions = showClinicianWorkflowPanel

  const handleClinicianPanelSubmit = useCallback(
    (prompt: string) => {
      if (status === "streaming") {
        stop()
      }
      setTabsDismissed(true)
      onSuggestion(prompt)
    },
    [onSuggestion, status, stop]
  )

  return (
    <div className="relative flex min-w-0 w-full max-w-full flex-col gap-4">
      {isMedicalStudent && (
        <LearningModeSelector
          value={learningMode}
          onChange={onLearningModeChange}
        />
      )}
      {isDoctor && onClinicianModeChange && !hasMessages && !tabsDismissed && (
        <div className="-mx-1 bg-background px-1 pt-1 pb-2">
          <ClinicianModeSelector
            value={clinicianMode}
            onChange={onClinicianModeChange}
          />
        </div>
      )}
      {hasSuggestions && (
        <PromptSystem
          onValueChange={onValueChange}
          onSuggestion={onSuggestion}
          value={value}
          learningMode={learningMode}
          clinicianMode={clinicianMode}
          position={shouldShowInlineSuggestions ? "inline" : "floating"}
        />
      )}
      {showClinicianWorkflowPanel && (
        <ClinicianWorkflowPanel
          mode={clinicianMode}
          onSubmitPrompt={handleClinicianPanelSubmit}
          isSubmitting={isSubmitting || status === "streaming"}
        />
      )}
      {!showClinicianWorkflowPanel && (
        <div className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1">
          <PromptInput
            className="bg-popover relative z-10 p-0 pt-1 shadow-xs backdrop-blur-xl"
            maxHeight={200}
            value={value}
            onValueChange={onValueChange}
          >
            <FileList files={files} getFileStatus={getFileStatus} onFileRemove={onFileRemove} />
            {selectedUploads.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1">
                {selectedUploads.map((upload) => {
                  const Icon = getUploadIcon(upload.uploadKind)
                  return (
                    <div
                      key={upload.id}
                      className="bg-muted/70 flex max-w-[280px] items-center gap-2 rounded-xl border border-border px-2.5 py-1.5"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-xs font-medium">
                        {upload.title || upload.fileName}
                      </span>
                      <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Upload
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelectedUpload(upload.id)}
                        className="text-muted-foreground transition hover:text-foreground"
                        aria-label="Remove upload reference"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <PromptInputTextarea
              placeholder={
                isMedicalStudent
                  ? placeholderByMode[learningMode]
                  : isDoctor
                    ? CLINICIAN_MODE_PLACEHOLDERS[clinicianMode]
                    : "Ask Fleming anything..."
              }
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base placeholder:text-muted-foreground placeholder:opacity-80"
            />
            {isUploadsPickerOpen && (
              <div className="absolute right-2 bottom-full left-2 z-30 mb-2 rounded-2xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur-xl">
                <div className="mb-1 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Quick Upload Reference
                </div>
                {!isUserAuthenticated ? (
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Sign in to browse your uploads with <span className="font-medium">/</span>
                  </div>
                ) : isUploadsLoading ? (
                  <div className="inline-flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <SpinnerGap className="size-3.5 animate-spin" />
                    Loading uploads...
                  </div>
                ) : filteredUploads.length === 0 ? (
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    No uploads match this search. Try <span className="font-medium">/oxford</span> or upload a file first.
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {filteredUploads.map((upload, index) => {
                      const Icon = getUploadIcon(upload.uploadKind)
                      const isActive = index === selectedUploadIndex
                      const isCompleted = upload.status === "completed"
                      return (
                        <button
                          key={upload.id}
                          type="button"
                          onClick={() => applyUploadReference(upload)}
                          disabled={!isCompleted}
                          className={[
                            "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                            isActive
                              ? "border-foreground/20 bg-muted/60"
                              : "border-border/70 bg-background hover:bg-muted/40",
                            !isCompleted ? "opacity-60" : "",
                          ].join(" ")}
                        >
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">
                                {upload.title || upload.fileName}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {upload.fileName}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {isCompleted ? "ready" : upload.status}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            <PromptInputActions className="mt-5 w-full justify-between px-3 pb-3">
              <div className="flex gap-2">
                <ButtonFileUpload
                  onFileUpload={onFileUpload}
                  isUserAuthenticated={isUserAuthenticated}
                  model={effectiveModelId}
                />
                {hasSearchSupport ? (
                  <ButtonSearch
                    isSelected={enableSearch}
                    onToggle={setEnableSearch}
                    isAuthenticated={isUserAuthenticated}
                  />
                ) : null}
                <ModelSelector
                  selectedModelId={effectiveModelId}
                  setSelectedModelId={onSelectModel}
                  isUserAuthenticated={isUserAuthenticated}
                  className="h-9 rounded-full"
                />
              </div>
              {fileUploadSummary?.hasProcessing ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  <SpinnerGap className="size-3 animate-spin" />
                  Processing {fileUploadSummary.processingCount} file
                  {fileUploadSummary.processingCount === 1 ? "" : "s"}...
                </div>
              ) : fileUploadSummary && fileUploadSummary.failedCount > 0 && files.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
                  <WarningCircle className="size-3" weight="fill" />
                  {fileUploadSummary.failedCount} file
                  {fileUploadSummary.failedCount === 1 ? "" : "s"} need attention
                </div>
              ) : null}
              <PromptInputAction tooltip={status === "streaming" ? "Stop" : "Send"}>
                <Button
                  size="sm"
                  className="size-9 rounded-full transition-all duration-300 ease-out"
                  disabled={isButtonDisabled}
                  type="button"
                  onClick={handleSend}
                  aria-label={status === "streaming" ? "Stop" : "Send message"}
                >
                  {status === "streaming" ? (
                    <StopIcon className="size-4" />
                  ) : (
                    <ArrowUpIcon className="size-4" />
                  )}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>
      )}
    </div>
  )
}
