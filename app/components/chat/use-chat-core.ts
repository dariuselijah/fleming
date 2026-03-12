import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { toast as sonnerToast } from "sonner"
import { getOrCreateGuestUserId } from "@/lib/api"
import { MESSAGE_MAX_LENGTH, getSystemPromptByRole } from "@/lib/config"
import { encodeArtifactWorkflowInput } from "@/lib/chat/artifact-workflow"
import { Attachment } from "@/lib/file-handling"
import { buildUploadReferenceTokens } from "@/lib/uploads/reference-tokens"
import { isImageAttachment } from "@/lib/chat-attachments/constants"
import {
  DEFAULT_MEDICAL_STUDENT_LEARNING_MODE,
  normalizeMedicalStudentLearningMode,
  type MedicalStudentLearningMode,
} from "@/lib/medical-student-learning"
import {
  DEFAULT_CLINICIAN_WORKFLOW_MODE,
  normalizeClinicianWorkflowMode,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import { normalizeCitationStyle, type CitationStyle } from "@/lib/citations/formatters"
import { resolveScopedSessionMessages } from "@/lib/chat-store/messages/session-restore"
import { API_ROUTE_CHAT } from "@/lib/routes"
import { getModelInfo } from "@/lib/models"
import {
  CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE,
  enforceImageAttachmentPolicy,
  enforceImageFilePolicy,
} from "@/lib/chat-attachments/policy"
import type { UserProfile } from "@/lib/user/types"
import type { Message } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"

const SESSION_SNAPSHOT_MAX_MESSAGES = 30
const SESSION_SNAPSHOT_MAX_CONTENT_CHARS = 6000
const SESSION_SNAPSHOT_FALLBACK_MAX_MESSAGES = 12
const SESSION_SNAPSHOT_FALLBACK_MAX_CONTENT_CHARS = 1800
const SESSION_SNAPSHOT_LATEST_MAX_MESSAGES = 8
const SESSION_SNAPSHOT_PART_TEXT_MAX_CHARS = 800
const INSTANT_STREAM_INTRO = "Working on your request..."
const IMAGE_UPLOAD_PREP_BUDGET_MS = 1200

function createEphemeralChatId() {
  return `temp-chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    const timeoutPromise = new Promise<T>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs)
    })
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

function truncateSnapshotString(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value
}

function compactSnapshotValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    return truncateSnapshotString(value, SESSION_SNAPSHOT_PART_TEXT_MAX_CHARS)
  }
  if (depth > 3) {
    return typeof value === "object" ? "[truncated]" : value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => compactSnapshotValue(item, depth + 1))
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12)
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, compactSnapshotValue(nested, depth + 1)])
    )
  }
  return String(value)
}

function extractSessionSafeMessageParts(message: Message): unknown[] | undefined {
  if (!Array.isArray(message.parts)) return undefined
  const refinedParts = message.parts
    .map((part) => {
      const candidate = part as any
      if (candidate?.type === "text" && typeof candidate.text === "string") {
        const trimmed = candidate.text.trim()
        if (!trimmed) return null
        return {
          type: "text",
          text: truncateSnapshotString(trimmed, SESSION_SNAPSHOT_PART_TEXT_MAX_CHARS),
        }
      }
      if (candidate?.type === "reasoning" && typeof candidate.text === "string") {
        const trimmed = candidate.text.trim()
        if (!trimmed) return null
        return {
          type: "reasoning",
          text: truncateSnapshotString(trimmed, SESSION_SNAPSHOT_PART_TEXT_MAX_CHARS),
        }
      }
      if (candidate?.type === "tool-invocation") {
        const invocation = candidate.toolInvocation as
          | {
              toolName?: unknown
              toolCallId?: unknown
              state?: unknown
              args?: unknown
              result?: unknown
              step?: unknown
            }
          | undefined
        const toolName = String(invocation?.toolName || "")
        const toolCallId =
          typeof invocation?.toolCallId === "string" &&
          invocation.toolCallId.trim().length > 0
            ? invocation.toolCallId
            : `${toolName || "tool"}-snapshot`
        const state =
          invocation?.state === "call" ||
          invocation?.state === "partial-call" ||
          invocation?.state === "result"
            ? invocation.state
            : "result"

        return {
          type: "tool-invocation",
          toolInvocation: {
            toolName,
            toolCallId,
            state,
            step:
              typeof invocation?.step === "number" ? invocation.step : undefined,
            args: compactSnapshotValue(invocation?.args),
            result: compactSnapshotValue(invocation?.result),
          },
        }
      }
      if (candidate?.type === "metadata" && candidate?.metadata) {
        const metadata = candidate.metadata as Record<string, unknown>
        return {
          type: "metadata",
          metadata: {
            topicContext: compactSnapshotValue(metadata.topicContext),
            evidenceCitations: compactSnapshotValue(metadata.evidenceCitations),
            documentArtifacts: compactSnapshotValue(metadata.documentArtifacts),
            quizArtifacts: compactSnapshotValue(metadata.quizArtifacts),
            citationStyle: compactSnapshotValue(metadata.citationStyle),
          },
        }
      }
      return null
    })
    .filter(Boolean)
    .slice(0, 18)
  return refinedParts.length > 0 ? refinedParts : undefined
}

function extractSessionSafeAnnotations(message: Message): unknown[] | undefined {
  const annotations = (message as any)?.annotations
  if (!Array.isArray(annotations)) return undefined
  const refinedAnnotations = annotations
    .map((annotation) => {
      if (!annotation || typeof annotation !== "object") return null
      const candidate = annotation as Record<string, unknown>
      const type = String(candidate.type || "")
      const base = {
        ...(typeof candidate.sequence === "number"
          ? { sequence: candidate.sequence }
          : {}),
        ...(typeof candidate.createdAt === "string"
          ? { createdAt: candidate.createdAt }
          : {}),
      }
      if (type === "artifact-refinement") {
        return {
          ...base,
          type,
          refinement: compactSnapshotValue(candidate.refinement),
        }
      }
      if (type === "topic-context") {
        return {
          ...base,
          type,
          topicContext: compactSnapshotValue(candidate.topicContext),
        }
      }
      if (type === "artifact-runtime-warnings") {
        return {
          ...base,
          type,
          warnings: compactSnapshotValue(candidate.warnings),
        }
      }
      if (type === "evidence-citations") {
        return {
          ...base,
          type,
          citations: compactSnapshotValue(candidate.citations),
        }
      }
      if (type === "langgraph-routing") {
        return {
          ...base,
          type,
          trace: compactSnapshotValue(candidate.trace),
          summary: compactSnapshotValue(candidate.summary),
          maxSteps: compactSnapshotValue(candidate.maxSteps),
        }
      }
      if (type === "tool-lifecycle") {
        return {
          ...base,
          type,
          toolName: compactSnapshotValue(candidate.toolName),
          toolCallId: compactSnapshotValue(candidate.toolCallId),
          lifecycle: compactSnapshotValue(candidate.lifecycle),
          detail: compactSnapshotValue(candidate.detail),
        }
      }
      if (type === "timeline-event") {
        return {
          ...base,
          type,
          event: compactSnapshotValue(candidate.event),
        }
      }
      if (type === "upload-status-tracking") {
        return {
          ...base,
          type,
          uploadIds: compactSnapshotValue(candidate.uploadIds),
        }
      }
      if (type === "upload-status") {
        return {
          ...base,
          type,
          uploadId: compactSnapshotValue(candidate.uploadId),
          uploadTitle: compactSnapshotValue(candidate.uploadTitle),
          status: compactSnapshotValue(candidate.status),
          progressStage: compactSnapshotValue(candidate.progressStage),
          progressPercent: compactSnapshotValue(candidate.progressPercent),
          lastError: compactSnapshotValue(candidate.lastError),
        }
      }
      return null
    })
    .filter(Boolean)
    .slice(0, 18)
  return refinedAnnotations.length > 0 ? refinedAnnotations : undefined
}

function extractSessionSafeMessageContent(message: Message): string {
  if (typeof message.content === "string") {
    return message.content
  }

  if (!Array.isArray(message.parts)) {
    return ""
  }

  const textChunks: string[] = []
  for (const part of message.parts) {
    const candidate = part as { type?: string; text?: unknown }
    if (candidate?.type === "text" && typeof candidate.text === "string") {
      const trimmed = candidate.text.trim()
      if (trimmed) {
        textChunks.push(trimmed)
      }
    }
  }

  return textChunks.join("\n\n")
}

function buildSessionMessageSnapshot(
  messages: Message[],
  maxMessages: number,
  maxContentChars: number
): Message[] {
  const recentMessages = messages.slice(-maxMessages)
  return recentMessages.map((message) => {
    const safeParts = extractSessionSafeMessageParts(message)
    const safeAnnotations = extractSessionSafeAnnotations(message)
    return {
      id: message.id,
      role: message.role,
      content: extractSessionSafeMessageContent(message).slice(0, maxContentChars),
      ...(safeParts ? { parts: safeParts as any } : {}),
      ...(safeAnnotations ? { annotations: safeAnnotations as any } : {}),
    } as Message
  })
}

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  )
}

function mergeEvidenceCitationAnnotations(
  annotations: Array<{ type?: string; citations?: unknown[] }> | undefined
) {
  if (!Array.isArray(annotations)) return []
  const merged: any[] = []
  const seenKeys = new Set<string>()
  annotations.forEach((annotation) => {
    if (annotation?.type !== "evidence-citations" || !Array.isArray(annotation.citations)) {
      return
    }
    annotation.citations.forEach((citation: any) => {
      const key =
        citation?.pmid ||
        citation?.doi ||
        citation?.url ||
        `${citation?.title || "untitled"}:${citation?.journal || "unknown"}`
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      merged.push(citation)
    })
  })
  return merged.map((citation, index) => ({
    ...citation,
    index: index + 1,
  }))
}

function mergeMessageAnnotations(
  existing: Array<Record<string, unknown>> | undefined,
  incoming: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const merged = [...(Array.isArray(existing) ? existing : []), ...incoming]
  const deduped = new Map<string, Record<string, unknown>>()

  merged.forEach((annotation, index) => {
    const type =
      typeof annotation?.type === "string"
        ? annotation.type
        : `annotation-${index}`
    const sequence =
      typeof annotation?.sequence === "number"
        ? annotation.sequence
        : `seq-${index}`
    const key = `${type}:${sequence}:${JSON.stringify(annotation).slice(0, 160)}`
    deduped.set(key, annotation)
  })

  return Array.from(deduped.values())
}

type UseChatCoreProps = {
  initialMessages: Message[]
  draftValue: string
  cacheAndAddMessage: (message: Message) => void
  chatId: string | null
  user: UserProfile | null
  files: File[]
  createOptimisticAttachments: (
    files: File[]
  ) => Attachment[]
  setFiles: (files: File[]) => void
  checkLimitsAndNotify: (
    uid: string,
    requestedAttachmentCount?: number
  ) => Promise<boolean>
  cleanupOptimisticAttachments: (attachments?: Array<{ url?: string }>) => void
  ensureChatExists: (
    uid: string,
    input: string,
    options?: { navigate?: boolean }
  ) => Promise<string | null>
  handleFileUploads: (
    uid: string,
    chatId: string,
    isAuthenticated?: boolean,
    filesToUpload?: File[]
  ) => Promise<Attachment[] | null>
  convertBlobUrlsToDataUrls: (
    attachments: Attachment[],
    files: File[]
  ) => Promise<Attachment[]>
  selectedModel: string
  clearDraft: () => void
  bumpChat: (chatId: string) => void
  setHasDialogAuth: (value: boolean) => void
  setHasRateLimitPaywall?: (value: boolean) => void
  setRateLimitWaitTime?: (value: number | null) => void
  setRateLimitType?: (value: "hourly" | "daily") => void
}

export function useChatCore({
  initialMessages,
  draftValue,
  cacheAndAddMessage,
  chatId,
  user,
  files,
  createOptimisticAttachments,
  setFiles,
  checkLimitsAndNotify,
  handleFileUploads,
  convertBlobUrlsToDataUrls,
  selectedModel,
  clearDraft,
  setHasDialogAuth,
  setHasRateLimitPaywall,
  setRateLimitWaitTime,
  setRateLimitType,
}: UseChatCoreProps) {
  const LEARNING_MODE_STORAGE_KEY = "medical-student-learning-mode"
  const CLINICIAN_MODE_STORAGE_KEY = "clinician-workflow-mode"
  const router = useRouter()
  // State management
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enableSearch, setEnableSearch] = useState(false)
  const [enableEvidence, setEnableEvidence] = useState(true) // Enabled by default
  const [learningMode, setLearningModeState] =
    useState<MedicalStudentLearningMode>(
      DEFAULT_MEDICAL_STUDENT_LEARNING_MODE
    )
  const [clinicianMode, setClinicianModeState] =
    useState<ClinicianWorkflowMode>(DEFAULT_CLINICIAN_WORKFLOW_MODE)
  const [artifactIntent, setArtifactIntent] = useState<"none" | "quiz">("none")
  const [citationStyle, setCitationStyleState] = useState<CitationStyle>("harvard")
  
  // Evidence citations from server - indexed by message ID or last response
  // Use ref to persist across hook reinitializations (e.g., URL changes)
  const evidenceCitationsRef = useRef<any[]>([])
  const [evidenceCitations, setEvidenceCitationsState] = useState<any[]>([])
  const topicContextRef = useRef<any | null>(null)
  const [streamIntroPreview, setStreamIntroPreview] = useState<string | null>(null)
  const pendingHeaderTimelineAnnotationsRef = useRef<
    Array<Record<string, unknown>>
  >([])
  const headerTimelineSequenceRef = useRef(0)

  const pushHeaderTimelineAnnotation = useCallback(
    (annotation: Record<string, unknown>) => {
      headerTimelineSequenceRef.current += 1
      pendingHeaderTimelineAnnotationsRef.current = [
        ...pendingHeaderTimelineAnnotationsRef.current,
        {
          ...annotation,
          sequence:
            typeof annotation.sequence === "number"
              ? annotation.sequence
              : headerTimelineSequenceRef.current,
          createdAt:
            typeof annotation.createdAt === "string"
              ? annotation.createdAt
              : new Date().toISOString(),
        },
      ]
    },
    []
  )

  const hasRenderableAssistantPayload = useCallback((message: Message) => {
    if (typeof message.content === "string" && message.content.trim().length > 0) {
      return true
    }
    if (!Array.isArray(message.parts)) return false
    return message.parts.some((part: any) => {
      if (!part || typeof part !== "object") return false
      if (part.type === "text") {
        return typeof part.text === "string" && part.text.trim().length > 0
      }
      return (
        part.type === "tool-invocation" ||
        part.type === "reasoning" ||
        part.type === "source" ||
        part.type === "step-start" ||
        part.type === "metadata"
      )
    })
  }, [])
  
  // Wrapper to update both state, ref, and sessionStorage
  const setEvidenceCitations = useCallback((citations: any[]) => {
    console.log('📚 [EVIDENCE] Setting evidence citations:', citations.length)
    evidenceCitationsRef.current = citations
    setEvidenceCitationsState(citations)
    
    // Store in sessionStorage for persistence across restores
    if (typeof window !== 'undefined' && citations.length > 0) {
      const key = chatId || 'pending'
      try {
        sessionStorage.setItem(`evidenceCitations:${key}`, JSON.stringify(citations))
        sessionStorage.setItem('evidenceCitations:latest', JSON.stringify({ chatId: key, citations, timestamp: Date.now() }))
        console.log('📚 [EVIDENCE] Stored citations to sessionStorage for key:', key)
      } catch (e) {
        console.error('📚 [EVIDENCE] Failed to store citations to sessionStorage:', e)
      }
    }
  }, [chatId])

  const clearEvidenceCitations = useCallback(() => {
    evidenceCitationsRef.current = []
    setEvidenceCitationsState([])
  }, [])

  const setTopicContext = useCallback((topicContext: any | null) => {
    topicContextRef.current = topicContext
    if (typeof window !== "undefined" && chatId && topicContext) {
      try {
        sessionStorage.setItem(`topicContext:${chatId}`, JSON.stringify(topicContext))
      } catch (error) {
        console.error("Failed to persist topic context:", error)
      }
    }
  }, [chatId])
  
  // Track which chatId we've already restored citations for to prevent duplicate restores
  const restoredChatIdRef = useRef<string | null>(null)
  const isRestoringRef = useRef(false) // Prevent concurrent restores
  
  // Reset restore tracking when navigating away (chatId becomes null)
  useEffect(() => {
    if (!chatId && restoredChatIdRef.current !== null) {
      restoredChatIdRef.current = null
      isRestoringRef.current = false
    }
  }, [chatId])
  
  // Extract evidence citations from loaded messages (from database)
  useEffect(() => {
    if (!initialMessages || initialMessages.length === 0) return
    
    // Find the last assistant message with evidence citations
    for (let i = initialMessages.length - 1; i >= 0; i--) {
      const msg = initialMessages[i] as any
      if (msg.role === 'assistant' && msg.evidenceCitations && Array.isArray(msg.evidenceCitations) && msg.evidenceCitations.length > 0) {
        console.log(`📚 [RESTORE] Found ${msg.evidenceCitations.length} evidence citations in loaded message`)
        evidenceCitationsRef.current = msg.evidenceCitations
        setEvidenceCitationsState(msg.evidenceCitations)
        
        // Also store in sessionStorage for persistence
        if (typeof window !== 'undefined' && chatId) {
          try {
            sessionStorage.setItem(`evidenceCitations:${chatId}`, JSON.stringify(msg.evidenceCitations))
            sessionStorage.setItem('evidenceCitations:latest', JSON.stringify({ chatId, citations: msg.evidenceCitations, timestamp: Date.now() }))
            restoredChatIdRef.current = chatId
          } catch (e) {
            console.error('📚 [RESTORE] Failed to store citations to sessionStorage:', e)
          }
        }
        break // Only restore from the most recent assistant message
      }
    }

    for (let i = initialMessages.length - 1; i >= 0; i--) {
      const msg = initialMessages[i] as any
      if (msg.role === "assistant" && msg.topicContext) {
        setTopicContext(msg.topicContext)
        break
      }
    }
  }, [initialMessages, chatId, setTopicContext])
  
  // Restore evidence citations from sessionStorage when chatId changes (only once per chatId)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isRestoringRef.current) return // Prevent concurrent restores
    
    // Skip if we've already restored for this chatId
    if (chatId && restoredChatIdRef.current === chatId) {
      return
    }

    // Moving to a different chat should never carry citations forward.
    if (
      chatId &&
      restoredChatIdRef.current &&
      restoredChatIdRef.current !== chatId
    ) {
      clearEvidenceCitations()
    }
    
    isRestoringRef.current = true
    
    try {
      // Skip if we already have citations in ref (they were set from onResponse)
      if (evidenceCitationsRef.current.length > 0 && chatId && restoredChatIdRef.current === null) {
        // Citations already exist from onResponse, just mark as restored
        restoredChatIdRef.current = chatId
        return
      }
      
      // First try to restore from current chatId
      if (chatId) {
        const key = `evidenceCitations:${chatId}`
        const stored = sessionStorage.getItem(key)
        if (stored) {
          try {
            const citations = JSON.parse(stored)
            if (Array.isArray(citations) && citations.length > 0) {
              // Only update if different from current ref
              const currentIds = evidenceCitationsRef.current.map(c => c.index).sort().join(',')
              const newIds = citations.map(c => c.index).sort().join(',')
              if (currentIds !== newIds) {
                console.log('📚 [EVIDENCE] Restored citations from sessionStorage for chatId:', chatId, citations.length)
                evidenceCitationsRef.current = citations
                setEvidenceCitationsState(citations)
              }
              restoredChatIdRef.current = chatId
              return
            }
          } catch (e) {
            console.error('📚 [EVIDENCE] Failed to parse stored citations:', e)
          }
        }
      }
      
      // Fallback to latest (only if we don't have a chatId or haven't restored yet)
      if (!chatId || restoredChatIdRef.current === null) {
        const latest = sessionStorage.getItem('evidenceCitations:latest')
        if (latest) {
          try {
            const latestData = JSON.parse(latest)
            if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
              // Only use if recent (within last 30 seconds) or matches current chatId
              const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 30000)
              const matchesChatId = !chatId || latestData.chatId === chatId
              
              // Never restore latest citations into a different concrete chat.
              if ((!chatId && isRecent) || matchesChatId) {
                // Only update if different from current ref
                const currentIds = evidenceCitationsRef.current.map((c: any) => c.index).sort().join(',')
                const newIds = latestData.citations.map((c: any) => c.index).sort().join(',')
                if (currentIds !== newIds) {
                  console.log('📚 [EVIDENCE] Restored citations from latest sessionStorage:', latestData.citations.length)
                  evidenceCitationsRef.current = latestData.citations
                  setEvidenceCitationsState(latestData.citations)
                }
                if (chatId) {
                  restoredChatIdRef.current = chatId
                }
                return
              }
            }
          } catch (e) {
            console.error('📚 [EVIDENCE] Failed to parse latest citations:', e)
          }
        }
      }
      
      // Mark as restored even if we didn't find anything (prevents infinite loops)
      if (chatId) {
        // Explicitly clear stale citations when this chat has no stored evidence.
        clearEvidenceCitations()
        restoredChatIdRef.current = chatId
      }
    } finally {
      // Always reset the restoring flag
      isRestoringRef.current = false
    }
  }, [chatId, clearEvidenceCitations]) // Only depend on chatId, NOT evidenceCitations

  useEffect(() => {
    if (typeof window === "undefined" || !chatId) return
    try {
      const stored = sessionStorage.getItem(`topicContext:${chatId}`)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === "object") {
        topicContextRef.current = parsed
      }
    } catch (error) {
      console.error("Failed to restore topic context:", error)
    }
  }, [chatId])

  // Get user preferences at the top level
  const { useUserPreferences } = require("@/lib/user-preference-store/provider")
  const userPreferences = useUserPreferences()

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedMode = window.localStorage.getItem(LEARNING_MODE_STORAGE_KEY)
    if (!storedMode) return
    setLearningModeState(normalizeMedicalStudentLearningMode(storedMode))
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedMode = window.localStorage.getItem(CLINICIAN_MODE_STORAGE_KEY)
    if (!storedMode) return
    setClinicianModeState(normalizeClinicianWorkflowMode(storedMode))
  }, [])

  useEffect(() => {
    if (userPreferences.preferences.userRole !== "medical_student") {
      if (learningMode !== DEFAULT_MEDICAL_STUDENT_LEARNING_MODE) {
        setLearningModeState(DEFAULT_MEDICAL_STUDENT_LEARNING_MODE)
      }
    } else {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LEARNING_MODE_STORAGE_KEY, learningMode)
      }

    // Guideline mode should always be evidence-backed.
    if (learningMode === "guideline" && !enableEvidence) {
        setEnableEvidence(true)
      }
    }

    if (userPreferences.preferences.userRole !== "doctor") {
      if (clinicianMode !== DEFAULT_CLINICIAN_WORKFLOW_MODE) {
        setClinicianModeState(DEFAULT_CLINICIAN_WORKFLOW_MODE)
      }
      return
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLINICIAN_MODE_STORAGE_KEY, clinicianMode)
    }

  // Clinician mode should always be evidence-backed (same expectation as med student).
  if (!enableEvidence) {
    setEnableEvidence(true)
  }
  }, [
    userPreferences.preferences.userRole,
    learningMode,
    enableEvidence,
    clinicianMode,
  ])

  const setLearningMode = useCallback(
    (mode: MedicalStudentLearningMode) => {
      const normalized = normalizeMedicalStudentLearningMode(mode)
      setLearningModeState(normalized)
      if (normalized === "guideline" && !enableEvidence) {
        setEnableEvidence(true)
      }
    },
    [enableEvidence]
  )

  const setClinicianMode = useCallback((mode: ClinicianWorkflowMode) => {
    const normalized = normalizeClinicianWorkflowMode(mode)
    setClinicianModeState(normalized)
  }, [])

  const setCitationStyle = useCallback((style: CitationStyle) => {
    setCitationStyleState(normalizeCitationStyle(style))
  }, [])

  // Refs and derived state
  const hasSentFirstMessageRef = useRef(false)
  // CRITICAL: Initialize to null, not chatId, so we can detect transitions properly
  const prevChatIdRef = useRef<string | null>(null)
  const lastUsedTempChatIdRef = useRef<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  
  // Track sent messages in sessionStorage to persist across navigation
  const sessionKey = `hasSentMessage:${chatId || 'none'}`
  const checkHasSentMessage = () => {
    if (typeof window === 'undefined') return false
    const stored = sessionStorage.getItem(sessionKey)
    if (stored === 'true') {
      hasSentFirstMessageRef.current = true
      return true
    }
    return false
  }
  
  // Check on mount if we've already sent a message in this chat
  useEffect(() => {
    checkHasSentMessage()
  }, [chatId])
  
  // Optimized system prompt determination - simplified for faster streaming
  const systemPrompt = useMemo(() => {
    // If user has a custom system prompt, use it immediately
    if (user?.system_prompt) {
      return user.system_prompt
    }
    
    // Use the utility function to get the appropriate system prompt based on user role
    return getSystemPromptByRole(userPreferences.preferences.userRole)
  }, [user?.system_prompt, userPreferences.preferences.userRole])

  // Search params handling
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt")
  const artifactIntentParam = searchParams.get("artifactIntent")
  const citationStyleParam = searchParams.get("citationStyle")

  // Handle errors directly in onError callback
  const handleError = useCallback((error: Error) => {
    console.error("Chat error:", error)
    console.error("Error message:", error.message)
    let errorMsg = error.message || "Something went wrong."

    if (typeof errorMsg === "string" && errorMsg.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(errorMsg) as { error?: string }
        if (parsed?.error) {
          errorMsg = parsed.error
        }
      } catch {
        // Keep raw string when parsing fails.
      }
    }

    // Check if this is a rate limit error with wait time
    // The error might have waitTimeSeconds attached if it came from our API
    const errorAny = error as any
    if (
      errorMsg.includes("Rate limit") ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("429") ||
      errorAny.statusCode === 429 ||
      errorAny.code === "RATE_LIMIT_EXCEEDED"
    ) {
      // Try to extract wait time from error
      const waitTime = errorAny.waitTimeSeconds || errorAny.waitTime || null
      const limitType = errorAny.limitType || "hourly"
      
      // Show paywall if we have the setters
      if (setHasRateLimitPaywall && setRateLimitWaitTime && setRateLimitType) {
        setRateLimitWaitTime(waitTime)
        setRateLimitType(limitType)
        setHasRateLimitPaywall(true)
      } else {
        // Fallback to toast if paywall setters not available
        toast({
          title: errorMsg,
          status: "error",
        })
      }
      return
    }

    // Handle specific image-related errors
    if (errorMsg.includes("Fetching image failed") || errorMsg.includes("400 Bad Request")) {
      errorMsg = "There was an issue with image search results. The chat will continue without images."
      console.warn("Image search error detected, continuing without images:", error)
    } else if (errorMsg === "An error occurred" || errorMsg === "fetch failed") {
      errorMsg = "Something went wrong. Please try again."
    }

    toast({
      title: errorMsg,
      status: "error",
    })
  }, [setHasRateLimitPaywall, setRateLimitWaitTime, setRateLimitType])

  // Track the last saved message count to detect new messages during streaming
  const lastSavedMessageCountRef = useRef(0)
  const currentChatIdForSavingRef = useRef<string | null>(null)
  const isStreamingRef = useRef(false)
  const messagesBeforeNavigationRef = useRef<Message[]>([])
  const stableChatIdRef = useRef<string | undefined>(undefined) // Stable ID for useChat to prevent resets
  const submitSourceRef = useRef<"submit" | "suggestion" | "reload" | null>(null)
  const submitStartedAtRef = useRef<number | null>(null)
  const firstByteMeasuredRef = useRef(false)
  const firstTokenMeasuredRef = useRef(false)

  const startSubmitTelemetry = useCallback(
    (source: "submit" | "suggestion" | "reload") => {
      submitSourceRef.current = source
      submitStartedAtRef.current = performance.now()
      firstByteMeasuredRef.current = false
      firstTokenMeasuredRef.current = false
    },
    []
  )

  const finishSubmitTelemetry = useCallback(() => {
    submitSourceRef.current = null
    submitStartedAtRef.current = null
    firstByteMeasuredRef.current = false
    firstTokenMeasuredRef.current = false
  }, [])
  
  // CRITICAL: Determine stable chatId for useChat
  // Strategy: Allow reset when navigating to a NEW chat, but prevent reset during streaming
  const stableChatId = useMemo(() => {
    // CRITICAL: If we're actively streaming, NEVER change the id - this prevents reset
    if (isStreamingRef.current && stableChatIdRef.current) {
      return stableChatIdRef.current
    }
    
    // If we have a real chatId, use it (this allows reset when navigating to new chat)
    // This is OK because we've stored messages in sessionStorage and they'll be in initialMessages
    if (chatId && !chatId.startsWith('temp-chat-')) {
      stableChatIdRef.current = chatId
      return chatId
    }
    
    // For temp chats or null, keep previous stable ID or use undefined
    return stableChatIdRef.current || undefined
  }, [chatId])
  
  // Keep initial messages deterministic between server and client first render.
  // Session/local storage restoration happens after mount in dedicated effects.
  const restoredInitialMessages = useMemo(() => {
    if (!chatId) {
      return []
    }

    // Use provider-supplied snapshot for hydration-safe first render.
    return initialMessages
  }, [chatId, initialMessages])
  
  // CRITICAL: Track previous chatId to detect navigation
  const prevChatIdForRestoreRef = useRef<string | null>(null)

  // Initialize useChat with optimized settings
  const {
    messages,
    input,
    handleSubmit,
    status,
    error,
    reload,
    stop,
    setMessages,
    setInput,
    append,
  } = useChat({
    id: stableChatId, // CRITICAL: Use stable ID to prevent resets during streaming
    api: API_ROUTE_CHAT,
    initialMessages: restoredInitialMessages.length > 0 ? restoredInitialMessages : undefined, // CRITICAL: Restore from sessionStorage
    initialInput: draftValue,
    onError: (error) => {
      // CRITICAL: Reset submitting state on error
      setIsSubmitting(false)
      setStreamIntroPreview(null)
      finishSubmitTelemetry()
      handleError(error)
    },
    // Optimize for streaming performance
    onFinish: async (message) => {
      setStreamIntroPreview(null)
      const pendingHeaderAnnotations =
        pendingHeaderTimelineAnnotationsRef.current.length > 0
          ? [...pendingHeaderTimelineAnnotationsRef.current]
          : []
      pendingHeaderTimelineAnnotationsRef.current = []
      headerTimelineSequenceRef.current = 0

      if (pendingHeaderAnnotations.length > 0) {
        const existingAnnotations = Array.isArray((message as any).annotations)
          ? ((message as any).annotations as Array<Record<string, unknown>>)
          : []
        ;(message as any).annotations = mergeMessageAnnotations(
          existingAnnotations,
          pendingHeaderAnnotations
        )
      }

      // CRITICAL: Restore evidence citations from stream body when headers were stripped (e.g. in production)
      const annotations = (
        message as {
          annotations?: Array<{ type?: string; citations?: unknown[]; topicContext?: unknown }>
        }
      ).annotations
      if (annotations && Array.isArray(annotations)) {
        const citations = mergeEvidenceCitationAnnotations(
          annotations as Array<{ type?: string; citations?: unknown[] }>
        )
        if (citations.length > 0) {
          setEvidenceCitations(citations)
          console.log(`📚 [EVIDENCE] Restored ${citations.length} citations from stream body (message.annotations)`)
        }
        const topicContextPart = annotations.find((a: any) => a?.type === "topic-context" && a?.topicContext)
        if (topicContextPart?.topicContext) {
          setTopicContext(topicContextPart.topicContext)
        }
      }

      // CRITICAL: Save all messages when streaming completes
      // Use the real chatId (not temp) if available
      const realChatId = chatId && !chatId.startsWith('temp-chat-') ? chatId : currentChatIdForSavingRef.current
      if (realChatId && !realChatId.startsWith('temp-chat-') && messagesRef.current.length > 0) {
        try {
          const { setMessages: saveMessagesToDb } = await import("@/lib/chat-store/messages/api")
          // CRITICAL: Get evidence citations from ref, or try sessionStorage as fallback
          let citationsToSave = evidenceCitationsRef.current.length > 0 ? evidenceCitationsRef.current : undefined

          // Fallback 0: Use citations we just restored from message.annotations above
          if (!citationsToSave && annotations && Array.isArray(annotations)) {
            const mergedAnnotationCitations = mergeEvidenceCitationAnnotations(
              annotations as Array<{ type?: string; citations?: unknown[] }>
            )
            if (mergedAnnotationCitations.length > 0) {
              citationsToSave = mergedAnnotationCitations
            }
          }

          // Fallback 1: Check sessionStorage if ref is empty
          if (!citationsToSave && typeof window !== 'undefined') {
            try {
              const latest = sessionStorage.getItem('evidenceCitations:latest')
              if (latest) {
                const latestData = JSON.parse(latest)
                if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
                  const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 60000) // 1 minute
                  const matchesChatId = !realChatId || latestData.chatId === realChatId || !latestData.chatId
                  if (isRecent && matchesChatId) {
                    citationsToSave = latestData.citations
                    console.log('📚 [onFinish] Restored citations from sessionStorage for save:', citationsToSave?.length ?? 0)
                  }
                }
              }
            } catch (e) {
              console.error('📚 [onFinish] Failed to parse sessionStorage citations:', e)
            }
          }
          
          // Fallback 2: Extract from the last assistant message's parts if available
          if (!citationsToSave && messagesRef.current.length > 0) {
            const lastAssistantMessage = [...messagesRef.current].reverse().find(m => m.role === 'assistant')
            if (lastAssistantMessage?.parts && Array.isArray(lastAssistantMessage.parts)) {
              const metadataPart = lastAssistantMessage.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
              if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
                citationsToSave = (metadataPart as any).metadata.evidenceCitations
                console.log('📚 [onFinish] Extracted citations from message parts for save:', citationsToSave?.length ?? 0)
              }
            }
          }
          
          await saveMessagesToDb(realChatId, messagesRef.current, citationsToSave)
          console.log('[🐛 onFinish] Saved', messagesRef.current.length, 'messages to chatId:', realChatId, citationsToSave ? `with ${citationsToSave.length} citations` : '')
        } catch (error) {
          console.error('[🐛 onFinish] Failed to save messages:', error)
        }
      }
      
      // Navigate only after stream completion to avoid aborting in-flight requests.
      if (realChatId && !realChatId.startsWith('temp-chat-') && typeof window !== 'undefined') {
        const currentPath = window.location.pathname
        const expectedPath = `/c/${realChatId}`
        const isOnHomeOrChatRoute =
          currentPath === "/" || currentPath.startsWith("/c/")
        // Never force navigation when user moved to another workspace route.
        if (isOnHomeOrChatRoute && currentPath !== expectedPath) {
          // Use a small delay to ensure all state updates are complete
          setTimeout(() => {
            startTransition(() => {
              router.replace(expectedPath, { scroll: false })
            })
          }, 100)
        }
      }
      
      finishSubmitTelemetry()
      setIsSubmitting(false)
    },
    // Ensure immediate status updates and extract evidence citations from headers
    onResponse: (response) => {
      if (
        submitStartedAtRef.current !== null &&
        !firstByteMeasuredRef.current
      ) {
        firstByteMeasuredRef.current = true
        const firstByteMs = Math.round(performance.now() - submitStartedAtRef.current)
        console.log(
          `[TTFT][client] first-byte ${firstByteMs}ms (${submitSourceRef.current || "unknown"})`
        )
      }

      // This ensures status changes to "streaming" immediately
      // Also extract evidence citations from response headers
      console.log('📚 [EVIDENCE] onResponse called, checking headers...')
      console.log('📚 [EVIDENCE] Available headers:', [...response.headers.keys()])
      
      try {
        const chatIdFromServer = response.headers.get("X-Chat-Id")
        const hasPersistentChatId = (value: string | null | undefined) =>
          Boolean(value && value !== "temp" && !value.startsWith("temp-chat-"))
        if (hasPersistentChatId(chatIdFromServer)) {
          currentChatIdForSavingRef.current = chatIdFromServer as string
          if (typeof window !== "undefined") {
            sessionStorage.setItem(`hasSentMessage:${chatIdFromServer}`, "true")
          }
          console.log(`[CHAT] Received canonical chat id from server: ${chatIdFromServer}`)
        }

        const introHeader = response.headers.get("X-Stream-Intro")
        if (introHeader) {
          try {
            const introText = atob(introHeader)
            setStreamIntroPreview(introText)
            if (introText.trim().length > 0) {
              pushHeaderTimelineAnnotation({
                type: "timeline-event",
                event: {
                  kind: "system-intro",
                  text: introText,
                },
              })
            }
          } catch {
            setStreamIntroPreview(null)
          }
        } else {
          setStreamIntroPreview(null)
        }

        const evidenceHeader = response.headers.get('X-Evidence-Citations')
        console.log('📚 [EVIDENCE] X-Evidence-Citations header:', evidenceHeader ? `${evidenceHeader.substring(0, 50)}...` : 'NOT FOUND')
        
        if (evidenceHeader) {
          // Decode base64 and parse JSON
          const citationsJson = atob(evidenceHeader)
          const citations = JSON.parse(citationsJson)
          console.log(`📚 [EVIDENCE] Successfully parsed ${citations.length} citations from server`)
          setEvidenceCitations(citations)
          pushHeaderTimelineAnnotation({
            type: "evidence-citations",
            citations,
          })
        } else {
          console.log('📚 [EVIDENCE] No evidence citations header found in response')
        }
      } catch (e) {
        console.error('📚 [EVIDENCE] Failed to parse evidence citations from header:', e)
      }
    },
  })
  
  // CRITICAL: Save messages incrementally during streaming
  // This ensures messages are saved even if navigation happens before onFinish
  useEffect(() => {
    // Only save if we have a real chatId (not temp) and messages have increased
    const realChatId = chatId && !chatId.startsWith('temp-chat-') ? chatId : currentChatIdForSavingRef.current
    if (!realChatId || realChatId.startsWith('temp-chat-')) {
      return // Don't save for temp chats
    }
    
    // Only save if we have new messages and we're streaming or just finished
    // CRITICAL: Only save assistant messages that are complete (have content)
    if (messages.length > lastSavedMessageCountRef.current && (status === 'streaming' || status === 'ready')) {
      const newMessages = messages.slice(lastSavedMessageCountRef.current)
      const assistantMessagesToSave = newMessages.filter(
        (m) => m.role === "assistant" && hasRenderableAssistantPayload(m)
      )
      
      if (assistantMessagesToSave.length === 0) {
        // Update count even if no messages to save (to avoid re-checking)
        lastSavedMessageCountRef.current = messages.length
        return
      }
      
      // Save new messages incrementally
      Promise.resolve().then(async () => {
        try {
          const { saveMessageIncremental } = await import("@/lib/chat-store/messages/api")
          // CRITICAL: Get evidence citations from ref, or try sessionStorage as fallback
          let citationsToSave = evidenceCitationsRef.current.length > 0 ? evidenceCitationsRef.current : undefined
          
          // Fallback 1: Check sessionStorage if ref is empty
          if (!citationsToSave && typeof window !== 'undefined') {
            try {
              const latest = sessionStorage.getItem('evidenceCitations:latest')
              if (latest) {
                const latestData = JSON.parse(latest)
                if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
                  const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 60000) // 1 minute
                  const matchesChatId = !realChatId || latestData.chatId === realChatId || !latestData.chatId
                  if (isRecent && matchesChatId) {
                    citationsToSave = latestData.citations
                    console.log('📚 [STREAMING] Restored citations from sessionStorage for save:', citationsToSave?.length ?? 0)
                  }
                }
              }
            } catch (e) {
              console.error('📚 [STREAMING] Failed to parse sessionStorage citations:', e)
            }
          }
          
          // Fallback 2: Extract from the message being saved if available
          if (!citationsToSave && assistantMessagesToSave.length > 0) {
            const messageToCheck = assistantMessagesToSave[assistantMessagesToSave.length - 1]
            if (messageToCheck?.parts && Array.isArray(messageToCheck.parts)) {
              const metadataPart = messageToCheck.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
              if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
                citationsToSave = (metadataPart as any).metadata.evidenceCitations
                console.log('📚 [STREAMING] Extracted citations from message parts for save:', citationsToSave?.length ?? 0)
              }
            }
          }
          
          for (const message of assistantMessagesToSave) {
            await saveMessageIncremental(realChatId, message, citationsToSave)
          }
          lastSavedMessageCountRef.current = messages.length
          console.log('[🐛 STREAMING] Saved', assistantMessagesToSave.length, 'new assistant messages incrementally to chatId:', realChatId, citationsToSave ? `with ${citationsToSave.length} citations` : '')
        } catch (error) {
          console.error('[🐛 STREAMING] Failed to save messages incrementally:', error)
        }
      })
    }
  }, [messages, chatId, status, hasRenderableAssistantPayload])
  
  // CRITICAL: Track if we're streaming and preserve messages during navigation
  useEffect(() => {
    isStreamingRef.current = status === 'streaming' || isSubmitting
    // Only store backup when streaming AND messages change significantly
    if ((status === 'streaming' || isSubmitting) && messages.length > 0) {
      const prevCount = messagesBeforeNavigationRef.current.length
      // Only update if message count increased (new messages arrived)
      if (messages.length > prevCount) {
        messagesBeforeNavigationRef.current = [...messages]
        console.log('[🐛 STREAMING TRACK] Stored', messages.length, 'messages before potential navigation')
      }
    }
  }, [status, isSubmitting, messages.length]) // Only depend on length, not full messages array
  
  // CRITICAL: Store messages in sessionStorage before navigation to prevent loss
  // This must be AFTER useChat hook so messages is defined
  // DEBOUNCED: Only store when messages actually change, not on every render
  const lastStoredMessagesRef = useRef<string>('')
  useEffect(() => {
    if (messages.length > 0 && typeof window !== 'undefined') {
      // Serialize messages to check if they actually changed
      const messagesKey = JSON.stringify(messages.map(m => ({ id: m.id, role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) : '' })))
      
      // Only store if messages actually changed
      if (messagesKey !== lastStoredMessagesRef.current) {
        const key = chatId || 'pending'
        const primarySnapshot = buildSessionMessageSnapshot(
          messages,
          SESSION_SNAPSHOT_MAX_MESSAGES,
          SESSION_SNAPSHOT_MAX_CONTENT_CHARS
        )
        const fallbackSnapshot = buildSessionMessageSnapshot(
          messages,
          SESSION_SNAPSHOT_FALLBACK_MAX_MESSAGES,
          SESSION_SNAPSHOT_FALLBACK_MAX_CONTENT_CHARS
        )

        const writeSnapshot = (snapshot: Message[]) => {
          sessionStorage.setItem(`pendingMessages:${key}`, JSON.stringify(snapshot))
          sessionStorage.setItem(
            'pendingMessages:latest',
            JSON.stringify({
              chatId: key,
              messages: snapshot.slice(-SESSION_SNAPSHOT_LATEST_MAX_MESSAGES),
              timestamp: Date.now(),
            })
          )
        }

        try {
          writeSnapshot(primarySnapshot)
        } catch (error) {
          if (isQuotaExceeded(error)) {
            console.warn(
              "[🐛 STORE] Session storage quota reached, retrying with compact snapshot"
            )
            try {
              writeSnapshot(fallbackSnapshot)
            } catch (fallbackError) {
              console.warn("[🐛 STORE] Failed to persist pending messages:", fallbackError)
              sessionStorage.removeItem(`pendingMessages:${key}`)
              sessionStorage.removeItem("pendingMessages:latest")
            }
          } else {
            console.warn("[🐛 STORE] Failed to persist pending messages:", error)
          }
        }

        messagesBeforeNavigationRef.current = [...messages]
        lastStoredMessagesRef.current = messagesKey
        console.log('[🐛 STORE] Stored', messages.length, 'messages to sessionStorage with key:', key)
      }
    }
  }, [messages.length, chatId]) // Only depend on length and chatId
  
  // Keep messages ref in sync with messages from useChat
  useEffect(() => {
    messagesRef.current = messages
    // CRITICAL: If messages were cleared but we have them in the backup ref, restore them immediately
    // This prevents blank screen when useChat resets during navigation
    if (messages.length === 0 && messagesBeforeNavigationRef.current.length > 0) {
      const isCurrentlyStreaming = status === 'streaming' || isSubmitting
      if (isCurrentlyStreaming) {
        console.log('[🐛 MESSAGE RESTORE] ⚠️ CRITICAL: Messages cleared during streaming, restoring from backup:', messagesBeforeNavigationRef.current.length)
        // Use setTimeout to ensure this runs after useChat's internal state update
        setTimeout(() => {
          setMessages(messagesBeforeNavigationRef.current)
        }, 0)
      }
    }
  }, [messages, status, isSubmitting, setMessages])

  useEffect(() => {
    if (submitStartedAtRef.current === null || firstTokenMeasuredRef.current) {
      return
    }
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && hasRenderableAssistantPayload(message))
    if (!lastAssistantMessage) {
      return
    }
    firstTokenMeasuredRef.current = true
    const firstTokenMs = Math.round(performance.now() - submitStartedAtRef.current)
    console.log(
      `[TTFT][client] first-token ${firstTokenMs}ms (${submitSourceRef.current || "unknown"})`
    )
  }, [messages, hasRenderableAssistantPayload])
  
  // CRITICAL: Watch status changes and ensure isSubmitting resets properly
  useEffect(() => {
    if (status === 'ready' || status === 'error') {
      setIsSubmitting(false)
      finishSubmitTelemetry()
      // CRITICAL: Reset streaming ref when status becomes ready
      isStreamingRef.current = false
    } else if (status === 'streaming' || status === 'submitted') {
      isStreamingRef.current = true
    }
  }, [status, finishSubmitTelemetry])
  
  // CRITICAL: Clear sessionStorage and reset state when navigating to home page
  useEffect(() => {
    if (typeof window !== 'undefined' && !chatId) {
      const isActiveSubmission =
        isSubmitting || status === "submitted" || status === "streaming"
      if (isActiveSubmission || messages.length > 0) {
        return
      }
      // Clear all pending messages when on home page
      sessionStorage.removeItem('pendingMessages:latest')
      const keys = Object.keys(sessionStorage)
      keys.forEach(key => {
        if (key.startsWith('pendingMessages:')) {
          sessionStorage.removeItem(key)
        }
      })
      // Reset streaming state and clear messages
      isStreamingRef.current = false
      messagesBeforeNavigationRef.current = []
      currentChatIdForSavingRef.current = null
      lastSavedMessageCountRef.current = 0
      // CRITICAL: Reset status if stuck
      if (status !== 'ready' && status !== 'error') {
        // Force reset by clearing messages if status is stuck
        if (messages.length === 0) {
          // Status should reset naturally, but ensure it does
        }
      }
    }
  }, [chatId, status, messages.length, isSubmitting])

  // CRITICAL: Update currentChatIdForSavingRef when chatId changes from temp to real
  useEffect(() => {
    if (chatId && !chatId.startsWith('temp-chat-')) {
      currentChatIdForSavingRef.current = chatId
      // Reset message count when chatId changes to start fresh
      lastSavedMessageCountRef.current = 0
      console.log('[🐛 CHATID UPDATE] Updated currentChatIdForSavingRef to real chatId:', chatId)
    }
  }, [chatId])

  // CRITICAL: Listen for chatCreated event to update chatId ref when chat is created
  useEffect(() => {
    const handleChatCreated = (event: CustomEvent<{ chatId: string }>) => {
      const newChatId = event.detail.chatId
      if (newChatId && !newChatId.startsWith('temp-chat-')) {
        currentChatIdForSavingRef.current = newChatId
        console.log('[🐛 CHAT CREATED] Updated currentChatIdForSavingRef from event:', newChatId)
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('chatCreated', handleChatCreated as EventListener)
      return () => {
        window.removeEventListener('chatCreated', handleChatCreated as EventListener)
      }
    }
  }, [])
  
  // CRITICAL: Track if this is the first render
  const isFirstRenderRef = useRef(true)
  
  // CRITICAL: Initialize prevChatIdRef on first render, but only if chatId is null
  // If chatId is already set (from URL), we want to detect the transition from null
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      // Don't set prevChatIdRef if chatId is already set - we want to detect the transition
      // Only set it if chatId is null (we're on home page)
      if (chatId === null) {
        prevChatIdRef.current = null
      }
      // Otherwise, leave it as null so we can detect the transition when chatId changes
    }
  }, [])
  
  // CRITICAL: Consolidated message syncing - SINGLE SOURCE OF TRUTH
  // This prevents race conditions and conflicting effects
  useEffect(() => {
    // CRITICAL: Capture prevChatId at the VERY START
    const prevChatId = prevChatIdRef.current
    
    // Calculate all transition states
    const chatIdChanged = prevChatId !== chatId
    const isNavigatingToHome = prevChatId !== null && chatId === null
    const isNavigatingFromHome = prevChatId === null && chatId !== null && !chatId.startsWith('temp-chat-')
    const isStreamingOrSubmitting = status === 'streaming' || isSubmitting
    const hasSentMessage = typeof window !== 'undefined' && chatId 
      ? sessionStorage.getItem(`hasSentMessage:${chatId}`) === 'true'
      : false
    const isTransitioningFromTemp = prevChatId?.startsWith('temp-chat-') && chatId && !chatId.startsWith('temp-chat-')
    
    // Use ref to get current messages without causing re-renders
    const currentMessages = messagesRef.current
    const currentMessagesLength = currentMessages.length
    
    // CRITICAL: Try to restore from sessionStorage IMMEDIATELY if messages are empty
    // This handles the case where useChat reset cleared messages
    if (messages.length === 0 && typeof window !== 'undefined') {
      const pendingKey = chatId ? `pendingMessages:${chatId}` : null
      const latestRawForRestore =
        !chatId && isStreamingOrSubmitting
          ? sessionStorage.getItem("pendingMessages:latest")
          : null
      const restoredMessages = resolveScopedSessionMessages({
        chatId,
        pendingRaw: pendingKey ? sessionStorage.getItem(pendingKey) : null,
        latestRaw: latestRawForRestore,
      })

      if (Array.isArray(restoredMessages) && restoredMessages.length > 0) {
        console.log(
          "[🐛 MESSAGE SYNC] Restored chat-scoped pending messages:",
          restoredMessages.length,
          "for chat:",
          chatId ?? "home"
        )
        setMessages(restoredMessages as Message[])
        messagesBeforeNavigationRef.current = restoredMessages as Message[]
        if (pendingKey) {
          sessionStorage.removeItem(pendingKey)
        }
        return
      }
    }
    
    // CRITICAL: Log the state for debugging
    if (chatIdChanged || isNavigatingFromHome || isTransitioningFromTemp || (messages.length === 0 && currentMessagesLength > 0)) {
      console.log('[🐛 MESSAGE SYNC] State check:', {
        chatId,
        prevChatId,
        chatIdChanged,
        isNavigatingToHome,
        isNavigatingFromHome,
        isTransitioningFromTemp,
        isStreamingOrSubmitting,
        hasSentMessage,
        messagesCount: currentMessagesLength,
        messagesInState: messages.length,
        initialMessagesCount: initialMessages.length,
        status,
        hasBackupMessages: messagesBeforeNavigationRef.current.length,
        stableChatId
      })
    }
    
    // 1. NAVIGATING TO HOME: Clear messages only when going to home page
    if (isNavigatingToHome && currentMessagesLength > 0) {
      console.log('[🐛 MESSAGE SYNC] Navigating to home, clearing messages')
      setMessages([])
      return
    }
    
    // 2. NAVIGATING FROM HOME (null) TO REAL CHAT: This happens when chat is created and we navigate
    // CRITICAL: Preserve messages if we're streaming or have messages
    if (isNavigatingFromHome) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Navigating from home to real chat!', {
        messagesCount: currentMessagesLength,
        messagesInState: messages.length,
        isStreaming: isStreamingOrSubmitting,
        initialMessagesCount: initialMessages.length,
        hasBackupMessages: messagesBeforeNavigationRef.current.length
      })
      
      // CRITICAL: Priority order:
      // 1. Messages in state (from streaming) - highest priority
      // 2. Messages in ref (backup) - second priority
      // 3. initialMessages (from database) - third priority
      
      if (messages.length > 0) {
        // We have messages in state - preserve them
        console.log('[🐛 MESSAGE SYNC] ✅ Preserving messages in state:', messages.length)
        messagesBeforeNavigationRef.current = [...messages]
        // Don't sync - keep current messages
        return
      } else if (currentMessagesLength > 0) {
        // We have messages in ref but not in state - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref after navigation:', currentMessagesLength)
        setMessages(currentMessages)
        messagesBeforeNavigationRef.current = currentMessages
        return
      } else if (messagesBeforeNavigationRef.current.length > 0) {
        // We have backup messages - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring backup messages after navigation:', messagesBeforeNavigationRef.current.length)
        setMessages(messagesBeforeNavigationRef.current)
        return
      } else if (initialMessages.length > 0) {
        // Use initialMessages from database
        console.log('[🐛 MESSAGE SYNC] Using initialMessages after navigation from home:', initialMessages.length)
      setMessages(initialMessages)
        return
      } else {
        // No messages anywhere - might still be streaming, wait
        console.log('[🐛 MESSAGE SYNC] ⚠️ No messages found after navigation, waiting for streaming...')
        // Don't clear - wait for messages to arrive
        return
      }
    }
    
    // 3. TRANSITIONING FROM TEMP TO REAL CHAT: Preserve messages
    if (isTransitioningFromTemp) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Transitioning from temp to real chat!', {
        prevChatId,
        chatId,
        messagesInState: messages.length,
        messagesInRef: currentMessagesLength,
        hasBackup: messagesBeforeNavigationRef.current.length,
        initialMessagesCount: initialMessages.length
      })
      
      // CRITICAL: Priority order for messages during temp-to-real transition:
      // 1. Messages in state (from streaming) - highest priority
      // 2. Messages in ref (backup) - second priority  
      // 3. Messages in backup ref - third priority
      // 4. sessionStorage for this chatId - fourth priority
      // 5. initialMessages (from database) - fifth priority
      
      if (messages.length > 0) {
        // We have messages in state - preserve them
        console.log('[🐛 MESSAGE SYNC] ✅ Preserving messages in state during transition:', messages.length)
        messagesBeforeNavigationRef.current = [...messages]
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve current messages
      } else if (currentMessagesLength > 0) {
        // We have messages in ref but not in state - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref during transition:', currentMessagesLength)
        setMessages(currentMessages)
        messagesBeforeNavigationRef.current = currentMessages
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages: currentMessages })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages: currentMessages }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve restored messages
      } else if (messagesBeforeNavigationRef.current.length > 0) {
        // We have backup messages - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring backup messages during transition:', messagesBeforeNavigationRef.current.length)
        setMessages(messagesBeforeNavigationRef.current)
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages: messagesBeforeNavigationRef.current })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages: messagesBeforeNavigationRef.current }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve restored messages
      } else if (typeof window !== 'undefined' && chatId) {
        // Try to get messages from sessionStorage for this chatId
        const sessionKey = `pendingMessages:${chatId}`
        const sessionData = sessionStorage.getItem(sessionKey)
        if (sessionData) {
          try {
            const sessionMessages = JSON.parse(sessionData)
            if (Array.isArray(sessionMessages) && sessionMessages.length > 0) {
              console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from sessionStorage during transition:', sessionMessages.length)
              setMessages(sessionMessages)
              messagesBeforeNavigationRef.current = sessionMessages
              return // Don't sync - preserve restored messages
            }
          } catch (e) {
            console.error('[🐛 MESSAGE SYNC] Failed to parse sessionStorage messages:', e)
          }
        }
      }
      
      // If we still don't have messages, check initialMessages but don't overwrite if we're streaming
      if (initialMessages.length > 0 && !isStreamingOrSubmitting) {
        console.log('[🐛 MESSAGE SYNC] Using initialMessages during transition:', initialMessages.length)
        setMessages(initialMessages)
        messagesBeforeNavigationRef.current = initialMessages
        return
      }
      
      // If we're streaming, wait for messages to arrive
      if (isStreamingOrSubmitting) {
        console.log('[🐛 MESSAGE SYNC] Streaming in progress during transition, waiting for messages...')
        return // Don't clear - wait for messages
      }
      
      // Last resort: if no messages found anywhere, log warning but don't clear
      console.warn('[🐛 MESSAGE SYNC] ⚠️ No messages found during temp-to-real transition!')
      return // Don't sync - preserve whatever we have
    }
    
    // 4. CHAT ID CHANGED: Sync from initialMessages if available
    // CRITICAL: NEVER clear messages if initialMessages is empty - wait for async load
    if (chatIdChanged) {
      // CRITICAL: If we're streaming, preserve current messages - don't sync yet
      if (isStreamingOrSubmitting && currentMessagesLength > 0) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ Streaming in progress, preserving', currentMessagesLength, 'messages during chatId change')
        // Ensure messages are set if they got cleared
        if (messages.length === 0) {
          setMessages(currentMessages)
        }
        return
      }
      
      if (initialMessages.length > 0) {
        // We have initialMessages - sync them
        const currentMessageIds = new Set(currentMessages.map(m => m.id))
        const initialMessageIds = new Set(initialMessages.map(m => m.id))
        const areDifferent = 
          currentMessageIds.size !== initialMessageIds.size ||
          Array.from(currentMessageIds).some(id => !initialMessageIds.has(id))
        
        if (areDifferent) {
          console.log('[🐛 MESSAGE SYNC] ✅ Syncing messages from initialMessages after chatId change:', initialMessages.length)
          setMessages(initialMessages)
        } else if (messages.length === 0 && currentMessagesLength > 0) {
          // Messages got cleared but we have them in ref - restore them
          console.log('[🐛 MESSAGE SYNC] ⚠️ Messages were cleared, restoring from ref:', currentMessagesLength)
          setMessages(currentMessages)
        }
      } else if (currentMessagesLength === 0 && !hasSentMessage && !isStreamingOrSubmitting) {
        // No messages, no initialMessages, haven't sent message, not streaming
        // This is a new empty chat - keep it empty
        console.log('[🐛 MESSAGE SYNC] New empty chat, keeping messages empty')
      } else if (currentMessagesLength > 0) {
        // CRITICAL: We have messages - preserve them even if initialMessages is empty
        // This prevents the blank screen bug!
        if (messages.length === 0) {
          console.log('[🐛 MESSAGE SYNC] ⚠️ Restoring messages from ref (preventing blank screen):', currentMessagesLength)
          setMessages(currentMessages)
        } else {
          console.log('[🐛 MESSAGE SYNC] ⚠️ Preserving messages during chatId change (preventing blank screen), waiting for initialMessages to load')
        }
      }
      return
    }
    
    // 5. CHAT ID UNCHANGED: Sync if initialMessages loaded and we have no messages
    // CRITICAL: Only sync if we're not streaming and messages are truly empty
    // BUT: Don't sync if we have messages in ref (they might have just been cleared by useChat reset)
    if (!chatIdChanged && initialMessages.length > 0 && messages.length === 0 && !isStreamingOrSubmitting) {
      // CRITICAL: Check if we have messages in ref first - if so, restore them instead of syncing
      if (currentMessagesLength > 0) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ Messages cleared but ref has them, restoring from ref instead of syncing:', currentMessagesLength)
        setMessages(currentMessages)
        return
      }
      
      // Also check if we have messages in sessionStorage for this chatId (strictly scoped).
      if (typeof window !== 'undefined' && chatId) {
        const sessionKey = `pendingMessages:${chatId}`
        const sessionData = sessionStorage.getItem(sessionKey)
        if (sessionData) {
          try {
            const sessionMessages = JSON.parse(sessionData)
            if (Array.isArray(sessionMessages) && sessionMessages.length > 0) {
              console.log('[🐛 MESSAGE SYNC] Found chat-scoped session messages, restoring:', sessionMessages.length)
              setMessages(sessionMessages)
              messagesRef.current = sessionMessages
              return
            }
          } catch (e) {
            console.error('[🐛 MESSAGE SYNC] Failed to parse sessionStorage messages:', e)
          }
        }
      }
      
      // Only sync if we truly have no messages anywhere
      console.log('[🐛 MESSAGE SYNC] ✅ Syncing initialMessages to empty messages state:', initialMessages.length)
      setMessages(initialMessages)
      return
    }
    
    // 6. CRITICAL: If messages are empty but we have backup messages, restore them
    // This handles the case where useChat reset cleared messages during navigation
    if (messages.length === 0 && messagesBeforeNavigationRef.current.length > 0) {
      const isCurrentlyStreaming = status === 'streaming' || isSubmitting
      if (isCurrentlyStreaming || chatId) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from backup ref:', {
          backupCount: messagesBeforeNavigationRef.current.length,
          isStreaming: isCurrentlyStreaming,
          chatId
        })
        setMessages(messagesBeforeNavigationRef.current)
        return
      }
    }
    
    // 7. CRITICAL: If we have messages in ref but not in state, and we have a chatId, restore them
    // This handles cases where messages got cleared but we have them cached
    if (messages.length === 0 && currentMessagesLength > 0 && chatId && !isStreamingOrSubmitting) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref (messages cleared but ref has them):', currentMessagesLength)
      setMessages(currentMessages)
      return
    }
    
  }, [chatId, initialMessages, status, isSubmitting, setMessages, messages, stableChatId]) // Include messages to detect when they're cleared

  // Update previous chat ID AFTER synchronization logic runs.
  useEffect(() => {
    const prev = prevChatIdRef.current
    if (prev !== chatId) {
      prevChatIdRef.current = chatId
      console.log('[🐛 PREV CHATID] Updated:', { from: prev, to: chatId })
    }
  }, [chatId, messages.length, status, isSubmitting])
  
  // Cache messages to temp chat ID as they come in (for migration)
  useEffect(() => {
    if (chatId && chatId.startsWith('temp-chat-') && messages.length > 0) {
      Promise.resolve().then(async () => {
        try {
          const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
          await writeToIndexedDB("messages", { id: chatId, messages })
          if (typeof window !== 'undefined') {
            (window as any).__lastMessagesForMigration = { chatId, messages }
          }
        } catch (error) {
          console.error('[useChatCore] Failed to cache messages:', error)
        }
      })
    }
  }, [chatId, messages])
  
  // Clear migration data when no longer needed
  useEffect(() => {
    if (chatId && !chatId.startsWith('temp-chat-') && typeof window !== 'undefined') {
      delete (window as any).__lastMessagesForMigration
    }
  }, [chatId])

  // Handle search params on mount
  useEffect(() => {
    if (prompt && typeof window !== "undefined") {
      requestAnimationFrame(() => setInput(prompt))
    }
  }, [prompt, setInput])

  useEffect(() => {
    if (artifactIntentParam === "quiz") {
      setArtifactIntent(artifactIntentParam)
    }
  }, [artifactIntentParam, setArtifactIntent])

  useEffect(() => {
    if (!citationStyleParam) return
    setCitationStyleState(normalizeCitationStyle(citationStyleParam))
  }, [citationStyleParam, setCitationStyleState])

  // Submit action - optimized for immediate response
  const submit = useCallback(async (overrideInput?: string) => {
    const resolvedInput = typeof overrideInput === "string" ? overrideInput : input
    if (!resolvedInput.trim() && files.length === 0) return

    const isAuthenticatedNow = !!user?.id
    if (!isAuthenticatedNow) {
      const fileMetadata = files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }))

      const pendingMessage = {
        content: resolvedInput.trim(),
        files: fileMetadata,
        hasFiles: files.length > 0,
        selectedModel,
        enableSearch,
        enableEvidence,
        learningMode,
        clinicianMode,
        artifactIntent,
        citationStyle,
        timestamp: Date.now(),
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem("pendingMessage", JSON.stringify(pendingMessage))
      }

      router.push("/auth")
      return
    }

    startSubmitTelemetry("submit")
    setIsSubmitting(true)
    setStreamIntroPreview(INSTANT_STREAM_INTRO)
    pendingHeaderTimelineAnnotationsRef.current = []
    headerTimelineSequenceRef.current = 0
    clearEvidenceCitations()
    pushHeaderTimelineAnnotation({
      type: "timeline-event",
      event: {
        kind: "system-intro",
        text: INSTANT_STREAM_INTRO,
      },
    })

    const currentInput = resolvedInput
    const currentFiles = [...files]
    const restoreComposerState = () => {
      setInput(currentInput)
      setFiles(currentFiles)
    }

    const modelSupportsVision = Boolean(getModelInfo(selectedModel)?.vision)
    const originalImageFiles = currentFiles.filter((file) => isImageAttachment(file.type))
    const nonImageFiles = currentFiles.filter((file) => !isImageAttachment(file.type))
    const { accepted: acceptedImageCandidates, rejected: rejectedImageFiles } =
      enforceImageFilePolicy(originalImageFiles)
    const imageFiles = modelSupportsVision ? (acceptedImageCandidates as File[]) : []

    if (originalImageFiles.length > 0 && !modelSupportsVision) {
      toast({
        title: "This model does not support image uploads",
        description: "Switch to a vision-enabled model to send images.",
        status: "warning",
      })
      setIsSubmitting(false)
      setStreamIntroPreview(null)
      finishSubmitTelemetry()
      return
    }

    if (rejectedImageFiles.length > 0) {
      toast({
        title: "Some images were skipped",
        description: rejectedImageFiles[0]?.detail || "Unsupported image format or size.",
        status: "warning",
      })
    }

    if (!currentInput.trim() && nonImageFiles.length === 0 && imageFiles.length === 0) {
      setIsSubmitting(false)
      setStreamIntroPreview(null)
      finishSubmitTelemetry()
      return
    }

    const isPersistentChatId = (value: string | null | undefined) =>
      Boolean(value && value !== "temp" && !value.startsWith("temp-chat-"))
    const isOnChatRoute =
      typeof window !== "undefined" && window.location.pathname.startsWith("/c/")
    const chatIdFromUrl = isOnChatRoute
      ? window.location.pathname.split("/c/")[1]
      : null

    let optimisticChatId =
      chatIdFromUrl ||
      (chatId && !chatId.startsWith("temp-chat-") ? chatId : null) ||
      currentChatIdForSavingRef.current ||
      lastUsedTempChatIdRef.current ||
      null

    if (!optimisticChatId) {
      optimisticChatId = createEphemeralChatId()
      lastUsedTempChatIdRef.current = optimisticChatId
    }
    if (!isPersistentChatId(optimisticChatId)) {
      lastUsedTempChatIdRef.current = optimisticChatId
    }

    let finalUserInput = currentInput
    let preparedUid: string | null = null
    let preparedAllowed: boolean | null = null
    let hasPreparedUploadReferences = false

    if (nonImageFiles.length > 0 && optimisticChatId) {
      const [resolvedUid, resolvedAllowed] = await Promise.all([
        getOrCreateGuestUserId(user),
        user?.id
          ? checkLimitsAndNotify(user.id, nonImageFiles.length + imageFiles.length)
          : Promise.resolve(true),
      ])
      preparedUid = resolvedUid
      preparedAllowed = resolvedAllowed
      if (!preparedUid) {
        setIsSubmitting(false)
        setHasDialogAuth(true)
        restoreComposerState()
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
        return
      }
      if (!preparedAllowed) {
        setIsSubmitting(false)
        restoreComposerState()
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
        return
      }

      const uploadPreparationToastId = toast({
        title: `Preparing ${nonImageFiles.length} document${nonImageFiles.length > 1 ? "s" : ""}...`,
        description: "Large files are routed through uploads for reliable retrieval.",
        status: "info",
      })
      const processedNonImageAttachments = await handleFileUploads(
        preparedUid,
        optimisticChatId,
        !!user?.id,
        nonImageFiles
      )
      sonnerToast.dismiss(uploadPreparationToastId)
      const uploadReferenceIds = (processedNonImageAttachments ?? [])
        .map((attachment) => attachment.uploadId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)

      if (uploadReferenceIds.length === 0) {
        setIsSubmitting(false)
        restoreComposerState()
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
        toast({
          title: "Couldn't prepare uploaded documents",
          description: "Please retry your message once the files finish uploading.",
          status: "warning",
        })
        return
      }

      const uploadLabelLine = `Selected uploads: ${(processedNonImageAttachments ?? [])
        .filter((attachment) => typeof attachment.uploadId === "string")
        .map((attachment) => attachment.name || "Upload")
        .join(", ")}`
      const tokenString = buildUploadReferenceTokens(uploadReferenceIds)
      hasPreparedUploadReferences = true
      const trimmedBaseInput = currentInput.trim()
      finalUserInput =
        trimmedBaseInput.length > 0
          ? `${trimmedBaseInput}\n\n${uploadLabelLine}\n\n${tokenString}`
          : `${uploadLabelLine}\n\nUse my selected uploads as context and provide a concise overview.\n\n${tokenString}`
    }

    const optimisticImageAttachments =
      imageFiles.length > 0 ? createOptimisticAttachments(imageFiles) : []
    const convertedImageAttachmentsPromise =
      optimisticImageAttachments.length > 0
        ? convertBlobUrlsToDataUrls(optimisticImageAttachments, imageFiles)
        : Promise.resolve([] as Attachment[])
    const uploadedImageAttachmentsPromise =
      imageFiles.length > 0 && optimisticChatId
        ? (async () => {
            const uidForImageUpload = preparedUid || (await getOrCreateGuestUserId(user))
            if (!uidForImageUpload) return null
            return handleFileUploads(
              uidForImageUpload,
              optimisticChatId as string,
              !!user?.id,
              imageFiles
            )
          })()
        : null

    let imageAttachmentsUsedUploadedUrls = false
    let resolvedImageAttachments: Attachment[] = []
    if (imageFiles.length > 0) {
      const uploadedWithinBudget = uploadedImageAttachmentsPromise
        ? await withTimeout<Attachment[] | null>(
            uploadedImageAttachmentsPromise,
            IMAGE_UPLOAD_PREP_BUDGET_MS,
            null
          )
        : null
      if (uploadedWithinBudget && uploadedWithinBudget.length > 0) {
        resolvedImageAttachments = uploadedWithinBudget
        imageAttachmentsUsedUploadedUrls = true
      } else {
        resolvedImageAttachments = await convertedImageAttachmentsPromise
      }
    }

    const nonImageUploadState = hasPreparedUploadReferences ? "completed" : "processing"
    const nonImageUploadMessage = hasPreparedUploadReferences
      ? "Routed to uploads"
      : "Sending to uploads"
    const optimisticNonImageAttachments: Attachment[] = nonImageFiles.map((file) => ({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      url: "",
      uploadState: nonImageUploadState,
      uploadMessage: nonImageUploadMessage,
    })) as Attachment[]

    let optimisticAttachments: Attachment[] | undefined = undefined
    if (resolvedImageAttachments.length > 0) {
      const { accepted, rejected } = enforceImageAttachmentPolicy(
        resolvedImageAttachments as Array<{
          name?: string
          url?: string
          contentType?: string
          mimeType?: string
          filePath?: string
        }>,
        {
          modelSupportsVision,
          maxImages: CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE,
        }
      )
      if (rejected.length > 0) {
        toast({
          title: "Some image attachments were skipped",
          description: rejected[0]?.detail || "Unsupported image payload.",
          status: "warning",
        })
      }

      optimisticAttachments = [
        ...optimisticNonImageAttachments,
        ...(accepted.map((attachment) => ({
          ...attachment,
          uploadState: attachment.url?.startsWith("http") ? "uploaded" : "sending",
        })) as Attachment[]),
      ]
    } else if (optimisticNonImageAttachments.length > 0) {
      optimisticAttachments = optimisticNonImageAttachments
    }

    const optimisticOptions = {
      body: {
        chatId: optimisticChatId,
        userId: user?.id || "temp",
        model: selectedModel,
        isAuthenticated: !!user?.id,
        systemPrompt,
        enableSearch,
        enableEvidence,
        learningMode,
        clinicianMode,
        userRole: userPreferences.preferences.userRole || "general",
        medicalSpecialty: userPreferences.preferences.medicalSpecialty,
        clinicalDecisionSupport: userPreferences.preferences.clinicalDecisionSupport,
        medicalLiteratureAccess: userPreferences.preferences.medicalLiteratureAccess,
        medicalComplianceMode: userPreferences.preferences.medicalComplianceMode,
        topicContext: topicContextRef.current || undefined,
        artifactIntent,
        citationStyle,
      },
    }

    append(
      {
        role: "user",
        content: finalUserInput,
        experimental_attachments: optimisticAttachments,
      },
      optimisticOptions
    )
    setInput("")
    setFiles([])
    clearDraft()
    setClinicianModeState(DEFAULT_CLINICIAN_WORKFLOW_MODE)
    setArtifactIntent("none")

    hasSentFirstMessageRef.current = true
    if (typeof window !== "undefined" && optimisticChatId) {
      sessionStorage.setItem(`hasSentMessage:${optimisticChatId}`, "true")
    }

    try {
      const [uid, allowed] = await Promise.all([
        preparedUid ? Promise.resolve(preparedUid) : getOrCreateGuestUserId(user),
        preparedAllowed !== null
          ? Promise.resolve(preparedAllowed)
          : user?.id
            ? checkLimitsAndNotify(user.id, nonImageFiles.length + imageFiles.length)
            : Promise.resolve(true),
      ])

      if (!uid) {
        setIsSubmitting(false)
        setHasDialogAuth(true)
        restoreComposerState()
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
        return
      }

      if (!allowed) {
        setIsSubmitting(false)
        restoreComposerState()
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
        return
      }

      const currentChatId = optimisticChatId
      if (currentChatId && !currentChatId.startsWith("temp-chat-")) {
        currentChatIdForSavingRef.current = currentChatId
      }

      if (
        imageFiles.length > 0 &&
        currentChatId &&
        !imageAttachmentsUsedUploadedUrls
      ) {
        Promise.resolve().then(async () => {
          try {
            const uploadingToastId = toast({
              title: `Uploading ${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""}...`,
              description: "Please wait while your files are being uploaded",
              status: "info",
            })
            const processedAttachments = uploadedImageAttachmentsPromise
              ? await uploadedImageAttachmentsPromise.then((result) => {
                  if (result && result.length > 0) return result
                  return handleFileUploads(uid, currentChatId, !!user?.id, imageFiles)
                })
              : await handleFileUploads(uid, currentChatId, !!user?.id, imageFiles)

            sonnerToast.dismiss(uploadingToastId)
            if (processedAttachments && processedAttachments.length > 0) {
              toast({
                title: "Files uploaded successfully",
                description: `${processedAttachments.length} image${processedAttachments.length > 1 ? "s" : ""} ready`,
                status: "success",
              })
            }
          } catch (error) {
            console.error("File upload failed:", error)
            toast({
              title: "File upload failed",
              description: "Your message was sent, but files couldn't be uploaded.",
              status: "warning",
            })
          }
        })
      }
    } catch (error) {
      console.error("Error in submit:", error)
      restoreComposerState()
      toast({
        title: "An error occurred while sending your message.",
        status: "error",
      })
      setIsSubmitting(false)
      setStreamIntroPreview(null)
      finishSubmitTelemetry()
    }
  }, [
    user,
    input,
    files,
    chatId,
    convertBlobUrlsToDataUrls,
    checkLimitsAndNotify,
    handleFileUploads,
    append,
    selectedModel,
    systemPrompt,
    enableSearch,
    enableEvidence,
    learningMode,
    clinicianMode,
    artifactIntent,
    citationStyle,
    clearEvidenceCitations,
    clearDraft,
    setHasDialogAuth,
    setInput,
    setFiles,
    userPreferences,
    createOptimisticAttachments,
    setArtifactIntent,
    pushHeaderTimelineAnnotation,
    startSubmitTelemetry,
    finishSubmitTelemetry,
    router,
  ]);

  // Handle suggestion - optimized for immediate response
  const handleSuggestion = useCallback(
    async (suggestion: string) => {
      const isAuthenticatedNow = !!user?.id

      if (!isAuthenticatedNow) {
        const pendingMessage = {
          content: suggestion,
          files: [],
          hasFiles: false,
          selectedModel,
          enableSearch,
          enableEvidence,
          learningMode,
          clinicianMode,
          artifactIntent,
          citationStyle,
          timestamp: Date.now(),
        }
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('pendingMessage', JSON.stringify(pendingMessage))
        }
        
        // Redirect to login page immediately
        router.push('/auth')
        return
      }

      startSubmitTelemetry("suggestion")
      setIsSubmitting(true)
      setStreamIntroPreview(INSTANT_STREAM_INTRO)
      pendingHeaderTimelineAnnotationsRef.current = []
      headerTimelineSequenceRef.current = 0
      clearEvidenceCitations()
      pushHeaderTimelineAnnotation({
        type: "timeline-event",
        event: {
          kind: "system-intro",
          text: INSTANT_STREAM_INTRO,
        },
      })
      // Reset clinician mode so tabs stay hidden after sending from workflow panel
      setClinicianModeState(DEFAULT_CLINICIAN_WORKFLOW_MODE)

      const isPersistentChatId = (value: string | null | undefined) =>
        Boolean(value && value !== "temp" && !value.startsWith("temp-chat-"))
      const chatIdFromUrl =
        typeof window !== "undefined" && window.location.pathname.startsWith("/c/")
          ? window.location.pathname.split("/c/")[1]
          : null

      let optimisticChatId =
        chatIdFromUrl ||
        (chatId && !chatId.startsWith("temp-chat-") ? chatId : null) ||
        currentChatIdForSavingRef.current ||
        lastUsedTempChatIdRef.current ||
        null

      if (!optimisticChatId) {
        optimisticChatId = createEphemeralChatId()
        lastUsedTempChatIdRef.current = optimisticChatId
      }
      if (!isPersistentChatId(optimisticChatId)) {
        lastUsedTempChatIdRef.current = optimisticChatId
      }

      // CRITICAL: Append message IMMEDIATELY with optimistic values - message appears instantly
      const optimisticOptions = {
        body: {
          chatId: optimisticChatId,
          userId: user?.id || "temp", // Use cached userId if available
          model: selectedModel,
          isAuthenticated: !!user?.id,
          systemPrompt: getSystemPromptByRole(userPreferences.preferences.userRole),
          enableSearch,
          enableEvidence,
          learningMode,
          clinicianMode: DEFAULT_CLINICIAN_WORKFLOW_MODE,
          topicContext: topicContextRef.current || undefined,
          artifactIntent,
          citationStyle,
        },
      }

      append({
        role: "user",
        content: suggestion,
      }, optimisticOptions)
      setArtifactIntent("none")

      // Mark that we've sent the first message to prevent redirect
      hasSentFirstMessageRef.current = true
      if (typeof window !== 'undefined' && optimisticChatId) {
        sessionStorage.setItem(`hasSentMessage:${optimisticChatId}`, 'true')
      }

      // NOW do async work in parallel (non-blocking - message already visible)
      try {
        // Run critical async operations in parallel
        const [uid, allowed] = await Promise.all([
          getOrCreateGuestUserId(user),
          // Pre-check limits with cached userId if available (non-blocking)
          user?.id ? checkLimitsAndNotify(user.id) : Promise.resolve(true)
        ])

        if (!uid) {
          setIsSubmitting(false)
          setStreamIntroPreview(null)
          finishSubmitTelemetry()
          return
        }

        if (!allowed) {
          setIsSubmitting(false)
          setStreamIntroPreview(null)
          finishSubmitTelemetry()
          return
        }

        let currentChatId = optimisticChatId

        if (chatId && !chatId.startsWith("temp")) {
          currentChatId = chatId
        }

        // Update chatId ref for next message
        if (currentChatId && !currentChatId.startsWith('temp-chat-')) {
          currentChatIdForSavingRef.current = currentChatId
        }

      } catch {
        toast({ title: "Failed to send suggestion", status: "error" })
        setIsSubmitting(false)
        setStreamIntroPreview(null)
        finishSubmitTelemetry()
      }
    },
    [
      chatId,
      selectedModel,
      user,
      append,
      checkLimitsAndNotify,
      userPreferences,
      router,
      enableSearch,
      enableEvidence,
      learningMode,
      clinicianMode,
      artifactIntent,
      citationStyle,
      clearEvidenceCitations,
      setArtifactIntent,
      pushHeaderTimelineAnnotation,
      startSubmitTelemetry,
      finishSubmitTelemetry,
    ]
  )

  const handleWorkflowSuggestion = useCallback(
    async (suggestion: string) => {
      const encoded = encodeArtifactWorkflowInput(suggestion)
      if (!encoded) return
      await submit(encoded)
    },
    [submit]
  )

  // Handle reload
  const handleReload = useCallback(async () => {
    startSubmitTelemetry("reload")
    const uid = await getOrCreateGuestUserId(user)
    if (!uid) {
      finishSubmitTelemetry()
      return
    }

    setIsSubmitting(true)
    setStreamIntroPreview(INSTANT_STREAM_INTRO)
    clearEvidenceCitations()
    pendingHeaderTimelineAnnotationsRef.current = []
    headerTimelineSequenceRef.current = 0
    pushHeaderTimelineAnnotation({
      type: "timeline-event",
      event: {
        kind: "system-intro",
        text: INSTANT_STREAM_INTRO,
      },
    })

    const options = {
      body: {
        chatId,
        userId: uid,
        model: selectedModel,
        isAuthenticated,
        systemPrompt: systemPrompt || getSystemPromptByRole(userPreferences.preferences.userRole),
        enableSearch,
        enableEvidence,
        learningMode,
        clinicianMode,
        topicContext: topicContextRef.current || undefined,
        artifactIntent,
        citationStyle,
      },
    }

    reload(options)
  }, [
    user,
    chatId,
    selectedModel,
    isAuthenticated,
    systemPrompt,
    enableSearch,
    enableEvidence,
    learningMode,
    clinicianMode,
    artifactIntent,
    citationStyle,
    clearEvidenceCitations,
    finishSubmitTelemetry,
    pushHeaderTimelineAnnotation,
    reload,
    startSubmitTelemetry,
  ])

  // Handle input change - optimized for streaming
  const { setDraftValue } = useChatDraft(chatId)
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value)
      setDraftValue(value)
    },
    [setInput, setDraftValue]
  )

  return {
    // Chat state
    messages,
    input,
    handleSubmit,
    status,
    error,
    streamIntroPreview,
    reload,
    stop,
    setMessages,
    setInput,
    append,
    isAuthenticated,
    systemPrompt,
    hasSentFirstMessageRef,

    // Component state
    isSubmitting,
    setIsSubmitting,
    enableSearch,
    enableEvidence,
    learningMode,
    clinicianMode,
    artifactIntent,
    citationStyle,
    setEnableEvidence,
    setEnableSearch,
    setLearningMode,
    setClinicianMode,
    setArtifactIntent,
    setCitationStyle,
    
    // Evidence citations from medical evidence database
    evidenceCitations,

    // Actions
    submit,
    handleSuggestion,
    handleWorkflowSuggestion,
    handleReload,
    handleInputChange,
  }
}
