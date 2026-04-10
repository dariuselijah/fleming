import {
  AUTH_HOURLY_ATTACHMENT_LIMIT,
  ENABLE_WEB_SEARCH_TOOL,
  ENABLE_UPLOAD_CONTEXT_SEARCH,
  ENABLE_UPLOAD_ARTIFACT_V2,
  ENABLE_YOUTUBE_TOOL,
  ENABLE_LANGGRAPH_HARNESS,
  ENABLE_LANGCHAIN_SUPERVISOR,
  ENABLE_COGNITIVE_ORCHESTRATION_FULL,
  ENABLE_CONNECTOR_REGISTRY,
  ENABLE_STRICT_CITATION_CONTRACT,
  NON_AUTH_HOURLY_ATTACHMENT_LIMIT,
  getSystemPromptByRole,
} from "@/lib/config"
import { getAllModels, getModelInfo } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
import type { ProviderWithoutOllama } from "@/lib/user-keys"
import { searchPubMed, fetchPubMedArticle, searchPubMedByDOI, type PubMedArticle } from "@/lib/pubmed"
import {
  searchGuidelines,
  searchClinicalTrials,
  lookupDrugSafety,
  detectEvidenceConflicts,
} from "@/lib/evidence/live-tools"
import { searchYouTubeVideos } from "@/lib/youtube"
import { hasWebSearchConfigured, searchWeb } from "@/lib/web-search"
import {
  buildProvenance,
  evaluateProvenanceQuality,
  provenanceToEvidenceCitation,
  type SourceProvenance,
} from "@/lib/evidence/provenance"
import { Attachment } from "@ai-sdk/ui-utils"
import {
  Message as MessageAISDK,
  convertToCoreMessages,
  generateText,
  streamText,
  ToolSet,
  tool,
  createDataStreamResponse,
} from "ai"
import { z } from "zod"
import {
  incrementMessageCount,
  logUserMessage,
  storeAssistantMessage,
  validateAndTrackUsage,
} from "./api"
import {
  createErrorResponse,
  ensureToolCallArgumentsInMessages,
  extractErrorMessage,
} from "./utils"
import { 
  analyzeMedicalQuery, 
  MedicalContext, 
  AgentSelection,
  getHealthcareSystemPromptServer,
  orchestrateHealthcareAgents
} from "@/lib/models/healthcare-agents"
import { integrateMedicalKnowledge } from "@/lib/models/medical-knowledge"
import { anonymizeMessages } from "@/lib/anonymize"
import {
  searchMedicalEvidence,
  resultsToCitations,
  synthesizeEvidence,
  buildEvidenceSystemPrompt,
  extractReferencedCitations,
  buildEvidenceContext,
  buildEvidenceSourceId,
} from "@/lib/evidence"
import type { EvidenceCitation } from "@/lib/evidence"
import { enrichEvidenceCitationsWithJournalVisuals } from "@/lib/evidence/journal-visuals"
import {
  getLearningModeSystemInstructions,
  normalizeMedicalStudentLearningMode,
  type MedicalStudentLearningMode,
} from "@/lib/medical-student-learning"
import {
  getClinicianModeSystemInstructions,
  normalizeClinicianWorkflowMode,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import { UserUploadService } from "@/lib/uploads/server"
import type { UploadContextSearchMode, UploadTopicContext } from "@/lib/uploads/server"
import type { UserUploadListItem } from "@/lib/uploads/types"
import { summarizeTextForNotes } from "@/lib/media/pipeline"
import { StudyGraphService } from "@/lib/student-workspace/study-graph"
import { StudyPlannerService } from "@/lib/student-workspace/planner"
import { StudyReviewService } from "@/lib/student-workspace/review"
import {
  extractUploadReferenceIds,
  stripUploadReferenceTokens,
} from "@/lib/uploads/reference-tokens"
import {
  CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE,
  enforceImageAttachmentPolicy,
} from "@/lib/chat-attachments/policy"
import {
  buildUploadRetrievalPreflightCacheKey,
  getUploadRetrievalPreflightCache,
  setUploadRetrievalPreflightCache,
} from "@/lib/uploads/retrieval-preflight-cache"
import { decodeArtifactWorkflowInput } from "@/lib/chat/artifact-workflow"
import type { TopicContext } from "@/app/types/api.types"
import {
  normalizeCitationStyle,
  type CitationStyle,
} from "@/lib/citations/formatters"
import { buildPatientClinicalTools } from "@/lib/clinical/chat-patient-tools"
import { runClinicalAgentHarness } from "@/lib/clinical-agent/graph"
import { recordCitationContractViolation } from "@/lib/clinical-agent/telemetry"
import type {
  ClinicalIncompleteEvidencePolicy,
  LmsContextSnapshot,
  LmsProvider,
} from "@/lib/clinical-agent/graph/types"
import {
  runConnectorSearch,
  type ClinicalConnectorId,
  type ConnectorSearchPayload,
} from "@/lib/evidence/connectors"
import { runLangChainSupervisor } from "@/lib/clinical-agent/langchain"
import { decryptHealthData, encryptHealthData, isEncryptionEnabled } from "@/lib/encryption"
import { createClient } from "@/lib/supabase/server"
import { getAnswerCache, setAnswerCache } from "@/lib/cache/retrieval-cache"

export const maxDuration = 60
const BENCH_STRICT_MODE = process.env.BENCH_STRICT_MODE === "true"

// CACHED SYSTEM PROMPTS for instant access
const systemPromptCache = new Map<string, string>()
const getCachedSystemPrompt = (role: "doctor" | "general" | "medical_student" | undefined, specialty?: string, customPrompt?: string): string => {
  if (customPrompt) return customPrompt
  
  const cacheKey = `${role || 'general'}-${specialty || 'default'}`
  if (!systemPromptCache.has(cacheKey)) {
    const prompt = getSystemPromptByRole(role, customPrompt)
    systemPromptCache.set(cacheKey, prompt)
  }
  return systemPromptCache.get(cacheKey)!
}

type ImplicitUploadIntentSignal = {
  hasImplicitUploadIntent: boolean
  preferSlides: boolean
}

function detectImplicitUploadIntent(query: string): ImplicitUploadIntentSignal {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return { hasImplicitUploadIntent: false, preferSlides: false }
  }
  const hasUploadCue =
    /\bfrom\s+my\s+upload(?:ed)?(?:\s+(?:files?|docs?|documents?|slides?|decks?))?\b/i.test(normalized) ||
    /\b(?:my|the)\s+upload(?:ed)?\s+(?:files?|docs?|documents?|slides?|decks?)\b/i.test(normalized) ||
    /\buse\s+(?:my|the)\s+upload(?:ed)?(?:\s+(?:files?|docs?|documents?|slides?|decks?))?\b/i.test(normalized) ||
    /\bfrom\s+my\s+uploads?\b/i.test(normalized)
  const preferSlides = /\b(slides?|pptx|deck|presentation)\b/i.test(normalized)
  return {
    hasImplicitUploadIntent: hasUploadCue,
    preferSlides,
  }
}

const LMS_COURSES_TABLE = "student_lms_courses"
const LMS_ARTIFACTS_TABLE = "student_lms_artifacts"
const EDUCATIONAL_PROMPT_CUE_PATTERN =
  /\b(curriculum|course|module|lecture|assignment|syllabus|learning objective|exam|osce|shelf|board|quiz|moodle|canvas|study plan|revision)\b/i

function hasEducationalPromptCue(
  query: string,
  learningMode: MedicalStudentLearningMode
): boolean {
  if (learningMode !== "ask") return true
  return EDUCATIONAL_PROMPT_CUE_PATTERN.test(query)
}

function isMissingLmsTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /student_lms_courses|student_lms_artifacts|does not exist|42P01/i.test(message)
}

async function loadMinimalLmsContextSnapshot(input: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}): Promise<LmsContextSnapshot | null> {
  if (!input.supabase) return null
  const coursesQuery = (input.supabase as any)
    .from(LMS_COURSES_TABLE)
    .select("provider, course_name, last_synced_at")
    .eq("user_id", input.userId)
    .order("last_synced_at", { ascending: false })
    .limit(60)
  const artifactsQuery = (input.supabase as any)
    .from(LMS_ARTIFACTS_TABLE)
    .select("provider, title, due_at, synced_at")
    .eq("user_id", input.userId)
    .order("synced_at", { ascending: false })
    .limit(160)

  const [coursesResult, artifactsResult] = await Promise.all([
    coursesQuery,
    artifactsQuery,
  ])
  if (coursesResult.error && !isMissingLmsTableError(coursesResult.error)) {
    throw new Error(coursesResult.error.message || "Failed to load LMS courses")
  }
  if (artifactsResult.error && !isMissingLmsTableError(artifactsResult.error)) {
    throw new Error(artifactsResult.error.message || "Failed to load LMS artifacts")
  }

  const courses = Array.isArray(coursesResult.data)
    ? (coursesResult.data as Array<Record<string, unknown>>)
    : []
  const artifacts = Array.isArray(artifactsResult.data)
    ? (artifactsResult.data as Array<Record<string, unknown>>)
    : []
  if (courses.length === 0 && artifacts.length === 0) return null

  const providerSet = new Set<LmsProvider>()
  const recentCourseNames: string[] = []
  const seenCourseNames = new Set<string>()
  courses.forEach((row) => {
    const provider = row.provider === "canvas" ? "canvas" : "moodle"
    providerSet.add(provider)
    const courseName = typeof row.course_name === "string" ? row.course_name.trim() : ""
    if (!courseName || seenCourseNames.has(courseName.toLowerCase())) return
    seenCourseNames.add(courseName.toLowerCase())
    if (recentCourseNames.length < 4) {
      recentCourseNames.push(courseName)
    }
  })

  const nowMs = Date.now()
  const days45Ms = 45 * 24 * 60 * 60 * 1000
  const upcomingDueTitles = artifacts
    .map((row) => ({
      title: typeof row.title === "string" ? row.title.trim() : "",
      dueAt: typeof row.due_at === "string" ? row.due_at : null,
      provider: row.provider === "canvas" ? "canvas" : "moodle",
    }))
    .filter((row) => {
      if (!row.dueAt) return false
      const dueMs = Date.parse(row.dueAt)
      return Number.isFinite(dueMs) && dueMs >= nowMs && dueMs <= nowMs + days45Ms
    })
    .sort((left, right) => Date.parse(left.dueAt as string) - Date.parse(right.dueAt as string))
    .slice(0, 4)
    .map((row) => row.title)
    .filter((title) => title.length > 0)

  artifacts.forEach((row) => {
    const provider = row.provider === "canvas" ? "canvas" : "moodle"
    providerSet.add(provider)
  })

  return {
    courseCount: courses.length,
    artifactCount: artifacts.length,
    providerIds: Array.from(providerSet),
    recentCourseNames,
    upcomingDueTitles,
  }
}

function resolveAutoLatestUploadIds(
  uploads: UserUploadListItem[],
  intentSignal: ImplicitUploadIntentSignal,
  maxCount = 3
): string[] {
  if (!intentSignal.hasImplicitUploadIntent) return []
  const kindPriority = intentSignal.preferSlides
    ? { pptx: 6, pdf: 5, docx: 4, text: 3, video: 3, image: 1 }
    : { pdf: 6, docx: 5, text: 4, pptx: 4, video: 4, image: 1 }

  return [...uploads]
    .filter((upload) => upload.status === "completed")
    .sort((a, b) => {
      const aPriority = kindPriority[a.uploadKind as keyof typeof kindPriority] ?? 0
      const bPriority = kindPriority[b.uploadKind as keyof typeof kindPriority] ?? 0
      if (aPriority !== bPriority) return bPriority - aPriority
      const aUpdated = new Date(a.updatedAt || a.createdAt).getTime()
      const bUpdated = new Date(b.updatedAt || b.createdAt).getTime()
      return bUpdated - aUpdated
    })
    .slice(0, maxCount)
    .map((upload) => upload.id)
}

type UploadReadinessSnapshot = {
  uploadId: string
  uploadTitle: string | null
  status: "pending" | "processing" | "completed" | "failed"
  progressStage: string | null
  progressPercent: number | null
  lastError: string | null
}

const UPLOAD_READY_GATE_MAX_WAIT_MS = Math.max(
  5_000,
  Number.parseInt(process.env.UPLOAD_READY_GATE_MAX_WAIT_MS || "45000", 10) || 45_000
)
const UPLOAD_READY_GATE_POLL_MS = Math.max(
  500,
  Number.parseInt(process.env.UPLOAD_READY_GATE_POLL_MS || "1500", 10) || 1_500
)

function normalizeRequestUploadIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  ).slice(0, 8)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSelectedUploadsReady(input: {
  uploadService: UserUploadService
  userId: string
  selectedUploadIds: string[]
  timeoutMs?: number
  pollMs?: number
}): Promise<{
  readyUploadIds: string[]
  snapshots: UploadReadinessSnapshot[]
  timedOut: boolean
}> {
  const timeoutMs = Math.max(2_000, input.timeoutMs ?? UPLOAD_READY_GATE_MAX_WAIT_MS)
  const pollMs = Math.max(500, input.pollMs ?? UPLOAD_READY_GATE_POLL_MS)
  const deadline = Date.now() + timeoutMs
  let snapshots: UploadReadinessSnapshot[] = input.selectedUploadIds.map((uploadId) => ({
    uploadId,
    uploadTitle: null,
    status: "pending",
    progressStage: "queued",
    progressPercent: 0,
    lastError: null,
  }))

  while (Date.now() <= deadline) {
    try {
      const uploads = await input.uploadService.listUploads(input.userId)
      const uploadById = new Map(uploads.map((upload) => [upload.id, upload]))
      snapshots = input.selectedUploadIds.map((uploadId) => {
        const upload = uploadById.get(uploadId)
        if (!upload) {
          return {
            uploadId,
            uploadTitle: null,
            status: "pending",
            progressStage: "queued",
            progressPercent: 0,
            lastError: null,
          } satisfies UploadReadinessSnapshot
        }
        const status =
          upload.status === "completed" || upload.status === "failed"
            ? upload.status
            : "processing"
        return {
          uploadId,
          uploadTitle: upload.title || null,
          status,
          progressStage: upload.latestJob?.progressStage || null,
          progressPercent:
            typeof upload.latestJob?.progressPercent === "number"
              ? upload.latestJob.progressPercent
              : null,
          lastError: upload.lastError || upload.latestJob?.errorMessage || null,
        } satisfies UploadReadinessSnapshot
      })
      const readyUploadIds = snapshots
        .filter((snapshot) => snapshot.status === "completed")
        .map((snapshot) => snapshot.uploadId)
      if (readyUploadIds.length === input.selectedUploadIds.length) {
        return {
          readyUploadIds,
          snapshots,
          timedOut: false,
        }
      }
    } catch {
      // Continue polling on transient failures.
    }

    await sleep(pollMs)
  }

  return {
    readyUploadIds: snapshots
      .filter((snapshot) => snapshot.status === "completed")
      .map((snapshot) => snapshot.uploadId),
    snapshots,
    timedOut: true,
  }
}

/**
 * Remove citation instructions from system prompt when evidence mode is off
 * This ensures normal conversations without citations when evidence mode is disabled
 */
function removeCitationInstructions(prompt: string): string {
  // Remove citation-related sections more reliably
  let cleaned = prompt
  
  // Remove "Mandatory Citations" section and related content
  cleaned = cleaned.replace(/\*\*Mandatory Citations?\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/\*\*Citation Format\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  
  // Remove citation examples and instructions (including web search citations)
  cleaned = cleaned.replace(/Every factual claim.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/must be followed by.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/MUST be followed by.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/Use.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/Use web search results to find and cite sources.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/with citations for every factual claim.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/properly cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/well-cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/with citations.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/cite sources.*?(?=\n|$)/gi, '')
  
  // Remove citation format examples
  cleaned = cleaned.replace(/\[CITATION:\d+\]/gi, '')
  cleaned = cleaned.replace(/\[CITATION:\d+,\d+\]/gi, '')
  cleaned = cleaned.replace(/\[CITATION:\d+-\d+\]/gi, '')
  
  // Remove "Response Structure" sections that mention citations
  cleaned = cleaned.replace(/\*\*Response Structure\*\*:.*?with citations.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/with immediate citations.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/all cited.*?(?=\n|$)/gi, '')
  
  // Remove "Your Mission" lines that mention citations
  cleaned = cleaned.replace(/Every response must be.*?cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/properly cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/evidence-based.*?cited.*?(?=\n|$)/gi, '')
  
  // Remove entire sections about citations
  cleaned = cleaned.replace(/\*\*Citations?\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/Citations?:.*?(?=\n\n|\*\*|$)/gis, '')
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.replace(/^\s+|\s+$/g, '')
  
  return cleaned
}

/**
 * Strip citation markers from response text when evidence mode is off
 * This prevents citation markers from appearing in the UI when evidence mode is disabled
 */
function stripCitationMarkers(text: string): string {
  if (!text) return text
  
  // Remove [CITATION:X] markers
  let cleaned = text
    .replace(/\[CITATION:\d+(?:,\d+)*\]/gi, '')
    .replace(/\[CITATION:\d+-\d+\]/gi, '')
    // Also remove simple numbered citations [1], [2] if they appear
    .replace(/\[\d+\]/g, '')
    .replace(/\[\d+,\d+\]/g, '')
    .replace(/\[\d+-\d+\]/g, '')
  
  // Remove "Citations:" section at the end if present
  cleaned = cleaned.replace(/\n\*\*Citations?\*\*:.*$/gis, '')
  cleaned = cleaned.replace(/\nCitations?:.*$/gis, '')
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  return cleaned.trim()
}

function stripInternalArtifactTokens(text: string): string {
  if (!text) return text
  return text
    .replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
    .replace(/\[tool\s+[^\]]+\]/gi, "")
    .replace(/\[source\s+[^\]]+\]/gi, "")
    .replace(/\[doc\s+[^\]]+\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
}

function detectExplicitMultiArtifactRequest(query: string): boolean {
  if (!query || typeof query !== "string") return false
  const normalized = query.toLowerCase()
  if (
    /\b(?:make|create|generate|produce)\s+\d+\s+(?:documents?|quizzes?|artifacts?)\b/.test(normalized)
  ) {
    return true
  }
  if (
    /\b(?:two|three|four|multiple|several|pair|double)\s+(?:documents?|quizzes?|artifacts?)\b/.test(
      normalized
    )
  ) {
    return true
  }
  return /\b(?:more than one|multiple versions|separate quizzes|separate documents)\b/.test(normalized)
}

function sanitizeAssistantMessagesForStorage(messages: any[]): any[] {
  if (!Array.isArray(messages)) return []
  return messages.map((message) => {
    if (!message || typeof message !== "object") {
      return message
    }

    const sanitizedMessage: any = { ...message }

    if (typeof sanitizedMessage.content === "string") {
      sanitizedMessage.content = stripInternalArtifactTokens(sanitizedMessage.content)
    } else if (Array.isArray(sanitizedMessage.content)) {
      sanitizedMessage.content = sanitizedMessage.content.map((item: any) => {
        if (
          item &&
          typeof item === "object" &&
          item.type === "text" &&
          typeof item.text === "string"
        ) {
          return {
            ...item,
            text: stripInternalArtifactTokens(item.text),
          }
        }
        return item
      })
    }

    if (Array.isArray(sanitizedMessage.parts)) {
      sanitizedMessage.parts = sanitizedMessage.parts.map((part: any) => {
        if (!part || typeof part !== "object") {
          return part
        }
        if (part.type === "text" && typeof part.text === "string") {
          return {
            ...part,
            text: stripInternalArtifactTokens(part.text),
          }
        }
        return part
      })
    }

    return sanitizedMessage
  })
}

function parseArtifactTypeFromToolResultPayload(
  payload: unknown
): "document" | "quiz" | null {
  if (!payload || typeof payload !== "object") return null
  const candidate = payload as Record<string, unknown>
  if (candidate.artifactType === "document" || candidate.artifactType === "quiz") {
    return candidate.artifactType
  }
  return null
}

function detectArtifactTypeFromMessage(message: any): "document" | "quiz" | null {
  if (!message || typeof message !== "object") return null
  const parts = Array.isArray(message.parts) ? message.parts : []
  for (const part of parts) {
    if (!part || typeof part !== "object") continue
    if (part.type === "tool-invocation" && part.toolInvocation?.state === "result") {
      const parsed = parseArtifactTypeFromToolResultPayload(part.toolInvocation?.result)
      if (parsed) return parsed
    }
    if (part.type === "metadata" && part.metadata && typeof part.metadata === "object") {
      const metadata = part.metadata as {
        documentArtifacts?: unknown[]
        quizArtifacts?: unknown[]
      }
      if (Array.isArray(metadata.documentArtifacts) && metadata.documentArtifacts.length > 0) {
        return "document"
      }
      if (Array.isArray(metadata.quizArtifacts) && metadata.quizArtifacts.length > 0) {
        return "quiz"
      }
    }
  }
  return null
}

function extractVisibleAssistantText(message: any): string {
  if (!message || typeof message !== "object") return ""
  let text = ""
  if (typeof message.content === "string") {
    text += message.content
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (
        part &&
        typeof part === "object" &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        text += `${part.text}\n`
      }
    }
  }
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (
        part &&
        typeof part === "object" &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        text += `${part.text}\n`
      }
    }
  }
  return text.trim()
}

function overwriteAssistantText(message: any, text: string): any {
  if (!message || typeof message !== "object") return message
  const nextMessage: any = { ...message }

  if (typeof nextMessage.content === "string") {
    nextMessage.content = text
  } else if (Array.isArray(nextMessage.content)) {
    const nonTextContent = nextMessage.content.filter(
      (part: any) => !(part && typeof part === "object" && part.type === "text")
    )
    nextMessage.content = [{ type: "text", text }, ...nonTextContent]
  } else {
    nextMessage.content = text
  }

  if (Array.isArray(nextMessage.parts)) {
    const nonTextParts = nextMessage.parts.filter(
      (part: any) => !(part && typeof part === "object" && part.type === "text")
    )
    nextMessage.parts = [{ type: "text", text }, ...nonTextParts]
  }

  return nextMessage
}

function computeCitationUtilization(
  allCitations: EvidenceCitation[],
  referencedCitations: EvidenceCitation[]
): {
  totalUnique: number
  referencedUnique: number
  ratio: number
  missingSourceIds: string[]
} {
  const allSourceIds = Array.from(
    new Set(
      allCitations
        .map((citation) => buildEvidenceSourceId(citation))
        .filter((sourceId) => typeof sourceId === "string" && sourceId.trim().length > 0)
    )
  )
  const referencedSet = new Set(
    referencedCitations
      .map((citation) => buildEvidenceSourceId(citation))
      .filter((sourceId) => typeof sourceId === "string" && sourceId.trim().length > 0)
  )
  const missingSourceIds = allSourceIds.filter((sourceId) => !referencedSet.has(sourceId))
  const totalUnique = allSourceIds.length
  const referencedUnique = totalUnique - missingSourceIds.length
  return {
    totalUnique,
    referencedUnique,
    ratio: totalUnique > 0 ? referencedUnique / totalUnique : 0,
    missingSourceIds,
  }
}

function ensureArtifactLeadInInMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages
  const nextMessages = [...messages]
  let assistantIndex = -1
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index]
    if (message?.role === "assistant") {
      assistantIndex = index
      break
    }
  }
  if (assistantIndex < 0) return nextMessages

  const assistantMessage = nextMessages[assistantIndex]
  const artifactType = detectArtifactTypeFromMessage(assistantMessage)
  if (!artifactType) return nextMessages

  const leadIn =
    artifactType === "quiz"
      ? "Here is your generated quiz."
      : "Here is your generated document."
  const visibleText = extractVisibleAssistantText(assistantMessage)
  const hasLeadIn = /here is your generated (quiz|document)\./i.test(visibleText)
  const needsLeadInInjection = !hasLeadIn && visibleText.length < 10
  if (!needsLeadInInjection) return nextMessages

  const updatedAssistantMessage: any = { ...assistantMessage }
  if (typeof updatedAssistantMessage.content === "string") {
    updatedAssistantMessage.content = leadIn
  } else if (Array.isArray(updatedAssistantMessage.content)) {
    const hasTextContent = updatedAssistantMessage.content.some(
      (part: any) => part?.type === "text" && typeof part?.text === "string" && part.text.trim().length > 0
    )
    if (!hasTextContent) {
      updatedAssistantMessage.content = [{ type: "text", text: leadIn }, ...updatedAssistantMessage.content]
    }
  } else {
    updatedAssistantMessage.content = leadIn
  }

  if (Array.isArray(updatedAssistantMessage.parts)) {
    const hasTextPart = updatedAssistantMessage.parts.some(
      (part: any) => part?.type === "text" && typeof part?.text === "string" && part.text.trim().length > 0
    )
    if (!hasTextPart) {
      updatedAssistantMessage.parts = [{ type: "text", text: leadIn }, ...updatedAssistantMessage.parts]
    }
  } else {
    updatedAssistantMessage.parts = [{ type: "text", text: leadIn }]
  }

  nextMessages[assistantIndex] = updatedAssistantMessage
  return nextMessages
}

function ensureRefinementFallbackTextInMessages(
  messages: any[],
  refinement: ArtifactRefinementToolResult | null
): any[] {
  if (!Array.isArray(messages) || messages.length === 0 || !refinement) return messages
  const nextMessages = [...messages]
  let assistantIndex = -1
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index]
    if (message?.role === "assistant") {
      assistantIndex = index
      break
    }
  }
  if (assistantIndex < 0) return nextMessages
  const assistantMessage: any = { ...nextMessages[assistantIndex] }
  const currentParts = Array.isArray(assistantMessage.parts)
    ? assistantMessage.parts
    : []
  const hasArtifactGenerationPart = currentParts.some(
    (part: any) =>
      part &&
      part.type === "tool-invocation" &&
      /generate(document|quiz)fromupload/i.test(
        String(part?.toolInvocation?.toolName || "")
      ) &&
      part?.toolInvocation?.state === "result"
  )
  if (hasArtifactGenerationPart) return nextMessages
  const visibleText = extractVisibleAssistantText(assistantMessage)
  if (visibleText.length >= 24) return nextMessages
  const choiceLines = refinement.choices
    .filter((choice) => !choice.requiresCustomInput)
    .map((choice) => `${choice.id}. ${choice.label}`)
    .join("\n")
  const fallbackText = `${refinement.title}\n${refinement.question}\n${choiceLines}\nE. Custom requirements (type your own).`
  if (typeof assistantMessage.content === "string") {
    assistantMessage.content = fallbackText
  } else {
    assistantMessage.content = fallbackText
  }
  if (Array.isArray(assistantMessage.parts)) {
    assistantMessage.parts = [{ type: "text", text: fallbackText }, ...assistantMessage.parts]
  } else {
    assistantMessage.parts = [{ type: "text", text: fallbackText }]
  }
  nextMessages[assistantIndex] = assistantMessage
  return nextMessages
}

function ensureRefinementToolResultInMessages(
  messages: any[],
  refinement: ArtifactRefinementToolResult | null
): any[] {
  if (!Array.isArray(messages) || messages.length === 0 || !refinement) return messages
  const nextMessages = [...messages]
  let assistantIndex = -1
  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    if (nextMessages[index]?.role === "assistant") {
      assistantIndex = index
      break
    }
  }
  if (assistantIndex < 0) return nextMessages

  const assistantMessage: any = { ...nextMessages[assistantIndex] }
  const currentParts = Array.isArray(assistantMessage.parts) ? [...assistantMessage.parts] : []
  const hasArtifactGenerationPart = currentParts.some(
    (part) =>
      part &&
      part.type === "tool-invocation" &&
      /generate(document|quiz)fromupload/i.test(
        String(part?.toolInvocation?.toolName || "")
      ) &&
      part?.toolInvocation?.state === "result"
  )
  if (hasArtifactGenerationPart) return nextMessages
  const hasRefinementToolPart = currentParts.some(
    (part) =>
      part &&
      part.type === "tool-invocation" &&
      /refine.*requirements/i.test(String(part?.toolInvocation?.toolName || "")) &&
      part?.toolInvocation?.state === "result"
  )
  if (hasRefinementToolPart) return nextMessages

  const syntheticToolName = "refineQuizRequirements"
  const syntheticToolPart = {
    type: "tool-invocation",
    toolInvocation: {
      state: "result",
      step: 1,
      toolCallId: `refine-fallback-${Date.now()}`,
      toolName: syntheticToolName,
      args: {
        intent: refinement.intent,
      },
      result: refinement,
    },
  }

  assistantMessage.parts = [syntheticToolPart, ...currentParts]
  nextMessages[assistantIndex] = assistantMessage
  return nextMessages
}

function buildSafeIntroPreview(input: {
  query: string
  shouldPreferUploadContext?: boolean
  shouldRunEvidenceSynthesis?: boolean
  shouldRunWebSearchPreflight?: boolean
  artifactIntent?: "none" | "quiz"
  artifactWorkflowStage?: "none" | "inspect" | "refine" | "generate"
}): string {
  const normalized = input.query.replace(/\s+/g, " ").trim()
  const snippet = normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized

  if (input.artifactIntent === "quiz") {
    if (input.artifactWorkflowStage === "inspect") {
      return snippet
        ? `Scanning your uploaded material to shape a focused quiz for "${snippet}".`
        : "Scanning your uploaded material to shape a focused quiz."
    }
    if (input.artifactWorkflowStage === "refine") {
      return snippet
        ? `Narrowing the quiz scope for "${snippet}" so the questions stay grounded and high-yield.`
        : "Narrowing the quiz scope so the questions stay grounded and high-yield."
    }
    return snippet
      ? `Building a source-grounded quiz for "${snippet}" and checking the supporting passages as I go.`
      : "Building a source-grounded quiz and checking the supporting passages as I go."
  }

  if (input.shouldPreferUploadContext) {
    return snippet
      ? `Checking your uploaded material for the best supporting passages on "${snippet}".`
      : "Checking your uploaded material for the best supporting passages."
  }

  if (input.shouldRunEvidenceSynthesis && input.shouldRunWebSearchPreflight) {
    return snippet
      ? `Pulling together the strongest evidence and current sources for "${snippet}".`
      : "Pulling together the strongest evidence and current sources."
  }

  if (input.shouldRunEvidenceSynthesis) {
    return snippet
      ? `Gathering evidence-backed guidance for "${snippet}".`
      : "Gathering evidence-backed guidance."
  }

  if (input.shouldRunWebSearchPreflight) {
    return snippet
      ? `Looking up current sources for "${snippet}" and drafting the answer inline.`
      : "Looking up current sources and drafting the answer inline."
  }

  if (!snippet) {
    return "Pulling together a grounded response and streaming the useful steps inline."
  }
  return `Working through "${snippet}" and surfacing the useful steps inline.`
}

const EVIDENCE_SEEKING_INTENT_PATTERN =
  /\b(treat(?:ment|ing)?|manage(?:ment|ing)?|guideline|guidelines|recommendation|consensus|workup|diagnos(?:is|e)|compare|comparison|drug|medication|therapy|therapeutic|prognos(?:is|tic)|risk|benefit|evidence(?:-based)?|citation|citations|source|sources|meta-analysis|systematic review)\b/i

function hasEvidenceSeekingIntent(query: string): boolean {
  const normalized = query.trim()
  if (!normalized) return false
  return EVIDENCE_SEEKING_INTENT_PATTERN.test(normalized)
}

function wantsInlineEvidenceFigure(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  const visualIntent = /\b(figure|fig\.?|diagram|schema|algorithm|image|illustration|visual)\b/.test(
    normalized
  )
  const inlineIntent = /\b(inline|show|include|render|display|embed)\b/.test(normalized)
  return visualIntent && inlineIntent
}

function wantsPmcOpenAccessReview(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  const pmcIntent = /\b(pmc|pubmed central|open-access|open access|oa)\b/.test(normalized)
  const reviewIntent = /\breview\b/.test(normalized)
  return pmcIntent && reviewIntent
}

function extractPmcidFromValue(value: string | null | undefined): string | null {
  if (!value) return null
  const match = String(value).match(/\b(PMC\d+)\b/i)
  return match?.[1]?.toUpperCase() || null
}

function buildPmcReviewSearchQueries(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normalized) return []

  const terms = extractClinicalQueryTerms(normalized).filter(
    (term) =>
      ![
        "pmc",
        "pubmed",
        "central",
        "open",
        "access",
        "review",
        "figure",
        "caption",
        "inline",
        "article",
        "articles",
        "pick",
        "yourself",
        "include",
        "using",
        "comply",
        "exact",
        "constraint",
        "clearly",
        "requirement",
      ].includes(term)
  )

  const compact = terms.slice(0, 4).join(" ").trim()
  const hasPd1 = /\bpd[\s-]?1\b/.test(normalized)
  const hasCtla4 = /\bctla[\s-]?4\b/.test(normalized)
  const hasCheckpoint = /\bimmune checkpoint|checkpoint inhibitor|checkpoint\b/.test(normalized)
  const hasCancer = /\bcancer|tumou?r|oncolog|melanoma|nsclc|lung\b/.test(normalized)

  const strategies = new Set<string>()

  if (hasPd1 && hasCtla4) {
    strategies.add(`("PD-1" OR PD1) AND ("CTLA-4" OR CTLA4) AND review`)
    strategies.add(`("PD-1" OR PD1) AND ("CTLA-4" OR CTLA4) AND ("immune checkpoint" OR immunotherapy) AND review`)
  }

  if (hasCheckpoint) {
    strategies.add(`("immune checkpoint" OR "immune checkpoints") AND review`)
  }

  if (hasCancer) {
    strategies.add(`("immune checkpoint" OR "immune checkpoints") AND cancer AND review`)
  }

  if (compact) {
    strategies.add(`${compact} review`)
    if (compact !== normalized) {
      strategies.add(`"${compact}" review`)
    }
  }

  return Array.from(strategies)
    .map((candidate) => candidate.replace(/\s+/g, " ").trim())
    .filter((candidate) => candidate.length > 0)
    .slice(0, 6)
}

function pubMedArticleToEvidenceCitation(article: PubMedArticle): EvidenceCitation {
  return {
    index: 1,
    sourceId: buildEvidenceSourceId({
      pmid: article.pmid,
      doi: article.doi,
      url: article.url,
      title: article.title,
      journal: article.journal,
    }),
    pmid: article.pmid || null,
    pmcid: article.pmcid || null,
    title: article.title,
    journal: article.journal || "PubMed",
    year: article.year ? Number(article.year) || null : null,
    doi: article.doi || null,
    authors: article.authors || [],
    evidenceLevel: 2,
    studyType: "Literature record",
    sampleSize: null,
    meshTerms: [],
    url: article.pmcid
      ? `https://pmc.ncbi.nlm.nih.gov/articles/${article.pmcid}/`
      : article.url || null,
    snippet: (article.abstract || "").slice(0, 320),
    score: 1,
    sourceType: "medical_evidence",
    sourceLabel: article.pmcid ? "PubMed Central" : "PubMed",
  }
}

function extractExplicitReferenceSignals(query: string): {
  pmids: string[]
  pmcids: string[]
  dois: string[]
} {
  const pmids = new Set<string>()
  const pmcids = new Set<string>()
  const dois = new Set<string>()

  const pmidPattern = /\bPMID\s*[:#]?\s*(\d{6,10})\b/gi
  let match: RegExpExecArray | null
  while ((match = pmidPattern.exec(query)) !== null) {
    if (match[1]) pmids.add(match[1].trim())
  }

  const pmcidPattern = /\b(PMC\d+)\b/gi
  while ((match = pmcidPattern.exec(query)) !== null) {
    if (match[1]) pmcids.add(match[1].trim().toUpperCase())
  }

  const doiPattern = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi
  while ((match = doiPattern.exec(query)) !== null) {
    if (match[0]) dois.add(match[0].trim())
  }

  return {
    pmids: Array.from(pmids),
    pmcids: Array.from(pmcids),
    dois: Array.from(dois),
  }
}

async function fetchPubMedArticleByPmcid(
  pmcid: string
): Promise<Awaited<ReturnType<typeof fetchPubMedArticle>> | null> {
  try {
    const endpoint = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search")
    endpoint.searchParams.set("query", `PMCID:${pmcid}`)
    endpoint.searchParams.set("format", "json")
    endpoint.searchParams.set("resultType", "core")
    endpoint.searchParams.set("pageSize", "1")
    const response = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
      cache: "force-cache",
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      resultList?: { result?: Array<{ pmid?: string | null }> }
    }
    const pmid = data.resultList?.result?.[0]?.pmid
    if (!pmid) return null
    return fetchPubMedArticle(String(pmid))
  } catch {
    return null
  }
}

async function fetchExplicitReferenceCitations(query: string): Promise<EvidenceCitation[]> {
  const { pmids, pmcids, dois } = extractExplicitReferenceSignals(query)
  if (pmids.length === 0 && pmcids.length === 0 && dois.length === 0) return []

  const articles = new Map<string, Awaited<ReturnType<typeof fetchPubMedArticle>>>()

  for (const pmid of pmids) {
    const article = await fetchPubMedArticle(pmid)
    if (article?.pmid) {
      articles.set(`pmid:${article.pmid}`, article)
    }
  }

  for (const doi of dois) {
    const article = await searchPubMedByDOI(doi)
    if (article?.pmid) {
      articles.set(`pmid:${article.pmid}`, article)
    } else if (article?.doi) {
      articles.set(`doi:${article.doi.toLowerCase()}`, article)
    }
  }

  for (const pmcid of pmcids) {
    const article = await fetchPubMedArticleByPmcid(pmcid)
    if (article?.pmid) {
      articles.set(`pmid:${article.pmid}`, article)
    }
  }

  return dedupeAndReindexCitations(
    Array.from(articles.values())
      .filter((article): article is NonNullable<typeof article> => Boolean(article))
      .map((article) => pubMedArticleToEvidenceCitation(article))
  )
}

