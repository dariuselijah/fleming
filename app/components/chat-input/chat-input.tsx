"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpIcon,
  FileDoc,
  FilePdf,
  FilePpt,
  FileText,
  FileVideo,
  FolderOpen,
  ImageSquare,
  Microphone,
  SpinnerGap,
  StopIcon,
  X,
} from "@phosphor-icons/react"
import {
  CLINICIAN_MODE_PLACEHOLDERS,
  DEFAULT_CLINICIAN_WORKFLOW_MODE,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import { MODEL_DEFAULT } from "@/lib/config"
import { getModelInfo } from "@/lib/models"
import { useModel } from "@/lib/model-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/toast"
import { listUserUploads } from "@/lib/uploads/api"
import type { UserUploadListItem } from "@/lib/uploads/types"
import { buildUploadReferenceTokens } from "@/lib/uploads/reference-tokens"
import { enforceImageFilePolicy } from "@/lib/chat-attachments/policy"
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
import { LearningModeSelector } from "./learning-mode-selector"
import type { FileUploadSummary, FileUploadStatus } from "../chat/use-file-upload"
import { useCommandBar } from "@/lib/command-bar/use-command-bar"
import type { SlashCommand } from "@/lib/command-bar/command-registry"
import { useWorkspaceStore, buildClinicalContext } from "@/lib/clinical-workspace"
import { useChatDictation } from "@/lib/hooks/use-chat-dictation"
import { AnimatePresence } from "motion/react"
import dynamic from "next/dynamic"

const CommandPopover = dynamic(
  () => import("../workspace/command-popover").then((m) => m.CommandPopover),
  { ssr: false }
)
const CommandChip = dynamic(
  () => import("../workspace/command-chip").then((m) => m.CommandChip),
  { ssr: false }
)

// Fleming 3.5 has been removed - only Fleming 4 is available

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
  const isDoctor_ = preferences.userRole === "doctor"
  const isMedicalStudent_ = preferences.userRole === "medical_student"
  const isClinicalWorkspaceActive_ = isDoctor_
  const [isButtonDisabled, setIsButtonDisabled] = useState(true)
  const [tabsDismissed, setTabsDismissed] = useState(false)
  const [isUploadsPickerOpen, setIsUploadsPickerOpen] = useState(false)
  const [isUploadsLoading, setIsUploadsLoading] = useState(false)
  const [uploadResults, setUploadResults] = useState<UserUploadListItem[]>([])
  const [selectedUploads, setSelectedUploads] = useState<UserUploadListItem[]>([])
  const [selectedUploadIndex, setSelectedUploadIndex] = useState(0)
  const [uploadsLoadedAt, setUploadsLoadedAt] = useState(0)
  const valueRef = useRef(value)
  valueRef.current = value

  const dictation = useChatDictation({
    onAppendText: useCallback(
      (t: string) => {
        onValueChange(valueRef.current + t)
      },
      [onValueChange]
    ),
  })

  useEffect(() => {
    if (!dictation.error) return
    toast({ title: dictation.error, status: "error" })
  }, [dictation.error])

  const activePatientId = useWorkspaceStore((s) => s.activePatientId)

  const handleCommandAction_ = useCallback(
    (command: SlashCommand, args: string) => {
      onValueChange("")

      if (command.action === "overlay") {
        window.dispatchEvent(
          new CustomEvent("fleming:command", { detail: { command: command.id, args } })
        )
        return
      }

      if (command.id === "upload") {
        window.dispatchEvent(new CustomEvent("fleming:open-document-selector"))
        return
      }

      if (command.id === "sign" || command.id === "submit_claim") {
        window.dispatchEvent(
          new CustomEvent("fleming:command", { detail: { command: command.id, args } })
        )
        return
      }

      const store = useWorkspaceStore.getState()
      const patient = store.openPatients.find(
        (p) => p.patientId === store.activePatientId
      )
      const ctx = buildClinicalContext(
        store.scribeTranscript,
        store.scribeEntities,
        patient,
        store.scribeEntityStatus
      )
      const CTX_BLOCK = ctx ? `\n\n${ctx}` : ""
      const CONCISE = "Be concise and clinically precise. No preamble. Bullet points preferred. Tag each statement with [T] (from transcript), [E] (from extracted entities), or [H] (from patient history) to indicate its source."
      const SOAP_FROM_CONSULT =
        "Be concise and clinically precise. Chart-ready SOAP from the consultation context only. Do not tag lines with [T], [E], or [H]. If something was not discussed, write \"not documented\" rather than guessing."
      const OPEN_EVIDENCE_STYLE =
        "OpenEvidence-style: lead with actionable recommendations, then conditional/alternative paths. " +
        "Cite ONLY with numbered in-text markers [1], [2] matching retrieved evidence — never use [T], [E], or [H]. " +
        "After the narrative, append a block exactly in this form so the workspace can parse sources:\n" +
        "=== EVIDENCE SOURCES (N) ===\n[1] Title\nJournal: … | Year: … | URL: …\n…\n=== END ==="
      const COMMAND_PROMPTS: Record<string, (a: string) => string> = {
        summary: (a) => a
          ? `[/summary] Clinical summary focusing on: ${a}. Sections: Presenting Complaint, Exam Findings, Assessment, Plan. ${CONCISE}${CTX_BLOCK}`
          : `[/summary] Generate a clinical summary for the current consult: Presenting Complaint, Exam Findings, Assessment, Plan. ${CONCISE}${CTX_BLOCK}`,
        interactions: (a) => a
          ? `[/interactions] Check drug interactions for: ${a}. List severity, mechanism, recommendation. ${CONCISE}${CTX_BLOCK}`
          : `[/interactions] Check drug interactions for all current medications. Flag contraindications. ${CONCISE}${CTX_BLOCK}`,
        evidence: (a) => a
          ? `[/evidence] Evidence-based answer for: ${a}. ${OPEN_EVIDENCE_STYLE}${CTX_BLOCK}`
          : `[/evidence] Evidence-based guidelines and literature for this presentation. ${OPEN_EVIDENCE_STYLE}${CTX_BLOCK}`,
        drug: (a) => a
          ? `[/drug] Drug info for: ${a}. Include dosing, route, frequency, side effects, interactions. ${CONCISE}${CTX_BLOCK}`
          : `[/drug] Drug information for current medications: dosing, side effects, interactions. ${CONCISE}${CTX_BLOCK}`,
        icd: (a) => a
          ? `[/icd] ICD-10 codes for: ${a}. Code, description, confidence. Primary first. ${CONCISE}${CTX_BLOCK}`
          : `[/icd] Suggest ICD-10 codes based on the consultation. Code, description, confidence. ${CONCISE}${CTX_BLOCK}`,
        prescribe: (a) => a
          ? `[/prescribe] Prescribe: ${a}. Drug, strength, route, frequency, duration, quantity. Check interactions. ${CONCISE}${CTX_BLOCK}`
          : `[/prescribe] Help prescribe medication. Drug, strength, route, frequency, duration. Check interactions. ${CONCISE}${CTX_BLOCK}`,
        refer: (a) => a
          ? `[/refer] Referral letter to: ${a}. Reason, clinical summary, investigations, questions. ${CONCISE}${CTX_BLOCK}`
          : `[/refer] Generate referral letter. Reason, clinical summary, investigations, specialist questions. ${CONCISE}${CTX_BLOCK}`,
        soap: (a) => a
          ? `[/soap] SOAP note focusing on: ${a}. Format with ## Subjective, ## Objective, ## Assessment, ## Plan. ${SOAP_FROM_CONSULT}${CTX_BLOCK}`
          : `[/soap] Create a SOAP note from this consultation. Format with ## Subjective, ## Objective, ## Assessment, ## Plan. ${SOAP_FROM_CONSULT}${CTX_BLOCK}`,
        vitals: (a) => a
          ? `[/vitals] Record vitals: ${a}. BP, HR, RR, Temp, SpO2, Weight, Height, BMI. Interpret abnormalities. ${CONCISE}${CTX_BLOCK}`
          : `[/vitals] Document vital-sign set: BP, HR, RR, Temp, SpO2, Weight, Height, BMI, Pain. Interpret abnormalities. ${CONCISE}${CTX_BLOCK}`,
        verify: (a) => a
          ? `[/verify] Verify medical aid eligibility for: ${a}. ${CONCISE}${CTX_BLOCK}`
          : `[/verify] Verify patient medical aid eligibility. Member status, benefits, pre-auth. ${CONCISE}${CTX_BLOCK}`,
        claim: (a) => a
          ? `[/claim] Billing claim: ${a}. ICD-10 codes, tariff codes, line items. ${CONCISE}${CTX_BLOCK}`
          : `[/claim] Prepare billing claim from consultation. ICD-10, tariffs, line items. ${CONCISE}${CTX_BLOCK}`,
      }

      const promptFn = COMMAND_PROMPTS[command.id]
      if (promptFn) {
        onSuggestion(promptFn(args))
        return
      }

      if (command.action === "panel") {
        window.dispatchEvent(
          new CustomEvent("fleming:command", { detail: { command: command.id, args } })
        )
        return
      }

      if (command.action === "submit") {
        const prompt = args ? `[/${command.id}] ${command.label}: ${args}` : `[/${command.id}] ${command.label}`
        onSuggestion(prompt)
      }
    },
    [onValueChange, onSuggestion]
  )

  const commandBar = useCommandBar({
    hasPatient: Boolean(activePatientId),
    clinicalCopilot: isDoctor_ || isMedicalStudent_,
    onCommandAction: handleCommandAction_,
  })

  // Migrate old model aliases to the default model id.
  const effectiveModelId = useMemo(() => {
    if (selectedModel === 'grok-4' || selectedModel === 'grok-4-fast-reasoning' || selectedModel === 'fleming-3.5') {
      return MODEL_DEFAULT
    }
    return selectedModel || MODEL_DEFAULT
  }, [selectedModel])

  const selectModelConfig = getModelInfo(effectiveModelId)
  const hasVisionSupport = Boolean(selectModelConfig?.vision)
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
    if (kind === "video") return FileVideo
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

    // Always collapse the scribe when sending so chat flows cleanly below it
    if (isClinicalWorkspaceActive_) {
      const ws = useWorkspaceStore.getState()
      if (!ws.scribeCollapsed) {
        ws.setScribeCollapsed(true)
      }
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
      // Let command bar handle keys first for doctors (popover open OR chip active)
      if (isDoctor_ && (commandBar.isOpen || commandBar.activeChip)) {
        const handled = commandBar.handleKeyDown(e, value)
        if (handled) return
      }

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

      if (!hasVisionSupport && hasImageContent) {
        e.preventDefault()
        toast({
          title: "This model does not support image uploads",
          description: "Switch to a vision-enabled model to paste images.",
          status: "warning",
        })
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
          const { accepted, rejected } = enforceImageFilePolicy(imageFiles)
          if (accepted.length > 0) {
            onFileUpload(accepted as File[])
          }
          if (rejected.length > 0) {
            toast({
              title: "Some pasted images were skipped",
              description: rejected[0]?.detail || "Unsupported image format or size.",
              status: "warning",
            })
          }
        }
      }
    },
    [hasVisionSupport, isUserAuthenticated, onFileUpload]
  )

  // When command is selected from popover, clear the slash text
  useEffect(() => {
    if (commandBar.activeChip) {
      onValueChange("")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandBar.activeChip])

  // Notify command bar of input changes (for doctors)
  useEffect(() => {
    if (isDoctor_) {
      commandBar.handleInputChange(value)
    }
  }, [value, isDoctor_, commandBar.handleInputChange])

  useEffect(() => {
    if (!isSlashUploadsMode || (isDoctor_ && commandBar.isOpen)) {
      setIsUploadsPickerOpen(false)
      return
    }
    setIsUploadsPickerOpen(true)
  }, [isSlashUploadsMode, isDoctor_, commandBar.isOpen])

  useEffect(() => {
    if (!isUploadsPickerOpen || !isUserAuthenticated) return
    const isStale = Date.now() - uploadsLoadedAt > 20_000
    if (!isStale && uploadResults.length > 0) return

    let active = true
    setIsUploadsLoading(true)
    listUserUploads({
      allowStale: true,
      maxAgeMs: 20_000,
      revalidateInBackground: true,
    })
      .then(async (uploads) => {
        if (!active) return
        setUploadResults(uploads)
        setUploadsLoadedAt(Date.now())
        if (!isStale) return
        const fresh = await listUserUploads({ forceRefresh: true, allowStale: true })
        if (!active) return
        setUploadResults(fresh)
        setUploadsLoadedAt(Date.now())
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
    const hasValidInput =
      (value && !isOnlyWhitespace(value)) ||
      Boolean(dictation.interimTranscript?.trim());
    const hasAttachedFiles = files.length > 0
    const hasUploadReferences = selectedUploads.length > 0
    const hasArtifactIntent = artifactIntent !== "none"
    const isStreaming = status === "streaming";
    const isSubmittingButNotStreaming = isSubmitting && !isStreaming;
    
    const shouldDisable = !isStreaming && ((!hasValidInput && !hasAttachedFiles && !hasUploadReferences && !hasArtifactIntent) || isSubmittingButNotStreaming);
    setIsButtonDisabled(Boolean(shouldDisable));
  }, [files.length, value, selectedUploads.length, artifactIntent, isSubmitting, status, dictation.interimTranscript])

  // Reset tabs-dismissed when conversation has no messages (e.g. new chat)
  useEffect(() => {
    if (!hasMessages) setTabsDismissed(false)
  }, [hasMessages])

  const placeholderByMode: Record<MedicalStudentLearningMode, string> = {
    ask: "Ask Fleming anything...",
    simulate: "Start a clinical simulation (e.g., chest pain in ED)...",
    guideline: "Ask for a guideline snapshot (e.g., HF GDMT updates)...",
  }

  const showClinicianWorkflowPanel =
    isDoctor_ &&
    !isClinicalWorkspaceActive_ &&
    !hasMessages &&
    !tabsDismissed &&
    clinicianMode !== "open_search"
  const shouldShowInlineSuggestions = showClinicianWorkflowPanel

  const showDictation =
    (isDoctor_ || isMedicalStudent_) && dictation.supported && !showClinicianWorkflowPanel

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
      {isMedicalStudent_ && (
        <LearningModeSelector
          value={learningMode}
          onChange={onLearningModeChange}
        />
      )}
      {isDoctor_ && !isClinicalWorkspaceActive_ && onClinicianModeChange && !hasMessages && !tabsDismissed && (
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
            {files.length > 0 ? (
              <div className="px-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {files.length} file{files.length === 1 ? "" : "s"} ready to send
                  </p>
                  <button
                    type="button"
                    onClick={() => files.forEach((file) => onFileRemove(file))}
                    className="text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {files.slice(0, 3).map((file) => {
                    const fileStatus = getFileStatus?.(file)
                    const toneClass =
                      fileStatus?.state === "failed"
                        ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
                        : fileStatus?.state === "uploading"
                          ? "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                          : "border-border/70 bg-muted/45 text-muted-foreground"
                    return (
                      <div
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className={cn(
                          "flex max-w-[220px] items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]",
                          toneClass
                        )}
                      >
                        <span className="truncate font-medium">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => onFileRemove(file)}
                          className="opacity-80 transition hover:opacity-100"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    )
                  })}
                  {files.length > 3 ? (
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                      +{files.length - 3} more
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
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
            {/* Command chip (stays in input when / command selected) */}
            <AnimatePresence>
              {isDoctor_ && commandBar.activeChip && (
                <div className="flex items-center px-3 pt-2">
                  <CommandChip command={commandBar.activeChip} onRemove={commandBar.clearChip} />
                </div>
              )}
            </AnimatePresence>
            {dictation.interimTranscript ? (
              <div className="px-4 pt-1 text-xs italic text-muted-foreground/90">
                {dictation.interimTranscript}
              </div>
            ) : null}
            <PromptInputTextarea
              placeholder={
                commandBar.activeChip
                  ? `${commandBar.activeChip.description}...`
                  : isMedicalStudent_
                    ? placeholderByMode[learningMode]
                    : isClinicalWorkspaceActive_
                      ? "Ask a clinical question or describe the case · Type / for commands"
                      : isDoctor_
                        ? CLINICIAN_MODE_PLACEHOLDERS[clinicianMode]
                        : "Ask Fleming anything..."
              }
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              className={cn(
                "min-h-[44px] text-base leading-[1.3] sm:text-base md:text-base placeholder:text-muted-foreground placeholder:opacity-80",
                commandBar.activeChip ? "pt-1.5 pl-4" : "pt-3 pl-4"
              )}
            />
            {/* Notion-style command popover for doctors */}
            <AnimatePresence>
              {isDoctor_ && commandBar.isOpen && !isUploadsPickerOpen && (
                <CommandPopover
                  commands={commandBar.results}
                  selectedIndex={commandBar.selectedIndex}
                  onSelect={(cmd) => commandBar.handleSelect(cmd, value)}
                />
              )}
            </AnimatePresence>
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
                <ButtonSearch
                  isSelected={enableSearch}
                  onToggle={setEnableSearch}
                  isAuthenticated={isUserAuthenticated}
                />
                <ModelSelector
                  selectedModelId={effectiveModelId}
                  setSelectedModelId={onSelectModel}
                  isUserAuthenticated={isUserAuthenticated}
                  className="h-9 rounded-full"
                />
                {showDictation ? (
                  <Button
                    size="sm"
                    type="button"
                    variant={dictation.isListening ? "default" : "outline"}
                    className={cn(
                      "size-9 shrink-0 rounded-full border p-0",
                      dictation.isListening &&
                        "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                    )}
                    onClick={() => dictation.toggle()}
                    aria-label={dictation.isListening ? "Stop dictation" : "Start dictation"}
                    aria-pressed={dictation.isListening}
                  >
                    <Microphone className={cn("size-4", dictation.isListening && "animate-pulse")} />
                  </Button>
                ) : null}
              </div>
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