async function fetchPmcOpenAccessReviewCitations(query: string): Promise<EvidenceCitation[]> {
  if (!wantsPmcOpenAccessReview(query)) return []

  const strategies = buildPmcReviewSearchQueries(query)
  if (strategies.length === 0) return []

  type EuropePmcReviewResult = {
    id?: string
    pmid?: string
    pmcid?: string
    doi?: string
    title?: string
    journalTitle?: string
    pubYear?: string
    abstractText?: string
    authorString?: string
    isOpenAccess?: string
    pubType?: string | string[]
  }

  const collected = new Map<string, EvidenceCitation>()

  for (const strategy of strategies) {
    const endpoint = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search")
    endpoint.searchParams.set(
      "query",
      `(${strategy}) AND OPEN_ACCESS:y AND SRC:PMC`
    )
    endpoint.searchParams.set("format", "json")
    endpoint.searchParams.set("resultType", "core")
    endpoint.searchParams.set("pageSize", "8")

    try {
      const response = await fetch(endpoint.toString(), {
        headers: { Accept: "application/json" },
        cache: "force-cache",
      })
      if (!response.ok) continue

      const data = (await response.json()) as {
        resultList?: { result?: EuropePmcReviewResult[] }
      }
      const results = Array.isArray(data.resultList?.result) ? data.resultList.result : []

      for (const article of results) {
        const pmcid = extractPmcidFromValue(article.pmcid || article.id || null)
        const title = typeof article.title === "string" ? article.title.trim() : ""
        const abstractText =
          typeof article.abstractText === "string" ? article.abstractText.trim() : ""
        const pubTypes = Array.isArray(article.pubType)
          ? article.pubType.join(" ").toLowerCase()
          : String(article.pubType || "").toLowerCase()
        const reviewLike =
          /\breview\b/i.test(title) ||
          /\breview\b/i.test(pubTypes) ||
          /\breview article\b/i.test(abstractText) ||
          /\boverview\b/i.test(title)

        if (!pmcid || !title || !reviewLike) continue
        const relevanceText = `${title} ${abstractText}`.toLowerCase()
        const overlapTerms = extractClinicalQueryTerms(query).filter(
          (term) => term.length >= 3 && relevanceText.includes(term)
        )
        if (overlapTerms.length === 0 && !/pd-?1|ctla-?4|checkpoint/i.test(relevanceText)) continue

        const authors = typeof article.authorString === "string"
          ? article.authorString
              .split(/,|;/)
              .map((author) => author.trim())
              .filter(Boolean)
              .slice(0, 8)
          : []

        const citation: EvidenceCitation = {
          index: 1,
          sourceId: buildEvidenceSourceId({
            pmid: article.pmid || undefined,
            doi: article.doi || undefined,
            url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
            title,
            journal: article.journalTitle || "PubMed Central",
          }),
          pmid: article.pmid || null,
          pmcid,
          title,
          journal: article.journalTitle || "PubMed Central",
          year: article.pubYear ? Number(article.pubYear) || null : null,
          doi: article.doi || null,
          authors,
          evidenceLevel: 2,
          studyType: "Review article",
          sampleSize: null,
          meshTerms: [],
          url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
          snippet: abstractText.slice(0, 320),
          score: 1,
          sourceType: "medical_evidence",
          sourceLabel: "PubMed Central",
        }

        collected.set(buildEvidenceSourceId(citation), citation)
        if (collected.size >= 4) break
      }
    } catch {
      continue
    }

    if (collected.size >= 2) break
  }

  console.log(
    `📚 [PMC REVIEW RESOLVER] Queries=${strategies.length} candidates=${collected.size}`
  )

  return dedupeAndReindexCitations(Array.from(collected.values()))
}

async function runWithTimeBudget<T>(
  label: string,
  run: () => Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const result = await Promise.race<T>([
      run(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs)
      }),
    ])

    if (timer) {
      clearTimeout(timer)
      timer = null
    }

    const elapsedMs = Date.now() - startedAt
    if (elapsedMs >= timeoutMs) {
      console.warn(`⏱️ [${label}] hit time budget (${timeoutMs}ms), using fallback`)
    }
    return result
  } catch (error) {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    console.warn(`⏱️ [${label}] failed, using fallback:`, error)
    return fallbackValue
  }
}

type HealthPreferencePatch = {
  healthContext?: string
  healthConditions?: string[]
  medications?: string[]
  allergies?: string[]
  familyHistory?: string
  lifestyleFactors?: string
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeHealthText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function splitHealthList(value: string): string[] {
  const normalized = normalizeHealthText(value)
  if (!normalized) return []
  if (/^(none|n\/a|na|unknown|no known)$/i.test(normalized)) return []
  return normalized
    .split(/,|;|\band\b|\//i)
    .map((item) => item.replace(/^[\s\-\*]+|[\s.]+$/g, "").trim())
    .filter((item) => item.length > 0 && !/^(none|n\/a|na|unknown)$/i.test(item))
}

function extractLabeledValue(source: string, labels: string[]): string | undefined {
  const labelPattern = labels.map(escapeRegex).join("|")
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*([^\\n]+)`, "i")
  const match = source.match(pattern)
  if (!match?.[1]) return undefined
  const normalized = normalizeHealthText(match[1])
  return normalized || undefined
}

function mergeDistinctHealthItems(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const value of [...existing, ...incoming]) {
    const normalized = normalizeHealthText(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(normalized)
  }
  return merged
}

function extractHealthPreferencePatchFromPrompts(
  latestUserPrompt: string,
  recentUserPrompts: string[]
): HealthPreferencePatch {
  const latestRaw = latestUserPrompt || ""
  const latest = normalizeHealthText(latestRaw)
  const combinedRaw = recentUserPrompts
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .slice(-8)
    .join("\n")
  const source = [latestRaw, combinedRaw].filter(Boolean).join("\n")
  if (!source.trim()) return {}

  const labeledHealthGoals = extractLabeledValue(source, [
    "health goals",
    "goals",
    "health context",
  ])
  const labeledConditions = extractLabeledValue(source, [
    "medical conditions",
    "conditions",
    "diagnoses",
  ])
  const labeledMedications = extractLabeledValue(source, ["medications", "meds"])
  const labeledAllergies = extractLabeledValue(source, ["allergies", "allergy"])
  const labeledFamilyHistory = extractLabeledValue(source, ["family history"])
  const labeledLifestyle = extractLabeledValue(source, [
    "lifestyle factors",
    "lifestyle",
  ])

  const naturalHealthGoals =
    latest.match(/\b(?:my\s+)?health\s+goals?\s*(?:are|:)\s*([^\n.]+)/i)?.[1] ||
    latest.match(/\bmy\s+goal\s+is\s+to\s+([^\n.]+)/i)?.[1] ||
    undefined
  const naturalMedications =
    latest.match(
      /\b(?:i(?:'m| am)?\s+taking|i\s+take|my\s+medications?\s+(?:are|include)|medications?\s*:\s*)([^\n.]+)/i
    )?.[1] || undefined
  const naturalAllergies =
    latest.match(
      /\b(?:i(?:'m| am)?\s+allergic\s+to|allerg(?:y|ies)\s*(?:are|include|:)\s*)([^\n.]+)/i
    )?.[1] || undefined
  const naturalFamilyHistory =
    latest.match(/\bfamily\s+history\s+(?:of|:)\s*([^\n.]+)/i)?.[1] || undefined
  const naturalConditions =
    latest.match(
      /\b(?:medical\s+conditions?\s*(?:are|include|:)|diagnosed\s+with)\s*([^\n.]+)/i
    )?.[1] || undefined

  const healthContext = normalizeHealthText(labeledHealthGoals || naturalHealthGoals || "")
  const conditions = splitHealthList(labeledConditions || naturalConditions || "")
  const medications = splitHealthList(labeledMedications || naturalMedications || "")
  const allergies = splitHealthList(labeledAllergies || naturalAllergies || "")
  const familyHistory = normalizeHealthText(labeledFamilyHistory || naturalFamilyHistory || "")
  const lifestyleFactors = normalizeHealthText(labeledLifestyle || "")

  const patch: HealthPreferencePatch = {}
  if (healthContext) patch.healthContext = healthContext
  if (conditions.length > 0) patch.healthConditions = conditions
  if (medications.length > 0) patch.medications = medications
  if (allergies.length > 0) patch.allergies = allergies
  if (familyHistory) patch.familyHistory = familyHistory
  if (lifestyleFactors) patch.lifestyleFactors = lifestyleFactors
  return patch
}

function hasHealthPreferencePatch(patch: HealthPreferencePatch): boolean {
  return Boolean(
    patch.healthContext ||
      patch.familyHistory ||
      patch.lifestyleFactors ||
      (patch.healthConditions && patch.healthConditions.length > 0) ||
      (patch.medications && patch.medications.length > 0) ||
      (patch.allergies && patch.allergies.length > 0)
  )
}

async function persistHealthMemoryPatchFromPrompts({
  supabase,
  userId,
  latestUserPrompt,
  recentUserPrompts,
}: {
  supabase: any
  userId: string
  latestUserPrompt: string
  recentUserPrompts: string[]
}): Promise<void> {
  const patch = extractHealthPreferencePatchFromPrompts(latestUserPrompt, recentUserPrompts)
  if (!hasHealthPreferencePatch(patch)) return

  const { data: existing, error: existingError } = await supabase
    .from("user_preferences")
    .select(`
      user_id,
      health_context,
      health_context_iv,
      health_conditions,
      health_conditions_iv,
      medications,
      medications_iv,
      allergies,
      allergies_iv,
      family_history,
      family_history_iv,
      lifestyle_factors,
      lifestyle_factors_iv
    `)
    .eq("user_id", userId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  const current = { ...(existing || {}) } as Record<string, any>
  if (isEncryptionEnabled()) {
    const mappings: Array<{ key: string; ivKey: string }> = [
      { key: "health_context", ivKey: "health_context_iv" },
      { key: "health_conditions", ivKey: "health_conditions_iv" },
      { key: "medications", ivKey: "medications_iv" },
      { key: "allergies", ivKey: "allergies_iv" },
      { key: "family_history", ivKey: "family_history_iv" },
      { key: "lifestyle_factors", ivKey: "lifestyle_factors_iv" },
    ]
    for (const { key, ivKey } of mappings) {
      const value = current[key]
      const iv = current[ivKey]
      if (!value) continue
      if (typeof iv === "string" || Array.isArray(iv)) {
        current[key] = decryptHealthData(value, iv)
      }
    }
  }

  const nextHealthConditions = patch.healthConditions
    ? mergeDistinctHealthItems(current.health_conditions || [], patch.healthConditions)
    : undefined
  const nextMedications = patch.medications
    ? mergeDistinctHealthItems(current.medications || [], patch.medications)
    : undefined
  const nextAllergies = patch.allergies
    ? mergeDistinctHealthItems(current.allergies || [], patch.allergies)
    : undefined

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  let shouldPersist = false

  if (patch.healthContext && patch.healthContext !== current.health_context) {
    updates.health_context = patch.healthContext
    shouldPersist = true
  }
  if (nextHealthConditions && JSON.stringify(nextHealthConditions) !== JSON.stringify(current.health_conditions || [])) {
    updates.health_conditions = nextHealthConditions
    shouldPersist = true
  }
  if (nextMedications && JSON.stringify(nextMedications) !== JSON.stringify(current.medications || [])) {
    updates.medications = nextMedications
    shouldPersist = true
  }
  if (nextAllergies && JSON.stringify(nextAllergies) !== JSON.stringify(current.allergies || [])) {
    updates.allergies = nextAllergies
    shouldPersist = true
  }
  if (patch.familyHistory && patch.familyHistory !== current.family_history) {
    updates.family_history = patch.familyHistory
    shouldPersist = true
  }
  if (patch.lifestyleFactors && patch.lifestyleFactors !== current.lifestyle_factors) {
    updates.lifestyle_factors = patch.lifestyleFactors
    shouldPersist = true
  }

  if (!shouldPersist) return

  if (isEncryptionEnabled()) {
    const encryptedUpdates: Record<string, any> = { updated_at: updates.updated_at }
    const mappings: Array<{ key: string; ivKey: string }> = [
      { key: "health_context", ivKey: "health_context_iv" },
      { key: "health_conditions", ivKey: "health_conditions_iv" },
      { key: "medications", ivKey: "medications_iv" },
      { key: "allergies", ivKey: "allergies_iv" },
      { key: "family_history", ivKey: "family_history_iv" },
      { key: "lifestyle_factors", ivKey: "lifestyle_factors_iv" },
    ]

    for (const { key, ivKey } of mappings) {
      if (!(key in updates)) continue
      const encrypted = encryptHealthData(updates[key])
      encryptedUpdates[key] = encrypted.encrypted
      encryptedUpdates[ivKey] = encrypted.iv
    }

    if (existing?.user_id) {
      await supabase.from("user_preferences").update(encryptedUpdates).eq("user_id", userId)
    } else {
      await supabase
        .from("user_preferences")
        .insert({ user_id: userId, ...encryptedUpdates, created_at: new Date().toISOString() })
    }
    return
  }

  if (existing?.user_id) {
    await supabase.from("user_preferences").update(updates).eq("user_id", userId)
  } else {
    await supabase
      .from("user_preferences")
      .insert({ user_id: userId, ...updates, created_at: new Date().toISOString() })
  }
}

type ChatAttachment = {
  name?: string
  contentType?: string
  url?: string
}

const MAX_INLINE_ATTACHMENT_DATA_URL_CHARS = 16 * 1024 * 1024
const MAX_INLINE_ATTACHMENT_BUFFER_BYTES = 12 * 1024 * 1024
const MAX_ATTACHMENT_CONTEXT_ITEMS = 2

function decodeDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  if (!dataUrl.startsWith("data:")) return null
  if (dataUrl.length > MAX_INLINE_ATTACHMENT_DATA_URL_CHARS) return null

  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex <= 5) return null

  const metadata = dataUrl.slice(5, commaIndex)
  if (!metadata.toLowerCase().includes(";base64")) return null

  const mimeType = metadata.split(";")[0]?.trim() || "application/octet-stream"
  const base64Payload = dataUrl.slice(commaIndex + 1)
  if (!base64Payload) return null

  const estimatedBytes = Math.floor((base64Payload.length * 3) / 4)
  if (estimatedBytes > MAX_INLINE_ATTACHMENT_BUFFER_BYTES) {
    return null
  }

  try {
    return {
      mimeType,
      buffer: Buffer.from(base64Payload, "base64"),
    }
  } catch {
    return null
  }
}

async function extractAttachmentText(attachment: ChatAttachment): Promise<string | null> {
  if (!attachment?.url || !attachment.url.startsWith("data:")) return null
  const decoded = decodeDataUrl(attachment.url)
  if (!decoded) return null

  const contentType = String(
    attachment.contentType || decoded.mimeType || "application/octet-stream"
  ).toLowerCase()

  try {
    if (contentType === "application/pdf") {
      // PDF parsing is intentionally skipped pre-stream to avoid delaying first token.
      return null
    }

    if (
      contentType.startsWith("text/") ||
      contentType === "application/json" ||
      contentType === "text/csv" ||
      contentType === "application/csv"
    ) {
      return decoded.buffer.toString("utf-8").replace(/\s+/g, " ").trim().slice(0, 6000)
    }
  } catch (error) {
    console.warn("[ATTACHMENT CONTEXT] Failed to extract attachment text:", error)
  }

  return null
}

async function buildAttachmentContext(message?: MessageAISDK): Promise<string> {
  const attachments = (message as any)?.experimental_attachments as ChatAttachment[] | undefined
  if (!attachments || attachments.length === 0) return ""

  const chunks = (
    await Promise.all(
      attachments.slice(0, MAX_ATTACHMENT_CONTEXT_ITEMS).map(async (attachment) => {
        const text = await extractAttachmentText(attachment)
        if (!text) return null
        return `Attachment: ${attachment.name || "Untitled"}\nExtracted content preview:\n${text}`
      })
    )
  ).filter((value): value is string => Boolean(value))

  if (chunks.length === 0) return ""
  return chunks.join("\n\n---\n\n")
}

// Function to quickly assess query complexity for smart orchestration
function assessQueryComplexity(query: string): "simple" | "complex" {
  const queryLower = query.toLowerCase()
  
  // Simple queries that don't need full orchestration
  const simplePatterns = [
    "hello", "hi", "thanks", "thank you", "goodbye", "bye",
    "what is", "what are", "define", "explain", "describe",
    "how to", "steps", "procedure", "protocol",
    "yes", "no", "ok", "okay", "sure", "fine"
  ]
  
  // Complex queries that need full orchestration
  const complexPatterns = [
    "differential diagnosis", "diagnosis", "diagnostic",
    "treatment plan", "treatment options", "therapeutic",
    "medication", "drug", "pharmacology", "interaction",
    "imaging", "x-ray", "mri", "ct", "ultrasound", "radiology",
    "laboratory", "lab values", "biomarker", "test results",
    "risk assessment", "prognosis", "complication",
    "guidelines", "evidence", "research", "study",
    "patient", "case", "scenario", "clinical",
    "emergency", "urgent", "critical", "acute"
  ]
  
  // Check for complex medical patterns
  const hasComplexPatterns = complexPatterns.some(pattern => queryLower.includes(pattern))
  
  // Check for simple patterns
  const hasSimplePatterns = simplePatterns.some(pattern => queryLower.includes(pattern))
  
  // Long queries (>100 chars) are likely complex
  const isLongQuery = query.length > 100
  
  // If it has complex medical patterns or is a long query, it's complex
  if (hasComplexPatterns || isLongQuery) {
    return "complex"
  }
  
  // If it only has simple patterns and is short, it's simple
  if (hasSimplePatterns && query.length < 50) {
    return "simple"
  }
  
  // Default to complex for medical queries to be safe
  return "complex"
}

function needsFreshEvidence(query: string): boolean {
  const q = query.toLowerCase()
  return (
    /\b(latest|recent|new|updated|current)\b/.test(q) ||
    /\b(guideline|consensus|position statement)\b/.test(q) ||
    /\btrial|rct|meta-analysis|systematic review\b/.test(q) ||
    /\b202[4-9]\b/.test(q)
  )
}

function hasExplicitScholarGatewayIntent(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return (
    /\b(use|run|try)\s+(the\s+)?scholar\s+gateway\b/i.test(normalized) ||
    /\bscholar\s+gateway\b/i.test(normalized) ||
    /\bopenalex\b/i.test(normalized) ||
    /\beurope\s*pmc\b/i.test(normalized)
  )
}

function shouldAllowScholarGatewayTool(options: {
  queryText: string
  finalEnableEvidence: boolean
  citationCount: number
  evidenceContextAvailable: boolean
  sourceDiversityCount: number
}): boolean {
  if (hasExplicitScholarGatewayIntent(options.queryText)) return true
  if (!options.finalEnableEvidence) return false
  if (needsFreshEvidence(options.queryText)) return true
  if (!options.evidenceContextAvailable) return true
  // Allow Scholar Gateway as corroboration when current evidence is still
  // monoculture (e.g., PubMed-only).
  if (options.sourceDiversityCount < 2) {
    return true
  }
  return options.citationCount < 4
}

type YouTubeIntentDecision = {
  shouldUse: boolean
  explicitRequest: boolean
  reason:
    | "empty_query"
    | "negative_non_tutorial_intent"
    | "tutorial_or_training_intent"
    | "emergency_without_explicit_video_request"
    | "no_video_intent"
}

function detectYouTubeIntent(
  query: string,
  options: { emergencyEscalation: boolean }
): YouTubeIntentDecision {
  const normalized = query.trim()
  if (!normalized) {
    return {
      shouldUse: false,
      explicitRequest: false,
      reason: "empty_query",
    }
  }

  const lower = normalized.toLowerCase()
  const explicitYouTubeRequest =
    /\b(youtube|yt)\b/i.test(normalized) ||
    /\bvideo(s)?\b/i.test(normalized)

  const tutorialIntent =
    /\b(tutorial|walkthrough|demonstration|demo|step[- ]?by[- ]?step|show me|watch)\b/i.test(
      normalized
    ) || /\bhow to\b/i.test(lower)
  const trainingIntent =
    /\b(cpr|history taking|history-taking|osce|physical exam|examination technique|procedural|procedure|skill)\b/i.test(
      normalized
    )
  const explicitTrainingVideoIntent =
    /\b(training video|educational video|video example|show me (a )?video)\b/i.test(
      normalized
    ) || (tutorialIntent && trainingIntent)
  const negativeOnlyMedicalIntent =
    /\b(diagnosis|diagnostic|differential|dosage|dose|contraindication|interaction|lab|imaging)\b/i.test(
      normalized
    ) && !tutorialIntent && !trainingIntent && !explicitYouTubeRequest

  if (negativeOnlyMedicalIntent) {
    return {
      shouldUse: false,
      explicitRequest: explicitYouTubeRequest,
      reason: "negative_non_tutorial_intent",
    }
  }

  if (options.emergencyEscalation && !explicitYouTubeRequest && !explicitTrainingVideoIntent) {
    return {
      shouldUse: false,
      explicitRequest: false,
      reason: "emergency_without_explicit_video_request",
    }
  }

  if (explicitYouTubeRequest || tutorialIntent || trainingIntent) {
    return {
      shouldUse: true,
      explicitRequest: explicitYouTubeRequest,
      reason: "tutorial_or_training_intent",
    }
  }

  return {
    shouldUse: false,
    explicitRequest: false,
    reason: "no_video_intent",
  }
}

const HIGH_RISK_EMERGENCY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(crushing\s+)?chest pain\b/i, label: "chest_pain" },
  { pattern: /\b(facial droop|slurred speech|stroke|hemiparesis|FAST)\b/i, label: "stroke_signs" },
  { pattern: /\b(septic shock|sepsis)\b/i, label: "sepsis" },
  { pattern: /\b(severe shortness of breath|cannot breathe|respiratory distress)\b/i, label: "respiratory_distress" },
  { pattern: /\b(anaphylaxis|airway compromise)\b/i, label: "airway_emergency" },
  { pattern: /\b(heavy bleeding|hemorrhage)\b/i, label: "hemorrhage" },
  { pattern: /\b(loss of consciousness|unresponsive|syncope with injury)\b/i, label: "altered_consciousness" },
  { pattern: /\b(suicidal|homicidal)\b/i, label: "behavioral_emergency" },
];

const URGENT_CONTEXT_PATTERN =
  /\b(immediate|urgent|emergency|er|ed|call 911|wait until morning|send to the ed|when should.*ed)\b/i;

function detectEmergencyEscalationNeed(query: string): {
  shouldEscalate: boolean
  matchedSignals: string[]
  escalationLevel: "soft" | "hard"
} {
  const normalized = query.trim()
  if (!normalized) {
    return { shouldEscalate: false, matchedSignals: [], escalationLevel: "soft" }
  }

  const matchedSignals = HIGH_RISK_EMERGENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ label }) => label)

  const hasUrgentContext = URGENT_CONTEXT_PATTERN.test(normalized)
  const hasSepsisSignal = matchedSignals.includes("sepsis")
  const hasNonSepsisHighRiskSignal = matchedSignals.some((label) => label !== "sepsis")
  const hasHardSepsisSignal = /\bseptic shock\b/i.test(normalized)
  const symptomaticUrgentSignal =
    hasUrgentContext &&
    /\b(pain|shock|stroke|sepsis|bleeding|abdominal|dyspnea|breath)\b/i.test(normalized)
  const shouldEscalate =
    hasNonSepsisHighRiskSignal ||
    hasHardSepsisSignal ||
    (hasSepsisSignal && hasUrgentContext) ||
    symptomaticUrgentSignal
  const escalationLevel: "soft" | "hard" =
    hasNonSepsisHighRiskSignal || hasHardSepsisSignal || symptomaticUrgentSignal
      ? "hard"
      : "soft"

  return { shouldEscalate, matchedSignals, escalationLevel }
}

function buildEmergencyEscalationInstruction(
  matchedSignals: string[],
  escalationLevel: "soft" | "hard"
): string {
  const signalText = matchedSignals.length > 0 ? matchedSignals.join(", ") : "urgent red flags"
  if (escalationLevel === "soft") {
    return `
EMERGENCY SAFETY GUIDANCE:
- Potential safety concern detected (${signalText}).
- Use calm, non-alarmist wording.
- Lead with a safety-first recommendation such as: "Given the risk profile, prompt in-person clinical assessment is recommended."
- Reserve hard directives ("Call 911 now" / "Go to the emergency department immediately") for clear immediate-danger patterns.
- Provide concise red-flag triggers for escalation and next-step stabilization priorities.
`.trim()
  }
  return `
EMERGENCY ESCALATION OVERRIDE:
- Emergency intent detected (${signalText}).
- In your final answer, include a direct escalation sentence using explicit wording such as:
  - "Call 911 now."
  - "Go to the emergency department immediately."
- Keep escalation clinically specific and place it near the top of the response.
- After escalation, provide concise stabilization priorities while deferring definitive care to in-person emergency evaluation.
`.trim()
}

const GUIDELINE_INTENT_PATTERN =
  /\b(guideline|guidelines|recommendation|consensus|position statement|evidence-based|first-line|society guidance|practice standard)\b/i
const STRICT_MIN_CITATION_FLOOR = 8
const STRICT_MIN_GUIDELINE_CITATIONS = 1
const FANOUT_TARGET_SOURCES_BALANCED = 5
const FANOUT_TARGET_SOURCES_FRESH = 6
const FANOUT_SOURCE_DIVERSITY_FLOOR = 3
const FANOUT_PER_TOOL_TIMEOUT_MS = 8_000
const FANOUT_TOTAL_BUDGET_MS = 14_000
const FANOUT_TOTAL_BUDGET_FRESH_MS = 18_000
const FANOUT_MAX_TOOL_STEPS = 6
const FANOUT_MAX_TOOL_STEPS_FRESH = 8
const ENABLE_GUIDELINE_DIAGNOSTICS = process.env.GUIDELINE_DIAGNOSTICS === "true"

function logGuidelineDiagnostics(event: string, payload: Record<string, unknown>) {
  if (!ENABLE_GUIDELINE_DIAGNOSTICS) return
  console.log(`[GUIDELINE_DIAGNOSTICS] ${event}`, payload)
}

function hasGuidelineIntent(query: string): boolean {
  const normalized = query.trim()
  if (!normalized) return false
  return GUIDELINE_INTENT_PATTERN.test(normalized)
}

function buildGuidelineQueryVariants(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return []
  const lower = normalized.toLowerCase()
  const variants = new Set<string>([normalized])
  if (!/\bguideline|recommendation|consensus\b/i.test(lower)) {
    variants.add(`${normalized} guideline`)
  }
  if (!/\bevidence\b/i.test(lower)) {
    variants.add(`${normalized} evidence based guideline`)
  }
  if (!/\bpractice\b/i.test(lower)) {
    variants.add(`${normalized} clinical practice recommendation`)
  }
  return Array.from(variants).slice(0, 4)
}

function buildGuidelineEscalationQueries(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return []
  const baseVariants = buildGuidelineQueryVariants(normalized)
  const expanded = new Set<string>(baseVariants)

  const acronymExpanded = normalized
    .replace(/\bESC\b/gi, "European Society of Cardiology")
    .replace(/\bNICE\b/gi, "National Institute for Health and Care Excellence")
    .replace(/\bACC\b/gi, "American College of Cardiology")
    .replace(/\bAHA\b/gi, "American Heart Association")
    .replace(/\bHFpEF\b/gi, "heart failure with preserved ejection fraction")
    .replace(/\bHFrEF\b/gi, "heart failure with reduced ejection fraction")
    .replace(/\bSGLT2i\b/gi, "SGLT2 inhibitor")
    .replace(/\bMI\b/gi, "myocardial infarction")
  if (acronymExpanded !== normalized) {
    expanded.add(acronymExpanded)
    expanded.add(`${acronymExpanded} guideline`)
  }

  if (/\b(esc|european society of cardiology)\b/i.test(normalized)) {
    expanded.add("European Society of Cardiology Heart Failure Guidelines 2024")
  }
  if (/\b(nice|national institute for health and care excellence)\b/i.test(normalized)) {
    expanded.add("NICE heart failure guideline recommendations")
  }
  if (/\bheart failure|hfpef|hfr?ef\b/i.test(normalized)) {
    expanded.add("heart failure clinical practice guideline recommendations")
    expanded.add("SGLT2i heart failure recommendations")
  }

  expanded.add(`${normalized} guideline summary`)
  expanded.add(`${normalized} society recommendations`)

  return Array.from(expanded)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
    .slice(0, 8)
}

function hasGuidelineCitationSignal(citations: EvidenceCitation[]): boolean {
  return citations.some((citation) =>
    /\b(guideline|recommendation|consensus|practice guideline|position statement|uspstf|acc|aha|idsa|nccn|acog)\b/i.test(
      `${citation.title || ""} ${citation.journal || ""} ${citation.studyType || ""}`
    )
  )
}

function citationSourceKey(citation: EvidenceCitation): string {
  let hostname = ""
  if (citation.url) {
    try {
      hostname = new URL(citation.url).hostname
    } catch {
      hostname = citation.url
    }
  }
  return (
    citation.sourceType ||
    citation.journal ||
    hostname ||
    "unknown"
  )
    .toString()
    .toLowerCase()
}

function estimateCitationRecencyScore(citation: EvidenceCitation): number {
  const nowYear = new Date().getUTCFullYear()
  const yearValue = typeof citation.year === "number" ? citation.year : Number(citation.year)
  if (!Number.isFinite(yearValue) || yearValue <= 1900) return 0
  const age = Math.max(0, nowYear - yearValue)
  if (age <= 1) return 1
  if (age <= 3) return 0.75
  if (age <= 5) return 0.45
  if (age <= 8) return 0.25
  return 0.1
}

function dedupeFigureReferences(
  references: EvidenceCitation["figureReferences"]
): EvidenceCitation["figureReferences"] {
  if (!Array.isArray(references) || references.length === 0) return []
  const byKey = new Map<string, NonNullable<EvidenceCitation["figureReferences"]>[number]>()
  for (const reference of references) {
    if (!reference) continue
    const key =
      reference.assetId ||
      reference.filePath ||
      `${reference.type || "figure"}:${reference.label || "asset"}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, reference)
      continue
    }
    byKey.set(key, {
      ...existing,
      ...reference,
      signedUrl: reference.signedUrl || existing.signedUrl || null,
      fullUrl: reference.fullUrl || existing.fullUrl || null,
      filePath: reference.filePath || existing.filePath || null,
      storageBucket: reference.storageBucket || existing.storageBucket || null,
    })
  }
  return Array.from(byKey.values())
}

function mergeCitationVisuals(
  existing: EvidenceCitation,
  incoming: EvidenceCitation
): Pick<EvidenceCitation, "previewReference" | "figureReferences"> {
  const incomingPreview = incoming.previewReference
  const existingPreview = existing.previewReference
  const incomingHasPreviewSignal = Boolean(
    incomingPreview?.filePath || incomingPreview?.signedUrl || incomingPreview?.assetId
  )
  const previewReference = incomingHasPreviewSignal
    ? incomingPreview
    : existingPreview || incomingPreview || null
  const figureReferences = dedupeFigureReferences([
    ...(existing.figureReferences || []),
    ...(incoming.figureReferences || []),
  ])
  return {
    previewReference,
    figureReferences,
  }
}

function normalizeTitleForDedup(title: string | undefined | null): string {
  if (!title) return ""
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const na = normalizeTitleForDedup(a)
  const nb = normalizeTitleForDedup(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0
  const tokensA = new Set(na.split(" ").filter(t => t.length > 2))
  const tokensB = new Set(nb.split(" ").filter(t => t.length > 2))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let overlap = 0
  for (const t of tokensA) if (tokensB.has(t)) overlap++
  return (2 * overlap) / (tokensA.size + tokensB.size)
}

function dedupeAndReindexCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const citationMetadataScore = (citation: EvidenceCitation): number => {
    let score = 0
    if (citation.title?.trim()) score += 3
    if (citation.journal?.trim()) score += 2
    if (citation.url?.trim()) score += 3
    if (citation.pmid?.trim()) score += 2
    if (citation.doi?.trim()) score += 1
    if (citation.sourceLabel?.trim()) score += 2
    if (citation.sourceType?.trim()) score += 1
    if (citation.studyType?.trim()) score += 1
    if (citation.snippet?.trim()) score += 1
    if (citation.sourceId?.trim()) score += 2
    if (Array.isArray(citation.authors) && citation.authors.length > 0) score += 1
    if (
      citation.previewReference?.filePath ||
      citation.previewReference?.signedUrl ||
      citation.previewReference?.assetId
    ) {
      score += 3
    }
    if (Array.isArray(citation.figureReferences) && citation.figureReferences.length > 0) {
      score += Math.min(4, citation.figureReferences.length)
    }
    return score
  }

  const deduped = new Map<string, EvidenceCitation>()
  const doiIndex = new Map<string, string>()
  const titleIndex = new Map<string, string>()

  const mergeInto = (key: string, normalizedCitation: EvidenceCitation) => {
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, normalizedCitation)
      return
    }
    const existingScore = citationMetadataScore(existing)
    const incomingScore = citationMetadataScore(normalizedCitation)
    const mergedVisuals = mergeCitationVisuals(existing, normalizedCitation)
    if (incomingScore >= existingScore) {
      deduped.set(key, { ...existing, ...normalizedCitation, ...mergedVisuals, sourceId: key })
    } else {
      deduped.set(key, { ...normalizedCitation, ...existing, ...mergedVisuals, sourceId: key })
    }
  }

  citations.forEach((citation) => {
    const normalizedCitation: EvidenceCitation = {
      ...citation,
      sourceId: buildEvidenceSourceId(citation),
    }
    const key =
      normalizedCitation.sourceId ||
      normalizedCitation.pmid ||
      normalizedCitation.doi ||
      normalizedCitation.url ||
      `${normalizedCitation.title || "untitled"}:${normalizedCitation.journal || "unknown"}`

    // DOI-based dedup: merge if same DOI already seen under a different key
    const doi = normalizedCitation.doi?.trim().toLowerCase()
    if (doi) {
      const existingKeyForDoi = doiIndex.get(doi)
      if (existingKeyForDoi && existingKeyForDoi !== key) {
        mergeInto(existingKeyForDoi, normalizedCitation)
        return
      }
      doiIndex.set(doi, key)
    }

    // Title similarity dedup: merge if a very similar title exists
    const normTitle = normalizeTitleForDedup(normalizedCitation.title)
    if (normTitle.length > 20) {
      for (const [existingTitle, existingKey] of titleIndex) {
        if (existingKey !== key && titleSimilarity(normTitle, existingTitle) > 0.85) {
          mergeInto(existingKey, normalizedCitation)
          return
        }
      }
      titleIndex.set(normTitle, key)
    }

    mergeInto(key, normalizedCitation)
  })
  return Array.from(deduped.values()).map((citation, index) => ({
    ...citation,
    index: index + 1,
    sourceId: buildEvidenceSourceId(citation),
  }))
}

function citationsFromProvenance(provenance: SourceProvenance[]): EvidenceCitation[] {
  if (!Array.isArray(provenance) || provenance.length === 0) return []
  return dedupeAndReindexCitations(
    provenance.map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
  )
}

function citationsFromToolResult(result: unknown): EvidenceCitation[] {
  if (!result || typeof result !== "object") return []
  const candidate = result as Record<string, unknown>
  if (Array.isArray(candidate.provenance)) {
    return citationsFromProvenance(candidate.provenance as SourceProvenance[])
  }
  if (Array.isArray(candidate.citations)) {
    return dedupeAndReindexCitations(candidate.citations as EvidenceCitation[])
  }
  if (Array.isArray(candidate.results)) {
    return dedupeAndReindexCitations(candidate.results as EvidenceCitation[])
  }
  return []
}

function rankCitationsForQuery(
  citations: EvidenceCitation[],
  queryText: string,
  options?: {
    guidelinePriority?: boolean
    recencyPriority?: boolean
  }
): EvidenceCitation[] {
  return citations
    .map((citation) => {
      const text = `${citation.title || ""} ${citation.snippet || ""} ${citation.journal || ""} ${citation.studyType || ""}`
      const overlapScore = computeKeywordOverlapScore(queryText, text)
      const evidenceLevel =
        typeof citation.evidenceLevel === "number" ? citation.evidenceLevel : 5
      const evidenceBoost = Math.max(0, 6 - evidenceLevel) * 0.1
      const guidelineBoost = /\b(guideline|recommendation|consensus|statement)\b/i.test(
        `${citation.title || ""} ${citation.studyType || ""}`
      )
        ? options?.guidelinePriority
          ? 0.45
          : 0.3
        : 0
      const recencyBoost = estimateCitationRecencyScore(citation) * (options?.recencyPriority ? 0.35 : 0.2)
      const score = overlapScore * 0.65 + evidenceBoost + guidelineBoost + recencyBoost
      return { citation, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.citation)
}

function filterLowRelevanceCitations(
  citations: EvidenceCitation[],
  queryText: string,
  minimumKeep: number = 6
): EvidenceCitation[] {
  const filtered = citations.filter((citation) => {
    const text = `${citation.title || ""} ${citation.snippet || ""} ${citation.journal || ""}`
    const overlap = computeKeywordOverlapScore(queryText, text)
    return overlap >= 0.18
  })
  return filtered.length >= minimumKeep ? filtered : citations
}

function ensureCitationFloor(
  selected: EvidenceCitation[],
  rankedPool: EvidenceCitation[],
  minCount: number
): EvidenceCitation[] {
  if (selected.length >= minCount) return selected
  const dedupedKeys = new Set(
    selected.map(
      (citation) =>
        citation.pmid ||
        citation.doi ||
        citation.url ||
        `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    )
  )
  const expanded = [...selected]
  for (const citation of rankedPool) {
    if (expanded.length >= minCount) break
    const key =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    if (!dedupedKeys.has(key)) {
      dedupedKeys.add(key)
      expanded.push(citation)
    }
  }
  return expanded
}

function ensureCitationSourceDiversity(
  selected: EvidenceCitation[],
  rankedPool: EvidenceCitation[],
  minimumSources: number
): EvidenceCitation[] {
  if (minimumSources <= 1) return selected
  const result = [...selected]
  const selectedKeys = new Set(
    result.map(
      (citation) =>
        citation.pmid ||
        citation.doi ||
        citation.url ||
        `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    )
  )
  const sourceSet = new Set(result.map((citation) => citationSourceKey(citation)))
  if (sourceSet.size >= minimumSources) return result

  for (const citation of rankedPool) {
    if (sourceSet.size >= minimumSources) break
    const recordKey =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    if (selectedKeys.has(recordKey)) continue
    const sourceKey = citationSourceKey(citation)
    if (!sourceSet.has(sourceKey)) {
      selectedKeys.add(recordKey)
      sourceSet.add(sourceKey)
      result.push(citation)
    }
  }
  return result
}

function ensureGuidelineCitations(
  selected: EvidenceCitation[],
  rankedPool: EvidenceCitation[],
  minimumGuidelineCount: number = 1
): EvidenceCitation[] {
  const currentGuidelineCount = selected.filter((citation) =>
    /\b(guideline|recommendation|consensus|practice guideline|position statement|uspstf|acc|aha|idsa|nccn|acog)\b/i.test(
      `${citation.title || ""} ${citation.journal || ""} ${citation.studyType || ""}`
    )
  ).length
  if (currentGuidelineCount >= minimumGuidelineCount) return selected

  const guidelineCandidates = rankedPool.filter((citation) =>
    /\b(guideline|recommendation|consensus|practice guideline|position statement|uspstf|acc|aha|idsa|nccn|acog)\b/i.test(
      `${citation.title || ""} ${citation.journal || ""} ${citation.studyType || ""}`
    )
  )
  if (guidelineCandidates.length === 0) return selected

  const result = [...selected]
  const dedupedKeys = new Set(
    result.map(
      (citation) =>
        citation.pmid ||
        citation.doi ||
        citation.url ||
        `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    )
  )
  for (const citation of guidelineCandidates) {
    const key =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    if (!dedupedKeys.has(key)) {
      dedupedKeys.add(key)
      result.unshift(citation)
    }
    const guidelineCount = result.filter((item) =>
      /\b(guideline|recommendation|consensus|practice guideline|position statement|uspstf|acc|aha|idsa|nccn|acog)\b/i.test(
        `${item.title || ""} ${item.journal || ""} ${item.studyType || ""}`
      )
    ).length
    if (guidelineCount >= minimumGuidelineCount) break
  }

  return result
}

function encodeEvidenceCitationsHeader(
  citations: EvidenceCitation[],
  maxEncodedLength: number = 20000
): string | null {
  if (!Array.isArray(citations) || citations.length === 0) return null

  const compactVisualReference = (reference: EvidenceCitation["previewReference"]) => {
    if (!reference) return null
    return {
      assetId: reference.assetId,
      type: reference.type,
      label: reference.label,
      caption:
        typeof reference.caption === "string" && reference.caption.length > 220
          ? `${reference.caption.slice(0, 217)}...`
          : reference.caption || null,
      signedUrl: reference.signedUrl || null,
      fullUrl: reference.fullUrl || null,
      contentType: reference.contentType || null,
      width: reference.width ?? null,
      height: reference.height ?? null,
      storageBucket: reference.storageBucket || null,
      filePath: reference.filePath || null,
    }
  }

  const compact = (items: EvidenceCitation[]) =>
    items.map((citation) => ({
      index: citation.index,
      sourceId: citation.sourceId,
      title: citation.title,
      journal: citation.journal,
      authors: Array.isArray(citation.authors) ? citation.authors : [],
      year: citation.year,
      evidenceLevel: citation.evidenceLevel,
      studyType: citation.studyType,
      url: citation.url,
      doi: citation.doi,
      pmid: citation.pmid,
      pmcid: citation.pmcid,
      meshTerms: Array.isArray(citation.meshTerms) ? citation.meshTerms : [],
      sourceType: citation.sourceType,
      sourceLabel: citation.sourceLabel,
      pageLabel: citation.pageLabel,
      uploadId: citation.uploadId,
      chunkId: citation.chunkId,
      sourceUnitId: citation.sourceUnitId,
      sourceUnitType: citation.sourceUnitType,
      sourceUnitNumber: citation.sourceUnitNumber,
      sourceOffsetStart: citation.sourceOffsetStart,
      sourceOffsetEnd: citation.sourceOffsetEnd,
      snippet:
        typeof citation.snippet === "string" ? citation.snippet.slice(0, 220) : "",
      previewReference: compactVisualReference(citation.previewReference || null),
      figureReferences: (citation.figureReferences || [])
        .slice(0, 2)
        .map((reference) => compactVisualReference(reference))
        .filter(Boolean),
    }))

  let candidate = [...citations]
  while (candidate.length > 0) {
    const payload = JSON.stringify(compact(candidate))
    const encoded = Buffer.from(payload).toString("base64")
    if (encoded.length <= maxEncodedLength) {
      return encoded
    }
    candidate = candidate.slice(0, candidate.length - 1)
  }

  return null
}

async function fetchGuidelineFallbackCitations(
  queryText: string,
  maxResults: number
): Promise<EvidenceCitation[]> {
  const startedAt = performance.now()
  const variants = buildGuidelineQueryVariants(queryText)
  const collected: EvidenceCitation[] = []
  const relaxedCollected: EvidenceCitation[] = []
  const variantDiagnostics: Array<{
    variant: string
    rawProvenanceCount: number
    qualityPassedCount: number
    relevancePassedCount: number
    rejectedByQualityReasons: string[]
  }> = []
  for (const variant of variants) {
    const guidelineResult = await searchGuidelines(variant, maxResults, "US")
    if (!guidelineResult.provenance.length) continue
    relaxedCollected.push(
      ...guidelineResult.provenance.map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
    )
    const qualityEvaluations = guidelineResult.provenance.map((item) => ({
      item,
      quality: evaluateProvenanceQuality(item, queryText),
    }))
    const qualityPassed = qualityEvaluations.filter((entry) => entry.quality.passed)
    const rejectedByQualityReasons = qualityEvaluations
      .filter((entry) => !entry.quality.passed)
      .flatMap((entry) => entry.quality.reasons || [])
    const relevancePassed = qualityPassed.filter((entry) =>
      isTextRelevantToClinicalQuery(
        `${entry.item.title || ""} ${entry.item.journal || ""} ${entry.item.snippet || ""}`,
        queryText
      )
    )
    const filtered = relevancePassed
      .map((entry) => entry.item)
      .map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
    variantDiagnostics.push({
      variant,
      rawProvenanceCount: guidelineResult.provenance.length,
      qualityPassedCount: qualityPassed.length,
      relevancePassedCount: relevancePassed.length,
      rejectedByQualityReasons: Array.from(new Set(rejectedByQualityReasons)).slice(0, 8),
    })
    if (filtered.length > 0) {
      collected.push(...filtered)
    }
    if (collected.length >= maxResults) break
  }
  logGuidelineDiagnostics("guideline_fallback_citations", {
    queryText,
    maxResults,
    elapsedMs: Math.round(performance.now() - startedAt),
    variants: variantDiagnostics,
    strictCollectedCount: collected.length,
    relaxedCollectedCount: relaxedCollected.length,
  })
  if (collected.length > 0) {
    return dedupeAndReindexCitations(collected).slice(0, maxResults)
  }
  // Relaxed fallback for sparse guideline responses in strict mode / guideline-priority queries.
  return dedupeAndReindexCitations(relaxedCollected).slice(0, maxResults)
}

function buildBenchStrictPrompt(params: {
  citationCount: number
  requiresEscalation: boolean
  requiresGuideline: boolean
  allowBibliography?: boolean
}): string {
  const { citationCount, requiresEscalation, requiresGuideline, allowBibliography = false } = params
  const citationRange = citationCount > 0 ? `1-${citationCount}` : "1"
  return [
    "BENCH STRONG-ENFORCEMENT MODE:",
    "- Keep the answer concise and factual (no filler, no marketing tone).",
    "- Every factual sentence must end with citation markers using only bracket indices.",
    `- Use citation indices strictly within [${citationRange}] and never use PMID/DOI numbers as bracket citations.`,
    allowBibliography
      ? "- Include a structured references section at the end of generated document artifacts."
      : "- Do NOT include a trailing references bibliography, 'tool-derived evidence', or any manual citation list.",
    "- If you cannot support a claim with available evidence indices, rewrite the claim conservatively instead of inventing citations.",
    "- Avoid long introductory framing; start directly with clinical guidance.",
    requiresEscalation
      ? '- First line must include explicit emergency escalation language: "Call 911 now." or "Go to the emergency department immediately."'
      : "- Do not include emergency directives unless clinically indicated.",
    requiresGuideline
      ? "- Include at least one formal guideline-backed recommendation citation."
      : "- Prefer high-evidence sources (guidelines, meta-analyses, RCTs) when available.",
  ].join("\n")
}

const MEDICAL_QUERY_STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "into",
  "about",
  "what",
  "when",
  "where",
  "which",
  "that",
  "this",
  "these",
  "those",
  "workup",
  "evaluation",
  "review",
  "adult",
  "adults",
  "patient",
  "patients",
])

function extractClinicalQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(
      (term) =>
        term.length >= 3 &&
        !MEDICAL_QUERY_STOP_WORDS.has(term) &&
        !/^\d+$/.test(term)
    )
}

function buildFocusedPubMedQuery(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return query
  const terms = extractClinicalQueryTerms(normalized).slice(0, 4)
  if (terms.length === 0) return normalized

  const publicationClauses: string[] = []
  if (/\bmeta-analysis|meta analysis\b/i.test(normalized)) {
    publicationClauses.push(`("Meta-Analysis"[Publication Type] OR "meta-analysis"[Title])`)
  }
  if (/\bsystematic review\b/i.test(normalized)) {
    publicationClauses.push(`("Systematic Review"[Title] OR systematic review[Title/Abstract])`)
  }
  if (/\bguideline|guidelines|recommendation|consensus|statement\b/i.test(normalized)) {
    publicationClauses.push(
      `("Guideline"[Publication Type] OR "Practice Guideline"[Publication Type] OR guideline[Title] OR guidelines[Title] OR recommendation[Title/Abstract] OR consensus[Title/Abstract])`
    )
  }
  if (/\bevidence-based|evidence based\b/i.test(normalized)) {
    publicationClauses.push(`("evidence-based"[Title/Abstract] OR "evidence based"[Title/Abstract])`)
  }

  const coreQuery = terms.map((term) => `${term}[Title/Abstract]`).join(" AND ")
  if (publicationClauses.length === 0) {
    return coreQuery
  }
  return `${coreQuery} AND ${publicationClauses.join(" AND ")}`
}

function buildPubMedQueryStrategies(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return [query]

  const strategies = new Set<string>([normalized])
  const lower = normalized.toLowerCase()

  if (!/\bguideline|guidelines|recommendation|consensus|statement\b/i.test(lower)) {
    strategies.add(`${normalized} guideline`)
  }
  if (/\bmeta-analysis|meta analysis\b/i.test(lower)) {
    strategies.add(`${normalized} "Meta-Analysis"[Publication Type]`)
  }
  if (/\bsystematic review\b/i.test(lower)) {
    strategies.add(`${normalized} systematic review`)
  }

  strategies.add(buildFocusedPubMedQuery(normalized))
  return Array.from(strategies).filter((candidate) => candidate.trim().length > 0).slice(0, 5)
}

function buildEvidenceParityQueries(query: string): string[] {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) return []

  const compactTerms = extractClinicalQueryTerms(normalized)
    .filter((term) => !term.includes("_") && /[a-z]/i.test(term))
    .slice(0, 7)
  const termDrivenQuery = compactTerms.join(" ").trim()
  const baseQuery = termDrivenQuery.length >= 8 ? termDrivenQuery : normalized
  const queries = new Set<string>([baseQuery])

  queries.add(`${baseQuery} clinical trial evidence`)
  queries.add(`${baseQuery} guideline summary`)

  if (
    !/\bclinical trial|randomized|guideline|meta-analysis|systematic review\b/i.test(baseQuery)
  ) {
    queries.add(`${baseQuery} randomized trial guideline`)
  }

  if (baseQuery !== normalized) {
    queries.add(normalized)
  }

  return Array.from(queries)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0)
    .slice(0, 5)
}

function computeKeywordOverlapScore(query: string, text: string): number {
  const terms = extractClinicalQueryTerms(query)
  if (terms.length === 0) return 0
  const haystack = text.toLowerCase()
  const matches = terms.filter((term) => haystack.includes(term)).length
  return matches / terms.length
}

function isTextRelevantToClinicalQuery(text: string, query: string): boolean {
  const terms = extractClinicalQueryTerms(query)
  if (terms.length === 0) return true

  const haystack = text.toLowerCase()
  const matchCount = terms.filter((term) => haystack.includes(term)).length
  const minMatches = Math.min(2, Math.max(1, Math.ceil(terms.length * 0.34)))
  return matchCount >= minMatches
}

function normalizeTopicContext(input: unknown): TopicContext | undefined {
  if (!input || typeof input !== "object") return undefined
  const candidate = input as Record<string, unknown>
  const recentPages = Array.isArray(candidate.recentPages)
    ? candidate.recentPages
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(0, 6)
    : []
  const recentEvidenceIds = Array.isArray(candidate.recentEvidenceIds)
    ? candidate.recentEvidenceIds
        .map((value) => String(value))
        .filter(Boolean)
        .slice(0, 10)
    : []
  const lastRetrievalWarnings = Array.isArray(candidate.lastRetrievalWarnings)
    ? candidate.lastRetrievalWarnings
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 8)
    : []
  const pendingArtifactStructureTopics = Array.isArray(candidate.pendingArtifactStructureTopics)
    ? candidate.pendingArtifactStructureTopics
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 10)
    : []
  const pendingQuizTopicOptions = Array.isArray(candidate.pendingQuizTopicOptions)
    ? candidate.pendingQuizTopicOptions
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 6)
    : []
  const pendingArtifactTopicOptions = Array.isArray(candidate.pendingArtifactTopicOptions)
    ? candidate.pendingArtifactTopicOptions
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 6)
    : pendingQuizTopicOptions
  const pendingArtifactTopicSelection =
    candidate.pendingArtifactTopicSelection === true ||
    candidate.pendingQuizTopicSelection === true
  const pendingArtifactIntentRaw =
    typeof candidate.pendingArtifactIntent === "string"
      ? candidate.pendingArtifactIntent.trim().toLowerCase()
      : ""
  const pendingArtifactIntent =
    pendingArtifactIntentRaw === "quiz"
      ? "quiz"
      : candidate.pendingQuizTopicSelection === true
        ? "quiz"
        : null
  const pendingArtifactOriginalQuery =
    typeof candidate.pendingArtifactOriginalQuery === "string"
      ? candidate.pendingArtifactOriginalQuery.trim().slice(0, 240)
      : typeof candidate.pendingQuizOriginalQuery === "string"
        ? candidate.pendingQuizOriginalQuery.trim().slice(0, 240)
        : null
  const pendingArtifactRequestedAt =
    typeof candidate.pendingArtifactRequestedAt === "string" &&
    candidate.pendingArtifactRequestedAt.trim().length > 0
      ? candidate.pendingArtifactRequestedAt.trim()
      : typeof candidate.pendingQuizRequestedAt === "string" &&
          candidate.pendingQuizRequestedAt.trim().length > 0
        ? candidate.pendingQuizRequestedAt.trim()
        : null
  const pendingArtifactRefinementChoices = Array.isArray(
    candidate.pendingArtifactRefinementChoices
  )
    ? candidate.pendingArtifactRefinementChoices
        .filter(
          (value): value is {
            id: string
            label: string
            submitText: string
            requiresCustomInput?: boolean
          } =>
            Boolean(
              value &&
                typeof value === "object" &&
                typeof (value as any).id === "string" &&
                typeof (value as any).label === "string" &&
                typeof (value as any).submitText === "string"
            )
        )
        .map((value) => ({
          id: value.id.trim().slice(0, 8),
          label: value.label.trim().slice(0, 140),
          submitText: value.submitText.trim().slice(0, 400),
          requiresCustomInput: value.requiresCustomInput === true,
        }))
        .slice(0, 5)
    : []
  const pendingArtifactRequiredFields = Array.isArray(candidate.pendingArtifactRequiredFields)
    ? candidate.pendingArtifactRequiredFields
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 6)
    : []
  const pendingArtifactCustomInputPlaceholder =
    typeof candidate.pendingArtifactCustomInputPlaceholder === "string"
      ? candidate.pendingArtifactCustomInputPlaceholder.trim().slice(0, 220)
      : null

  return {
    activeTopic:
      typeof candidate.activeTopic === "string" && candidate.activeTopic.trim().length > 0
        ? candidate.activeTopic.trim()
        : null,
    lastUploadId:
      typeof candidate.lastUploadId === "string" && candidate.lastUploadId.trim().length > 0
        ? candidate.lastUploadId.trim()
        : null,
    recentPages,
    recentEvidenceIds,
    lastRetrievalConfidence:
      candidate.lastRetrievalConfidence === "high" ||
      candidate.lastRetrievalConfidence === "medium" ||
      candidate.lastRetrievalConfidence === "low"
        ? candidate.lastRetrievalConfidence
        : undefined,
    lastRetrievalFallbackReason:
      typeof candidate.lastRetrievalFallbackReason === "string" &&
      candidate.lastRetrievalFallbackReason.trim().length > 0
        ? candidate.lastRetrievalFallbackReason.trim().slice(0, 80)
        : null,
    lastRetrievalWarnings,
    pendingArtifactStage:
      candidate.pendingArtifactStage === "inspect" ||
      candidate.pendingArtifactStage === "refine" ||
      candidate.pendingArtifactStage === "generate"
        ? candidate.pendingArtifactStage
        : null,
    pendingArtifactStructureInspected:
      candidate.pendingArtifactStructureInspected === true,
    pendingArtifactStructureConfidence:
      candidate.pendingArtifactStructureConfidence === "high" ||
      candidate.pendingArtifactStructureConfidence === "medium" ||
      candidate.pendingArtifactStructureConfidence === "low"
        ? candidate.pendingArtifactStructureConfidence
        : null,
    pendingArtifactStructureTopics,
    followUpType:
      typeof candidate.followUpType === "string"
        ? (candidate.followUpType as TopicContext["followUpType"])
        : "unknown",
    pendingArtifactTopicSelection,
    pendingArtifactRefinement:
      candidate.pendingArtifactRefinement === true || pendingArtifactTopicSelection,
    pendingArtifactRefinementChoices,
    pendingArtifactRequiredFields,
    pendingArtifactCustomInputPlaceholder,
    pendingArtifactTopicOptions,
    pendingArtifactIntent,
    pendingArtifactOriginalQuery,
    pendingArtifactRequestedAt,
    pendingQuizTopicSelection:
      candidate.pendingQuizTopicSelection === true ||
      (pendingArtifactTopicSelection && pendingArtifactIntent === "quiz"),
    pendingQuizTopicOptions:
      pendingQuizTopicOptions.length > 0
        ? pendingQuizTopicOptions
        : pendingArtifactIntent === "quiz"
          ? pendingArtifactTopicOptions
          : [],
    pendingQuizOriginalQuery:
      typeof candidate.pendingQuizOriginalQuery === "string"
        ? candidate.pendingQuizOriginalQuery.trim().slice(0, 240)
        : pendingArtifactIntent === "quiz"
          ? pendingArtifactOriginalQuery
          : null,
    pendingQuizRequestedAt:
      typeof candidate.pendingQuizRequestedAt === "string" &&
      candidate.pendingQuizRequestedAt.trim().length > 0
        ? candidate.pendingQuizRequestedAt.trim()
        : pendingArtifactIntent === "quiz"
          ? pendingArtifactRequestedAt
          : null,
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

function isEphemeralChatId(chatId: string): boolean {
  return (
    chatId === "temp" ||
    chatId.startsWith("temp-chat-") ||
    chatId.startsWith("benchmark-")
  )
}

async function assertChatOwnership(params: {
  supabase: Awaited<ReturnType<typeof validateAndTrackUsage>>
  chatId: string
  userId: string
}): Promise<void> {
  const { supabase, chatId, userId } = params
  if (!supabase || isEphemeralChatId(chatId)) return

  const { data: chat, error } = await supabase
    .from("chats")
    .select("id, user_id")
    .eq("id", chatId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to verify chat ownership: ${error.message}`)
  }
  if (!chat || chat.user_id !== userId) {
    throw new Error("Chat ownership verification failed")
  }
}

function mergeTopicContexts(
  baseContext: TopicContext | undefined,
  overrideContext: TopicContext | undefined
): TopicContext | undefined {
  if (!baseContext && !overrideContext) return undefined
  const pendingArtifactTopicSelection =
    overrideContext?.pendingArtifactTopicSelection ??
    baseContext?.pendingArtifactTopicSelection ??
    overrideContext?.pendingQuizTopicSelection ??
    baseContext?.pendingQuizTopicSelection ??
    false
  const pendingArtifactIntent =
    overrideContext?.pendingArtifactIntent ??
    baseContext?.pendingArtifactIntent ??
    (overrideContext?.pendingQuizTopicSelection || baseContext?.pendingQuizTopicSelection
      ? "quiz"
      : null)
  const pendingArtifactTopicOptions =
    overrideContext?.pendingArtifactTopicOptions &&
    overrideContext.pendingArtifactTopicOptions.length > 0
      ? overrideContext.pendingArtifactTopicOptions
      : baseContext?.pendingArtifactTopicOptions &&
          baseContext.pendingArtifactTopicOptions.length > 0
        ? baseContext.pendingArtifactTopicOptions
        : overrideContext?.pendingQuizTopicOptions &&
            overrideContext.pendingQuizTopicOptions.length > 0
          ? overrideContext.pendingQuizTopicOptions
          : baseContext?.pendingQuizTopicOptions ?? []
  const pendingArtifactOriginalQuery =
    overrideContext?.pendingArtifactOriginalQuery ??
    baseContext?.pendingArtifactOriginalQuery ??
    overrideContext?.pendingQuizOriginalQuery ??
    baseContext?.pendingQuizOriginalQuery ??
    null
  const pendingArtifactRequestedAt =
    overrideContext?.pendingArtifactRequestedAt ??
    baseContext?.pendingArtifactRequestedAt ??
    overrideContext?.pendingQuizRequestedAt ??
    baseContext?.pendingQuizRequestedAt ??
    null
  const pendingArtifactRefinementChoices =
    overrideContext?.pendingArtifactRefinementChoices &&
    overrideContext.pendingArtifactRefinementChoices.length > 0
      ? overrideContext.pendingArtifactRefinementChoices
      : baseContext?.pendingArtifactRefinementChoices ?? []
  const pendingArtifactRequiredFields =
    overrideContext?.pendingArtifactRequiredFields &&
    overrideContext.pendingArtifactRequiredFields.length > 0
      ? overrideContext.pendingArtifactRequiredFields
      : baseContext?.pendingArtifactRequiredFields ?? []
  const pendingArtifactCustomInputPlaceholder =
    overrideContext?.pendingArtifactCustomInputPlaceholder ??
    baseContext?.pendingArtifactCustomInputPlaceholder ??
    null

  return {
    activeTopic: overrideContext?.activeTopic ?? baseContext?.activeTopic ?? null,
    lastUploadId: overrideContext?.lastUploadId ?? baseContext?.lastUploadId ?? null,
    recentPages:
      overrideContext?.recentPages && overrideContext.recentPages.length > 0
        ? overrideContext.recentPages
        : baseContext?.recentPages ?? [],
    recentEvidenceIds:
      overrideContext?.recentEvidenceIds && overrideContext.recentEvidenceIds.length > 0
        ? overrideContext.recentEvidenceIds
        : baseContext?.recentEvidenceIds ?? [],
    lastRetrievalConfidence:
      overrideContext?.lastRetrievalConfidence ??
      baseContext?.lastRetrievalConfidence ??
      undefined,
    lastRetrievalFallbackReason:
      overrideContext?.lastRetrievalFallbackReason ??
      baseContext?.lastRetrievalFallbackReason ??
      null,
    lastRetrievalWarnings:
      overrideContext?.lastRetrievalWarnings &&
      overrideContext.lastRetrievalWarnings.length > 0
        ? overrideContext.lastRetrievalWarnings
        : baseContext?.lastRetrievalWarnings ?? [],
    pendingArtifactStage:
      overrideContext?.pendingArtifactStage ??
      baseContext?.pendingArtifactStage ??
      null,
    pendingArtifactStructureInspected:
      overrideContext?.pendingArtifactStructureInspected ??
      baseContext?.pendingArtifactStructureInspected ??
      false,
    pendingArtifactStructureConfidence:
      overrideContext?.pendingArtifactStructureConfidence ??
      baseContext?.pendingArtifactStructureConfidence ??
      null,
    pendingArtifactStructureTopics:
      overrideContext?.pendingArtifactStructureTopics &&
      overrideContext.pendingArtifactStructureTopics.length > 0
        ? overrideContext.pendingArtifactStructureTopics
        : baseContext?.pendingArtifactStructureTopics ?? [],
    followUpType: overrideContext?.followUpType ?? baseContext?.followUpType ?? "unknown",
    pendingArtifactTopicSelection,
    pendingArtifactRefinement:
      overrideContext?.pendingArtifactRefinement ??
      baseContext?.pendingArtifactRefinement ??
      pendingArtifactTopicSelection,
    pendingArtifactRefinementChoices,
    pendingArtifactRequiredFields,
    pendingArtifactCustomInputPlaceholder,
    pendingArtifactTopicOptions,
    pendingArtifactIntent,
    pendingArtifactOriginalQuery,
    pendingArtifactRequestedAt,
    pendingQuizTopicSelection:
      pendingArtifactIntent === "quiz" ? pendingArtifactTopicSelection : false,
    pendingQuizTopicOptions:
      pendingArtifactIntent === "quiz" ? pendingArtifactTopicOptions : [],
    pendingQuizOriginalQuery:
      pendingArtifactIntent === "quiz" ? pendingArtifactOriginalQuery : null,
    pendingQuizRequestedAt:
      pendingArtifactIntent === "quiz" ? pendingArtifactRequestedAt : null,
  }
}

function isGenericQuizRequest(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  if (/\ball topics?\b/.test(normalized)) return false
  const hasQuizCue = /\b(quiz|mcq|multiple choice|questions?)\b/.test(normalized)
  if (!hasQuizCue) return false
  const hasTopicSpecificCue =
    /\b(on|about|covering|focus(?:ed)?\s+on|topic|chapter|section|regarding|from)\b/.test(normalized) ||
    /\b(?:pages?|pp?\.?)\s*\d+(?:\s*(?:-|–|to)\s*\d+)?\b/.test(normalized) ||
    /"[^"]{3,}"/.test(query)
  if (hasTopicSpecificCue) return false
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  return wordCount <= 10
}

function isQuizArtifactIntentQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return false
  return (
    /\b(quiz|mcq|multiple choice|practice questions?)\b/.test(normalized) ||
    /\btest me\b/.test(normalized)
  )
}

function isGenericDocumentRequest(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  if (/\ball topics?\b/.test(normalized)) return false
  const hasDocumentCue =
    /\b(document|study\s+(plan|document|notes)|notes|summary|review|report|write[-\s]?up)\b/.test(
      normalized
    )
  if (!hasDocumentCue) return false
  const hasTopicSpecificCue =
    /\b(on|about|covering|focus(?:ed)?\s+on|topic|chapter|section|regarding|from)\b/.test(
      normalized
    ) ||
    /\b(?:pages?|pp?\.?)\s*\d+(?:\s*(?:-|–|to)\s*\d+)?\b/.test(normalized) ||
    /"[^"]{3,}"/.test(query)
  if (hasTopicSpecificCue) return false
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  return wordCount <= 12
}

function isGenericArtifactRequest(
  intent: "document" | "quiz",
  query: string
): boolean {
  return intent === "quiz" ? isGenericQuizRequest(query) : isGenericDocumentRequest(query)
}

function hasArtifactScopeSignal(query: string): boolean {
  const normalized = query.toLowerCase()
  return (
    /\b(topic|chapter|section|focus(?:ed)?\s+on|about|covering|regarding)\b/.test(normalized) ||
    /\b(?:pages?|pp?\.?)\s*\d+(?:\s*(?:-|–|to)\s*\d+)?\b/.test(normalized) ||
    /\b(all topics?|whole (?:book|document|file)|mixed)\b/.test(normalized) ||
    /(?:^|\n)\s*(topic|pages?)\s*:/i.test(query)
  )
}

function hasDocumentSettingsSignal(query: string): boolean {
  const normalized = query.toLowerCase()
  const hasDepth = /\b(depth|detail(?:ed)?|high[-\s]?yield|overview|comprehensive)\b/.test(normalized)
  const hasFormat = /\b(format|outline|notes?|table|bullets?|summary|study plan|review)\b/.test(
    normalized
  )
  const hasLength = /\b(length|short|concise|medium|long|comprehensive|one-page|one page)\b/.test(
    normalized
  )
  return hasDepth || (hasFormat && hasLength)
}

function hasQuizSettingsSignal(query: string): boolean {
  const normalized = query.toLowerCase()
  const hasCount = /\bquestions?\s*:?\s*\d+|\b\d+\s*(?:questions?|mcqs?)\b/.test(normalized)
  const hasDifficulty = /\b(difficulty|easy|medium|hard)\b/.test(normalized)
  const hasStyle = /\b(style|format|mcq|single[-\s]?best|case[-\s]?based|mixed)\b/.test(normalized)
  return hasCount || (hasDifficulty && hasStyle)
}

function hasExplicitReferenceIntent(query: string): boolean {
  const normalized = query.toLowerCase()
  return /\b(reference|references|bibliography|harvard|apa|vancouver|citation|citations)\b/.test(
    normalized
  )
}

type ArtifactRefinementChoice = {
  id: "A" | "B" | "C" | "D" | "E"
  label: string
  submitText: string
  requiresCustomInput?: boolean
}

type ArtifactRefinementPrompt = {
  title: string
  question: string
  helperText: string
  requiredFields: string[]
  customInputPlaceholder: string
  choices: ArtifactRefinementChoice[]
}

type ArtifactRefinementToolResult = {
  kind: "artifact-refinement"
  intent: "document" | "quiz"
  title: string
  question: string
  helperText: string
  requiredFields: string[]
  customInputPlaceholder: string
  sourceContext: {
    uploadTitle?: string | null
    pageHints: number[]
  }
  choices: ArtifactRefinementChoice[]
}

function buildSuggestedPageRange(recentPages: number[]): string {
  if (recentPages.length === 0) return "pages 120-145"
  const sorted = [...recentPages].sort((a, b) => a - b)
  const start = sorted[0]
  const end = sorted[Math.min(sorted.length - 1, 3)]
  if (start === end) {
    return `page ${start}`
  }
  return `pages ${start}-${end}`
}

function normalizeRefinementOptionLabel(value: string): string {
  return sanitizeTopicOption(value)
    .replace(/\b(?:slide|slides|page|pages)\s*\d+(?:\s*[-–to]+\s*\d+)?\b/gi, " ")
    .replace(/\b(?:ocr|scan|scanned|artifact)\b/gi, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-.\s]+/, "")
    .replace(/[,;:\-.\s]+$/, "")
    .trim()
    .slice(0, 84)
}

function dedupeRefinementOptionLabels(options: string[], maxOptions = 4): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const option of options) {
    const value = normalizeRefinementOptionLabel(option)
    if (!value || value.length < 12) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(value)
    if (normalized.length >= maxOptions) break
  }
  return normalized
}

function buildContextAwareFallbackTopicOptions(input: {
  query: string
  uploadTitle?: string | null
  recentPages: number[]
}): string[] {
  const trimmedQuery = input.query.replace(/\s+/g, " ").trim()
  const queryTopic = trimmedQuery
    .replace(/\b(?:quiz|questions?|mcqs?|on|about|from|using|the|my|uploaded|slides?|file|this)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  const uploadLabel =
    typeof input.uploadTitle === "string" && input.uploadTitle.trim().length > 0
      ? normalizeRefinementOptionLabel(input.uploadTitle)
      : null
  const pageRange = buildSuggestedPageRange(input.recentPages)
  return dedupeRefinementOptionLabels(
    [
      queryTopic ? `${queryTopic} - high-yield essentials` : "",
      uploadLabel ? `Core concepts from ${uploadLabel}` : "",
      `Mechanisms and key processes (${pageRange})`,
      `Clinical/application scenarios (${pageRange})`,
    ].filter(Boolean)
  )
}

function buildArtifactRefinementPrompt(
  intent: "document" | "quiz",
  options: string[],
  recentPages: number[] = [],
  uploadTitle?: string | null
): ArtifactRefinementPrompt {
  const normalizedOptions = dedupeRefinementOptionLabels(options, 4)
  const optionA = normalizedOptions[0] || "Core definitions and foundational concepts"
  const optionB = normalizedOptions[1] || "High-yield mechanisms and processes"
  const optionC = normalizedOptions[2] || "Clinical/application-style scenarios"
  const suggestedPageRange = buildSuggestedPageRange(recentPages)
  const baseUploadContext =
    typeof uploadTitle === "string" && uploadTitle.trim().length > 0
      ? `from ${uploadTitle.trim()}`
      : "from your uploaded file"
  return {
    title:
      intent === "quiz"
        ? "Refine the quiz before generation"
        : "Refine the document before generation",
    question:
      intent === "quiz"
        ? `Choose one option so I can generate a focused quiz ${baseUploadContext}:`
        : `Choose one option so I can generate a focused study document ${baseUploadContext}:`,
    helperText:
      intent === "quiz"
        ? "I need topic/page scope plus settings (question count, difficulty, style)."
        : "I need topic/page scope plus settings (depth, format, length).",
    requiredFields:
      intent === "quiz"
        ? ["Topic or pages", "Question count", "Difficulty", "Question style"]
        : ["Topic or pages", "Depth", "Output format", "Length"],
    customInputPlaceholder:
      intent === "quiz"
        ? "Type custom quiz requirements (topic/pages, question count, difficulty, style)"
        : "Type custom document requirements (topic/pages, depth, format, length)",
    choices: [
      {
        id: "A",
        label: optionA,
        submitText:
          intent === "quiz"
            ? `Topic: ${optionA}\nQuestions: 12\nDifficulty: medium\nFormat: single-best-answer MCQs`
            : `Topic: ${optionA}\nDepth: high-yield overview\nFormat: concise study notes\nLength: medium`,
      },
      {
        id: "B",
        label: optionB,
        submitText:
          intent === "quiz"
            ? `Topic: ${optionB}\nQuestions: 15\nDifficulty: hard\nFormat: mixed MCQs with explanations`
            : `Topic: ${optionB}\nDepth: detailed\nFormat: structured outline\nLength: comprehensive`,
      },
      {
        id: "C",
        label: optionC,
        submitText:
          intent === "quiz"
            ? `Topic: ${optionC}\nQuestions: 10\nDifficulty: medium\nFormat: case-based MCQs`
            : `Topic: ${optionC}\nDepth: applied clinical\nFormat: case-focused notes\nLength: medium`,
      },
      {
        id: "D",
        label: `Use a specific page range (${suggestedPageRange})`,
        submitText:
          intent === "quiz"
            ? `Pages: ${suggestedPageRange.replace(/^pages?\s*/i, "")}\nQuestions: 10\nDifficulty: medium\nFormat: single-best-answer MCQs`
            : `Pages: ${suggestedPageRange.replace(/^pages?\s*/i, "")}\nDepth: high-yield overview\nFormat: concise study notes\nLength: medium`,
      },
      {
        id: "E",
        label: "Custom requirements (blank)",
        submitText: "",
        requiresCustomInput: true,
      },
    ],
  }
}

function toArtifactRefinementToolResult(
  prompt: ArtifactRefinementPrompt,
  intent: "document" | "quiz",
  pageHints: number[],
  uploadTitle?: string | null
): ArtifactRefinementToolResult {
  return {
    kind: "artifact-refinement",
    intent,
    title: prompt.title,
    question: prompt.question,
    helperText: prompt.helperText,
    requiredFields: prompt.requiredFields,
    customInputPlaceholder: prompt.customInputPlaceholder,
    sourceContext: {
      uploadTitle: uploadTitle || null,
      pageHints: pageHints.slice(0, 6),
    },
    choices: prompt.choices,
  }
}

function sanitizeTopicOption(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-\d\.\)\s]+/, "")
    .slice(0, 96)
}

function isLowQualityTopicOption(value: string): boolean {
  const normalized = sanitizeTopicOption(value)
  if (!normalized) return true
  if (normalized.length < 10) return true
  if (!/[a-z]{3}/i.test(normalized)) return true
  if (/(.)\1{4,}/.test(normalized)) return true
  if (/[^a-z0-9\s:;,\-()/]/i.test(normalized)) return true

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length < 3) return true
  const alphaChars = (normalized.match(/[a-z]/gi) || []).length
  const alphaRatio = alphaChars / Math.max(normalized.length, 1)
  if (alphaRatio < 0.55) return true

  return false
}

function buildTopicOptionsFromUploadCitations(
  citations: Array<{
    title?: string | null
    snippet?: string | null
    sourceUnitId?: string | null
    sourceUnitType?: string | null
    sourceUnitNumber?: number | null
  }>,
  maxOptions = 4
): string[] {
  const options: string[] = []
  const seen = new Set<string>()
  const pushOption = (candidate: string | undefined | null) => {
    if (!candidate) return
    const normalized = sanitizeTopicOption(candidate)
    if (isLowQualityTopicOption(normalized)) return
    if (normalized.length < 16) return
    if (
      /\b(references?|bibliography|table of contents|contents|index|appendix|first published|edition|copyright|isbn|oxford university press)\b/i.test(
        normalized
      )
    ) {
      return
    }
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length
    if (tokenCount < 3) return
    const digitRatio = (normalized.match(/\d/g) || []).length / Math.max(normalized.length, 1)
    if (digitRatio > 0.22) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    options.push(normalized)
  }

  for (const citation of citations) {
    if (options.length >= maxOptions) break
    const title = typeof citation.title === "string" ? citation.title : ""
    if (title && !/\.(pdf|pptx?|docx?)$/i.test(title)) {
      pushOption(title)
    }
    const snippet = typeof citation.snippet === "string" ? citation.snippet : ""
    if (snippet) {
      const sentence = (snippet.split(/(?<=[.!?])\s+/)[0] || snippet).trim()
      pushOption(sentence)
    }
  }

  return options.slice(0, maxOptions)
}

function buildTopicOptionsFromStructureInspection(
  inspection:
    | {
        topicMap?: Array<{ label?: string | null }>
        headingCandidates?: string[]
        confidence?: "high" | "medium" | "low"
      }
    | null
    | undefined,
  maxOptions = 4
): string[] {
  if (!inspection) return []
  const options: string[] = []
  const seen = new Set<string>()
  const push = (value?: string | null) => {
    if (!value) return
    const normalized = sanitizeTopicOption(value)
    if (isLowQualityTopicOption(normalized)) return
    if (normalized.length < 10) return
    if (/\b(references?|index|appendix|copyright|first published)\b/i.test(normalized)) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    options.push(normalized)
  }
  for (const topic of inspection.topicMap ?? []) {
    if (options.length >= maxOptions) break
    push(topic?.label)
  }
  for (const heading of inspection.headingCandidates ?? []) {
    if (options.length >= maxOptions) break
    push(heading)
  }
  return options.slice(0, maxOptions)
}

function analyzeUploadTopicBreadth(
  citations: Array<{
    title?: string | null
    snippet?: string | null
    sourceUnitId?: string | null
    sourceUnitType?: string | null
    sourceUnitNumber?: number | null
  }>
): {
  isBroad: boolean
  topicOptions: string[]
} {
  if (citations.length === 0) {
    return { isBroad: false, topicOptions: [] }
  }

  const unitKeys = new Set<string>()
  const pages: number[] = []
  const titles = new Set<string>()
  for (const citation of citations) {
    const unitId =
      typeof citation.sourceUnitId === "string" && citation.sourceUnitId.trim().length > 0
        ? citation.sourceUnitId.trim()
        : null
    const unitType =
      typeof citation.sourceUnitType === "string" && citation.sourceUnitType.trim().length > 0
        ? citation.sourceUnitType.trim()
        : "unit"
    const unitNumber =
      typeof citation.sourceUnitNumber === "number" && Number.isFinite(citation.sourceUnitNumber)
        ? citation.sourceUnitNumber
        : null
    if (unitId) {
      unitKeys.add(unitId)
    } else if (unitNumber !== null) {
      unitKeys.add(`${unitType}:${unitNumber}`)
      pages.push(unitNumber)
    }
    if (typeof citation.title === "string" && citation.title.trim().length > 0) {
      titles.add(citation.title.trim().toLowerCase())
    }
  }

  const pageSpread =
    pages.length >= 2 ? Math.max(...pages) - Math.min(...pages) : 0
  const isBroad =
    (citations.length >= 4 &&
      (unitKeys.size >= 3 || titles.size >= 2 || pageSpread >= 8)) ||
    (citations.length >= 2 && pageSpread >= 20)

  return {
    isBroad,
    topicOptions: buildTopicOptionsFromUploadCitations(citations),
  }
}

function resolveArtifactTopicReply(
  intent: "document" | "quiz",
  query: string,
  options: string[]
): {
  resolvedTopic: string | null
  wantsAllTopics: boolean
} {
  const normalized = query.trim()
  if (!normalized) {
    return { resolvedTopic: null, wantsAllTopics: false }
  }
  const normalizedLower = normalized.toLowerCase()
  const optionOnlyMatch = normalized.match(/^\s*([A-Ea-e])\s*$/)
  if (optionOnlyMatch?.[1]) {
    const optionId = optionOnlyMatch[1].toUpperCase()
    if (optionId === "A" || optionId === "B" || optionId === "C") {
      const index = optionId.charCodeAt(0) - 65
      return { resolvedTopic: options[index] || null, wantsAllTopics: false }
    }
    // D/E alone are incomplete - ask for details again.
    return { resolvedTopic: null, wantsAllTopics: false }
  }
  if (/\b(all topics?|everything|whole (?:file|document|book)|mixed)\b/i.test(normalized)) {
    return { resolvedTopic: null, wantsAllTopics: true }
  }
  const explicitTopicMatch = normalized.match(/(?:^|\n)\s*topic\s*:\s*(.+)$/im)
  if (explicitTopicMatch?.[1]) {
    return { resolvedTopic: explicitTopicMatch[1].trim().slice(0, 120), wantsAllTopics: false }
  }
  const explicitPagesMatch = normalized.match(
    /(?:^|\n)\s*(?:pages?|pp?\.?)\s*:\s*(\d+(?:\s*(?:-|–|to)\s*\d+)?)\s*$/im
  )
  if (explicitPagesMatch?.[1]) {
    return {
      resolvedTopic: `pages ${explicitPagesMatch[1].trim()}`.slice(0, 120),
      wantsAllTopics: false,
    }
  }
  const inlinePagesMatch = normalized.match(
    /\b(?:pages?|pp?\.?)\s*(\d+(?:\s*(?:-|–|to)\s*\d+)?)\b/i
  )
  if (inlinePagesMatch?.[1]) {
    return {
      resolvedTopic: `pages ${inlinePagesMatch[1].trim()}`.slice(0, 120),
      wantsAllTopics: false,
    }
  }
  for (const option of options) {
    if (normalizedLower.includes(option.toLowerCase())) {
      return { resolvedTopic: option, wantsAllTopics: false }
    }
  }
  if (isGenericArtifactRequest(intent, normalized)) {
    return { resolvedTopic: null, wantsAllTopics: false }
  }
  const wordCount = normalizedLower.split(/\s+/).filter(Boolean).length
  const hasSettingsCue =
    intent === "quiz"
      ? /\bquestions?\s*:|\bdifficulty\s*:|\bformat\s*:/.test(normalizedLower)
      : /\bdepth\s*:|\bformat\s*:|\blength\s*:/.test(normalizedLower)
  const isLowSignalReply =
    wordCount < 3 ||
    /^(yes|yeah|yep|ok|okay|sure|go ahead|continue|do it)\b/.test(normalizedLower)
  if (!hasSettingsCue && isLowSignalReply) {
    return { resolvedTopic: null, wantsAllTopics: false }
  }
  return { resolvedTopic: normalized.slice(0, 120), wantsAllTopics: false }
}

function extractTopicContextFromMessages(messages: MessageAISDK[]): TopicContext | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as any
    if (message?.role !== "assistant") continue
    const parts = Array.isArray(message?.parts) ? message.parts : []
    for (const part of parts) {
      if (part?.type === "metadata" && part?.metadata?.topicContext) {
        const parsed = normalizeTopicContext(part.metadata.topicContext)
        if (parsed) {
          return parsed
        }
      }
    }
  }
  return undefined
}

function deriveTopicContextFromCitations(
  baseContext: TopicContext | undefined,
  citations: EvidenceCitation[],
  queryText: string
): TopicContext | undefined {
  const uploadCitations = citations.filter(
    (citation) => citation.sourceType === "user_upload"
  )
  if (uploadCitations.length === 0) {
    return baseContext
  }

  const recentPages = Array.from(
    new Set(
      uploadCitations
        .map((citation) => citation.sourceUnitNumber)
        .filter((value): value is number => typeof value === "number" && value > 0)
    )
  ).slice(0, 6)
  const recentEvidenceIds = Array.from(
    new Set(
      uploadCitations
        .map((citation) => citation.chunkId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ).slice(0, 10)
  const lastUploadId =
    uploadCitations[0]?.uploadId ||
    baseContext?.lastUploadId ||
    null

  return {
    activeTopic: baseContext?.activeTopic || queryText.trim().slice(0, 160),
    lastUploadId,
    recentPages: recentPages.length > 0 ? recentPages : baseContext?.recentPages ?? [],
    recentEvidenceIds:
      recentEvidenceIds.length > 0
        ? recentEvidenceIds
        : baseContext?.recentEvidenceIds ?? [],
    lastRetrievalConfidence: baseContext?.lastRetrievalConfidence,
    lastRetrievalFallbackReason: baseContext?.lastRetrievalFallbackReason ?? null,
    lastRetrievalWarnings: baseContext?.lastRetrievalWarnings ?? [],
    pendingArtifactStage: baseContext?.pendingArtifactStage ?? null,
    pendingArtifactStructureInspected:
      baseContext?.pendingArtifactStructureInspected ?? false,
    pendingArtifactStructureConfidence:
      baseContext?.pendingArtifactStructureConfidence ?? null,
    pendingArtifactStructureTopics: baseContext?.pendingArtifactStructureTopics ?? [],
    followUpType: baseContext?.followUpType ?? "unknown",
    pendingArtifactTopicSelection:
      baseContext?.pendingArtifactTopicSelection ?? false,
    pendingArtifactRefinement: baseContext?.pendingArtifactRefinement ?? false,
    pendingArtifactRefinementChoices:
      baseContext?.pendingArtifactRefinementChoices ?? [],
    pendingArtifactRequiredFields: baseContext?.pendingArtifactRequiredFields ?? [],
    pendingArtifactCustomInputPlaceholder:
      baseContext?.pendingArtifactCustomInputPlaceholder ?? null,
    pendingArtifactTopicOptions: baseContext?.pendingArtifactTopicOptions ?? [],
    pendingArtifactIntent: baseContext?.pendingArtifactIntent ?? null,
    pendingArtifactOriginalQuery: baseContext?.pendingArtifactOriginalQuery ?? null,
    pendingArtifactRequestedAt: baseContext?.pendingArtifactRequestedAt ?? null,
    pendingQuizTopicSelection: baseContext?.pendingQuizTopicSelection ?? false,
    pendingQuizTopicOptions: baseContext?.pendingQuizTopicOptions ?? [],
    pendingQuizOriginalQuery: baseContext?.pendingQuizOriginalQuery ?? null,
    pendingQuizRequestedAt: baseContext?.pendingQuizRequestedAt ?? null,
  }
}

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: SupportedModel
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  enableEvidence?: boolean  // NEW: Enable evidence-backed responses
  message_group_id?: string
  userRole?: "doctor" | "general" | "medical_student"
  medicalSpecialty?: string
  clinicalDecisionSupport?: boolean
  medicalLiteratureAccess?: boolean
  medicalComplianceMode?: boolean
  learningMode?: MedicalStudentLearningMode
  clinicianMode?: ClinicianWorkflowMode
  benchmarkStrictMode?: boolean
  topicContext?: TopicContext
  artifactIntent?: "none" | "quiz"
  citationStyle?: CitationStyle
  incompleteEvidencePolicy?: ClinicalIncompleteEvidencePolicy
  allowMultipleArtifacts?: boolean
  selectedUploadIds?: string[]
}

const chatAttachmentRequestSchema = z
  .object({
    // Keep schema permissive for in-flight optimistic attachments.
    // Some client-side placeholders intentionally send empty/null values
    // (for example non-image docs routed through upload references).
    name: z.string().nullish(),
    url: z.string().nullish(),
    contentType: z.string().nullish(),
    mimeType: z.string().nullish(),
    filePath: z.string().nullish(),
  })
  .passthrough()

const chatMessageRequestSchema = z
  .object({
    role: z.string(),
    content: z.unknown().optional(),
    experimental_attachments: z.array(chatAttachmentRequestSchema).optional(),
  })
  .passthrough()

const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageRequestSchema).min(1),
    chatId: z.string().min(1),
    userId: z.string().min(1),
    model: z.string().min(1),
    isAuthenticated: z.boolean(),
    systemPrompt: z.string(),
    enableSearch: z.boolean().optional().default(true),
    enableEvidence: z.boolean().optional(),
    message_group_id: z.string().optional(),
    userRole: z.enum(["doctor", "general", "medical_student"]).optional(),
    medicalSpecialty: z.string().optional(),
    clinicalDecisionSupport: z.boolean().optional(),
    medicalLiteratureAccess: z.boolean().optional(),
    medicalComplianceMode: z.boolean().optional(),
    learningMode: z.string().optional(),
    clinicianMode: z.string().optional(),
    benchmarkStrictMode: z.boolean().optional(),
    topicContext: z.unknown().optional(),
    artifactIntent: z.enum(["none", "quiz"]).optional(),
    citationStyle: z.string().optional(),
    selectedUploadIds: z.array(z.string()).optional(),
    incompleteEvidencePolicy: z
      .enum(["none", "balanced_conditional", "strict_blocking"])
      .optional(),
    allowMultipleArtifacts: z.boolean().optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const requestStartTime = performance.now()
    const rawBody = await req.json()
    const parsedRequest = chatRequestSchema.safeParse(rawBody)
    if (!parsedRequest.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid chat request payload",
          details: parsedRequest.error.flatten(),
        }),
        { status: 400 }
      )
    }

    const {
      messages,
      chatId,
      userId,
      model,
      isAuthenticated,
      systemPrompt,
      enableSearch: enableSearchFromClient,
      enableEvidence: enableEvidenceFromClient,
      message_group_id,
      userRole,
      medicalSpecialty,
      clinicalDecisionSupport,
      medicalLiteratureAccess,
      medicalComplianceMode,
      learningMode,
      clinicianMode,
      benchmarkStrictMode,
      topicContext: topicContextFromRequest,
      artifactIntent: artifactIntentFromRequest,
      citationStyle: citationStyleFromRequest,
      selectedUploadIds: selectedUploadIdsFromRequest,
      incompleteEvidencePolicy: incompleteEvidencePolicyFromRequest,
      allowMultipleArtifacts: allowMultipleArtifactsFromRequest,
    } = parsedRequest.data as unknown as ChatRequest

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    if (!isEphemeralChatId(chatId) && !isUuidLike(chatId)) {
      return new Response(
        JSON.stringify({ error: "Invalid chatId" }),
        { status: 400 }
      )
    }

    const latestUserMessageForLimits = [...messages]
      .reverse()
      .find((message) => message.role === "user")
    const requestedAttachmentCount = Array.isArray(
      (latestUserMessageForLimits as any)?.experimental_attachments
    )
      ? ((latestUserMessageForLimits as any).experimental_attachments as unknown[]).length
      : 0
    const perMessageAttachmentLimit = isAuthenticated
      ? AUTH_HOURLY_ATTACHMENT_LIMIT
      : NON_AUTH_HOURLY_ATTACHMENT_LIMIT
    if (requestedAttachmentCount > perMessageAttachmentLimit) {
      return new Response(
        JSON.stringify({
          error: `You can include up to ${perMessageAttachmentLimit} images/files in a single message.`,
          code: "ATTACHMENT_LIMIT_EXCEEDED",
        }),
        { status: 400 }
      )
    }

    let effectiveChatId = chatId
    let consultPatientId: string | null = null
    let consultPracticeId: string | null = null

    // CRITICAL: Check rate limits FIRST - fail fast before any other work
    let validatedSupabase: Awaited<ReturnType<typeof validateAndTrackUsage>> = null
    if (userId !== "temp") {
      try {
        validatedSupabase = await validateAndTrackUsage({
          userId,
          model,
          isAuthenticated,
          attachmentCount: requestedAttachmentCount,
        })
        if (!validatedSupabase) {
          return new Response(
            JSON.stringify({ error: "Unable to validate user identity" }),
            { status: 401 }
          )
        }

        // If a client still submits an ephemeral id, immediately materialize a real chat.
        if (isAuthenticated && isEphemeralChatId(effectiveChatId)) {
          const lastMessageContent =
            typeof messages[messages.length - 1]?.content === "string"
              ? decodeArtifactWorkflowInput(messages[messages.length - 1]?.content as string)
              : ""
          const fallbackTitle = lastMessageContent.trim().slice(0, 120) || "New Chat"
          const { data: createdChat, error: createChatError } = await validatedSupabase
            .from("chats")
            .insert({
              user_id: userId,
              title: fallbackTitle,
              model,
            })
            .select("id")
            .single()

          if (createChatError || !createdChat?.id) {
            console.error("[/api/chat] Failed to materialize chat for ephemeral id:", createChatError)
            return new Response(
              JSON.stringify({ error: "Failed to initialize chat session" }),
              { status: 500 }
            )
          }

          effectiveChatId = createdChat.id
          console.warn(
            `[/api/chat] Materialized chat ${effectiveChatId} from ephemeral request id ${chatId}`
          )
        }

        if (!isEphemeralChatId(effectiveChatId)) {
          await assertChatOwnership({
            supabase: validatedSupabase,
            chatId: effectiveChatId,
            userId,
          })
          const { data: cRow } = await validatedSupabase
            .from("chats")
            .select("patient_id")
            .eq("id", effectiveChatId)
            .maybeSingle()
          consultPatientId = (cRow?.patient_id as string | null) ?? null
          if (consultPatientId) {
            const { data: pRow } = await validatedSupabase
              .from("practice_patients")
              .select("practice_id")
              .eq("id", consultPatientId)
              .maybeSingle()
            consultPracticeId = (pRow?.practice_id as string | null) ?? null
          }
        }
      } catch (error: any) {
        if (error.code === "DAILY_LIMIT_REACHED" || error.limitType === "hourly") {
          return new Response(
            JSON.stringify({
              error: error.message,
              code: error.code || "RATE_LIMIT_EXCEEDED",
              waitTimeSeconds: error.waitTimeSeconds || null,
              limitType: error.limitType || "daily",
            }),
            { status: 429 }
          )
        }
        throw error
      }
    }

    const lastUserMessage = latestUserMessageForLimits
    const rawQueryText =
      typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""
    const queryText = decodeArtifactWorkflowInput(stripUploadReferenceTokens(rawQueryText))
    const recentUserPrompts = messages
      .filter(
        (message): message is MessageAISDK & { content: string } =>
          message.role === "user" && typeof message.content === "string"
      )
      .map((message) => decodeArtifactWorkflowInput(stripUploadReferenceTokens(message.content)))
      .filter((content) => content.trim().length > 0)
      .slice(-8)
    const healthMemorySyncPromise =
      isAuthenticated && userId !== "temp" && validatedSupabase
        ? runWithTimeBudget(
            "HEALTH_MEMORY_SYNC",
            () =>
              persistHealthMemoryPatchFromPrompts({
                supabase: validatedSupabase,
                userId,
                latestUserPrompt: queryText,
                recentUserPrompts,
              }).catch((error) => {
                console.warn("[HEALTH MEMORY SYNC] Failed to persist prompt-derived memory patch:", error)
              }),
            650,
            undefined
          )
        : Promise.resolve(undefined)
    const implicitUploadIntentSignal = detectImplicitUploadIntent(queryText)
    const uploadService = new UserUploadService()
    const selectedUploadIdsFromBody = normalizeRequestUploadIds(selectedUploadIdsFromRequest)
    const explicitSelectedUploadIds = extractUploadReferenceIds(rawQueryText)
    let selectedUploadIds = Array.from(
      new Set([...selectedUploadIdsFromBody, ...explicitSelectedUploadIds])
    )
    let autoSelectedUploadIds: string[] = []
    if (
      selectedUploadIds.length === 0 &&
      implicitUploadIntentSignal.hasImplicitUploadIntent &&
      isAuthenticated &&
      userId !== "temp"
    ) {
      try {
        autoSelectedUploadIds = resolveAutoLatestUploadIds(
          await uploadService.listUploads(userId),
          implicitUploadIntentSignal,
          3
        )
        selectedUploadIds = autoSelectedUploadIds
      } catch (error) {
        console.warn(
          "[UPLOAD INTENT] Failed to resolve auto-latest uploads:",
          error instanceof Error ? error.message : error
        )
      }
    }
    const trackedUploadIds = [...selectedUploadIds]
    let uploadReadinessSnapshots: UploadReadinessSnapshot[] = trackedUploadIds.map((uploadId) => ({
      uploadId,
      uploadTitle: null,
      status: "pending",
      progressStage: "queued",
      progressPercent: 0,
      lastError: null,
    }))
    let uploadReadinessTimedOut = false
    if (
      trackedUploadIds.length > 0 &&
      isAuthenticated &&
      userId !== "temp"
    ) {
      const readiness = await waitForSelectedUploadsReady({
        uploadService,
        userId,
        selectedUploadIds: trackedUploadIds,
      })
      uploadReadinessSnapshots = readiness.snapshots
      uploadReadinessTimedOut = readiness.timedOut
      selectedUploadIds = readiness.readyUploadIds
    }

    const selectedUploadIdHint = selectedUploadIds[0]
    const attachmentContextPromise = buildAttachmentContext(lastUserMessage)
    const persistedTopicContext = extractTopicContextFromMessages(messages)
    const selectedUploadTopicContext = selectedUploadIdHint
      ? normalizeTopicContext({
          lastUploadId: selectedUploadIdHint,
          followUpType: "drill_down",
        })
      : undefined
    const effectiveTopicContext = mergeTopicContexts(
      persistedTopicContext,
      mergeTopicContexts(
        normalizeTopicContext(topicContextFromRequest),
        selectedUploadTopicContext
      )
    )
    const effectiveLearningMode = normalizeMedicalStudentLearningMode(learningMode)
    const effectiveClinicianMode = normalizeClinicianWorkflowMode(clinicianMode)
    const requestedArtifactIntent = artifactIntentFromRequest === "quiz" ? "quiz" : "none"
    const hasUploadContextHint = Boolean(
      selectedUploadIdHint || effectiveTopicContext?.lastUploadId || trackedUploadIds.length > 0
    )
    const shouldPreferUploadContext =
      hasUploadContextHint ||
      implicitUploadIntentSignal.hasImplicitUploadIntent ||
      autoSelectedUploadIds.length > 0
    const hasQuizContinuationSignal =
      hasQuizSettingsSignal(queryText) ||
      /(?:^|\n)\s*(topic|pages?)\s*:/i.test(queryText) ||
      /^\s*[A-Ea-e]\s*$/.test(queryText.trim())
    // Temporary hard-disable: quiz generation/refinement is turned off.
    const ENABLE_QUIZ_GENERATION = false
    const artifactIntent =
      ENABLE_QUIZ_GENERATION && (
        requestedArtifactIntent === "quiz" ||
        (hasUploadContextHint &&
          (isQuizArtifactIntentQuery(queryText) || hasQuizContinuationSignal))
      )
        ? "quiz"
        : "none"
    const allowMultipleArtifacts =
      allowMultipleArtifactsFromRequest === true || detectExplicitMultiArtifactRequest(queryText)
    const resolvedCitationStyle = normalizeCitationStyle(citationStyleFromRequest)
    const allowBibliographyInOutput = false
    const emergencyEscalationIntent = detectEmergencyEscalationNeed(queryText)
    const youtubeIntentDecision = detectYouTubeIntent(queryText, {
      emergencyEscalation: emergencyEscalationIntent.shouldEscalate,
    })
    const requestBenchStrictMode =
      benchmarkStrictMode === true ||
      req.headers.get("x-bench-strict-mode") === "true" ||
      chatId.startsWith("benchmark-")
    const benchStrictMode = BENCH_STRICT_MODE || requestBenchStrictMode

    // Run all blocking work in parallel so streaming can start as soon as possible
    const effectiveModel = model
    const modelConfig = getModelInfo(effectiveModel)
    if (!modelConfig || !modelConfig.apiSdk) {
      return new Response(
        JSON.stringify({ error: `Model ${model} not found` }),
        { status: 400 }
      )
    }

    const [effectiveUserRole, apiKey] = await Promise.all([
      // 1) Resolve user role (from request or DB)
      (async (): Promise<"doctor" | "general" | "medical_student" | undefined> => {
        if (userRole) return userRole
        if (!isAuthenticated || userId === "temp") return undefined
        try {
          const { createClient } = await import("@/lib/supabase/server")
          const supabase = await createClient()
          if (!supabase) return undefined
          const { data: prefs } = await supabase
            .from("user_preferences")
            .select("user_role")
            .eq("user_id", userId)
            .single()
          const validRoles = ["doctor", "general", "medical_student"] as const
          if (prefs?.user_role && validRoles.includes(prefs.user_role as (typeof validRoles)[number])) {
            return prefs.user_role as (typeof validRoles)[number]
          }
        } catch {
          // non-critical
        }
        return undefined
      })(),
      // 2) API key (needed before stream)
      (async (): Promise<string | undefined> => {
        if (!isAuthenticated || !userId || userId === "temp") return undefined
        const { getEffectiveApiKey } = await import("@/lib/user-keys")
        const provider = getProviderForModel(effectiveModel)
        return (await getEffectiveApiKey(userId, provider as ProviderWithoutOllama)) || undefined
      })(),
      healthMemorySyncPromise,
    ])
    const resolvedProvider = getProviderForModel(effectiveModel)
    const embeddingApiKey = resolvedProvider === "openai" ? apiKey : undefined
    const embeddingProviderMismatch = Boolean(apiKey) && resolvedProvider !== "openai"

    const clinicianRoleFromResolvedRole =
      effectiveUserRole === "doctor" || effectiveUserRole === "medical_student"
    const shouldLoadLmsContextForTurn =
      isAuthenticated &&
      userId !== "temp" &&
      effectiveUserRole === "medical_student" &&
      hasEducationalPromptCue(queryText, effectiveLearningMode)
    const lmsContextPromise: Promise<LmsContextSnapshot | null> =
      shouldLoadLmsContextForTurn
        ? runWithTimeBudget(
            "LMS_CONTEXT_PREFLIGHT",
            async () => {
              const supabase = validatedSupabase || (await createClient())
              if (!supabase) return null
              return loadMinimalLmsContextSnapshot({
                supabase,
                userId,
              })
            },
            900,
            null
          )
        : Promise.resolve(null)
    const effectiveIncompleteEvidencePolicy: ClinicalIncompleteEvidencePolicy =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL
        ? incompleteEvidencePolicyFromRequest ||
          (clinicianRoleFromResolvedRole ? "balanced_conditional" : "none")
        : "none"
    const evidenceSeekingIntent = hasEvidenceSeekingIntent(queryText) || hasGuidelineIntent(queryText)
    const freshEvidenceIntent = needsFreshEvidence(queryText)
    /** SOAP is charting from the consult only — no PubMed/web/RAG retrieval. */
    const isSoapCommandRequest = /^\[\/soap\]/i.test(queryText.trim())
    const finalEnableEvidence =
      isSoapCommandRequest
        ? false
        : enableEvidenceFromClient === true ||
          clinicianRoleFromResolvedRole ||
          evidenceSeekingIntent
    const finalEnableSearch =
      ENABLE_WEB_SEARCH_TOOL &&
      enableSearchFromClient !== false
    const webSearchConfigured = hasWebSearchConfigured()
    const allowWebRetrieval =
      !isSoapCommandRequest &&
      finalEnableSearch &&
      webSearchConfigured &&
      queryText.length > 0 &&
      !shouldPreferUploadContext
    const shouldRunWebSearchPreflight =
      allowWebRetrieval
    const minEvidenceLevelForQuery = clinicianRoleFromResolvedRole ? 3 : 5

    const uploadSearchMode: UploadContextSearchMode =
      /\b(page|pp?\.?)\s*\d+/i.test(queryText) || /\bpages?\s*\d+\s*(?:-|to)\s*\d+\b/i.test(queryText)
        ? "auto"
        : "hybrid"
    const shouldRunEvidenceSynthesis =
      finalEnableEvidence &&
      queryText.length > 0 &&
      (
        evidenceSeekingIntent ||
        shouldPreferUploadContext ||
        queryText.trim().length >= 40
      )
    const shouldUseBroadEvidenceFanout =
      finalEnableEvidence &&
      queryText.length > 0 &&
      !shouldPreferUploadContext &&
      artifactIntent !== "quiz"
    const targetFanoutSources = freshEvidenceIntent
      ? FANOUT_TARGET_SOURCES_FRESH
      : FANOUT_TARGET_SOURCES_BALANCED
    const fanoutTotalBudgetMs = freshEvidenceIntent
      ? FANOUT_TOTAL_BUDGET_FRESH_MS
      : FANOUT_TOTAL_BUDGET_MS
    const isArtifactRequestForRetrievalBudget = artifactIntent === "quiz"
    const uploadContextMaxDurationMs = isArtifactRequestForRetrievalBudget ? 2400 : 1200
    const uploadContextTimeBudgetMs = isArtifactRequestForRetrievalBudget ? 2600 : 1500
    const shouldRunUploadContextSearch =
      ENABLE_UPLOAD_CONTEXT_SEARCH &&
      isAuthenticated &&
      userId !== "temp" &&
      queryText.length > 0 &&
      shouldPreferUploadContext
    const uploadContextPreflightCacheKey = shouldRunUploadContextSearch
      ? buildUploadRetrievalPreflightCacheKey({
          userId,
          query: queryText,
          uploadId: selectedUploadIdHint,
          mode: uploadSearchMode,
          selectedUploadIds,
          topicContext: (effectiveTopicContext ?? null) as UploadTopicContext | null,
        })
      : null
    const cachedUploadContextResult = uploadContextPreflightCacheKey
      ? getUploadRetrievalPreflightCache<
          Awaited<ReturnType<UserUploadService["uploadContextSearch"]>> | null
        >(uploadContextPreflightCacheKey)
      : undefined
    const shouldRunStudyGraphContext =
      isAuthenticated &&
      userId !== "temp" &&
      queryText.length > 0 &&
      shouldPreferUploadContext
    const studyGraphService = new StudyGraphService()
    const studyPlannerService = new StudyPlannerService()
    const studyReviewService = new StudyReviewService()
    // L3 answer cache: short-circuit if we have a recent answer for this exact query
    let l3CacheHit: { answer: string; citations: EvidenceCitation[] } | null = null
    if (shouldRunEvidenceSynthesis && queryText.length > 0) {
      try {
        const cachedAnswer = await getAnswerCache(queryText, effectiveModel)
        if (cachedAnswer && cachedAnswer.answer && cachedAnswer.answer.length > 80) {
          const ageMs = Date.now() - (cachedAnswer.cachedAt || 0)
          if (ageMs < 18 * 60 * 60 * 1000) {
            l3CacheHit = {
              answer: cachedAnswer.answer,
              citations: (cachedAnswer.citations || []) as EvidenceCitation[],
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // Let the model invoke web search lazily during streaming instead of
    // blocking the initial response on a speculative preflight crawl.
    const webSearchPreflightPromise = Promise.resolve<Awaited<ReturnType<typeof searchWeb>> | null>(null)

    const [evidenceContextResult, uploadContextResult, webSearchPreflight, studyGraphNodeContext] = await Promise.all([
      shouldRunEvidenceSynthesis
        ? runWithTimeBudget(
            "EVIDENCE_SYNTHESIS",
            async () =>
              synthesizeEvidence({
                query: queryText,
                maxResults: 20,
                minEvidenceLevel: minEvidenceLevelForQuery,
                candidateMultiplier: 4,
                enableRerank: true,
                queryExpansion: true,
                minMedicalConfidence: 0.25,
                forceEvidence:
                  evidenceSeekingIntent || freshEvidenceIntent || Boolean(clinicianRoleFromResolvedRole),
              }).catch((err) => {
                console.error("📚 EVIDENCE MODE: Error synthesizing evidence:", err)
                return null
              }),
            1800,
            null
          )
        : Promise.resolve(null),
      shouldRunUploadContextSearch
        ? cachedUploadContextResult !== undefined
          ? Promise.resolve(cachedUploadContextResult)
          : runWithTimeBudget(
              "UPLOAD_CONTEXT_SEARCH",
              async () =>
                uploadService
                  .uploadContextSearch({
                    userId,
                    query: queryText,
                    apiKey,
                    embeddingApiKey,
                    uploadId: selectedUploadIdHint,
                    mode: uploadSearchMode,
                    topK: 6,
                    includeNeighborPages: 1,
                    topicContext: (effectiveTopicContext ??
                      undefined) as UploadTopicContext | undefined,
                    maxDurationMs: uploadContextMaxDurationMs,
                  })
                  .catch((err) => {
                    console.warn("📚 [UPLOAD RETRIEVAL] Structured retrieval failed:", err)
                    return null
                  }),
              uploadContextTimeBudgetMs,
              null
            ).then((result) => {
              if (uploadContextPreflightCacheKey) {
                setUploadRetrievalPreflightCache(uploadContextPreflightCacheKey, userId, result)
              }
              return result
            })
        : Promise.resolve(null),
      webSearchPreflightPromise,
      shouldRunStudyGraphContext
        ? runWithTimeBudget(
            "STUDY_GRAPH_CONTEXT",
            async () =>
              studyGraphService.searchNodes({
                userId,
                query: queryText,
                uploadId: selectedUploadIdHint,
                limit: 6,
              }),
            900,
            []
          )
        : Promise.resolve([]),
    ])

    const uploadEvidenceCitations =
      uploadContextResult?.citations ??
      (isAuthenticated && userId !== "temp" && queryText.length > 0 && shouldPreferUploadContext
        ? await runWithTimeBudget(
            "UPLOAD_LEGACY_CITATIONS",
            async () =>
              uploadService
                .retrieveUploadCitations({
                  userId,
                  query: queryText,
                  apiKey,
                  embeddingApiKey,
                  maxResults: 4,
                })
                .catch((err) => {
                  console.warn("📚 [UPLOAD RETRIEVAL] Legacy retrieval failed:", err)
                  return []
                }),
            800,
            []
          )
        : [])

    if (uploadContextResult?.warnings && uploadContextResult.warnings.length > 0) {
      console.log(
        "📚 [UPLOAD RETRIEVAL] Warnings:",
        uploadContextResult.warnings.join(" | ")
      )
    }

    let resolvedTopicContext = mergeTopicContexts(
      effectiveTopicContext,
      mergeTopicContexts(
        normalizeTopicContext(uploadContextResult?.topicContext),
        normalizeTopicContext({
          lastRetrievalConfidence: uploadContextResult?.metrics?.retrievalConfidence,
          lastRetrievalFallbackReason: uploadContextResult?.metrics?.fallbackReason || null,
          lastRetrievalWarnings: uploadContextResult?.warnings || [],
          lastUploadId: uploadContextResult?.topicContext?.lastUploadId || undefined,
        })
      )
    )
    const uploadCitationsForBreadth = Array.isArray(uploadContextResult?.citations)
      ? uploadContextResult.citations
      : []
    const topicBreadth = analyzeUploadTopicBreadth(uploadCitationsForBreadth)
    const pageHintsForRefinement = Array.from(
      new Set(
        uploadCitationsForBreadth
          .map((citation) =>
            typeof citation.sourceUnitNumber === "number" && citation.sourceUnitNumber > 0
              ? citation.sourceUnitNumber
              : null
          )
          .filter((value): value is number => value !== null)
      )
    ).slice(0, 6)
    const uploadTitleHintForRefinement =
      uploadCitationsForBreadth.find(
        (citation) => typeof citation.title === "string" && citation.title.trim().length > 0
      )?.title || null
    const isTextbookScaleUpload =
      uploadContextResult?.metrics?.textbookScale === true ||
      (uploadContextResult?.metrics?.sourceUnitCount ?? 0) >= 80 ||
      (uploadContextResult?.metrics?.maxUnitNumber ?? 0) >= 80
    const hasScopeSignalInQuery = hasArtifactScopeSignal(queryText)
    const shouldRunInspectionPreflight =
      ENABLE_UPLOAD_ARTIFACT_V2 &&
      (artifactIntent === "quiz" || resolvedTopicContext?.pendingArtifactIntent === "quiz") &&
      Boolean(selectedUploadIdHint || resolvedTopicContext?.lastUploadId) &&
      (
        isTextbookScaleUpload ||
        topicBreadth.isBroad ||
        isGenericQuizRequest(queryText) ||
        !hasScopeSignalInQuery
      )
    const structureInspectionForWorkflow = shouldRunInspectionPreflight
      ? await runWithTimeBudget(
          "UPLOAD_STRUCTURE_WORKFLOW_PREFLIGHT",
          async () =>
            uploadService.inspectUploadStructure({
              userId,
              uploadId: selectedUploadIdHint,
              topicContext: (resolvedTopicContext ?? undefined) as UploadTopicContext | undefined,
            }),
          1200,
          null
        )
      : null
    const structureTopicOptions = buildTopicOptionsFromStructureInspection(
      structureInspectionForWorkflow,
      4
    )
    if (structureInspectionForWorkflow) {
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingArtifactStructureInspected: true,
        pendingArtifactStructureConfidence: structureInspectionForWorkflow.confidence,
        pendingArtifactStructureTopics: structureTopicOptions,
      })
    }
    const pendingArtifactTopicSelection =
      resolvedTopicContext?.pendingArtifactTopicSelection === true
    const pendingArtifactIntent =
      resolvedTopicContext?.pendingArtifactIntent === "quiz"
        ? "quiz"
        : null
    const pendingArtifactOptions = Array.isArray(resolvedTopicContext?.pendingArtifactTopicOptions)
      ? resolvedTopicContext.pendingArtifactTopicOptions
      : []
    const effectiveArtifactIntent =
      artifactIntent === "none" && pendingArtifactIntent
        ? pendingArtifactIntent
        : artifactIntent
    const isArtifactIntentSupported = effectiveArtifactIntent === "quiz"
    const isGenericArtifactIntentRequest =
      isArtifactIntentSupported &&
      isGenericArtifactRequest(effectiveArtifactIntent, queryText)
    const hasStructureInspectionReady =
      resolvedTopicContext?.pendingArtifactStructureInspected === true
    const structureInspectionConfidence =
      resolvedTopicContext?.pendingArtifactStructureConfidence ||
      structureInspectionForWorkflow?.confidence ||
      null
    const hasSettingsSignalInQuery = hasQuizSettingsSignal(queryText)
    const hasRetrievalTopicSignals =
      topicBreadth.topicOptions.length > 0 || pageHintsForRefinement.length > 0
    const hasToolContextForRefinement =
      Boolean(uploadContextResult) ||
      Boolean(structureInspectionForWorkflow) ||
      hasRetrievalTopicSignals
    const hasWeakOrMissingRetrievalSignals =
      !uploadContextResult ||
      uploadCitationsForBreadth.length === 0 ||
      uploadContextResult.metrics.retrievalConfidence === "low" ||
      uploadContextResult.metrics.retrievalConfidence === "medium"
    const requiresInspectionBeforeGeneration =
      isArtifactIntentSupported &&
      (isTextbookScaleUpload ||
        topicBreadth.isBroad ||
        isGenericArtifactIntentRequest ||
        hasWeakOrMissingRetrievalSignals ||
        (!hasScopeSignalInQuery && !hasRetrievalTopicSignals))
    const inspectionGateSatisfied =
      !requiresInspectionBeforeGeneration || hasStructureInspectionReady
    const inspectionConfidenceAcceptable =
      !requiresInspectionBeforeGeneration || structureInspectionConfidence !== "low"
    const canInferScopeFromContext =
      hasScopeSignalInQuery ||
      hasRetrievalTopicSignals ||
      structureTopicOptions.length > 0
    const canInferSettingsFromContext =
      hasSettingsSignalInQuery ||
      (isArtifactIntentSupported && hasToolContextForRefinement)
    const requiresScopeClarification = !canInferScopeFromContext
    const requiresSettingsClarification = !canInferSettingsFromContext
    const requiresScopeOrSettingsClarification =
      requiresScopeClarification || requiresSettingsClarification
    const shouldSkipRefinementForNarrowUpload =
      isArtifactIntentSupported &&
      !isTextbookScaleUpload &&
      !topicBreadth.isBroad &&
      !isGenericArtifactIntentRequest &&
      !requiresScopeOrSettingsClarification &&
      !requiresInspectionBeforeGeneration &&
      !hasWeakOrMissingRetrievalSignals &&
      uploadCitationsForBreadth.length > 4 &&
      pageHintsForRefinement.length > 4
    const citationDerivedTopicOptions = topicBreadth.topicOptions.slice(0, 4)
    const contextAwareFallbackTopicOptions = buildContextAwareFallbackTopicOptions({
      query: queryText,
      uploadTitle: uploadTitleHintForRefinement,
      recentPages: pageHintsForRefinement,
    })
    const fallbackTopicOptions =
      citationDerivedTopicOptions.length > 0
        ? citationDerivedTopicOptions
        : structureTopicOptions.length > 0
          ? structureTopicOptions
          : contextAwareFallbackTopicOptions.length > 0
            ? contextAwareFallbackTopicOptions
            : [
                "Core definitions and foundational concepts",
                "High-yield mechanisms and processes",
                "Clinical/application-style scenarios",
              ]
    const preferredRefinementTopicOptions = dedupeRefinementOptionLabels(
      [...citationDerivedTopicOptions, ...structureTopicOptions, ...fallbackTopicOptions],
      4
    )
    const hasRefinementContextSignals =
      preferredRefinementTopicOptions.length > 0 || pageHintsForRefinement.length > 0
    const canEmitRefinementPrompt =
      isArtifactIntentSupported &&
      inspectionGateSatisfied &&
      (hasRefinementContextSignals || pendingArtifactOptions.length > 0 || hasToolContextForRefinement)
    const shouldDefaultToBalancedQuizGeneration =
      isArtifactIntentSupported &&
      isGenericArtifactIntentRequest &&
      (hasToolContextForRefinement || hasUploadContextHint) &&
      inspectionGateSatisfied &&
      inspectionConfidenceAcceptable
    let artifactRefinementPrompt: ArtifactRefinementPrompt | null = null
    let artifactRefinementToolResult: ArtifactRefinementToolResult | null = null
    const isPendingForCurrentArtifactIntent =
      isArtifactIntentSupported &&
      pendingArtifactTopicSelection &&
      pendingArtifactIntent === effectiveArtifactIntent
    const artifactTopicReplyResolution =
      isPendingForCurrentArtifactIntent && isArtifactIntentSupported
        ? resolveArtifactTopicReply(
            effectiveArtifactIntent,
            queryText,
            pendingArtifactOptions
          )
        : { resolvedTopic: null, wantsAllTopics: false }
    let shouldAskArtifactTopicFollowup =
      isArtifactIntentSupported &&
      !pendingArtifactTopicSelection &&
      !shouldSkipRefinementForNarrowUpload &&
      !shouldDefaultToBalancedQuizGeneration &&
      canEmitRefinementPrompt &&
      (
        (!canInferScopeFromContext && isGenericArtifactIntentRequest) ||
        requiresScopeOrSettingsClarification ||
        !inspectionConfidenceAcceptable
      )
    let quizQueryOverride: string | undefined = undefined
    let documentQueryOverride: string | undefined = undefined
    let quizLeadInSentence = "Here is your generated quiz."
    let documentLeadInSentence = "Here is your generated document."
    if (isArtifactIntentSupported) {
      console.log("[ARTIFACT TELEMETRY]", {
        intent: effectiveArtifactIntent,
        textbookScale: isTextbookScaleUpload,
        genericIntent: isGenericArtifactIntentRequest,
        canInferScopeFromContext,
        hasToolContextForRefinement,
        requiresScopeOrSettingsClarification,
        requiresInspectionBeforeGeneration,
        inspectionGateSatisfied,
        structureInspectionConfidence,
        shouldAskArtifactTopicFollowup,
        shouldDefaultToBalancedQuizGeneration,
        retrievalConfidence: uploadContextResult?.metrics?.retrievalConfidence || "unknown",
        retrievalFallbackReason: uploadContextResult?.metrics?.fallbackReason || "none",
        embeddingProviderMismatch,
      })
    }

    if (shouldDefaultToBalancedQuizGeneration && !pendingArtifactTopicSelection) {
      quizQueryOverride =
        "Generate a balanced mixed-topic quiz from the uploaded slides, prioritizing core definitions, mechanisms, and high-yield clinical application."
      quizLeadInSentence = "Here is your generated quiz from the uploaded slides."
    }

    if (
      pendingArtifactTopicSelection &&
      pendingArtifactIntent &&
      isArtifactIntentSupported &&
      pendingArtifactIntent !== effectiveArtifactIntent
    ) {
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingArtifactTopicSelection: false,
        pendingArtifactRefinement: false,
        pendingArtifactRefinementChoices: [],
        pendingArtifactRequiredFields: [],
        pendingArtifactCustomInputPlaceholder: null,
        pendingArtifactTopicOptions: [],
        pendingArtifactIntent: null,
        pendingArtifactOriginalQuery: null,
        pendingArtifactRequestedAt: null,
        pendingQuizTopicSelection: false,
        pendingQuizTopicOptions: [],
        pendingQuizOriginalQuery: null,
        pendingQuizRequestedAt: null,
      })
      shouldAskArtifactTopicFollowup = isArtifactIntentSupported
    }

    if (isPendingForCurrentArtifactIntent && isArtifactIntentSupported) {
      if (artifactTopicReplyResolution.wantsAllTopics) {
        quizQueryOverride =
          "Generate a balanced mixed-topic quiz that covers all major themes from the uploaded material."
        quizLeadInSentence = "Here is your generated quiz across all topics."
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          pendingArtifactTopicSelection: false,
          pendingArtifactRefinement: false,
          pendingArtifactRefinementChoices: [],
          pendingArtifactRequiredFields: [],
          pendingArtifactCustomInputPlaceholder: null,
          pendingArtifactTopicOptions: [],
          pendingArtifactIntent: null,
          pendingArtifactOriginalQuery: null,
          pendingArtifactRequestedAt: null,
          pendingQuizTopicSelection: false,
          pendingQuizTopicOptions: [],
          pendingQuizOriginalQuery: null,
          pendingQuizRequestedAt: null,
          followUpType: "drill_down",
        })
      } else if (!artifactTopicReplyResolution.resolvedTopic) {
        const followupOptions = dedupeRefinementOptionLabels(
          pendingArtifactOptions.length > 0
            ? pendingArtifactOptions
            : preferredRefinementTopicOptions,
          4
        )
        shouldAskArtifactTopicFollowup = true
        artifactRefinementPrompt = buildArtifactRefinementPrompt(
          "quiz",
          followupOptions,
          pageHintsForRefinement,
          uploadTitleHintForRefinement
        )
        artifactRefinementToolResult = toArtifactRefinementToolResult(
          artifactRefinementPrompt,
          "quiz",
          pageHintsForRefinement,
          uploadTitleHintForRefinement
        )
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          pendingArtifactTopicSelection: true,
          pendingArtifactRefinement: true,
          pendingArtifactRefinementChoices: artifactRefinementPrompt.choices,
          pendingArtifactRequiredFields: artifactRefinementPrompt.requiredFields,
          pendingArtifactCustomInputPlaceholder:
            artifactRefinementPrompt.customInputPlaceholder,
          pendingArtifactTopicOptions: followupOptions,
          pendingArtifactIntent: "quiz",
          pendingArtifactOriginalQuery:
            resolvedTopicContext?.pendingArtifactOriginalQuery || queryText,
          pendingArtifactRequestedAt: new Date().toISOString(),
          pendingQuizTopicSelection: true,
          pendingQuizTopicOptions: followupOptions,
          pendingQuizOriginalQuery:
            resolvedTopicContext?.pendingQuizOriginalQuery || queryText,
          pendingQuizRequestedAt: new Date().toISOString(),
          followUpType: "clarify",
        })
      } else if (artifactTopicReplyResolution.resolvedTopic) {
        const replyHasSettingsSignal =
          effectiveArtifactIntent === "quiz"
            ? hasQuizSettingsSignal(queryText)
            : hasDocumentSettingsSignal(queryText)
        const shouldRequireAnotherClarification =
          isTextbookScaleUpload &&
          !replyHasSettingsSignal &&
          !canInferSettingsFromContext
        if (shouldRequireAnotherClarification) {
          const followupOptions = dedupeRefinementOptionLabels(
            pendingArtifactOptions.length > 0
              ? pendingArtifactOptions
              : preferredRefinementTopicOptions,
            4
          )
          shouldAskArtifactTopicFollowup = true
          artifactRefinementPrompt = buildArtifactRefinementPrompt(
            effectiveArtifactIntent,
            followupOptions,
            pageHintsForRefinement,
            uploadTitleHintForRefinement
          )
          artifactRefinementToolResult = toArtifactRefinementToolResult(
            artifactRefinementPrompt,
            effectiveArtifactIntent,
            pageHintsForRefinement,
            uploadTitleHintForRefinement
          )
          resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
            pendingArtifactTopicSelection: true,
            pendingArtifactRefinement: true,
            pendingArtifactRefinementChoices: artifactRefinementPrompt.choices,
            pendingArtifactRequiredFields: artifactRefinementPrompt.requiredFields,
            pendingArtifactCustomInputPlaceholder:
              artifactRefinementPrompt.customInputPlaceholder,
            pendingArtifactTopicOptions: followupOptions,
            pendingArtifactIntent: effectiveArtifactIntent,
            pendingArtifactOriginalQuery:
              resolvedTopicContext?.pendingArtifactOriginalQuery || queryText,
            pendingArtifactRequestedAt: new Date().toISOString(),
            followUpType: "clarify",
          })
        } else {
          const resolvedTopic = artifactTopicReplyResolution.resolvedTopic
          if (effectiveArtifactIntent === "quiz") {
            quizQueryOverride = `Generate a focused quiz on this topic from the uploaded material: ${resolvedTopic}`
            quizLeadInSentence = `Here is your generated quiz on ${resolvedTopic}.`
          } else {
            documentQueryOverride = `Generate a focused study document on this topic from the uploaded material: ${resolvedTopic}`
            documentLeadInSentence = `Here is your generated document on ${resolvedTopic}.`
          }
          resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
            activeTopic: resolvedTopic,
            pendingArtifactTopicSelection: false,
            pendingArtifactRefinement: false,
            pendingArtifactRefinementChoices: [],
            pendingArtifactRequiredFields: [],
            pendingArtifactCustomInputPlaceholder: null,
            pendingArtifactTopicOptions: [],
            pendingArtifactIntent: null,
            pendingArtifactOriginalQuery: null,
            pendingArtifactRequestedAt: null,
            pendingQuizTopicSelection: false,
            pendingQuizTopicOptions: [],
            pendingQuizOriginalQuery: null,
            pendingQuizRequestedAt: null,
            followUpType: "drill_down",
          })
        }
      } else {
        // Keep asking for scope instead of generating a generic artifact when reply is ambiguous.
        const followupOptions = dedupeRefinementOptionLabels(
          pendingArtifactOptions.length > 0
            ? pendingArtifactOptions
            : preferredRefinementTopicOptions,
          4
        )
        shouldAskArtifactTopicFollowup = true
        artifactRefinementPrompt = buildArtifactRefinementPrompt(
          effectiveArtifactIntent,
          followupOptions,
          pageHintsForRefinement,
          uploadTitleHintForRefinement
        )
        artifactRefinementToolResult = toArtifactRefinementToolResult(
          artifactRefinementPrompt,
          effectiveArtifactIntent,
          pageHintsForRefinement,
          uploadTitleHintForRefinement
        )
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          pendingArtifactTopicSelection: true,
          pendingArtifactRefinement: true,
          pendingArtifactRefinementChoices: artifactRefinementPrompt.choices,
          pendingArtifactRequiredFields: artifactRefinementPrompt.requiredFields,
          pendingArtifactCustomInputPlaceholder:
            artifactRefinementPrompt.customInputPlaceholder,
          pendingArtifactTopicOptions: followupOptions,
          pendingArtifactIntent: effectiveArtifactIntent,
          pendingArtifactOriginalQuery:
            resolvedTopicContext?.pendingArtifactOriginalQuery || queryText,
          pendingArtifactRequestedAt: new Date().toISOString(),
          pendingQuizTopicSelection: effectiveArtifactIntent === "quiz",
          pendingQuizTopicOptions:
            effectiveArtifactIntent === "quiz" ? followupOptions : [],
          pendingQuizOriginalQuery:
            effectiveArtifactIntent === "quiz"
              ? resolvedTopicContext?.pendingQuizOriginalQuery || queryText
              : null,
          pendingQuizRequestedAt:
            effectiveArtifactIntent === "quiz" ? new Date().toISOString() : null,
          followUpType: "clarify",
        })
      }
    } else if (shouldAskArtifactTopicFollowup) {
      const followupOptions = dedupeRefinementOptionLabels(
        preferredRefinementTopicOptions,
        4
      )
      artifactRefinementPrompt =
        isArtifactIntentSupported
          ? buildArtifactRefinementPrompt(
              effectiveArtifactIntent,
              followupOptions,
              pageHintsForRefinement,
              uploadTitleHintForRefinement
            )
          : null
      artifactRefinementToolResult =
        artifactRefinementPrompt && isArtifactIntentSupported
          ? toArtifactRefinementToolResult(
              artifactRefinementPrompt,
              effectiveArtifactIntent,
              pageHintsForRefinement,
              uploadTitleHintForRefinement
            )
          : null
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingArtifactTopicSelection: true,
        pendingArtifactRefinement: artifactRefinementPrompt ? true : false,
        pendingArtifactRefinementChoices: artifactRefinementPrompt?.choices ?? [],
        pendingArtifactRequiredFields: artifactRefinementPrompt?.requiredFields ?? [],
        pendingArtifactCustomInputPlaceholder:
          artifactRefinementPrompt?.customInputPlaceholder ?? null,
        pendingArtifactTopicOptions: followupOptions,
        pendingArtifactIntent:
          isArtifactIntentSupported
            ? effectiveArtifactIntent
            : null,
        pendingArtifactOriginalQuery: queryText,
        pendingArtifactRequestedAt: new Date().toISOString(),
        pendingQuizTopicSelection: effectiveArtifactIntent === "quiz",
        pendingQuizTopicOptions:
          effectiveArtifactIntent === "quiz" ? followupOptions : [],
        pendingQuizOriginalQuery:
          effectiveArtifactIntent === "quiz" ? queryText : null,
        pendingQuizRequestedAt:
          effectiveArtifactIntent === "quiz" ? new Date().toISOString() : null,
        followUpType: "clarify",
      })
    }
    if (
      isArtifactIntentSupported &&
      !shouldAskArtifactTopicFollowup &&
      !quizQueryOverride &&
      !hasScopeSignalInQuery
    ) {
      const inferredScope =
        preferredRefinementTopicOptions[0] ||
        (pageHintsForRefinement.length > 0
          ? buildSuggestedPageRange(pageHintsForRefinement)
          : null)
      if (inferredScope) {
        const countMatch = queryText.match(
          /\bquestions?\s*:?\s*(\d+)|\b(\d+)\s*(?:questions?|mcqs?)\b/i
        )
        const requestedCountRaw = Number.parseInt(
          countMatch?.[1] || countMatch?.[2] || "",
          10
        )
        const inferredQuestionCount = Number.isFinite(requestedCountRaw)
          ? Math.max(5, Math.min(15, requestedCountRaw))
          : 10
        const inferredDifficulty = /\bhard\b/i.test(queryText)
          ? "hard"
          : /\beasy\b/i.test(queryText)
            ? "easy"
            : "medium"
        const inferredFormat = /\bcase[-\s]?based\b/i.test(queryText)
          ? "case-based MCQs"
          : /\bmixed\b/i.test(queryText)
            ? "mixed MCQs with explanations"
            : "single-best-answer MCQs"
        const isPageScoped = /^pages?\s+\d+/i.test(inferredScope)
        const scopeLine = isPageScoped
          ? `Pages: ${inferredScope.replace(/^pages?\s*/i, "")}`
          : `Topic: ${inferredScope}`
        quizQueryOverride = `${scopeLine}\nQuestions: ${inferredQuestionCount}\nDifficulty: ${inferredDifficulty}\nFormat: ${inferredFormat}`
      }
    }

    const artifactWorkflowStage: "none" | "inspect" | "refine" | "generate" =
      !isArtifactIntentSupported
        ? "none"
        : requiresInspectionBeforeGeneration && !inspectionGateSatisfied
          ? "inspect"
          : shouldAskArtifactTopicFollowup
            ? "refine"
            : "generate"
    const streamIntroPreview = buildSafeIntroPreview({
      query: queryText,
      shouldPreferUploadContext,
      shouldRunEvidenceSynthesis,
      shouldRunWebSearchPreflight,
      artifactIntent: effectiveArtifactIntent,
      artifactWorkflowStage,
    })
    if (isArtifactIntentSupported) {
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingArtifactStage: artifactWorkflowStage === "none" ? null : artifactWorkflowStage,
      })
    } else {
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingArtifactStage: null,
      })
    }

    let evidenceContext = evidenceContextResult
    let retrievalGateSummary: {
      enabled: boolean
      status: "completed" | "failed" | "skipped"
      detail: string
      elapsedMs: number
      addedCitations: number
    } | null = null
    let secondaryEvidenceFallbackSummary: {
      active: boolean
      sourceId: string | null
      sourceLabel: string
    } | null = null
    const inlineEvidenceFigureRequested =
      finalEnableEvidence && wantsInlineEvidenceFigure(queryText)
    const [explicitReferenceCitations, pmcOpenAccessReviewCitations] =
      finalEnableEvidence && queryText.length > 0
        ? await Promise.all([
            runWithTimeBudget(
              "EXPLICIT_REFERENCE_SEED",
              () => fetchExplicitReferenceCitations(queryText),
              1200,
              [] as EvidenceCitation[]
            ),
            runWithTimeBudget(
              "PMC_OPEN_ACCESS_REVIEW_SEED",
              () => fetchPmcOpenAccessReviewCitations(queryText),
              1800,
              [] as EvidenceCitation[]
            ),
          ])
        : [[] as EvidenceCitation[], [] as EvidenceCitation[]]
    const preferredInlineVisualSourceIds = new Set(
      [...explicitReferenceCitations, ...pmcOpenAccessReviewCitations].map((citation) =>
        buildEvidenceSourceId(citation)
      )
    )
    if (finalEnableEvidence && queryText.length > 0) {
      let mergedCitations = evidenceContextResult?.context?.citations
        ? [...evidenceContextResult.context.citations]
        : []
      if (uploadEvidenceCitations.length > 0) {
        mergedCitations = [...mergedCitations, ...uploadEvidenceCitations]
      }
      if (explicitReferenceCitations.length > 0) {
        mergedCitations = [...mergedCitations, ...explicitReferenceCitations]
      }
      if (pmcOpenAccessReviewCitations.length > 0) {
        mergedCitations = [...mergedCitations, ...pmcOpenAccessReviewCitations]
      }
      const guidelinePriority = benchStrictMode || hasGuidelineIntent(queryText)
      const strictCitationFloor = benchStrictMode ? STRICT_MIN_CITATION_FLOOR : 6
      const gateStartedAt = performance.now()
      const citationsBeforeGate = mergedCitations.length

      if (guidelinePriority && !hasGuidelineCitationSignal(mergedCitations)) {
        try {
          const fallbackGuidelineCitations = await runWithTimeBudget(
            "GUIDELINE_FALLBACK_CITATIONS",
            () =>
              fetchGuidelineFallbackCitations(
                queryText,
                6
              ),
            900,
            [] as EvidenceCitation[]
          )
          if (fallbackGuidelineCitations.length > 0) {
            mergedCitations = [...mergedCitations, ...fallbackGuidelineCitations]
            console.log(
              `📚 [GUIDELINE FALLBACK] Added ${fallbackGuidelineCitations.length} guideline citations`
            )
          } else {
            console.warn(
              "📚 [GUIDELINE FALLBACK] No guideline fallback citations found"
            )
          }
        } catch (error) {
          console.warn("📚 [GUIDELINE FALLBACK] Failed:", error)
        }
      }

      // Hard retrieval gate: block final answer streaming until broadening retrieval completes.
      const shouldRunBlockingBroadening =
        !shouldPreferUploadContext &&
        (shouldUseBroadEvidenceFanout ||
          mergedCitations.length < 6 ||
          (guidelinePriority && !hasGuidelineCitationSignal(mergedCitations)))

      if (shouldRunBlockingBroadening) {
        try {
          const parityCitations = await runWithTimeBudget(
            "EVIDENCE_PARITY_RETRIEVAL",
            async () => {
              const parityQueries = buildEvidenceParityQueries(queryText)
              let candidates: EvidenceCitation[] = []
              const minBlockingQueries = shouldUseBroadEvidenceFanout ? Math.min(3, parityQueries.length) : 1
              for (const [parityIndex, parityQuery] of parityQueries.entries()) {
                if (candidates.length >= 14) break
                const results = await searchMedicalEvidence({
                  query: parityQuery,
                  maxResults: 14,
                  minEvidenceLevel: Math.max(5, minEvidenceLevelForQuery),
                })
                candidates = dedupeAndReindexCitations([
                  ...candidates,
                  ...resultsToCitations(results),
                ])
                if (parityIndex + 1 >= minBlockingQueries && candidates.length >= 3) {
                  break
                }
              }

              if (candidates.length < 3) {
                const fallbackSeed = parityQueries[0] || queryText
                const expandedResults = await searchMedicalEvidence({
                  query: `${fallbackSeed} clinical trial evidence guideline summaries`,
                  maxResults: 14,
                  minEvidenceLevel: Math.max(5, minEvidenceLevelForQuery),
                })
                candidates = dedupeAndReindexCitations([
                  ...candidates,
                  ...resultsToCitations(expandedResults),
                ])
              }

              return dedupeAndReindexCitations(candidates).slice(0, 8)
            },
            shouldUseBroadEvidenceFanout ? 2600 : 1800,
            [] as EvidenceCitation[]
          )
          if (parityCitations.length > 0) {
            mergedCitations = [...mergedCitations, ...parityCitations]
            console.log(
              `📚 [EVIDENCE PARITY] Added ${parityCitations.length} supplemental citations`
            )
          }
          retrievalGateSummary = {
            enabled: true,
            status: "completed",
            detail:
              parityCitations.length > 0
                ? `Broadening search parameters completed before response synthesis (${parityCitations.length} supplemental citations).`
                : "Broadening search parameters completed before response synthesis (no additional high-signal citations).",
            elapsedMs: Math.round(performance.now() - gateStartedAt),
            addedCitations: Math.max(0, mergedCitations.length - citationsBeforeGate),
          }
        } catch (error) {
          console.warn("📚 [EVIDENCE PARITY] Failed:", error)
          retrievalGateSummary = {
            enabled: true,
            status: "failed",
            detail:
              "Broadening search parameters encountered an error; proceeding with validated pre-gate evidence.",
            elapsedMs: Math.round(performance.now() - gateStartedAt),
            addedCitations: Math.max(0, mergedCitations.length - citationsBeforeGate),
          }
        }
      } else {
        retrievalGateSummary = {
          enabled: false,
          status: "skipped",
          detail:
            "Broadening search parameters not required for this turn; primary retrieval met evidence threshold.",
          elapsedMs: Math.round(performance.now() - gateStartedAt),
          addedCitations: Math.max(0, mergedCitations.length - citationsBeforeGate),
        }
      }

      if (mergedCitations.length > 0) {
        const hasGuidelineSignalAfterBroadening = hasGuidelineCitationSignal(mergedCitations)
        if (guidelinePriority && !hasGuidelineSignalAfterBroadening) {
          const fallbackSource = mergedCitations[0]
          if (fallbackSource) {
            secondaryEvidenceFallbackSummary = {
              active: true,
              sourceId: buildEvidenceSourceId(fallbackSource),
              sourceLabel:
                fallbackSource.sourceLabel ||
                fallbackSource.journal ||
                fallbackSource.sourceType ||
                "secondary clinical evidence",
            }
          }
        }

        const rankedPool = rankCitationsForQuery(mergedCitations, queryText, {
          guidelinePriority,
          recencyPriority: freshEvidenceIntent,
        })
        let selected = filterLowRelevanceCitations(
          rankedPool,
          queryText,
          benchStrictMode ? strictCitationFloor : 6
        )
        // If relevance filtering removed everything but the ranker still had candidates,
        // keep top sources so the client gets real citation metadata and the task board
        // can attribute retrieval (avoids empty X-Evidence-Citations + "Citation 1" UI).
        if (selected.length === 0 && rankedPool.length > 0) {
          selected = dedupeAndReindexCitations(rankedPool).slice(0, 12)
        }
        if (benchStrictMode) {
          selected = ensureCitationFloor(selected, rankedPool, strictCitationFloor)
        }
        if (guidelinePriority) {
          selected = ensureGuidelineCitations(
            selected,
            rankedPool,
            STRICT_MIN_GUIDELINE_CITATIONS
          )
        }
        if (shouldUseBroadEvidenceFanout) {
          selected = ensureCitationSourceDiversity(
            selected,
            rankedPool,
            FANOUT_SOURCE_DIVERSITY_FLOOR
          )
        }
        const dedupedAndRanked = dedupeAndReindexCitations(selected).slice(0, 12)
        const rebuiltContext = buildEvidenceContext(dedupedAndRanked)
        evidenceContext = {
          context: rebuiltContext,
          shouldUseEvidence: dedupedAndRanked.length > 0,
          searchTimeMs: evidenceContextResult?.searchTimeMs ?? 0,
        }
      }
    }

    let effectiveSystemPrompt = getCachedSystemPrompt(
      effectiveUserRole || "general",
      medicalSpecialty,
      systemPrompt
    )

    if (effectiveUserRole === "medical_student") {
      effectiveSystemPrompt += `\n\n${getLearningModeSystemInstructions(
        effectiveLearningMode
      )}`
    }

    if (effectiveUserRole === "doctor") {
      effectiveSystemPrompt += `\n\n${getClinicianModeSystemInstructions(
        effectiveClinicianMode
      )}`
    }

    if (emergencyEscalationIntent.shouldEscalate) {
      effectiveSystemPrompt += `\n\n${buildEmergencyEscalationInstruction(
        emergencyEscalationIntent.matchedSignals,
        emergencyEscalationIntent.escalationLevel
      )}`
    }

    if (evidenceContext?.shouldUseEvidence && evidenceContext.context.citations.length > 0) {
      effectiveSystemPrompt = buildEvidenceSystemPrompt(effectiveSystemPrompt, evidenceContext.context)
    }

    // Patient context: extract demographics and clinical details from conversation
    try {
      const { extractPatientContext, buildPatientContextPrompt } = await import("@/lib/patient-context")
      const patientMsgs = messages
        .filter(m => typeof m.content === "string")
        .map(m => ({ role: m.role, content: m.content as string }))
      const patientCtx = extractPatientContext(patientMsgs)
      const patientPrompt = buildPatientContextPrompt(patientCtx)
      if (patientPrompt) {
        effectiveSystemPrompt += patientPrompt
      }
    } catch { /* non-fatal */ }

    if (
      (effectiveUserRole === "doctor" || effectiveUserRole === "medical_student") &&
      consultPatientId &&
      consultPracticeId &&
      validatedSupabase
    ) {
      try {
        const { buildStructuredClinicalConsultContext } = await import(
          "@/lib/clinical/server-patient-context"
        )
        const clinicalBlock = await buildStructuredClinicalConsultContext({
          supabase: validatedSupabase,
          userId,
          practiceId: consultPracticeId,
          patientId: consultPatientId,
          chatId: effectiveChatId,
          firstUserMessage: queryText.slice(0, 500),
        })
        if (clinicalBlock) {
          effectiveSystemPrompt += `\n\n${clinicalBlock}`
        }
      } catch (e) {
        console.warn("[/api/chat] structured clinical consult context failed", e)
      }
    }

    const attachmentContext = await runWithTimeBudget(
      "ATTACHMENT_CONTEXT_PREVIEW",
      () => attachmentContextPromise,
      350,
      ""
    )
    if (attachmentContext) {
      effectiveSystemPrompt += isArtifactIntentSupported
        ? `\n\nUSER ATTACHMENT CONTEXT (preview only):\n${attachmentContext}\n\nThis preview may be incomplete for large PDFs. For document/quiz artifact generation, prefer upload tools (inspectUploadStructure, uploadContextSearch, generation tools) over direct preview text.`
        : `\n\nUSER ATTACHMENT CONTEXT (from uploaded document content):\n${attachmentContext}\n\nUse this attachment content directly when answering the user's question. If the user asks whether you can see/read the file, explicitly confirm and reference the attachment by name.`
    }
    if (Array.isArray(studyGraphNodeContext) && studyGraphNodeContext.length > 0) {
      const studyGraphBlock = studyGraphNodeContext
        .slice(0, 6)
        .map((node: { nodeType: string; label: string; deadlineAt?: string | null }) => {
          const deadline = node.deadlineAt ? ` | deadline ${node.deadlineAt.slice(0, 10)}` : ""
          return `- ${node.nodeType}: ${node.label}${deadline}`
        })
        .join("\n")
      effectiveSystemPrompt += `\n\nSTRUCTURED STUDY GRAPH CONTEXT (file-grounded):\n${studyGraphBlock}\n\nUse this as structured context alongside upload citations.`
    }

    if (benchStrictMode && finalEnableEvidence) {
      effectiveSystemPrompt += `\n\n${buildBenchStrictPrompt({
        citationCount: evidenceContext?.context?.citations?.length ?? 0,
        requiresEscalation: emergencyEscalationIntent.shouldEscalate,
        requiresGuideline: hasGuidelineIntent(queryText),
        allowBibliography: allowBibliographyInOutput,
      })}`
    }

    if (webSearchPreflight?.results?.length) {
      effectiveSystemPrompt +=
        `\n\nWeb preflight found ${webSearchPreflight.results.length} relevant sources. Use webSearch only if additional freshness or corroboration is needed.`
    } else if (finalEnableSearch && !webSearchConfigured) {
      effectiveSystemPrompt +=
        "\n\nWeb search was requested but EXA_API_KEY is not configured, so continue without live web sources."
    }

    if (!finalEnableEvidence) {
      effectiveSystemPrompt = removeCitationInstructions(effectiveSystemPrompt)
      effectiveSystemPrompt += `\n\n**IMPORTANT: Do NOT include citations, citation markers, or reference numbers in your response. Respond naturally without any [CITATION:X] or [X] markers. Do not include a "Citations" section at the end.`
    }
    if (isSoapCommandRequest) {
      effectiveSystemPrompt += `\n\n**SOAP NOTE:** Write a polished chart-ready SOAP using only the consultation transcript and structured patient context already in this thread. Do not use transcript source tags like [T], [E], or [H]. Do not add numeric literature citations. If something was not discussed, write "not documented" for that element rather than inferring. Prefer accurate omission over speculation.`
    }
    effectiveSystemPrompt += `\n\nFORMATTING GUARDRAILS:
- Never output internal tool/source tags such as [tool ...], [tool slide ...], [source ...], or [doc ...].
- Never output placeholder tokens such as [CITE_PLACEHOLDER_0] or similar.
- If you mention uploaded slide locations, write them as plain text (e.g., "slide 14"), not bracketed pseudo-citations.
- When evidence citations are enabled, only use bracketed numeric citation indices like [1], [1,2], or [1-3].`

    const messagesSansUploadReferenceTokens = messages.map((message) => {
      if (message.role !== "user" || typeof message.content !== "string") {
        return message
      }
      return {
        ...message,
        content: decodeArtifactWorkflowInput(stripUploadReferenceTokens(message.content)),
      }
    })

    const modelSupportsVision = Boolean(modelConfig?.vision)
    let sawImageAttachmentAttempt = false
    const rejectedImageAttachmentDetails: Array<{ name: string; detail: string }> = []
    const filteredMessages = messagesSansUploadReferenceTokens.map((message) => {
      if (!Array.isArray(message.experimental_attachments) || message.experimental_attachments.length === 0) {
        return message
      }

      const imageCandidates = message.experimental_attachments.filter((attachment: any) => {
        const contentType = String(
          attachment?.contentType || attachment?.mimeType || ""
        ).toLowerCase()
        const url = String(attachment?.url || "")
        return contentType.startsWith("image/") || url.startsWith("data:image/")
      })
      if (imageCandidates.length > 0) {
        sawImageAttachmentAttempt = true
      }

      const { accepted, rejected } = enforceImageAttachmentPolicy(imageCandidates, {
        modelSupportsVision,
        maxImages: CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE,
      })

      if (rejected.length > 0) {
        rejected.slice(0, 4).forEach((entry) => {
          rejectedImageAttachmentDetails.push({
            name: entry.attachment?.name || "image",
            detail: entry.detail,
          })
        })
      }

      if (accepted.length === 0) {
        return {
          ...message,
          experimental_attachments: undefined,
        }
      }

      return {
        ...message,
        experimental_attachments: accepted.map((attachment) => ({
          ...attachment,
          contentType: attachment.contentType || "application/octet-stream",
        })),
      }
    })

    if (sawImageAttachmentAttempt && !modelSupportsVision) {
      return new Response(
        JSON.stringify({
          error: "Selected model does not support image uploads. Please switch to a vision-enabled model.",
          code: "MODEL_DOES_NOT_SUPPORT_VISION",
        }),
        { status: 400 }
      )
    }
    if (rejectedImageAttachmentDetails.length > 0) {
      console.warn("[/api/chat] Rejected image attachments:", rejectedImageAttachmentDetails)
    }

    // CRITICAL: Anonymize messages before sending to LLM providers
    // This ensures no PII/PHI is sent to third-party LLM services (HIPAA compliance)
    const messagesWithToolArgs = ensureToolCallArgumentsInMessages(
      filteredMessages as MessageAISDK[]
    )
    const anonymizedMessages = anonymizeMessages(messagesWithToolArgs) as MessageAISDK[]
    console.log("🔒 Messages anonymized before sending to LLM provider")
    const coreMessages = convertToCoreMessages(
      anonymizedMessages as Array<Omit<MessageAISDK, "id">>
    )

    // START STREAMING IMMEDIATELY with basic prompt
    const startTime = performance.now()
    
    // Disable provider-native web search and rely on explicit Exa-backed tooling.
    const modelWithSearch = modelConfig.apiSdk(apiKey, {
      enableSearch: false,
    })

    if (finalEnableSearch) {
      console.log("✅ WEB SEARCH ENABLED - Using explicit Exa webSearch tool path")
    }
    
    // CRITICAL: Capture evidenceContext in a const to ensure it's available in closure
    const capturedEvidenceContext = evidenceContext
    if (capturedEvidenceContext) {
      console.log(`📚 [CAPTURE] Captured evidence context with ${capturedEvidenceContext.context.citations.length} citations for onFinish callback`)
    } else {
      console.log(`📚 [CAPTURE] No evidence context to capture`)
    }
    
    // Optional live PubMed tools for freshness and sparse-corpus gaps
    const supportsTools = Boolean(modelConfig?.tools)
    const citationCountForRouting =
      capturedEvidenceContext?.context?.citations?.length ??
      evidenceContextResult?.context?.citations?.length ??
      0
    const sourceDiversityForRouting = new Set(
      (capturedEvidenceContext?.context?.citations || []).map((citation) => {
        const sourceType =
          typeof citation.sourceType === "string" ? citation.sourceType : ""
        const sourceLabel =
          typeof citation.sourceLabel === "string" ? citation.sourceLabel : ""
        const journal = typeof citation.journal === "string" ? citation.journal : ""
        return (sourceType || sourceLabel || journal || "unknown").toLowerCase()
      })
    ).size
    const scholarGatewayExplicitIntent = hasExplicitScholarGatewayIntent(queryText)
    const allowScholarGatewayTool = shouldAllowScholarGatewayTool({
      queryText,
      finalEnableEvidence,
      citationCount: citationCountForRouting,
      evidenceContextAvailable: Boolean(capturedEvidenceContext?.shouldUseEvidence),
      sourceDiversityCount: sourceDiversityForRouting,
    })
    const shouldEnableWebSearchTool =
      allowWebRetrieval &&
      supportsTools &&
      queryText.length > 0
    const shouldEnablePubMedTools =
      finalEnableEvidence &&
      supportsTools &&
      queryText.length > 0 &&
      (
        shouldUseBroadEvidenceFanout ||
        needsFreshEvidence(queryText) ||
        (capturedEvidenceContext?.context?.citations?.length ?? 0) < 4
      )
    const shouldEnableEvidenceTools = finalEnableEvidence && supportsTools && queryText.length > 0
    const canUseArtifactTools =
      supportsTools &&
      ENABLE_UPLOAD_CONTEXT_SEARCH &&
      isAuthenticated &&
      userId !== "temp"
    const shouldEnableArtifactRefinementTool =
      canUseArtifactTools &&
      artifactWorkflowStage === "refine" &&
      effectiveArtifactIntent === "quiz"
    const shouldEnableArtifactRefinementToolInInspect =
      canUseArtifactTools &&
      artifactWorkflowStage === "inspect" &&
      effectiveArtifactIntent === "quiz" &&
      canEmitRefinementPrompt
    const shouldEnableArtifactGenerationTools =
      canUseArtifactTools &&
      artifactWorkflowStage === "generate" &&
      inspectionGateSatisfied &&
      inspectionConfidenceAcceptable &&
      effectiveArtifactIntent === "quiz"
    const shouldEnableArtifactGenerationToolInInspect =
      canUseArtifactTools &&
      artifactWorkflowStage === "inspect" &&
      effectiveArtifactIntent === "quiz" &&
      inspectionConfidenceAcceptable
    const shouldEnableStructureInspectionTool =
      ENABLE_UPLOAD_ARTIFACT_V2 &&
      canUseArtifactTools &&
      artifactWorkflowStage === "inspect"
    const structureInspectionPreflight = structureInspectionForWorkflow
    const uploadContextToolMaxDurationMs =
      effectiveArtifactIntent === "quiz"
        ? 3200
        : 2200
    const allowBibliographyForOutput = false
    const shouldEnableYoutubeTool =
      ENABLE_YOUTUBE_TOOL &&
      supportsTools &&
      queryText.length > 0 &&
      youtubeIntentDecision.shouldUse
    let webSearchCallCount = 0
    let youtubeSearchCallCount = 0
    let documentArtifactCallCount = 0
    let quizArtifactCallCount = 0
    let cachedDocumentArtifact: Record<string, unknown> | null = null
    let cachedQuizArtifact: Record<string, unknown> | null = null
    let langGraphHarnessTrace: string[] = []
    let timelineAnnotationSequence = 0
    let syntheticToolCallCounter = 0
    let activeStreamWriter: {
      writeMessageAnnotation: (annotation: unknown) => void
    } | null = null
    const pendingMessageAnnotations: unknown[] = []
    let runtimeEvidenceCitations: EvidenceCitation[] = []
    let firstStreamWriteLogged = false

    const nextTimelineSequence = () => {
      timelineAnnotationSequence += 1
      return timelineAnnotationSequence
    }

    const writeStreamAnnotation = (annotation: unknown) => {
      if (activeStreamWriter) {
        if (!firstStreamWriteLogged) {
          firstStreamWriteLogged = true
          console.log(
            `[TTFT][server] first-stream-write ${Math.round(
              performance.now() - requestStartTime
            )}ms`
          )
        }
        activeStreamWriter.writeMessageAnnotation(
          annotation as Parameters<typeof activeStreamWriter.writeMessageAnnotation>[0]
        )
        return
      }
      pendingMessageAnnotations.push(annotation)
    }

    const emitTimelineEvent = (event: Record<string, unknown>) => {
      writeStreamAnnotation({
        type: "timeline-event",
        event: {
          ...event,
          sequence: event.sequence ?? nextTimelineSequence(),
          createdAt:
            typeof event.createdAt === "string"
              ? event.createdAt
              : new Date().toISOString(),
        },
      })
    }

    const resolveToolLifecycleCallId = (
      toolName: string,
      context: unknown
    ): string => {
      const candidate =
        context && typeof context === "object"
          ? (context as { toolCallId?: unknown }).toolCallId
          : undefined
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate
      }
      syntheticToolCallCounter += 1
      return `${toolName}-${Date.now()}-${syntheticToolCallCounter}`
    }

    const emitToolLifecycleEvent = (payload: {
      toolName: string
      toolCallId: string
      lifecycle: "queued" | "running" | "completed" | "failed"
      detail?: string | null
    }) => {
      const createdAt = new Date().toISOString()
      const sequence = nextTimelineSequence()
      writeStreamAnnotation({
        type: "tool-lifecycle",
        sequence,
        createdAt,
        toolName: payload.toolName,
        toolCallId: payload.toolCallId,
        lifecycle: payload.lifecycle,
        detail: payload.detail || undefined,
      })
      emitTimelineEvent({
        kind: "tool-lifecycle",
        sequence,
        createdAt,
        toolName: payload.toolName,
        toolCallId: payload.toolCallId,
        lifecycle: payload.lifecycle,
        detail: payload.detail || undefined,
      })
    }

    const pushRuntimeEvidenceCitations = (toolResult: unknown) => {
      const citations = citationsFromToolResult(toolResult)
      if (citations.length === 0) return
      runtimeEvidenceCitations = dedupeAndReindexCitations([
        ...runtimeEvidenceCitations,
        ...citations,
      ]).slice(0, 12)
      writeStreamAnnotation({
        type: "evidence-citations",
        sequence: nextTimelineSequence(),
        createdAt: new Date().toISOString(),
        citations: runtimeEvidenceCitations,
      })
    }

    const CONNECTOR_ALTERNATES: Partial<Record<ClinicalConnectorId, ClinicalConnectorId[]>> = {
      chembl: ["pubmed", "scholar_gateway"],
      biorxiv: ["pubmed", "scholar_gateway"],
      scholar_gateway: ["pubmed", "guideline"],
      guideline: ["pubmed"],
      clinical_trials: ["pubmed", "guideline"],
      synapse: ["scholar_gateway", "pubmed"],
      benchling: ["scholar_gateway", "pubmed"],
      biorender: ["scholar_gateway", "pubmed"],
      cms_coverage: ["guideline", "pubmed"],
      npi_registry: ["cms_coverage", "pubmed"],
      pubmed: ["guideline"],
      rxnorm: ["openfda", "pubmed"],
      openfda: ["rxnorm", "pubmed"],
    }

    const CONNECTOR_WEB_SCOPE_HINT: Partial<Record<ClinicalConnectorId, string>> = {
      chembl: "site:ebi.ac.uk/chembl metformin mechanism target",
      biorxiv: "site:biorxiv.org preprint",
      scholar_gateway: "systematic review meta-analysis",
      synapse: "site:synapse.org biomedical dataset",
      benchling: "site:benchling.com protocol",
      biorender: "site:biorender.com figure",
      cms_coverage: "site:cms.gov coverage policy",
      npi_registry: "site:npiregistry.cms.hhs.gov provider",
      pubmed: "site:pubmed.ncbi.nlm.nih.gov",
      guideline: "clinical practice guideline",
      clinical_trials: "site:clinicaltrials.gov",
    }

    const sourceTypeForConnector = (
      connectorId: ClinicalConnectorId
    ): SourceProvenance["sourceType"] => {
      const map: Record<ClinicalConnectorId, SourceProvenance["sourceType"]> = {
        pubmed: "pubmed",
        guideline: "guideline",
        clinical_trials: "clinical_trial",
        scholar_gateway: "scholar_gateway",
        biorxiv: "preprint",
        biorender: "visual_knowledge",
        npi_registry: "provider_registry",
        synapse: "research_dataset",
        cms_coverage: "coverage_policy",
        chembl: "chemical_database",
        benchling: "lab_workflow",
        rxnorm: "rxnorm",
        openfda: "openfda",
      }
      return map[connectorId]
    }

    const isConnectorPayloadDegraded = (payload: ConnectorSearchPayload): boolean => {
      if (payload.metrics?.degraded) return true
      if (payload.results.length === 0) return true
      if (payload.confidence < 0.45) return true
      const warningHeavy = (payload.warnings || []).some((warning) =>
        /timeout|failed|unavailable|disabled|no matching records|low-utility/i.test(warning)
      )
      return warningHeavy
    }

    const buildWebFallbackPayload = async (
      connectorId: ClinicalConnectorId,
      query: string,
      maxResults: number,
      medicalOnly: boolean
    ): Promise<ConnectorSearchPayload> => {
      const scopeHint = CONNECTOR_WEB_SCOPE_HINT[connectorId] || ""
      const webResponse = await searchWeb(`${query} ${scopeHint}`.trim(), {
        maxResults: Math.min(Math.max(maxResults, 1), 8),
        retries: 1,
        timeoutMs: FANOUT_PER_TOOL_TIMEOUT_MS + 1_200,
        medicalOnly,
      })
      const records = webResponse.results.map((item, index) => ({
        id: `${connectorId}_web_${index + 1}`,
        title: item.title,
        snippet: item.snippet,
        url: item.url || null,
        publishedAt: item.publishedDate || null,
        sourceLabel: "Web fallback",
      }))
      const provenance = records.map((record, index) =>
        buildProvenance({
          id: `${connectorId}_fallback_${index + 1}`,
          sourceType: sourceTypeForConnector(connectorId),
          sourceName: "Web fallback",
          title: record.title,
          url: record.url,
          publishedAt: record.publishedAt,
          region: null,
          journal: "Web fallback",
          doi: null,
          pmid: null,
          evidenceLevel: 4,
          studyType: "Web fallback",
          snippet: record.snippet,
        })
      )
      return {
        connectorId,
        query,
        results: records,
        warnings: [...(webResponse.warnings || []), "Connector fallback used web search."],
        provenance,
        confidence: records.length > 0 ? 0.52 : 0.2,
        licenseTier: "public",
        metrics: {
          elapsedMs: webResponse.metrics.elapsedMs,
          retriesUsed: webResponse.metrics.retriesUsed,
          sourceCount: records.length,
          fallbackUsed: true,
          cacheHit: webResponse.metrics.cacheHit,
          circuitOpen: false,
          degraded: records.length === 0,
          qualityScore: records.length > 0 ? 0.52 : 0.2,
        },
      }
    }

    const executeConnectorWithFallback = async (params: {
      connectorId: ClinicalConnectorId
      query: string
      maxResults: number
      medicalOnly: boolean
    }): Promise<ConnectorSearchPayload> => {
      const primary = await runConnectorSearch({
        connectorId: params.connectorId,
        query: params.query,
        maxResults: params.maxResults,
        medicalOnly: params.medicalOnly,
      })
      if (!isConnectorPayloadDegraded(primary)) {
        return primary
      }

      const narrowedQuery = params.query
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .join(" ")
      if (narrowedQuery.length >= 3 && narrowedQuery !== params.query.trim()) {
        const narrowed = await runConnectorSearch({
          connectorId: params.connectorId,
          query: narrowedQuery,
          maxResults: params.maxResults,
          medicalOnly: params.medicalOnly,
        })
        if (!isConnectorPayloadDegraded(narrowed)) {
          return {
            ...narrowed,
            warnings: [...narrowed.warnings, "Applied narrowed-query retry for connector quality."],
            metrics: {
              ...narrowed.metrics,
              fallbackUsed: true,
            },
          }
        }
      }

      const alternates = CONNECTOR_ALTERNATES[params.connectorId] || []
      for (const alternateConnector of alternates.slice(0, 2)) {
        const alternatePayload = await runConnectorSearch({
          connectorId: alternateConnector,
          query: params.query,
          maxResults: params.maxResults,
          medicalOnly: params.medicalOnly,
        })
        if (!isConnectorPayloadDegraded(alternatePayload)) {
          return {
            ...alternatePayload,
            warnings: [
              ...alternatePayload.warnings,
              `Primary connector ${params.connectorId} degraded; used alternate ${alternateConnector}.`,
            ],
            metrics: {
              ...alternatePayload.metrics,
              fallbackUsed: true,
            },
          }
        }
      }

      if (allowWebRetrieval) {
        return buildWebFallbackPayload(
          params.connectorId,
          params.query,
          params.maxResults,
          params.medicalOnly
        )
      }

      return primary
    }

    const RETRIEVAL_SIGNAL_TOOLS = new Set([
      "guidelineSearch",
      "pubmedSearch",
      "pubmedLookup",
      "clinicalTrialsSearch",
      "scholarGatewaySearch",
      "bioRxivSearch",
      "webSearch",
      "uploadContextSearch",
      "rxnormInteractionSearch",
      "openfdaDrugLabelSearch",
    ])

    const countToolResultRecords = (result: unknown): number => {
      if (Array.isArray(result)) return result.length
      if (!result || typeof result !== "object") return 0
      const candidate = result as Record<string, unknown>
      if (Array.isArray(candidate.results)) return candidate.results.length
      if (Array.isArray(candidate.articles)) return candidate.articles.length
      if (Array.isArray(candidate.trials)) return candidate.trials.length
      if (Array.isArray(candidate.citations)) return candidate.citations.length
      if (typeof candidate.totalResults === "number") return Math.max(0, candidate.totalResults)
      if (typeof candidate.rawTotalResults === "number") return Math.max(0, candidate.rawTotalResults)
      if (typeof candidate.found === "boolean") return candidate.found ? 1 : 0
      if (candidate.article && typeof candidate.article === "object") return 1
      return 0
    }

    const evaluateToolResultSignal = (
      toolName: string,
      result: unknown
    ): {
      shouldEvaluate: boolean
      hasData: boolean
      count: number
      detail?: string
    } => {
      if (!RETRIEVAL_SIGNAL_TOOLS.has(toolName)) {
        return {
          shouldEvaluate: false,
          hasData: true,
          count: 0,
        }
      }
      const sourceLabelByTool: Record<string, string> = {
        guidelineSearch: "Guideline Index",
        pubmedSearch: "PubMed",
        pubmedLookup: "PubMed",
        clinicalTrialsSearch: "ClinicalTrials.gov",
        scholarGatewaySearch: "Scholar Gateway",
        bioRxivSearch: "bioRxiv",
        webSearch: "Web Search",
        uploadContextSearch: "Upload Context",
        rxnormInteractionSearch: "RxNorm Interactions",
        openfdaDrugLabelSearch: "OpenFDA Drug Labels",
      }
      const sourceLabel = sourceLabelByTool[toolName] || "primary source"
      const noSignalReason = `No direct matches found in ${sourceLabel}. Attempting query expansion...`
      const count = countToolResultRecords(result)
      if (toolName === "guidelineSearch") {
        const candidate =
          result && typeof result === "object"
            ? (result as Record<string, unknown>)
            : null
        const strategy =
          candidate?.strategy && typeof candidate.strategy === "object"
            ? (candidate.strategy as Record<string, unknown>)
            : null
        const directMatches =
          strategy && typeof strategy.directMatches === "number"
            ? strategy.directMatches
            : count
        const secondaryMatches =
          strategy && typeof strategy.secondaryMatches === "number"
            ? strategy.secondaryMatches
            : 0
        if (directMatches <= 0) {
          if (count > 0 || secondaryMatches > 0) {
            return {
              shouldEvaluate: true,
              hasData: true,
              count: Math.max(count, secondaryMatches),
              detail:
                "No direct guideline PDF matches in current index; checking secondary medical databases.",
            }
          }
          return {
            shouldEvaluate: true,
            hasData: false,
            count: 0,
            detail: noSignalReason,
          }
        }
      }
      if (count > 0) {
        return {
          shouldEvaluate: true,
          hasData: true,
          count,
        }
      }
      return {
        shouldEvaluate: true,
        hasData: false,
        count: 0,
        detail: noSignalReason,
      }
    }

    const resolveUploadRecordForChatTools = async (uploadId?: string) => {
      const scopedUploadId =
        typeof uploadId === "string" && isUuidLike(uploadId)
          ? uploadId
          : selectedUploadIdHint && isUuidLike(selectedUploadIdHint)
            ? selectedUploadIdHint
            : undefined
      if (!scopedUploadId) return null
      if (!isAuthenticated || userId === "temp") return null

      let supabase = validatedSupabase
      if (!supabase) {
        supabase = await createClient()
      }
      if (!supabase) return null

      const { data, error } = await (supabase as any)
        .from("user_uploads")
        .select("id, title, file_name, upload_kind, metadata")
        .eq("id", scopedUploadId)
        .eq("user_id", userId)
        .maybeSingle()
      if (error || !data) {
        return null
      }
      return {
        id: data.id as string,
        title: (data.title as string | null) || (data.file_name as string | null) || "Uploaded material",
        fileName: (data.file_name as string | null) || null,
        uploadKind: (data.upload_kind as string | null) || "other",
        metadata:
          data.metadata && typeof data.metadata === "object"
            ? (data.metadata as Record<string, unknown>)
            : ({} as Record<string, unknown>),
      }
    }

    if (ENABLE_YOUTUBE_TOOL && supportsTools && queryText.length > 0) {
      console.log("[YOUTUBE INTENT]", {
        shouldEnableYoutubeTool,
        reason: youtubeIntentDecision.reason,
        explicitRequest: youtubeIntentDecision.explicitRequest,
      })
    }
    if (isArtifactIntentSupported) {
      console.log("[ARTIFACT TOOLING]", {
        supportsTools,
        finalEnableEvidence,
        canUseArtifactTools,
        artifactWorkflowStage,
      })
    }

    const evidenceRuntimeTools: ToolSet = shouldEnableEvidenceTools
      ? {
          ...(ENABLE_UPLOAD_CONTEXT_SEARCH
            ? { uploadContextSearch: tool({
            description:
              "Search user-uploaded documents with page-aware and topic-aware retrieval modes.",
            parameters: z.object({
              query: z
                .string()
                .default("")
                .describe("Optional query to search within uploaded documents. May be empty for page/range lookups."),
              // Accepts either a UUID or a human label; non-UUID values are safely ignored.
              uploadId: z.string().min(1).optional().describe("Optional upload identifier to scope retrieval"),
              mode: z
                .enum(["auto", "page_lookup", "range_lookup", "semantic", "hybrid"])
                .default("auto"),
              page: z.number().int().min(1).optional(),
              pageStart: z.number().int().min(1).optional(),
              pageEnd: z.number().int().min(1).optional(),
              topK: z.number().int().min(1).max(20).default(6),
              includeNeighborPages: z.number().int().min(0).max(3).default(1),
              conversationContext: z
                .object({
                  activeTopic: z.string().optional(),
                  lastUploadId: z.string().optional(),
                  recentPages: z.array(z.number().int().min(1)).optional(),
                  recentEvidenceIds: z.array(z.string()).optional(),
                  followUpType: z
                    .enum([
                      "clarify",
                      "next_page",
                      "previous_page",
                      "drill_down",
                      "switch_topic",
                      "unknown",
                    ])
                    .optional(),
                })
                .optional(),
            }),
            execute: async ({
              query,
              uploadId,
              mode,
              page,
              pageStart,
              pageEnd,
              topK,
              includeNeighborPages,
              conversationContext,
            }) => {
              const normalizedUploadId =
                typeof uploadId === "string" && isUuidLike(uploadId) ? uploadId : undefined

              if (!isAuthenticated || userId === "temp") {
                return {
                  intent: { modeResolved: mode, page: page ?? null, pageStart: pageStart ?? null, pageEnd: pageEnd ?? null },
                  results: [],
                  pagesReturned: [],
                  warnings: ["User must be authenticated to search uploads."],
                  metrics: {
                    candidateCount: 0,
                    elapsedMs: 0,
                    fallbackUsed: false,
                    fallbackReason: "none",
                    retrievalConfidence: "low",
                    sourceUnitCount: 0,
                    maxUnitNumber: 0,
                    textbookScale: false,
                  },
                }
              }

              const result = await uploadService.uploadContextSearch({
                userId,
                query,
                apiKey,
                embeddingApiKey,
                uploadId: normalizedUploadId,
                mode,
                page,
                pageStart,
                pageEnd,
                topK,
                includeNeighborPages,
                topicContext: (mergeTopicContexts(
                  resolvedTopicContext,
                  normalizeTopicContext(conversationContext)
                ) ?? undefined) as UploadTopicContext | undefined,
                maxDurationMs: uploadContextToolMaxDurationMs,
              })

              return {
                intent: result.intent,
                citations: result.citations,
                results: result.citations.map((citation) => ({
                  index: citation.index,
                  title: citation.title,
                  sourceLabel: citation.sourceLabel,
                  pmcid: citation.pmcid,
                  uploadId: citation.uploadId,
                  sourceUnitId: citation.sourceUnitId,
                  sourceUnitType: citation.sourceUnitType,
                  sourceUnitNumber: citation.sourceUnitNumber,
                  sourceOffsetStart: citation.sourceOffsetStart,
                  sourceOffsetEnd: citation.sourceOffsetEnd,
                  url: citation.url,
                  snippet: citation.snippet,
                  score: citation.score,
                  previewReference: citation.previewReference || null,
                  figureReferences: citation.figureReferences || [],
                })),
                pagesReturned: result.pagesReturned,
                warnings: result.warnings,
                metrics: result.metrics,
              }
            },
          }) }
            : {}),
          ...(shouldEnableStructureInspectionTool
            ? {
                inspectUploadStructure: tool({
                  description:
                    "Inspect uploaded document structure (TOC, section headings, topic map) before generation.",
                  parameters: z.object({
                    uploadId: z
                      .string()
                      .min(1)
                      .optional()
                      .describe("Optional upload UUID to inspect"),
                    maxHeadings: z.number().int().min(6).max(32).default(18),
                    maxTopics: z.number().int().min(6).max(28).default(14),
                  }),
                  execute: async ({ uploadId, maxHeadings, maxTopics }) => {
                    const normalizedUploadId =
                      typeof uploadId === "string" && isUuidLike(uploadId) ? uploadId : undefined
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        uploadId: null,
                        uploadTitle: null,
                        sourceUnitCount: 0,
                        maxUnitNumber: 0,
                        probableTocPages: [],
                        pageOffsetEstimate: null,
                        partDistribution: {},
                        headingCandidates: [],
                        topicMap: [],
                        extractionCoverage: 0,
                        confidence: "low",
                        textbookScale: false,
                        warnings: ["User must be authenticated to inspect upload structure."],
                        inspectedAt: new Date().toISOString(),
                      }
                    }
                    return uploadService.inspectUploadStructure({
                      userId,
                      uploadId:
                        normalizedUploadId ||
                        (selectedUploadIdHint && isUuidLike(selectedUploadIdHint)
                          ? selectedUploadIdHint
                          : undefined),
                      topicContext: (resolvedTopicContext ?? undefined) as UploadTopicContext | undefined,
                      maxHeadings,
                      maxTopics,
                    })
                  },
                }),
              }
            : {}),
          ...(shouldEnableArtifactRefinementTool ||
          shouldEnableArtifactRefinementToolInInspect
            ? {
                refineQuizRequirements: tool({
                  description:
                    "Create concise, context-aware refinement questions and A-E options before quiz generation.",
                  parameters: z.object({
                    intent: z.enum(["quiz"]).optional(),
                    objective: z.string().min(1).optional(),
                  }),
                  execute: async ({ objective }) => {
                    const resolvedIntent: "quiz" = "quiz"
                    const topicOptions =
                      resolvedTopicContext?.pendingArtifactTopicOptions &&
                      resolvedTopicContext.pendingArtifactTopicOptions.length > 0
                        ? resolvedTopicContext.pendingArtifactTopicOptions
                        : fallbackTopicOptions
                    const refinementPrompt =
                      artifactRefinementPrompt ||
                      buildArtifactRefinementPrompt(
                        resolvedIntent,
                        topicOptions,
                        pageHintsForRefinement,
                        uploadTitleHintForRefinement
                      )

                    return {
                      ...toArtifactRefinementToolResult(
                        refinementPrompt,
                        resolvedIntent,
                        pageHintsForRefinement,
                        uploadTitleHintForRefinement
                      ),
                      objective: objective || null,
                    }
                  },
                }),
                refineArtifactRequirements: tool({
                  description:
                    "Create concise, context-aware refinement questions and A-E options before quiz generation.",
                  parameters: z.object({
                    intent: z.enum(["quiz"]).optional(),
                    objective: z.string().min(1).optional(),
                  }),
                  execute: async ({ objective }) => {
                    const resolvedIntent: "quiz" = "quiz"
                    const topicOptions =
                      resolvedTopicContext?.pendingArtifactTopicOptions &&
                      resolvedTopicContext.pendingArtifactTopicOptions.length > 0
                        ? resolvedTopicContext.pendingArtifactTopicOptions
                        : fallbackTopicOptions
                    const refinementPrompt =
                      artifactRefinementPrompt ||
                      buildArtifactRefinementPrompt(
                        resolvedIntent,
                        topicOptions,
                        pageHintsForRefinement,
                        uploadTitleHintForRefinement
                      )

                    return {
                      ...toArtifactRefinementToolResult(
                        refinementPrompt,
                        resolvedIntent,
                        pageHintsForRefinement,
                        uploadTitleHintForRefinement
                      ),
                      objective: objective || null,
                    }
                  },
                }),
              }
            : {}),
          ...(shouldEnableArtifactGenerationTools ||
          shouldEnableArtifactGenerationToolInInspect
            ? {
                generateQuizFromUpload: tool({
                  description:
                    "Generate a multiple-choice quiz from user-uploaded content.",
                  parameters: z.object({
                    query: z
                      .string()
                      .min(1)
                      .describe("Topic to quiz from uploaded context"),
                    uploadId: z
                      .string()
                      .min(1)
                      .optional()
                      .describe("Optional upload UUID to scope generation"),
                    questionCount: z.number().int().min(3).max(10).default(5),
                  }),
                  execute: async ({ query, uploadId, questionCount }) => {
                    quizArtifactCallCount += 1
                    if (!allowMultipleArtifacts && quizArtifactCallCount > 1 && cachedQuizArtifact) {
                      return cachedQuizArtifact
                    }
                    const normalizedUploadId =
                      typeof uploadId === "string" && isUuidLike(uploadId) ? uploadId : undefined
                    const artifact = await uploadService.generateQuizFromUpload({
                      userId,
                      query: quizQueryOverride || query,
                      uploadId:
                        normalizedUploadId ||
                        (selectedUploadIdHint && isUuidLike(selectedUploadIdHint)
                          ? selectedUploadIdHint
                          : undefined),
                      apiKey,
                      embeddingApiKey,
                      topicContext:
                        (resolvedTopicContext ?? undefined) as UploadTopicContext | undefined,
                      questionCount,
                    })
                    if (!allowMultipleArtifacts) {
                      cachedQuizArtifact = artifact as Record<string, unknown>
                    }
                    return artifact
                  },
                }),
              }
            : {}),
          ...(shouldEnableEvidenceTools
            ? {
                generateTimetableFromUploads: tool({
                  description:
                    "Generate a study timetable/plan from uploaded materials and inferred timetable metadata.",
                  parameters: z.object({
                    title: z.string().min(1).max(120).optional(),
                    uploadId: z.string().min(1).optional(),
                    startDate: z
                      .string()
                      .regex(/^\d{4}-\d{2}-\d{2}$/)
                      .optional()
                      .describe("YYYY-MM-DD"),
                    endDate: z
                      .string()
                      .regex(/^\d{4}-\d{2}-\d{2}$/)
                      .optional()
                      .describe("YYYY-MM-DD"),
                    hoursPerDay: z.number().min(0.5).max(16).default(3),
                  }),
                  execute: async ({ title, uploadId, startDate, endDate, hoursPerDay }) => {
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        ok: false,
                        error: "User must be authenticated to generate a timetable.",
                      }
                    }

                    const uploadRecord = await resolveUploadRecordForChatTools(uploadId)
                    const extraction =
                      uploadRecord?.metadata?.studyExtraction &&
                      typeof uploadRecord.metadata.studyExtraction === "object"
                        ? (uploadRecord.metadata.studyExtraction as Record<string, unknown>)
                        : null
                    const timetableEntries = extraction?.timetableEntries
                    const datedEntries = Array.isArray(timetableEntries)
                      ? timetableEntries
                          .map((entry) => {
                            if (!entry || typeof entry !== "object") return null
                            const date = typeof entry.date === "string" ? entry.date : null
                            return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
                          })
                          .filter((item): item is string => Boolean(item))
                      : []
                    const sortedDates = [...datedEntries].sort((a, b) => a.localeCompare(b))

                    const today = new Date().toISOString().slice(0, 10)
                    const inferredStart = sortedDates[0] || today
                    const inferredEnd =
                      sortedDates.length > 1
                        ? sortedDates[sortedDates.length - 1]
                        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
                            .toISOString()
                            .slice(0, 10)

                    const generated = await studyPlannerService.generatePlan({
                      userId,
                      title:
                        title ||
                        (uploadRecord ? `${uploadRecord.title} timetable` : "Study timetable"),
                      startDate: startDate || inferredStart,
                      endDate: endDate || inferredEnd,
                      hoursPerDay: Math.max(0.5, Math.min(16, Number(hoursPerDay || 3))),
                    })

                    return {
                      ok: true,
                      sourceUploadId: uploadRecord?.id || null,
                      sourceUploadTitle: uploadRecord?.title || null,
                      inferredFromUploadDates: datedEntries.length > 0,
                      plan: generated.plan,
                      blockCount: generated.blocks.length,
                      previewBlocks: generated.blocks.slice(0, 10).map((block) => ({
                        id: block.id,
                        title: block.title,
                        startsAt: block.startAt,
                        endsAt: block.endAt,
                        status: block.status,
                      })),
                    }
                  },
                }),
                rebuildStudyGraphFromUpload: tool({
                  description:
                    "Rebuild StudyGraph nodes/edges from a selected upload's extracted study metadata.",
                  parameters: z.object({
                    uploadId: z.string().min(1).optional(),
                  }),
                  execute: async ({ uploadId }) => {
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        ok: false,
                        error: "User must be authenticated to rebuild StudyGraph.",
                      }
                    }
                    const uploadRecord = await resolveUploadRecordForChatTools(uploadId)
                    if (!uploadRecord) {
                      return {
                        ok: false,
                        error: "No upload found. Provide uploadId or reference an upload in chat.",
                      }
                    }
                    const extraction =
                      uploadRecord.metadata.studyExtraction &&
                      typeof uploadRecord.metadata.studyExtraction === "object"
                        ? (uploadRecord.metadata.studyExtraction as Record<string, unknown>)
                        : null
                    if (!extraction) {
                      return {
                        ok: false,
                        error:
                          "This upload has no studyExtraction metadata yet. Reprocess the upload first.",
                      }
                    }
                    const rebuilt = await studyGraphService.rebuildGraphFromUpload({
                      userId,
                      uploadId: uploadRecord.id,
                      uploadTitle: uploadRecord.title,
                      extraction: extraction as any,
                    })
                    return {
                      ok: true,
                      uploadId: uploadRecord.id,
                      nodeCount: rebuilt.nodeCount,
                      edgeCount: rebuilt.edgeCount,
                    }
                  },
                }),
                rebalanceTimetablePlan: tool({
                  description: "Rebalance a generated timetable after missed or shifted blocks.",
                  parameters: z.object({
                    planId: z.string().min(1),
                    missedBlockIds: z.array(z.string().min(1)).optional(),
                  }),
                  execute: async ({ planId, missedBlockIds }) => {
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        ok: false,
                        error: "User must be authenticated to rebalance a timetable.",
                      }
                    }
                    const result = await studyPlannerService.rebalancePlan({
                      userId,
                      planId,
                      missedBlockIds,
                    })
                    if (!result) {
                      return {
                        ok: false,
                        error: "Plan not found.",
                      }
                    }
                    return {
                      ok: true,
                      planId: result.plan.id,
                      movedBlockCount: result.blocks.length,
                      previewBlocks: result.blocks.slice(0, 10).map((block) => ({
                        id: block.id,
                        title: block.title,
                        startsAt: block.startAt,
                        endsAt: block.endAt,
                        status: block.status,
                      })),
                    }
                  },
                }),
                createReviewQueueFromUploads: tool({
                  description:
                    "Generate and fetch a spaced-repetition review queue from uploaded study sources.",
                  parameters: z.object({
                    limit: z.number().int().min(1).max(80).default(24),
                  }),
                  execute: async ({ limit }) => {
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        ok: false,
                        error: "User must be authenticated to create review queues.",
                      }
                    }
                    const generatedItems = await studyReviewService.generateReviewItems({
                      userId,
                      limit,
                    })
                    const due = await studyReviewService.getDueQueue(userId, limit)
                    return {
                      ok: true,
                      generatedCount: generatedItems.length,
                      dueCount: due.due.length,
                      duePreview: due.due.slice(0, 10).map((item) => ({
                        id: item.id,
                        prompt: item.prompt,
                        topicLabel: item.topicLabel,
                        dueAt: item.nextReviewAt,
                        status: item.status,
                      })),
                    }
                  },
                }),
                summarizeLectureUpload: tool({
                  description:
                    "Generate lecture notes, summary, and next actionables from an uploaded lecture video or document.",
                  parameters: z.object({
                    uploadId: z.string().min(1).optional(),
                    includeActionables: z.boolean().default(true),
                  }),
                  execute: async ({ uploadId, includeActionables }) => {
                    if (!isAuthenticated || userId === "temp") {
                      return {
                        ok: false,
                        error: "User must be authenticated to summarize uploaded lectures.",
                      }
                    }

                    const uploadRecord = await resolveUploadRecordForChatTools(uploadId)
                    if (!uploadRecord) {
                      return {
                        ok: false,
                        error:
                          "No upload found. Provide an uploadId or reference an upload in chat first.",
                      }
                    }

                    const extraction =
                      uploadRecord.metadata.studyExtraction &&
                      typeof uploadRecord.metadata.studyExtraction === "object"
                        ? (uploadRecord.metadata.studyExtraction as Record<string, unknown>)
                        : null
                    const extractionSummary =
                      extraction && typeof extraction.lectureSummary === "string"
                        ? extraction.lectureSummary
                        : null
                    const extractionActionables =
                      extraction && Array.isArray(extraction.actionables)
                        ? extraction.actionables
                            .map((item) => (typeof item === "string" ? item.trim() : ""))
                            .filter((item): item is string => item.length > 0)
                        : []
                    const extractionTopics =
                      extraction && Array.isArray(extraction.topicLabels)
                        ? extraction.topicLabels
                            .map((item) => (typeof item === "string" ? item.trim() : ""))
                            .filter((item): item is string => item.length > 0)
                        : []

                    let summary = extractionSummary || ""
                    let actionables = extractionActionables

                    if (!summary) {
                      try {
                        const detail = await uploadService.getUploadDetail(
                          userId,
                          uploadRecord.id
                        )
                        if (detail) {
                          const synthesized = summarizeTextForNotes(
                            detail.sourceUnits.map((unit) => unit.extractedText || "").join("\n")
                          )
                          summary = synthesized.summary
                          if (actionables.length === 0) {
                            actionables = synthesized.actionables
                          }
                        }
                      } catch {
                        // fall through and return best-effort metadata summary
                      }
                    }

                    const nextActions = [
                      actionables[0] || "Ask chat to convert this lecture into a timed study block.",
                      actionables[1] || "Generate a 10-question viva drill from these notes.",
                      "Create a spaced-repetition queue from the lecture takeaways.",
                    ]
                      .filter((item): item is string => Boolean(item))
                      .slice(0, 5)

                    return {
                      ok: true,
                      uploadId: uploadRecord.id,
                      uploadTitle: uploadRecord.title,
                      uploadKind: uploadRecord.uploadKind,
                      summary: summary || "No transcript summary available yet.",
                      actionables: includeActionables ? actionables.slice(0, 12) : [],
                      keyTopics: extractionTopics.slice(0, 12),
                      nextActions,
                    }
                  },
                }),
              }
            : {}),
          pubmedSearch: tool({
            description: "Search PubMed for recent or guideline-related medical literature.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical query for PubMed"),
              maxResults: z.number().int().min(1).max(10).default(5),
            }),
            execute: async ({ query, maxResults }) => {
              const strategies = buildPubMedQueryStrategies(query)
              let rawTotalResults = 0
              const collectedArticles: Array<Awaited<ReturnType<typeof searchPubMed>>["articles"][number]> = []
              const seenPmids = new Set<string>()
              let usedQuery = strategies[0] || query

              for (const strategy of strategies) {
                const result = await searchPubMed(strategy, Math.min(maxResults * 4, 32))
                rawTotalResults = Math.max(rawTotalResults, result.totalResults)
                if (result.articles.length === 0) {
                  continue
                }
                usedQuery = strategy
                for (const article of result.articles) {
                  if (!article?.pmid || seenPmids.has(article.pmid)) continue
                  if (
                    !isTextRelevantToClinicalQuery(
                      `${article.title || ""} ${article.abstract || ""}`,
                      query
                    )
                  ) {
                    continue
                  }
                  seenPmids.add(article.pmid)
                  collectedArticles.push(article)
                  if (collectedArticles.length >= maxResults) break
                }
                if (collectedArticles.length >= maxResults) break
              }
              const relevantArticles = collectedArticles.slice(0, maxResults)

              const provenance: SourceProvenance[] = relevantArticles.map((a, idx) =>
                buildProvenance({
                  id: `pubmed_${a.pmid || idx + 1}`,
                  sourceType: "pubmed",
                  sourceName: "PubMed",
                  title: a.title,
                  url: a.url || null,
                  publishedAt: a.year ? String(a.year) : null,
                  region: null,
                  journal: a.journal || "PubMed",
                  doi: a.doi || null,
                  pmid: a.pmid || null,
                  evidenceLevel: 2,
                  studyType: "Literature record",
                  snippet: (a.abstract || "").slice(0, 320),
                })
              )
              const payload = {
                totalResults: relevantArticles.length,
                rawTotalResults,
                searchedQuery: usedQuery,
                attemptedQueries: strategies,
                articles: relevantArticles.map(a => ({
                  pmid: a.pmid,
                  title: a.title,
                  journal: a.journal,
                  year: a.year,
                  doi: a.doi,
                  url: a.url,
                })),
                provenance,
              }
              pushRuntimeEvidenceCitations(payload)
              return payload
            },
          }),
          pubmedLookup: tool({
            description: "Get details for a PubMed article by PMID.",
            parameters: z.object({
              pmid: z.string().min(4).describe("PubMed ID"),
            }),
            execute: async ({ pmid }) => {
              const article = await fetchPubMedArticle(pmid)
              if (!article) return { found: false }
              const provenance = [
                buildProvenance({
                  id: `pubmed_${article.pmid || "lookup"}`,
                  sourceType: "pubmed",
                  sourceName: "PubMed",
                  title: article.title,
                  url: article.url || null,
                  publishedAt: article.year ? String(article.year) : null,
                  region: null,
                  journal: article.journal || "PubMed",
                  doi: article.doi || null,
                  pmid: article.pmid || null,
                  evidenceLevel: 2,
                  studyType: "Literature record",
                  snippet: article.abstract || "",
                }),
              ]
              const payload = {
                found: true,
                article: {
                  pmid: article.pmid,
                  title: article.title,
                  abstract: article.abstract,
                  journal: article.journal,
                  year: article.year,
                  doi: article.doi,
                  url: article.url,
                },
                provenance,
              }
              pushRuntimeEvidenceCitations(payload)
              return payload
            },
          }),
          guidelineSearch: tool({
            description: "Search guideline-like sources from the pre-indexed local corpus and live adapters.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical guideline query"),
              maxResults: z.number().int().min(1).max(10).default(6),
            }),
            execute: async ({ query, maxResults }) => {
              const strictMaxResults = benchStrictMode
                ? Math.max(maxResults, 8)
                : maxResults
              const startedAt = performance.now()

              // Fast path: search local pre-indexed guideline corpus first.
              // This avoids the slow live-adapter cascade (4 variants × 5 regions × adapters = 60 calls).
              let localResults: any[] = []
              try {
                const { searchMedicalEvidence } = await import("@/lib/evidence/search")
                const localEvidence = await searchMedicalEvidence({
                  query: query.includes("guideline") ? query : `${query} guideline`,
                  maxResults: strictMaxResults,
                  studyTypes: ["Guideline", "Practice Guideline", "Consensus"],
                  enableRerank: true,
                  queryExpansion: true,
                })
                localResults = localEvidence
                  .filter((r) =>
                    /guideline|consensus|recommendation|statement|practice/i.test(
                      `${r.title || ""} ${r.study_type || ""} ${r.content || ""}`
                    )
                  )
                  .slice(0, strictMaxResults)
              } catch {
                // Local search failed; continue to live fallback
              }

              const localMs = Math.round(performance.now() - startedAt)

              // If local corpus delivered enough guideline results, return immediately
              if (localResults.length >= 2) {
                const results = localResults.map((r) => ({
                  title: r.title || "Untitled guideline",
                  source: r.journal_name || "Medical Evidence Index",
                  region: null,
                  date: r.publication_year ? String(r.publication_year) : null,
                  url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}` : null,
                  summary: (r.content || "").slice(0, 400),
                  evidenceLevel: r.evidence_level ?? 2,
                  studyType: r.study_type || "Guideline",
                }))
                const provenance = localResults.map((r) =>
                  buildProvenance({
                    id: r.id || `local:${r.pmid || r.title}`,
                    sourceType: "guideline" as any,
                    sourceName: r.journal_name || "Local Guideline Index",
                    title: r.title || "",
                    url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}` : null,
                    publishedAt: r.publication_year ? `${r.publication_year}-01-01` : null,
                    region: null,
                    journal: r.journal_name || null,
                    doi: r.doi || null,
                    pmid: r.pmid || null,
                    evidenceLevel: r.evidence_level ?? 2,
                    studyType: r.study_type || "Guideline",
                    snippet: (r.content || "").slice(0, 300),
                  })
                )
                const payload = {
                  results,
                  sourcesUsed: ["Local Guideline Index"],
                  provenance,
                  warnings: [] as string[],
                  attemptedQueries: [query],
                  strategy: {
                    directMatches: results.length,
                    broadenedMatches: 0,
                    secondaryMatches: 0,
                    fallbackTriggered: false,
                    localFastPath: true,
                    localMs,
                  },
                }
                logGuidelineDiagnostics("guideline_tool_execute", {
                  query,
                  strictMaxResults,
                  benchStrictMode,
                  elapsedMs: localMs,
                  resultCount: results.length,
                  provenanceCount: provenance.length,
                  strategy: payload.strategy,
                  steps: [{ step: "local_fast_path", query, source: "medical_evidence", resultCount: results.length }],
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              }

              // Slow path: live adapter cascade (only when local corpus has <2 guideline results)
              const mergedByKey = new Map<string, any>()
              const mergedProvenanceByKey = new Map<string, SourceProvenance>()
              const sourcesUsed = new Set<string>()
              const attemptedQueries: string[] = []

              // Seed with any local results we did find
              localResults.forEach((r) => {
                const key = `${r.pmid || ""}|${(r.title || "").toLowerCase()}`
                if (!mergedByKey.has(key)) {
                  mergedByKey.set(key, {
                    title: r.title || "",
                    source: r.journal_name || "Local Index",
                    region: null,
                    date: r.publication_year ? String(r.publication_year) : null,
                    url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}` : null,
                    summary: (r.content || "").slice(0, 400),
                    evidenceLevel: r.evidence_level ?? 2,
                    studyType: r.study_type || "Guideline",
                  })
                  sourcesUsed.add("Local Guideline Index")
                }
              })

              // Run live search with a tight 8s timeout — single variant, single region
              try {
                const timeoutPromise = new Promise<void>((_, reject) =>
                  setTimeout(() => reject(new Error("guideline_live_timeout")), 8_000)
                )
                const livePromise = (async () => {
                  const primary = await searchGuidelines(query, strictMaxResults, "US")
                  attemptedQueries.push(query)
                  primary.sourcesUsed.forEach((s) => sourcesUsed.add(s))
                  primary.results.forEach((item) => {
                    const key = `${item.url || ""}|${String(item.title || "").toLowerCase()}`
                    if (!mergedByKey.has(key) && mergedByKey.size < strictMaxResults) {
                      mergedByKey.set(key, item)
                    }
                  })
                  primary.provenance.forEach((item) => {
                    const key = item.id || `${item.url || ""}|${String(item.title || "").toLowerCase()}`
                    if (!mergedProvenanceByKey.has(key)) mergedProvenanceByKey.set(key, item)
                  })
                })()
                await Promise.race([livePromise, timeoutPromise])
              } catch {
                // Live search timed out or failed — we still have local results
              }

              const mergedResults = Array.from(mergedByKey.values()).slice(0, strictMaxResults)
              const mergedProvenance = Array.from(mergedProvenanceByKey.values()).slice(0, strictMaxResults * 2)
              const payload = {
                results: mergedResults,
                sourcesUsed: Array.from(sourcesUsed),
                provenance: mergedProvenance,
                warnings: mergedResults.length === 0
                  ? ["Guideline Search: No matches found in local corpus or live sources."]
                  : [],
                attemptedQueries: Array.from(new Set(attemptedQueries)),
                strategy: {
                  directMatches: mergedResults.length,
                  broadenedMatches: 0,
                  secondaryMatches: 0,
                  fallbackTriggered: localResults.length < 2,
                  localFastPath: false,
                  localMs,
                },
              }
              logGuidelineDiagnostics("guideline_tool_execute", {
                query,
                strictMaxResults,
                benchStrictMode,
                elapsedMs: Math.round(performance.now() - startedAt),
                resultCount: payload.results.length,
                provenanceCount: payload.provenance.length,
                strategy: payload.strategy,
              })
              pushRuntimeEvidenceCitations(payload)
              return payload
            },
          }),
          clinicalTrialsSearch: tool({
            description: "Search ClinicalTrials.gov v2 for recent or ongoing trials relevant to a clinical question.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical trial search query"),
              maxResults: z.number().int().min(1).max(10).default(5),
            }),
            execute: async ({ query, maxResults }) => {
              const payload = await searchClinicalTrials(query, maxResults)
              pushRuntimeEvidenceCitations(payload)
              return payload
            },
          }),
          drugSafetyLookup: tool({
            description: "Lookup drug contraindications, interactions, and renal considerations.",
            parameters: z.object({
              drugName: z.string().min(2).describe("Generic or brand drug name"),
            }),
            execute: async ({ drugName }) => {
              const result = await lookupDrugSafety(drugName)
              return result
            },
          }),
          evidenceConflictCheck: tool({
            description: "Detect potential contradictions across provided evidence statements.",
            parameters: z.object({
              statements: z.array(z.string().min(10)).min(2).max(20),
            }),
            execute: async ({ statements }) => {
              return detectEvidenceConflicts(statements)
            },
          }),
        }
      : ({} as ToolSet)

    const connectorRuntimeTools: ToolSet =
      ENABLE_CONNECTOR_REGISTRY && shouldEnableEvidenceTools
        ? {
            scholarGatewaySearch: tool({
              description:
                "Search scholar-oriented sources to enrich evidence with literature-focused records.",
              parameters: z.object({
                query: z.string().min(3).describe("Scholar gateway query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "scholar_gateway",
                  query,
                  maxResults,
                  medicalOnly: true,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            bioRxivSearch: tool({
              description:
                "Search bioRxiv preprints for very recent biomedical research signals.",
              parameters: z.object({
                query: z.string().min(3).describe("bioRxiv query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "biorxiv",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            bioRenderSearch: tool({
              description:
                "Search BioRender resources for visual scientific explanations and figures.",
              parameters: z.object({
                query: z.string().min(2).describe("BioRender topic or concept"),
                maxResults: z.number().int().min(1).max(8).default(4),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "biorender",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            npiRegistrySearch: tool({
              description:
                "Search the US NPI Registry for provider records and identifiers.",
              parameters: z.object({
                query: z.string().min(2).describe("Provider organization/name or NPI number"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "npi_registry",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            synapseSearch: tool({
              description:
                "Search Synapse scientific datasets and metadata for research context.",
              parameters: z.object({
                query: z.string().min(3).describe("Synapse dataset query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "synapse",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            cmsCoverageSearch: tool({
              description:
                "Search CMS coverage policy resources (NCD/LCD-style references).",
              parameters: z.object({
                query: z.string().min(3).describe("CMS coverage query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "cms_coverage",
                  query,
                  maxResults,
                  medicalOnly: true,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            chemblSearch: tool({
              description:
                "Search ChEMBL for molecule and compound records relevant to biomedical questions.",
              parameters: z.object({
                query: z.string().min(2).describe("ChEMBL molecule/compound query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "chembl",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            benchlingSearch: tool({
              description:
                "Search Benchling-oriented resources for experimental workflows and lab context.",
              parameters: z.object({
                query: z.string().min(3).describe("Benchling/lab workflow query"),
                maxResults: z.number().int().min(1).max(10).default(5),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "benchling",
                  query,
                  maxResults,
                  medicalOnly: false,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            rxnormInteractionSearch: tool({
              description:
                "Look up drug-drug interactions using the NIH RxNorm/DrugBank database. Use when asked about medication interactions, DDIs, or drug safety between multiple medications.",
              parameters: z.object({
                query: z.string().min(2).describe("Drug name(s) to check interactions for, e.g. 'warfarin and aspirin'"),
                maxResults: z.number().int().min(1).max(15).default(10),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "rxnorm",
                  query,
                  maxResults,
                  medicalOnly: true,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
            openfdaDrugLabelSearch: tool({
              description:
                "Search FDA-approved drug labels for prescribing information including indications, dosage, contraindications, boxed warnings, and adverse reactions. Use for drug prescribing questions.",
              parameters: z.object({
                query: z.string().min(2).describe("Drug name to look up FDA label for"),
                maxResults: z.number().int().min(1).max(5).default(3),
              }),
              execute: async ({ query, maxResults }) => {
                const payload = await executeConnectorWithFallback({
                  connectorId: "openfda",
                  query,
                  maxResults,
                  medicalOnly: true,
                })
                pushRuntimeEvidenceCitations(payload)
                return payload
              },
            }),
          }
        : ({} as ToolSet)

    const youtubeRuntimeTools: ToolSet = shouldEnableYoutubeTool
      ? {
          youtubeSearch: tool({
            description:
              "Search YouTube for educational clinical videos and procedural demonstrations when video learning is requested.",
            parameters: z.object({
              query: z.string().min(3).describe("YouTube video search query"),
              maxResults: z.number().int().min(7).max(9).default(8),
              regionCode: z
                .string()
                .length(2)
                .optional()
                .describe("Optional ISO 3166-1 alpha-2 region code (e.g., US, GB)"),
              safeSearch: z.enum(["none", "moderate", "strict"]).default("strict"),
              medicalOnly: z
                .boolean()
                .default(true)
                .describe("Prioritize clinically relevant educational content"),
            }),
            execute: async ({
              query,
              maxResults,
              regionCode,
              safeSearch,
              medicalOnly,
            }) => {
              youtubeSearchCallCount += 1
              if (youtubeSearchCallCount > 1) {
                return {
                  results: [],
                  warnings: [
                    "youtubeSearch already executed for this response; reusing prior results.",
                  ],
                  metrics: {
                    cacheHit: false,
                    elapsedMs: 0,
                    searchCalls: 0,
                    videosCalls: 0,
                    quotaUnitsEstimate: 0,
                  },
                }
              }
              return searchYouTubeVideos(query, {
                maxResults,
                regionCode: regionCode?.toUpperCase(),
                relevanceLanguage: "en",
                safeSearch,
                medicalOnly,
              })
            },
          }),
        }
      : ({} as ToolSet)

    const buildWebSearchCitations = (
      response: Awaited<ReturnType<typeof searchWeb>>
    ): EvidenceCitation[] => {
      return response.results.map((result, index) => {
        let journal = "Web"
        try {
          journal = new URL(result.url).hostname.replace(/^www\./i, "") || "Web"
        } catch {
          journal = "Web"
        }
        const yearMatch = result.publishedDate?.match(/\b(19|20)\d{2}\b/)
        return {
          index: index + 1,
          pmid: null,
          title: result.title || "Web search result",
          journal,
          year: yearMatch ? Number(yearMatch[0]) : null,
          doi: null,
          authors: [],
          evidenceLevel: 4,
          studyType: "Web search",
          sampleSize: null,
          meshTerms: [],
          url: result.url || null,
          snippet: result.snippet || "",
          score: typeof result.score === "number" ? result.score : 0,
          sourceType: "medical_evidence",
          sourceLabel: "Web search",
        } satisfies EvidenceCitation
      })
    }

    const webSearchRuntimeTools: ToolSet = shouldEnableWebSearchTool
      ? {
          webSearch: tool({
            description:
              "Search the public web for current, high-quality references and return source URLs/snippets.",
            parameters: z.object({
              query: z
                .string()
                .min(3)
                .describe("Focused query for web search retrieval"),
              maxResults: z.number().int().min(1).max(8).default(5),
              medicalOnly: z
                .boolean()
                .default(clinicianRoleFromResolvedRole)
                .describe(
                  "Prioritize clinically relevant sources and medical domains."
                ),
            }),
            execute: async ({ query, maxResults, medicalOnly }) => {
              webSearchCallCount += 1
              if (webSearchCallCount > 2) {
                return {
                  query,
                  results: [],
                  warnings: [
                    "webSearch already executed twice for this response; reusing earlier web context.",
                  ],
                  citations: [],
                  metrics: {
                    cacheHit: false,
                    elapsedMs: 0,
                    retriesUsed: 0,
                    totalCandidates: 0,
                  },
                }
              }

              const firstAttempt = await searchWeb(query, {
                maxResults,
                timeoutMs: FANOUT_PER_TOOL_TIMEOUT_MS,
                retries: 0,
                medicalOnly,
                liveCrawl: "preferred",
              })
              const hasTimeoutWarning = (firstAttempt.warnings || []).some((warning) =>
                /timeout|failed|unavailable/i.test(warning)
              )
              const shouldRetryBroader =
                webSearchCallCount === 1 &&
                (firstAttempt.results.length === 0 || hasTimeoutWarning)
              if (!shouldRetryBroader) {
                return {
                  ...firstAttempt,
                  citations: buildWebSearchCitations(firstAttempt),
                }
              }

              const broaderQuery = query
                .replace(/\bsite:[^\s]+/gi, "")
                .replace(/\s+/g, " ")
                .trim()
              const secondAttempt = await searchWeb(
                broaderQuery.length >= 3 ? broaderQuery : query,
                {
                  maxResults,
                  timeoutMs: FANOUT_PER_TOOL_TIMEOUT_MS + 4_000,
                  retries: 0,
                  medicalOnly,
                  liveCrawl: "preferred",
                }
              )
              if (secondAttempt.results.length > 0) {
                return {
                  ...secondAttempt,
                  citations: buildWebSearchCitations(secondAttempt),
                  warnings: [
                    ...secondAttempt.warnings,
                    "webSearch used broader-query retry after sparse/timeout first attempt.",
                  ],
                }
              }
              return {
                ...firstAttempt,
                citations: buildWebSearchCitations(firstAttempt),
                warnings: [
                  ...firstAttempt.warnings,
                  ...secondAttempt.warnings,
                  "webSearch retry did not improve retrieval.",
                ],
              }
            },
          }),
        }
      : ({} as ToolSet)

    const patientClinicalTools: ToolSet =
      supportsTools &&
      (effectiveUserRole === "doctor" || effectiveUserRole === "medical_student") &&
      consultPatientId &&
      consultPracticeId &&
      validatedSupabase
        ? buildPatientClinicalTools({
            supabase: validatedSupabase,
            userId,
            practiceId: consultPracticeId,
            patientId: consultPatientId,
            omitRetrievalTools: isSoapCommandRequest,
          })
        : ({} as ToolSet)

    let runtimeTools: ToolSet = {
      ...patientClinicalTools,
      ...webSearchRuntimeTools,
      ...evidenceRuntimeTools,
      ...connectorRuntimeTools,
      ...youtubeRuntimeTools,
    }
    if (!allowScholarGatewayTool && "scholarGatewaySearch" in runtimeTools) {
      const rest = { ...(runtimeTools as Record<string, unknown>) }
      delete rest.scholarGatewaySearch
      runtimeTools = rest as ToolSet
      console.log(
        `[ROUTING] Scholar Gateway gated off (explicit=${scholarGatewayExplicitIntent}, citations=${citationCountForRouting}, sourceDiversity=${sourceDiversityForRouting})`
      )
    }
    const preferredFanoutToolNames = shouldUseBroadEvidenceFanout
      ? [
          "pubmedSearch",
          "guidelineSearch",
          "clinicalTrialsSearch",
          ...(freshEvidenceIntent ? ["scholarGatewaySearch", "bioRxivSearch"] : ["scholarGatewaySearch"]),
          ...(shouldEnableWebSearchTool ? ["webSearch"] : []),
        ]
      : []

    let langGraphPlan:
      | Awaited<ReturnType<typeof runClinicalAgentHarness>>
      | Awaited<ReturnType<typeof runLangChainSupervisor>>
      | null = null
    const shouldUseLangChainSupervisor =
      ENABLE_LANGCHAIN_SUPERVISOR &&
      (effectiveUserRole === "medical_student" || effectiveUserRole === "doctor")

    if (supportsTools && queryText.trim().length > 0) {
      const lmsContextForSupervisor = shouldUseLangChainSupervisor
        ? await lmsContextPromise
        : null
      if (shouldUseLangChainSupervisor) {
        try {
          langGraphPlan = await runLangChainSupervisor({
            query: queryText,
            role: effectiveUserRole,
            learningMode: effectiveLearningMode,
            clinicianMode: effectiveClinicianMode,
            lmsContext: lmsContextForSupervisor,
            artifactIntent: effectiveArtifactIntent,
            supportsTools,
            evidenceEnabled: finalEnableEvidence,
            fanoutPreferred: shouldUseBroadEvidenceFanout,
            availableToolNames: Object.keys(runtimeTools),
            incompleteEvidencePolicy: effectiveIncompleteEvidencePolicy,
          })
          langGraphHarnessTrace = langGraphPlan.trace
        } catch (error) {
          console.warn("[ROUTING] LangChain supervisor failed, attempting harness fallback:", error)
        }
      }

      if (!langGraphPlan && ENABLE_LANGGRAPH_HARNESS) {
        langGraphPlan = await runClinicalAgentHarness({
          query: queryText,
          role: effectiveUserRole,
          learningMode: effectiveLearningMode,
          clinicianMode: effectiveClinicianMode,
          artifactIntent: effectiveArtifactIntent,
          supportsTools,
          evidenceEnabled: finalEnableEvidence,
          fanoutPreferred: shouldUseBroadEvidenceFanout,
          availableToolNames: Object.keys(runtimeTools),
          incompleteEvidencePolicy: effectiveIncompleteEvidencePolicy,
        })
        langGraphHarnessTrace = langGraphPlan.trace
      }

      if (langGraphPlan) {
        const selectedToolNames = new Set(langGraphPlan.selectedToolNames || [])
        const isSupervisorPlan =
          "orchestrationEngine" in langGraphPlan &&
          langGraphPlan.orchestrationEngine === "langchain-supervisor"
        const enforcePlannerLazySelection = isSupervisorPlan
        if (!allowScholarGatewayTool) {
          selectedToolNames.delete("scholarGatewaySearch")
        }
        if (!isSupervisorPlan && preferredFanoutToolNames.length > 0) {
          for (const toolName of preferredFanoutToolNames) {
            if (toolName in runtimeTools) {
              selectedToolNames.add(toolName)
            }
          }
        }
        if (effectiveArtifactIntent === "quiz") {
          if (artifactWorkflowStage === "inspect") {
            selectedToolNames.add("inspectUploadStructure")
            if (shouldEnableArtifactRefinementToolInInspect) {
              selectedToolNames.add("refineQuizRequirements")
              selectedToolNames.add("refineArtifactRequirements")
            }
            if (shouldEnableArtifactGenerationToolInInspect) {
              selectedToolNames.add("generateQuizFromUpload")
            }
          } else if (artifactWorkflowStage === "refine") {
            selectedToolNames.add("refineQuizRequirements")
            selectedToolNames.add("refineArtifactRequirements")
          } else if (artifactWorkflowStage === "generate") {
            selectedToolNames.add("generateQuizFromUpload")
          }
        }
        const filteredEntries = Object.entries(runtimeTools).filter(([toolName]) =>
          selectedToolNames.has(toolName)
        )
        if (filteredEntries.length > 0 || enforcePlannerLazySelection) {
          runtimeTools = Object.fromEntries(filteredEntries) as ToolSet
        }
      }

      if (langGraphPlan?.systemPromptAdditions.length) {
        effectiveSystemPrompt += `\n\n${langGraphPlan.systemPromptAdditions.join("\n")}`
      }
    }

    const wrapRuntimeToolWithLifecycle = (
      toolName: string,
      toolDefinition: unknown
    ) => {
      if (!toolDefinition || typeof toolDefinition !== "object") {
        return toolDefinition
      }
      const candidate = toolDefinition as { execute?: unknown }
      if (typeof candidate.execute !== "function") {
        return toolDefinition
      }
      const originalExecute = candidate.execute as (
        args: unknown,
        context?: unknown
      ) => Promise<unknown>

      return {
        ...(toolDefinition as Record<string, unknown>),
        execute: async (args: unknown, context?: unknown) => {
          const toolCallId = resolveToolLifecycleCallId(toolName, context)
          emitToolLifecycleEvent({
            toolName,
            toolCallId,
            lifecycle: "queued",
          })
          emitToolLifecycleEvent({
            toolName,
            toolCallId,
            lifecycle: "running",
          })
          try {
            const result = await originalExecute(args, context)
            const signal = evaluateToolResultSignal(toolName, result)
            if (!signal.shouldEvaluate || signal.hasData) {
              emitToolLifecycleEvent({
                toolName,
                toolCallId,
                lifecycle: "completed",
                detail:
                  signal.shouldEvaluate && signal.count > 0
                    ? `${signal.count} record${signal.count === 1 ? "" : "s"} returned`
                    : signal.detail,
              })
            } else {
              emitToolLifecycleEvent({
                toolName,
                toolCallId,
                lifecycle: "failed",
                detail: signal.detail || "Tool returned no direct matches.",
              })
            }
            return result
          } catch (error) {
            emitToolLifecycleEvent({
              toolName,
              toolCallId,
              lifecycle: "failed",
              detail: extractErrorMessage(error),
            })
            throw error
          }
        },
      }
    }

    runtimeTools = Object.fromEntries(
      Object.entries(runtimeTools).map(([toolName, toolDefinition]) => [
        toolName,
        wrapRuntimeToolWithLifecycle(toolName, toolDefinition),
      ])
    ) as ToolSet

    if (shouldEnableEvidenceTools) {
      effectiveSystemPrompt += `\n\nYou may use live evidence tools when needed:
${ENABLE_UPLOAD_CONTEXT_SEARCH ? "- Use uploadContextSearch for user-uploaded documents, especially page-specific prompts (e.g., \"page 50\") and follow-up continuity (\"next page\", \"expand this section\")." : ""}
- ${shouldEnableStructureInspectionTool ? "Use inspectUploadStructure for large uploads to map TOC/headings before generating study artifacts." : "Structure inspection tool is unavailable in this context."}
- ${canUseArtifactTools ? "Use refineQuizRequirements before quiz generation when scope is broad or underspecified." : "Quiz refinement/generation tools are unavailable unless upload tools are enabled."}
- ${canUseArtifactTools ? "Use generateQuizFromUpload only after refinement is complete for quiz intents." : "Quiz artifact generation is unavailable unless upload tools are enabled."}
- Use generateTimetableFromUploads for study schedule/timetable generation directly from uploads or chat constraints.
- Use rebuildStudyGraphFromUpload when the user asks to refresh topic/objective/deadline nodes from files.
- Use rebalanceTimetablePlan when the user asks to shift missed blocks or rebalance a plan.
- Use summarizeLectureUpload for uploaded lecture videos to return notes, summary, and next actionables.
- Use createReviewQueueFromUploads to build revision queues from uploaded study materials.
- Use pubmedSearch/pubmedLookup for latest literature and PMID-grounded facts.
- Use guidelineSearch for formal recommendations and regional guidance.
- Use clinicalTrialsSearch for ongoing/new evidence.
- ${ENABLE_CONNECTOR_REGISTRY ? "Use scholarGatewaySearch and bioRxivSearch for broader/early research signals when guideline and PubMed retrieval are sparse." : "Connector registry tools are disabled."}
- ${ENABLE_CONNECTOR_REGISTRY ? "Use npiRegistrySearch and cmsCoverageSearch for provider identity and coverage-policy queries." : "Provider/coverage connector tools are disabled."}
- ${ENABLE_CONNECTOR_REGISTRY ? "Use chemblSearch, synapseSearch, bioRenderSearch, and benchlingSearch only when the user intent explicitly needs molecular, dataset, visual, or lab-workflow context." : "Specialized connector tools are disabled."}
- Use drugSafetyLookup for contraindications/interactions/renal dosing checks.
- Use evidenceConflictCheck when sources disagree.
- ${shouldUseBroadEvidenceFanout ? `For this turn, run a balanced multi-source fan-out: target ${targetFanoutSources} distinct sources (roughly 4-6) before finalizing unless tools are unavailable or exhausted.` : "Balanced fan-out is optional; use additional sources when confidence is weak or evidence is sparse."}
- ${shouldUseBroadEvidenceFanout ? `Respect the balanced retrieval budget (${fanoutTotalBudgetMs} ms total; ~${FANOUT_PER_TOOL_TIMEOUT_MS} ms per retrieval call) and avoid looping the same source repeatedly.` : "Avoid repeated low-yield retries against the same source."}
- IMPORTANT: Keep tool queries tightly aligned to the user question (specific condition/drug terms, not broad generic terms).
- IMPORTANT: If a tool returns irrelevant records, explicitly discard them and retry with a narrower query before citing evidence.
- IMPORTANT: Do not append manual references/bibliography sections; keep citations inline in the answer body only.
- CITATION DENSITY: For medical content, place citations after each factual sentence whenever evidence exists; avoid bundling multiple distinct claims under one citation.
- CITATION FORMAT: Preferred format is numeric bracket [n] matching the evidence index (e.g. [1], [2,3]). Alternative: [CITE_<sourceId>] using the EXACT sourceId from the evidence list. Do NOT abbreviate or truncate sourceId strings.
- DIAGRAM/CODE CITATIONS: Never place citation markers inside fenced code blocks (including \`\`\`chart and \`\`\`mermaid). Put citations in surrounding prose only.
- CHART OUTPUT: If you have structured numeric trend data (sleep stages, labs over time, activity, readiness, HR/HRV), include a fenced \`\`\`chart block containing JSON with this shape: { "type": "line|bar|area|stacked-bar|composed", "title": "...", "subtitle": "...", "source": "...", "xKey": "label", "series": [{ "key": "valueKey", "label": "Legend Label", "color": "#HEX" }], "data": [{ "label": "Mon", "valueKey": 7.2 }] }.
- MULTI-CHART OUTPUT: If the data contains multiple distinct numeric groups/trajectories, emit either (a) multiple fenced \`\`\`chart blocks, or (b) one fenced \`\`\`chart block with JSON shape { "charts": [<chartSpec>, <chartSpec>, ...] }. Only emit charts when data quality is sufficient; otherwise provide normal text and call out missing structure.`
      if (benchStrictMode) {
        effectiveSystemPrompt += `\n- BENCH STRICT: If guideline evidence is requested or clinically relevant, run guidelineSearch before finalizing your answer.
- BENCH STRICT: If a tool returns weakly relevant results, rerun once with a narrower query and cite only the focused result set.
- BENCH STRICT: Do not emit raw PMID/DOI values as citations; use [CITE_<sourceId>] tokens from provided evidence.
- BENCH STRICT: Do not append manual references sections; keep citations inline only.`
      }
    } else if (shouldEnablePubMedTools) {
      effectiveSystemPrompt += `\n\nYou may use PubMed tools when the question requests latest evidence, guideline updates, or when provided evidence is sparse. Prefer retrieved PubMed records for recency-sensitive claims and cite them explicitly.`
    }

    if (ENABLE_STRICT_CITATION_CONTRACT && finalEnableEvidence) {
      effectiveSystemPrompt += `\n\nSTRICT CITATION CONTRACT:
- Never output unresolved placeholder tokens such as [CITE_PLACEHOLDER_0].
- Preferred citation format: numeric bracket [n] matching the evidence index (e.g. [1], [2,3]). Alternative: [CITE_<sourceId>] using the EXACT sourceId string from the evidence list.
- If you lack evidence for a claim, rewrite it using the closest available evidence or state it as clinical context without a citation marker. NEVER add disclaimers like "(no citation in provided sources)" or "(not directly addressed in provided sources)".
- DO NOT fabricate citations or reference sources not in the provided evidence list.`
    }

    if (finalEnableEvidence && explicitReferenceCitations.length > 0) {
      const explicitSourceIds = explicitReferenceCitations
        .map((citation) => `[CITE_${buildEvidenceSourceId(citation)}]`)
        .join(", ")
      effectiveSystemPrompt += `\n\nEXPLICIT SOURCE PRIORITY:
- The user explicitly named one or more papers in the request.
- You MUST prioritize the explicitly referenced source(s) when they are relevant: ${explicitSourceIds}.
- Ground the answer in those source-id citations instead of falling back to naked URLs or saying the paper is unavailable if it appears in the provided evidence context.`
    }

    if (finalEnableEvidence && pmcOpenAccessReviewCitations.length > 0) {
      const pmcReviewSourceIds = pmcOpenAccessReviewCitations
        .map((citation) => `[CITE_${buildEvidenceSourceId(citation)}]`)
        .join(", ")
      effectiveSystemPrompt += `\n\nPMC OPEN-ACCESS REVIEW POLICY:
- The user asked for a PMC/open-access review and suitable PMC-backed review evidence is available in the evidence context: ${pmcReviewSourceIds}.
- If the user says to pick one, choose the best-matching PMC-backed review and proceed without asking for a PMCID.
- Do not claim you cannot verify PMC/open-access availability when one of these citations is present in the evidence context.
- If you name a specific review article, every claim about that review and any inline figure reference MUST use that exact source-id citation, not a different source.
- Never describe a figure/caption from one article while citing a different article.`
    }

    if (inlineEvidenceFigureRequested) {
      effectiveSystemPrompt += `\n\nINLINE EVIDENCE VISUAL POLICY:
- If a cited evidence source includes a linked visual, the interface can render it automatically as a structured evidence visual.
- Do not say you cannot include a figure inline solely because of copyright if the figure comes from the provided evidence context, especially for PMC-backed open-access sources.
- Keep the answer grounded in the evidence and let the UI render the linked visual; if useful, briefly refer to it as an inline evidence visual.
- Only mention a figure or caption when it belongs to the same cited source used for the surrounding explanation.
- Prefer conceptual/schematic figures for mechanism or comparison questions; avoid statistical plots unless the user asked about outcomes, efficacy, or meta-analysis results.`
    }

    if (secondaryEvidenceFallbackSummary?.active) {
      const fallbackMarker = secondaryEvidenceFallbackSummary.sourceId
        ? `[CITE_${secondaryEvidenceFallbackSummary.sourceId}]`
        : ""
      effectiveSystemPrompt += `\n\nSECONDARY EVIDENCE FRAMING:
- Primary guideline was not found in indexed guideline repositories for this turn.
- You MUST state this explicitly in the answer: "Primary guideline not found; synthesis based on secondary clinical evidence from ${secondaryEvidenceFallbackSummary.sourceLabel}${fallbackMarker ? ` ${fallbackMarker}` : ""}."
- Continue with concrete clinical synthesis from secondary evidence instead of saying information is unavailable.`
    }

    if (artifactWorkflowStage === "inspect" && effectiveArtifactIntent === "quiz") {
      effectiveSystemPrompt += `\n\nQUIZ INSPECTION MODE:
- Start by calling inspectUploadStructure once to map topic boundaries.
- In the SAME turn, do not stop after inspection.
- If scope/settings are still missing after inspection, call refineQuizRequirements exactly once.
- Otherwise call generateQuizFromUpload exactly once.
- Never end this turn with only inspection output.`
    } else if (shouldEnableArtifactRefinementTool && effectiveArtifactIntent === "quiz") {
      effectiveSystemPrompt += `\n\nQUIZ REFINEMENT MODE:
- You MUST call refineQuizRequirements exactly once before finalizing this turn.
- Do NOT call generateQuizFromUpload in this turn.
- After the refinement tool result appears, ask the user to choose A-E or provide custom requirements.
- Keep the reply concise (2-4 lines) and actionable.`
    } else if (
      shouldEnableArtifactGenerationTools &&
      effectiveArtifactIntent === "quiz"
    ) {
      effectiveSystemPrompt += `\n\nQUIZ ARTIFACT MODE:
- You MUST call generateQuizFromUpload exactly once before finalizing the answer.
- Generate an interactive MCQ-ready quiz payload from uploaded material.
- Keep the textual reply to one short sentence indicating the quiz card is ready.
- Use this exact lead-in sentence: "${quizLeadInSentence}"
- Do NOT paste quiz questions, answer keys, or explanations into plain chat text.`
    }

    if (shouldEnableYoutubeTool) {
      effectiveSystemPrompt += `\n\nYou may use youtubeSearch only when the user asks for video-based learning (tutorials, demonstrations, or procedural walkthroughs).
- Prefer trusted medical education channels when available.
- Do not use YouTube videos as primary clinical evidence for diagnosis/treatment claims.
- If no clinically relevant videos are returned, continue with normal text guidance without forcing video references.
- When the user asks for videos/tutorials and youtubeSearch is available, you MUST call youtubeSearch before giving recommendations.
- Do not invent or fabricate YouTube links. Only include links returned by youtubeSearch.
- If youtubeSearch returns results, provide direct full video URLs using the exact \`url\` values from tool output (for example \`https://www.youtube.com/watch?v=...\`). Do not output plain \`youtube.com\` placeholders.
- Call youtubeSearch at most once per answer.
- Response style requirement when videos are requested:
  1) Start with 1 short intro paragraph.
  2) Add a heading exactly: "Recommended Videos:"
  3) Provide 7-9 recommendations (target 8) in this format:
     - <Video Title> by <Channel>
       <One-line summary from tool description>
       <Exact URL from tool result>
  4) End with one short suggestion sentence.
- Keep output sleek and concise with real links only.`
    }

    if (shouldEnableWebSearchTool) {
      effectiveSystemPrompt += `\n\nWeb search is explicitly enabled by user toggle.
- Use the webSearch tool when you need fresh or external sources.
- Never claim web-browsing unless webSearch returns results.
- Cite only URLs returned by webSearch.
- Prefer high-quality medical and institutional sources when clinical claims are involved.
- If webSearch returns no relevant results, continue with internal reasoning and state that no strong fresh sources were found.`
    }

    const artifactToolChoice =
      artifactWorkflowStage === "inspect" &&
      effectiveArtifactIntent === "quiz" &&
      !shouldAskArtifactTopicFollowup &&
      shouldEnableArtifactGenerationToolInInspect
        ? ({ type: "tool", toolName: "generateQuizFromUpload" } as const)
        : artifactWorkflowStage === "inspect" &&
            effectiveArtifactIntent === "quiz" &&
      shouldEnableArtifactRefinementToolInInspect
        ? ({
            type: "tool",
            toolName: "refineQuizRequirements",
          } as const)
      : shouldEnableArtifactRefinementTool
        ? ({
            type: "tool",
            toolName: "refineQuizRequirements",
          } as const)
        : shouldEnableArtifactGenerationTools &&
            effectiveArtifactIntent === "quiz"
          ? ({ type: "tool", toolName: "generateQuizFromUpload" } as const)
          : undefined
    const resolvedMaxSteps =
      typeof langGraphPlan?.maxSteps === "number" && Number.isFinite(langGraphPlan.maxSteps)
        ? Math.max(
            1,
            Math.min(
              langGraphPlan.maxSteps,
              shouldUseBroadEvidenceFanout && freshEvidenceIntent
                ? FANOUT_MAX_TOOL_STEPS_FRESH
                : FANOUT_MAX_TOOL_STEPS
            )
          )
        : artifactWorkflowStage === "inspect" && effectiveArtifactIntent === "quiz"
          ? 4
        : shouldEnableArtifactRefinementTool
          ? 1
          : effectiveArtifactIntent === "quiz"
            ? 2
            : shouldEnableYoutubeTool
              ? 4
              : shouldUseBroadEvidenceFanout
                ? freshEvidenceIntent
                  ? FANOUT_MAX_TOOL_STEPS_FRESH
                  : FANOUT_MAX_TOOL_STEPS
                : 10

    const result = streamText({
      model: modelWithSearch,
      system: effectiveSystemPrompt,
      messages: coreMessages,
      tools: runtimeTools,
      ...(artifactToolChoice ? ({ toolChoice: artifactToolChoice } as any) : {}),
      maxSteps: resolvedMaxSteps,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        let sanitizedResponseMessages = sanitizeAssistantMessagesForStorage(
          (response.messages || []) as any[]
        )
        sanitizedResponseMessages = ensureRefinementFallbackTextInMessages(
          sanitizedResponseMessages,
          shouldEnableArtifactRefinementTool ? artifactRefinementToolResult : null
        )
        sanitizedResponseMessages = ensureArtifactLeadInInMessages(
          sanitizedResponseMessages
        )
        // Extract citations from xAI response if available
        const xaiCitations = (response as any).experimental_providerMetadata?.citations || 
                            (response as any).citations || 
                            []
        
        // Check if sources are in message parts
        const allParts = sanitizedResponseMessages.flatMap((m: any) => m.parts || [])
        const sourceParts = allParts.filter((p: any) => p.type === 'source')
        const toolInvocationParts = allParts.filter((p: any) => p.type === 'tool-invocation')
        
        // Log full response structure for debugging
        console.log('\n' + '='.repeat(80))
        console.log('[WEB SEARCH DEBUG] Response structure:')
        console.log('  - experimental_providerMetadata:', (response as any).experimental_providerMetadata ? 'EXISTS' : 'undefined')
        console.log('  - citations:', (response as any).citations ? 'EXISTS' : 'undefined')
        console.log('  - messages count:', (response as any).messages?.length || 0)
        console.log('  - total parts:', allParts.length)
        console.log('  - source parts:', sourceParts.length)
        console.log('  - tool invocations:', toolInvocationParts.length)
        
        if (xaiCitations.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${xaiCitations.length} citations:`, xaiCitations.slice(0, 5))
        }
        
        if (sourceParts.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${sourceParts.length} source parts:`, sourceParts.map((p: any) => p.source).slice(0, 3))
        }
        
        if (toolInvocationParts.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${toolInvocationParts.length} tool invocations`)
          toolInvocationParts.forEach((p: any, i: number) => {
            console.log(`  Tool ${i + 1}:`, p.toolInvocation?.toolName, 'state:', p.toolInvocation?.state)
            if (p.toolInvocation?.result) {
              console.log(`    Result keys:`, Object.keys(p.toolInvocation.result))
            }
          })
        }
        
        // Check message content for URLs
        const lastMessage =
          sanitizedResponseMessages[sanitizedResponseMessages.length - 1]
        if (lastMessage?.content) {
          const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content)
          const urlMatches = content.match(/https?:\/\/[^\s\)\]\[]+/g) || []
          if (urlMatches.length > 0) {
            console.log(`[WEB SEARCH] Found ${urlMatches.length} URLs in message content:`, urlMatches.slice(0, 5))
          }
        }
        const runtimeToolCitations = dedupeAndReindexCitations(
          toolInvocationParts.flatMap((part: any) => citationsFromToolResult(part?.toolInvocation?.result))
        )
        
        console.log('='.repeat(80) + '\n')
        
        // Handle completion in background - CRITICAL: Ensure this always runs
        Promise.resolve().then(async () => {
          try {
            // Only process completion if we have a real userId and chatId
            // CRITICAL: Still extract citations even for temp chats, but don't save to DB
            // This ensures citations are available in the UI even during streaming
            const isTempChat = userId === "temp" || isEphemeralChatId(effectiveChatId)
            
            if (isTempChat) {
              console.log("📚 [CITATION] Temp chat detected - extracting citations but skipping DB save")
            }

            let supabase = validatedSupabase
            if (!supabase && !isTempChat && !isEphemeralChatId(effectiveChatId)) {
              supabase = await validateAndTrackUsage({
                userId,
                model: effectiveModel,
                isAuthenticated,
                attachmentCount: 0,
              })
            }

            if (!isTempChat) {
              await assertChatOwnership({
                supabase,
                chatId: effectiveChatId,
                userId,
              })
            }

            if (supabase) {
              // Save user message first (if not already saved)
              // Use original (non-anonymized) message for storage - it will be encrypted
              const userMessage = messagesSansUploadReferenceTokens[messagesSansUploadReferenceTokens.length - 1]
              if (!isTempChat && userMessage?.role === "user") {
                try {
                  await logUserMessage({
                    supabase,
                    userId,
                    chatId: effectiveChatId,
                    content:
                      typeof userMessage.content === "string"
                        ? decodeArtifactWorkflowInput(
                            stripUploadReferenceTokens(userMessage.content)
                          )
                        : "",
                    attachments: userMessage.experimental_attachments as Attachment[],
                    model: effectiveModel,
                    isAuthenticated,
                    message_group_id,
                  })
                } catch (error) {
                  console.error("Failed to save user message:", error)
                  // Continue even if user message save fails
                }
              }

              // CRITICAL: Extract citations from response (even for temp chats)
              // This ensures citations are available in the UI
              const assistantMessage =
                sanitizedResponseMessages[sanitizedResponseMessages.length - 1]
              
              // Extract text content from message (handles both string and array formats)
              let responseText = ''
              if (assistantMessage?.content) {
                if (typeof assistantMessage.content === 'string') {
                  responseText = assistantMessage.content
                } else if (Array.isArray(assistantMessage.content)) {
                  // Extract text from content parts
                  const textParts = assistantMessage.content
                    .filter((part: any) => part?.type === 'text' && part?.text)
                    .map((part: any) => part.text)
                  responseText = textParts.join('\n\n')
                }
              }

              if (
                ENABLE_STRICT_CITATION_CONTRACT &&
                /\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/i.test(responseText)
              ) {
                recordCitationContractViolation()
                responseText = responseText.replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
              }

              if (secondaryEvidenceFallbackSummary?.active && responseText.trim().length > 0) {
                const fallbackMarker = secondaryEvidenceFallbackSummary.sourceId
                  ? `[CITE_${secondaryEvidenceFallbackSummary.sourceId}]`
                  : ""
                const fallbackSentence = `Primary guideline not found; synthesis based on secondary clinical evidence from ${secondaryEvidenceFallbackSummary.sourceLabel}${fallbackMarker ? ` ${fallbackMarker}` : ""}.`
                const unavailablePattern = /this information is not available in the provided sources\.?/gi
                if (unavailablePattern.test(responseText)) {
                  responseText = responseText.replace(unavailablePattern, fallbackSentence)
                }
                if (!/primary guideline not found;/i.test(responseText)) {
                  responseText = `${fallbackSentence}\n\n${responseText}`
                }
                sanitizedResponseMessages[sanitizedResponseMessages.length - 1] =
                  overwriteAssistantText(assistantMessage, responseText)
              }
              
              // Extract referenced citations from the response
              // CRITICAL: Only extract citations if evidence mode is enabled
              // CRITICAL: Use capturedEvidenceContext to ensure we have the right context
              let citationsToSave: any[] = []
              
              // Only extract citations if evidence mode was enabled
              if (finalEnableEvidence) {
                const contextToUse =
                  runtimeToolCitations.length > 0
                    ? {
                        ...(capturedEvidenceContext || evidenceContext || {
                          shouldUseEvidence: true,
                          searchTimeMs: 0,
                        }),
                        context: buildEvidenceContext(
                          dedupeAndReindexCitations([
                            ...((capturedEvidenceContext || evidenceContext)?.context?.citations || []),
                            ...runtimeToolCitations,
                          ])
                        ),
                      }
                    : capturedEvidenceContext || evidenceContext
                
                if (contextToUse?.context?.citations) {
                console.log(`📚 [CITATION EXTRACTION] Using evidence context with ${contextToUse.context.citations.length} citations`)
                if (responseText) {
                  const extractionResult = extractReferencedCitations(
                    responseText,
                    contextToUse.context.citations
                  )
                  
                  citationsToSave = extractionResult.referencedCitations
                  
                  // Log extraction results for debugging
                  if (extractionResult.hasCitations) {
                    console.log(`📚 [CITATION EXTRACTION] Found ${citationsToSave.length} referenced citations (indices: [${extractionResult.citationIndices.join(', ')}])`)
                    if (extractionResult.verificationStats.fallbackAdded > 0) {
                      console.warn(
                        `📚 [CITATION EXTRACTION] Added ${extractionResult.verificationStats.fallbackAdded} fallback citations to preserve minimum evidence references`
                      )
                    }
                    if (extractionResult.verificationStats.missingCitations.length > 0) {
                      console.warn(`📚 [CITATION EXTRACTION] ${extractionResult.verificationStats.missingCitations.length} retrieved citations were not referenced`)
                    }
                  } else if (contextToUse.context.citations.length > 0) {
                    console.warn(`📚 [CITATION EXTRACTION] ⚠️ No citation markers found in response despite ${contextToUse.context.citations.length} citations being provided`)
                    console.warn(`📚 [CITATION EXTRACTION] Response preview: ${responseText.substring(0, 300)}...`)
                  }

                  const utilization = computeCitationUtilization(
                    contextToUse.context.citations,
                    citationsToSave as EvidenceCitation[]
                  )
                  const shouldRunCoverageRefinement =
                    utilization.totalUnique >= 4 &&
                    utilization.ratio < 0.7 &&
                    responseText.trim().length > 0

                  if (shouldRunCoverageRefinement) {
                    const uncoveredCitations = contextToUse.context.citations
                      .filter((citation) =>
                        utilization.missingSourceIds.includes(
                          buildEvidenceSourceId(citation)
                        )
                      )
                      .slice(0, 8)
                    console.warn(
                      `📚 [COVERAGE CHECK] Citation utilization ${Math.round(
                        utilization.ratio * 100
                      )}% (${utilization.referencedUnique}/${utilization.totalUnique}); running one refinement pass.`
                    )
                    try {
                      const refinementText = await runWithTimeBudget(
                        "CITATION_UTILIZATION_REFINEMENT",
                        async () => {
                          const uncoveredLines = uncoveredCitations
                            .map(
                              (citation, idx) =>
                                `${idx + 1}. [CITE_${buildEvidenceSourceId(citation)}] ${citation.title} (${citation.journal || citation.sourceLabel || "Source"})`
                            )
                            .join("\n")
                          const refinement = await generateText({
                            model: modelWithSearch,
                            system: `${effectiveSystemPrompt}

Coverage policy for this pass:
- You MUST integrate more of the uncovered evidence.
- You MUST cite using [CITE_<sourceId>] immediately after factual claims.
- Keep answer concise and clinically focused.
- Do not include bibliography/reference list sections.`,
                            prompt: `Revise this clinical answer to improve evidence utilization.

Current answer:
${responseText}

Uncovered evidence that must be incorporated where clinically relevant:
${uncoveredLines}

Return only the revised answer body with inline citations.`,
                          })
                          return refinement.text?.trim() || ""
                        },
                        2600,
                        ""
                      )

                      if (refinementText) {
                        responseText = refinementText
                        sanitizedResponseMessages[sanitizedResponseMessages.length - 1] =
                          overwriteAssistantText(assistantMessage, refinementText)
                        const refinedExtraction = extractReferencedCitations(
                          refinementText,
                          contextToUse.context.citations
                        )
                        citationsToSave = refinedExtraction.referencedCitations
                        const refinedUtilization = computeCitationUtilization(
                          contextToUse.context.citations,
                          citationsToSave as EvidenceCitation[]
                        )
                        console.log(
                          `📚 [COVERAGE CHECK] Post-refinement utilization ${Math.round(
                            refinedUtilization.ratio * 100
                          )}% (${refinedUtilization.referencedUnique}/${refinedUtilization.totalUnique})`
                        )
                      }
                    } catch (refinementError) {
                      console.warn(
                        "📚 [COVERAGE CHECK] Refinement pass failed:",
                        refinementError
                      )
                    }
                  }
                } else {
                  console.warn(`📚 [CITATION EXTRACTION] ⚠️ Could not extract response text for citation parsing`)
                }
                } else {
                  console.log(`📚 [CITATION EXTRACTION] No evidence context available (capturedEvidenceContext: ${!!capturedEvidenceContext}, evidenceContext: ${!!evidenceContext})`)
                }
              } else {
                console.log(`📚 [CITATION EXTRACTION] Evidence mode is OFF - skipping citation extraction`)
              }

              const topicContextForSave = deriveTopicContextFromCitations(
                resolvedTopicContext,
                citationsToSave as EvidenceCitation[],
                queryText
              )
              
              // Only save to database if not a temp chat
              if (!isTempChat && supabase) {
                try {
                  await storeAssistantMessage({
                    supabase,
                    userId,
                    chatId: effectiveChatId,
                    messages:
                      sanitizedResponseMessages as unknown as import("@/app/types/api.types").Message[],
                    message_group_id,
                    model: effectiveModel,
                    evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
                    topicContext: topicContextForSave,
                    allowMultipleArtifacts,
                  })
                  if (citationsToSave.length > 0) {
                    console.log(`📚 [CITATION SAVE] ✅ Saved ${citationsToSave.length} citations to database`)
                  }
                } catch (error) {
                  console.error("Failed to save assistant message:", error)
                  // Try one more time after a short delay
                  await new Promise(resolve => setTimeout(resolve, 1000))
                  try {
                    await storeAssistantMessage({
                      supabase,
                      userId,
                      chatId: effectiveChatId,
                      messages:
                        sanitizedResponseMessages as unknown as import("@/app/types/api.types").Message[],
                      message_group_id,
                      model: effectiveModel,
                      evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
                      topicContext: topicContextForSave,
                      allowMultipleArtifacts,
                    })
                  } catch (retryError) {
                    console.error("Retry also failed to save assistant message:", retryError)
                  }
                }
              } else if (isTempChat && citationsToSave.length > 0) {
                console.log(`📚 [CITATION] Temp chat - ${citationsToSave.length} citations extracted but not saved to DB`)
              }

              // L3 answer cache: write-behind for repeat queries
              if (
                shouldRunEvidenceSynthesis &&
                citationsToSave.length > 0 &&
                responseText?.trim().length > 80
              ) {
                setAnswerCache(queryText, effectiveModel, {
                  answer: responseText,
                  citations: citationsToSave,
                  modelId: effectiveModel,
                  cachedAt: Date.now(),
                }).catch((cacheErr) =>
                  console.warn("[L3 CACHE] Write failed:", cacheErr)
                )
              }

              // Increment message count after successful save
              try {
                await incrementMessageCount({ supabase, userId })
              } catch (error) {
                console.error("Failed to increment message count:", error)
                // Non-critical, continue
              }
            }
          } catch (error) {
            console.error("Background operations failed:", error)
            // Don't throw - errors are logged but shouldn't break the stream
          }
        }).catch((error) => {
          // Extra safety net for any unhandled errors
          console.error("Unhandled error in onFinish:", error)
        })
      },
    })

    const streamingStartTime = performance.now() - startTime
    console.log(`✅ Streaming started in ${streamingStartTime.toFixed(0)}ms`)

    // ENHANCE SYSTEM PROMPT IN BACKGROUND (non-blocking)
    if (effectiveUserRole === "doctor" || effectiveUserRole === "medical_student") {
      // Don't await - let this run in background
      Promise.resolve().then(async () => {
        try {
          console.log("Enhancing system prompt in background for role:", effectiveUserRole)
          
          const healthcarePrompt = getHealthcareSystemPromptServer(
            effectiveUserRole,
            medicalSpecialty,
            clinicalDecisionSupport,
            medicalLiteratureAccess,
            medicalComplianceMode
          )
          
          if (healthcarePrompt) {
            console.log("Healthcare system prompt generated in background")
            
            // Analyze medical query complexity
            const medicalContext: MedicalContext = {
              userRole: effectiveUserRole as "doctor" | "medical_student",
              medicalSpecialty,
              specialties: medicalSpecialty ? [medicalSpecialty] : [],
              requiredCapabilities: [],
              clinicalDecisionSupport,
              medicalLiteratureAccess,
              medicalComplianceMode
            }
            
            const latestMessageContent =
              typeof messages[messages.length - 1]?.content === "string"
                ? decodeArtifactWorkflowInput(messages[messages.length - 1].content as string)
                : ""
            const agentSelections = analyzeMedicalQuery(latestMessageContent, medicalContext)
            
            if (agentSelections.length > 0) {
              try {
                const orchestrationInfo = await orchestrateHealthcareAgents(
                  latestMessageContent,
                  medicalContext
                )
                
                // Integrate medical knowledge
                try {
                  const medicalKnowledge = await integrateMedicalKnowledge(
                    latestMessageContent,
                    medicalContext,
                    agentSelections
                  )
                  if (medicalKnowledge.length > 0) {
                    console.log("Medical knowledge integrated in background")
                  }
                } catch (error) {
                  console.warn("Background medical knowledge integration failed:", error)
                }
              } catch (error) {
                console.warn("Background orchestration failed:", error)
              }
            }
          }
        } catch (error) {
          console.warn("Background system prompt enhancement failed:", error)
        }
      })
    }

    console.log("✅ Streaming response ready, returning to client")
    
    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Expose-Headers': 'X-Stream-Intro, X-Chat-Id',
      'X-Stream-Intro': Buffer.from(streamIntroPreview, "utf-8").toString("base64"),
      'X-Chat-Id': effectiveChatId,
    }
    let evidenceCitationsForStream: EvidenceCitation[] = []
    const artifactRuntimeWarningsForStream = Array.from(
      new Set([
        ...(uploadReadinessTimedOut
          ? [
              selectedUploadIds.length > 0
                ? "Some uploads were still indexing; retrieval used the completed subset."
                : "Uploads are still indexing. Ask again in a moment for grounded citations.",
            ]
          : []),
        ...(uploadContextResult?.warnings ?? []).filter(
          (warning) =>
            !/embedding provider mismatch|key\/provider mismatch|lexical fallback/i.test(
              String(warning)
            )
        ),
        ...(uploadContextResult?.metrics?.retrievalConfidence === "low"
          ? ["Low retrieval confidence. Consider narrowing by chapter/topic/pages before generation."]
          : []),
        ...(structureInspectionPreflight?.warnings ?? []),
      ])
    ).slice(0, 6)
    const topicContextForStream = mergeTopicContexts(
      normalizeTopicContext(uploadContextResult?.topicContext),
      normalizeTopicContext(resolvedTopicContext)
    )
    const artifactRefinementForStream =
      artifactWorkflowStage === "refine" &&
      shouldAskArtifactTopicFollowup &&
      effectiveArtifactIntent === "quiz"
        ? artifactRefinementToolResult ||
          toArtifactRefinementToolResult(
            artifactRefinementPrompt ||
              buildArtifactRefinementPrompt(
                effectiveArtifactIntent,
                (topicContextForStream?.pendingArtifactTopicOptions ?? []).slice(0, 4),
                topicContextForStream?.recentPages ?? [],
                uploadTitleHintForRefinement
              ),
            effectiveArtifactIntent,
            topicContextForStream?.recentPages ?? [],
            uploadTitleHintForRefinement
          )
        : null
    const selectedToolNamesForTurn = Object.keys(runtimeTools)
    const normalizedQuerySnippet = queryText.trim().replace(/\s+/g, " ").slice(0, 140)
    const orchestrationEngineForStream =
      langGraphPlan && "orchestrationEngine" in langGraphPlan
        ? langGraphPlan.orchestrationEngine
        : langGraphPlan
          ? "langgraph-harness"
          : "none"
    const dynamicChecklistForStream =
      langGraphPlan &&
      "dynamicChecklist" in langGraphPlan &&
      Array.isArray(langGraphPlan.dynamicChecklist)
        ? langGraphPlan.dynamicChecklist.slice(0, 12)
        : []
    const plannerRuntimeStepsForStream =
      langGraphPlan &&
      "runtimeSteps" in langGraphPlan &&
      Array.isArray(langGraphPlan.runtimeSteps)
        ? langGraphPlan.runtimeSteps.slice(0, 16)
        : []
    const retrievalGateRuntimeStep = retrievalGateSummary
      ? [
          {
            id: "retrieval-gate-block",
            label: "Awaiting broadened evidence",
            status:
              retrievalGateSummary.status === "failed"
                ? "failed"
                : retrievalGateSummary.status === "completed"
                  ? "completed"
                  : "completed",
            detail: retrievalGateSummary.detail,
            reasoning: `Hard retrieval gate completed in ${retrievalGateSummary.elapsedMs}ms before answer streaming.`,
            phase: "retrieval",
            isCritical: true,
          },
        ]
      : []
    const runtimeStepsForStream = [
      ...plannerRuntimeStepsForStream,
      ...retrievalGateRuntimeStep,
    ].slice(0, 16)
    const taskPlanForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "taskPlan" in langGraphPlan &&
      Array.isArray(langGraphPlan.taskPlan)
        ? langGraphPlan.taskPlan.slice(0, 16)
        : []
    const hasCurriculumAlignmentTaskForStream = taskPlanForStream.some(
      (task: { taskName?: unknown }) =>
        typeof task.taskName === "string" &&
        /(curriculum alignment|cross-referencing .* learning objectives|institutional learning objectives)/i.test(
          String(task.taskName)
        )
    )
    const runtimeDagForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "runtimeDag" in langGraphPlan &&
      Array.isArray(langGraphPlan.runtimeDag)
        ? langGraphPlan.runtimeDag.slice(0, 20)
        : []
    const gatekeeperDecisionsForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "gatekeeperDecisions" in langGraphPlan &&
      Array.isArray(langGraphPlan.gatekeeperDecisions)
        ? langGraphPlan.gatekeeperDecisions.slice(0, 40)
        : []
    const loopTransitionsForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "loopTransitions" in langGraphPlan &&
      Array.isArray(langGraphPlan.loopTransitions)
        ? langGraphPlan.loopTransitions.slice(0, 12)
        : []
    const confidenceTransitionsForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "confidenceTransitions" in langGraphPlan &&
      Array.isArray(langGraphPlan.confidenceTransitions)
        ? langGraphPlan.confidenceTransitions.slice(0, 12)
        : []
    const missingVariablePromptsForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "missingVariablePrompts" in langGraphPlan &&
      Array.isArray(langGraphPlan.missingVariablePrompts)
        ? langGraphPlan.missingVariablePrompts.slice(0, 8)
        : []
    const plannerRetrievalNotesForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "retrievalNotes" in langGraphPlan &&
      Array.isArray(langGraphPlan.retrievalNotes)
        ? langGraphPlan.retrievalNotes.slice(0, 10)
        : []
    const retrievalGateOutcomeForStream =
      retrievalGateSummary?.status === "failed"
        ? "error"
        : retrievalGateSummary?.status === "completed"
          ? "fallback"
          : "success"
    const retrievalGateNoteForStream = retrievalGateSummary
      ? [
          {
            id: "retrieval-gate-note",
            connectorId: "retrieval_gate",
            outcome: retrievalGateOutcomeForStream,
            note: retrievalGateSummary.detail,
            detail: `Gate time ${retrievalGateSummary.elapsedMs}ms • +${retrievalGateSummary.addedCitations} citations`,
          },
        ]
      : []
    const secondaryEvidenceNoteForStream = secondaryEvidenceFallbackSummary?.active
      ? [
          {
            id: "secondary-evidence-framing",
            connectorId: "guideline",
            outcome: "fallback" as const,
            note: `Primary guideline not found; using secondary clinical evidence from ${secondaryEvidenceFallbackSummary.sourceLabel}.`,
            detail: secondaryEvidenceFallbackSummary.sourceId
              ? `Primary evidence marker [CITE_${secondaryEvidenceFallbackSummary.sourceId}]`
              : "Secondary evidence synthesized without canonical source marker.",
          },
        ]
      : []
    const retrievalNotesForStream = [
      ...plannerRetrievalNotesForStream,
      ...retrievalGateNoteForStream,
      ...secondaryEvidenceNoteForStream,
    ].slice(0, 10)
    const incompleteEvidenceStateForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "incompleteEvidenceState" in langGraphPlan &&
      typeof langGraphPlan.incompleteEvidenceState === "string"
        ? langGraphPlan.incompleteEvidenceState
        : undefined
    const complexityModeForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "complexityMode" in langGraphPlan &&
      typeof langGraphPlan.complexityMode === "string"
        ? langGraphPlan.complexityMode
        : undefined
    const clinicalCompletenessForStream =
      ENABLE_COGNITIVE_ORCHESTRATION_FULL &&
      langGraphPlan &&
      "clinicalCompleteness" in langGraphPlan &&
      langGraphPlan.clinicalCompleteness &&
      typeof langGraphPlan.clinicalCompleteness === "object"
        ? langGraphPlan.clinicalCompleteness
        : null
    const chartPlanForStream =
      langGraphPlan &&
      "chartPlan" in langGraphPlan &&
      langGraphPlan.chartPlan &&
      typeof langGraphPlan.chartPlan === "object"
        ? langGraphPlan.chartPlan
        : null
    const selectedConnectorIdsForRouting =
      langGraphPlan?.routingSummary?.selectedConnectorIds ||
      langGraphPlan?.selectedConnectorIds ||
      []
    const selectedToolNamesForRouting =
      langGraphPlan?.routingSummary?.selectedToolNames ||
      langGraphPlan?.selectedToolNames ||
      selectedToolNamesForTurn
    const routingSummaryText = [
      `Focus: ${normalizedQuerySnippet || "general request"}.`,
      `Intent ${langGraphPlan?.routingSummary?.intent || langGraphPlan?.intent || "general"}.`,
      complexityModeForStream ? `Complexity ${complexityModeForStream}.` : null,
      `Selected ${selectedConnectorIdsForRouting.length} connector${
        selectedConnectorIdsForRouting.length === 1 ? "" : "s"
      } and ${selectedToolNamesForRouting.length} tool${
        selectedToolNamesForRouting.length === 1 ? "" : "s"
      }.`,
      taskPlanForStream.length > 0
        ? `${taskPlanForStream.length} planner task${
            taskPlanForStream.length === 1 ? "" : "s"
          } active.`
        : null,
      hasCurriculumAlignmentTaskForStream
        ? "Curriculum alignment active for this educational turn."
        : null,
      retrievalNotesForStream.length > 0 ? retrievalNotesForStream[0]?.note || null : null,
      incompleteEvidenceStateForStream &&
      incompleteEvidenceStateForStream !== "complete"
        ? `Evidence state ${incompleteEvidenceStateForStream.replace(/_/g, " ")}.`
        : null,
    ]
      .filter((item): item is string => Boolean(item))
      .join(" ")
    const taskBoardTitleForStream = normalizedQuerySnippet
      ? `Agent Task Board - ${normalizedQuerySnippet.slice(0, 54)}${
          normalizedQuerySnippet.length > 54 ? "..." : ""
        }`
      : "Agent Task Board"
    const routingSummaryForStream = {
      intent: langGraphPlan?.routingSummary?.intent || langGraphPlan?.intent || "general",
      summary: routingSummaryText,
      taskBoardTitle: taskBoardTitleForStream,
      querySnippet: normalizedQuerySnippet,
      selectedConnectorIds: selectedConnectorIdsForRouting,
      selectedToolNames: selectedToolNamesForRouting.slice(0, 24),
      modePolicy:
        langGraphPlan?.routingSummary?.modePolicy ||
        langGraphPlan?.modePolicy ||
        null,
      maxSteps: resolvedMaxSteps,
      artifactWorkflowStage,
      learningMode: effectiveLearningMode,
      clinicianMode: effectiveClinicianMode,
      orchestrationEngine: orchestrationEngineForStream,
      loopIterations:
        langGraphPlan &&
        "loopIterations" in langGraphPlan &&
        typeof langGraphPlan.loopIterations === "number"
          ? langGraphPlan.loopIterations
          : undefined,
      confidence:
        langGraphPlan &&
        "confidence" in langGraphPlan &&
        typeof langGraphPlan.confidence === "number"
          ? langGraphPlan.confidence
          : undefined,
      sourceDiversity:
        langGraphPlan &&
        "sourceDiversity" in langGraphPlan &&
        typeof langGraphPlan.sourceDiversity === "number"
          ? langGraphPlan.sourceDiversity
          : undefined,
      complexityMode: complexityModeForStream,
      clinicalCompleteness: clinicalCompletenessForStream,
      incompleteEvidencePolicy: effectiveIncompleteEvidencePolicy,
      incompleteEvidenceState: incompleteEvidenceStateForStream,
      missingVariablePrompts: missingVariablePromptsForStream,
      gatekeeperDecisions: gatekeeperDecisionsForStream,
      loopTransitions: loopTransitionsForStream,
      confidenceTransitions: confidenceTransitionsForStream,
      taskPlan: taskPlanForStream,
      retrievalNotes: retrievalNotesForStream,
      runtimeSteps: runtimeStepsForStream,
      runtimeDag: runtimeDagForStream,
      chartPlan: chartPlanForStream,
    }
    if (finalEnableEvidence) {
      const contextForStream = capturedEvidenceContext || evidenceContext
      const mergedStreamCitations = [
        ...(contextForStream?.context?.citations || []),
        ...runtimeEvidenceCitations,
      ]
      if (mergedStreamCitations.length) {
        const rankedStreamPool = rankCitationsForQuery(mergedStreamCitations, queryText, {
          recencyPriority: freshEvidenceIntent,
        })
        const diversityAdjustedPool = shouldUseBroadEvidenceFanout
          ? ensureCitationSourceDiversity(
              rankedStreamPool,
              rankedStreamPool,
              FANOUT_SOURCE_DIVERSITY_FLOOR
            )
          : rankedStreamPool
        const streamPool = dedupeAndReindexCitations(diversityAdjustedPool)
        const prioritizedStreamPool =
          preferredInlineVisualSourceIds.size > 0
            ? [...streamPool].sort((left, right) => {
                const leftExplicit = preferredInlineVisualSourceIds.has(buildEvidenceSourceId(left)) ? 1 : 0
                const rightExplicit = preferredInlineVisualSourceIds.has(buildEvidenceSourceId(right)) ? 1 : 0
                return rightExplicit - leftExplicit
              })
            : streamPool
        evidenceCitationsForStream = dedupeAndReindexCitations(prioritizedStreamPool).slice(0, 20)
        const journalVisualTimeoutMs = inlineEvidenceFigureRequested ? 7000 : 2600
        const maxCitationsToEnrich = inlineEvidenceFigureRequested
          ? preferredInlineVisualSourceIds.size > 0
            ? 2
            : 3
          : 6
        evidenceCitationsForStream = await runWithTimeBudget(
          "EVIDENCE_JOURNAL_VISUALS",
          async () =>
            enrichEvidenceCitationsWithJournalVisuals(evidenceCitationsForStream, {
              queryText,
              maxCitationsToEnrich,
            }),
          journalVisualTimeoutMs,
          evidenceCitationsForStream
        )

        const encodedHeader = encodeEvidenceCitationsHeader(evidenceCitationsForStream)
        if (encodedHeader) {
          responseHeaders["Access-Control-Expose-Headers"] =
            "X-Evidence-Citations, X-Stream-Intro, X-Chat-Id"
          responseHeaders["X-Evidence-Citations"] = encodedHeader
        }
      }
    }

    console.log(
      `[TTFT][server] response-ready ${Math.round(performance.now() - requestStartTime)}ms`
    )

    const shouldEmitChecklistForStream =
      taskPlanForStream.length === 0 &&
      runtimeStepsForStream.length === 0 &&
      runtimeDagForStream.length === 0
    const checklistItemsForStream =
      shouldEmitChecklistForStream && dynamicChecklistForStream.length > 0
        ? dynamicChecklistForStream.map((item: {
            id: string
            label: string
            status: "pending" | "running" | "completed" | "failed"
          }) => ({
            id: item.id,
            label: item.label,
            status:
              item.status === "failed"
                ? ("failed" as const)
                : item.status === "running"
                  ? ("running" as const)
                  : item.status === "completed"
                    ? ("completed" as const)
                    : ("pending" as const),
          }))
          .filter(
            (item: {
              id: string
              label: string
              status: "pending" | "running" | "completed" | "failed"
            }) => item.status !== "pending"
          )
        : null
    const checklistTitleForStream =
      checklistItemsForStream && checklistItemsForStream.length > 0
        ? "Agentic orchestration loop"
        : undefined

    return createDataStreamResponse({
      status: 200,
      headers: responseHeaders,
      execute: (writer) => {
        activeStreamWriter = writer as typeof activeStreamWriter
        if (pendingMessageAnnotations.length > 0) {
          for (const annotation of pendingMessageAnnotations.splice(
            0,
            pendingMessageAnnotations.length
          )) {
            writeStreamAnnotation(annotation)
          }
        }

        emitTimelineEvent({
          kind: "system-intro",
          text: streamIntroPreview,
        })

        if (checklistItemsForStream && checklistItemsForStream.length > 0) {
          emitTimelineEvent({
            kind: "checklist",
            title: checklistTitleForStream,
            items: checklistItemsForStream,
          })
        }

        if (trackedUploadIds.length > 0) {
          const uploadTrackingSequence = nextTimelineSequence()
          const uploadTrackingCreatedAt = new Date().toISOString()
          writeStreamAnnotation({
            type: "upload-status-tracking",
            sequence: uploadTrackingSequence,
            createdAt: uploadTrackingCreatedAt,
            uploadIds: trackedUploadIds,
          })
          const uploadSnapshotById = new Map(
            uploadReadinessSnapshots.map((snapshot) => [snapshot.uploadId, snapshot])
          )
          trackedUploadIds.forEach((uploadId) => {
            const snapshot = uploadSnapshotById.get(uploadId)
            emitTimelineEvent({
              kind: "upload-status",
              uploadId,
              uploadTitle: snapshot?.uploadTitle || null,
              status: snapshot?.status || "pending",
              progressStage: snapshot?.progressStage || "queued",
              progressPercent:
                typeof snapshot?.progressPercent === "number" ? snapshot.progressPercent : 0,
              lastError: snapshot?.lastError || null,
            })
          })
        }

        if (
          langGraphPlan ||
          langGraphHarnessTrace.length > 0 ||
          runtimeDagForStream.length > 0 ||
          gatekeeperDecisionsForStream.length > 0 ||
          loopTransitionsForStream.length > 0 ||
          confidenceTransitionsForStream.length > 0 ||
          runtimeStepsForStream.length > 0 ||
          routingSummaryForStream.selectedToolNames.length > 0
        ) {
          writeStreamAnnotation({
            type: "langgraph-routing",
            sequence: nextTimelineSequence(),
            createdAt: new Date().toISOString(),
            trace: langGraphHarnessTrace,
            ...routingSummaryForStream,
          })
        }
        if (topicContextForStream) {
          writeStreamAnnotation({
            type: "topic-context",
            sequence: nextTimelineSequence(),
            createdAt: new Date().toISOString(),
            topicContext: topicContextForStream,
          })
        }
        if (artifactRefinementForStream) {
          writeStreamAnnotation({
            type: "artifact-refinement",
            sequence: nextTimelineSequence(),
            createdAt: new Date().toISOString(),
            refinement: {
              ...artifactRefinementForStream,
              intent: effectiveArtifactIntent,
            },
          })
        }
        if (artifactRuntimeWarningsForStream.length > 0) {
          writeStreamAnnotation({
            type: "artifact-runtime-warnings",
            sequence: nextTimelineSequence(),
            createdAt: new Date().toISOString(),
            warnings: artifactRuntimeWarningsForStream,
          })
        }
        if (evidenceCitationsForStream.length > 0) {
          writeStreamAnnotation({
            type: "evidence-citations",
            sequence: nextTimelineSequence(),
            createdAt: new Date().toISOString(),
            citations: evidenceCitationsForStream,
          })
        }
        result.mergeIntoDataStream(writer, {
          sendReasoning: true,
          sendSources: true,
        })
      },
      onError: (error: unknown) => {
        console.error("Stream error:", error)
        return extractErrorMessage(error)
      },
    })
  } catch (err: unknown) {
    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}
