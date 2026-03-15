import {
  AUTH_HOURLY_ATTACHMENT_LIMIT,
  ENABLE_WEB_SEARCH_TOOL,
  ENABLE_UPLOAD_CONTEXT_SEARCH,
  ENABLE_UPLOAD_ARTIFACT_V2,
  ENABLE_YOUTUBE_TOOL,
  ENABLE_LANGGRAPH_HARNESS,
  ENABLE_CONNECTOR_REGISTRY,
  ENABLE_STRICT_CITATION_CONTRACT,
  NON_AUTH_HOURLY_ATTACHMENT_LIMIT,
  getSystemPromptByRole,
} from "@/lib/config"
import { getAllModels, getModelInfo } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
import type { ProviderWithoutOllama } from "@/lib/user-keys"
import { searchPubMed, fetchPubMedArticle } from "@/lib/pubmed"
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
import { createErrorResponse, extractErrorMessage } from "./utils"
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
  synthesizeEvidence,
  buildEvidenceSystemPrompt,
  extractReferencedCitations,
  buildEvidenceContext,
} from "@/lib/evidence"
import type { EvidenceCitation } from "@/lib/evidence"
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
import { runClinicalAgentHarness } from "@/lib/clinical-agent/graph"
import { recordCitationContractViolation } from "@/lib/clinical-agent/telemetry"
import {
  runConnectorSearch,
  type ClinicalConnectorId,
  type ConnectorSearchPayload,
} from "@/lib/evidence/connectors"

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

function resolveAutoLatestUploadIds(
  uploads: UserUploadListItem[],
  intentSignal: ImplicitUploadIntentSignal,
  maxCount = 3
): string[] {
  if (!intentSignal.hasImplicitUploadIntent) return []
  const kindPriority = intentSignal.preferSlides
    ? { pptx: 6, pdf: 5, docx: 4, text: 3, image: 1 }
    : { pdf: 6, docx: 5, text: 4, pptx: 4, image: 1 }

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
const FANOUT_PER_TOOL_TIMEOUT_MS = 18_000
const FANOUT_TOTAL_BUDGET_MS = 28_000
const FANOUT_TOTAL_BUDGET_FRESH_MS = 34_000
const FANOUT_MAX_TOOL_STEPS = 12
const FANOUT_MAX_TOOL_STEPS_FRESH = 14

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

function dedupeAndReindexCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const deduped = new Map<string, EvidenceCitation>()
  citations.forEach((citation) => {
    const key =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      `${citation.title || "untitled"}:${citation.journal || "unknown"}`
    if (!deduped.has(key)) {
      deduped.set(key, citation)
    }
  })
  return Array.from(deduped.values()).map((citation, index) => ({
    ...citation,
    index: index + 1,
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
  maxEncodedLength: number = 12000
): string | null {
  if (!Array.isArray(citations) || citations.length === 0) return null

  const compact = (items: EvidenceCitation[]) =>
    items.map((citation) => ({
      index: citation.index,
      title: citation.title,
      journal: citation.journal,
      authors: Array.isArray(citation.authors) ? citation.authors : [],
      year: citation.year,
      evidenceLevel: citation.evidenceLevel,
      studyType: citation.studyType,
      url: citation.url,
      doi: citation.doi,
      pmid: citation.pmid,
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
      previewReference: citation.previewReference || null,
      figureReferences: citation.figureReferences || [],
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
  const variants = buildGuidelineQueryVariants(queryText)
  const collected: EvidenceCitation[] = []
  const relaxedCollected: EvidenceCitation[] = []
  for (const variant of variants) {
    const guidelineResult = await searchGuidelines(variant, maxResults, "US")
    if (!guidelineResult.provenance.length) continue
    relaxedCollected.push(
      ...guidelineResult.provenance.map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
    )
    const filtered = guidelineResult.provenance
      .filter((item) => evaluateProvenanceQuality(item, queryText).passed)
      .filter((item) =>
        isTextRelevantToClinicalQuery(
          `${item.title || ""} ${item.journal || ""} ${item.snippet || ""}`,
          queryText
        )
      )
      .map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
    if (filtered.length > 0) {
      collected.push(...filtered)
    }
    if (collected.length >= maxResults) break
  }
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
  allowMultipleArtifacts?: boolean
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
    const implicitUploadIntentSignal = detectImplicitUploadIntent(queryText)
    const uploadService = new UserUploadService()
    const explicitSelectedUploadIds = extractUploadReferenceIds(rawQueryText)
    let selectedUploadIds = explicitSelectedUploadIds
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
    const hasUploadContextHint = Boolean(selectedUploadIdHint || effectiveTopicContext?.lastUploadId)
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
    const artifactIntent: "none" | "quiz" =
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
    ])
    const resolvedProvider = getProviderForModel(effectiveModel)
    const embeddingApiKey = resolvedProvider === "openai" ? apiKey : undefined
    const embeddingProviderMismatch = Boolean(apiKey) && resolvedProvider !== "openai"

    const clinicianRoleFromResolvedRole =
      effectiveUserRole === "doctor" || effectiveUserRole === "medical_student"
    const evidenceSeekingIntent = hasEvidenceSeekingIntent(queryText) || hasGuidelineIntent(queryText)
    const freshEvidenceIntent = needsFreshEvidence(queryText)
    const finalEnableEvidence =
      enableEvidenceFromClient === true || clinicianRoleFromResolvedRole || evidenceSeekingIntent
    const finalEnableSearch =
      ENABLE_WEB_SEARCH_TOOL &&
      enableSearchFromClient !== false
    const shouldRunWebSearchPreflight =
      finalEnableSearch && queryText.length > 0 && !shouldPreferUploadContext
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
    const webSearchPreflightPromise = shouldRunWebSearchPreflight
      ? runWithTimeBudget<Awaited<ReturnType<typeof searchWeb>> | null>(
          "WEB_SEARCH_PREFLIGHT",
          async () =>
            searchWeb(queryText, {
              maxResults: 4,
              timeoutMs: FANOUT_PER_TOOL_TIMEOUT_MS,
              retries: 0,
              medicalOnly: clinicianRoleFromResolvedRole,
            }),
          Math.min(FANOUT_PER_TOOL_TIMEOUT_MS + 1_000, fanoutTotalBudgetMs),
          null
        )
      : Promise.resolve(null)

    const [evidenceContextResult, uploadContextResult, webSearchPreflight] = await Promise.all([
      shouldRunEvidenceSynthesis
        ? runWithTimeBudget(
            "EVIDENCE_SYNTHESIS",
            async () =>
              synthesizeEvidence({
                query: queryText,
                maxResults: 12,
                minEvidenceLevel: minEvidenceLevelForQuery,
                candidateMultiplier: 6,
                enableRerank: true,
                queryExpansion: true,
                minMedicalConfidence: 0.25,
                forceEvidence: queryText.trim().length >= 8,
              }).catch((err) => {
                console.error("📚 EVIDENCE MODE: Error synthesizing evidence:", err)
                return null
              }),
            1200,
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
    if (finalEnableEvidence && queryText.length > 0) {
      let mergedCitations = evidenceContextResult?.context?.citations
        ? [...evidenceContextResult.context.citations]
        : []
      if (uploadEvidenceCitations.length > 0) {
        mergedCitations = [...mergedCitations, ...uploadEvidenceCitations]
      }
      const guidelinePriority = benchStrictMode || hasGuidelineIntent(queryText)
      const strictCitationFloor = benchStrictMode ? STRICT_MIN_CITATION_FLOOR : 6

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

      if (mergedCitations.length > 0) {
        const rankedPool = rankCitationsForQuery(mergedCitations, queryText, {
          guidelinePriority,
          recencyPriority: freshEvidenceIntent,
        })
        let selected = filterLowRelevanceCitations(
          rankedPool,
          queryText,
          benchStrictMode ? strictCitationFloor : 6
        )
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

    if (benchStrictMode && finalEnableEvidence) {
      effectiveSystemPrompt += `\n\n${buildBenchStrictPrompt({
        citationCount: evidenceContext?.context?.citations?.length ?? 0,
        requiresEscalation: emergencyEscalationIntent.shouldEscalate,
        requiresGuideline: hasGuidelineIntent(queryText),
        allowBibliography: allowBibliographyInOutput,
      })}`
    }

    if (webSearchPreflight?.results?.length) {
      const serializedResults = webSearchPreflight.results
        .slice(0, 4)
        .map(
          (result, index) =>
            `[WEB:${index + 1}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}`
        )
        .join("\n\n")
      effectiveSystemPrompt += `\n\nWEB SEARCH SNAPSHOT (latest web context from user-enabled search):\n${serializedResults}`
    } else if (finalEnableSearch && !hasWebSearchConfigured()) {
      effectiveSystemPrompt +=
        "\n\nWeb search was requested but EXA_API_KEY is not configured, so continue without live web sources."
    }

    if (!finalEnableEvidence) {
      effectiveSystemPrompt = removeCitationInstructions(effectiveSystemPrompt)
      effectiveSystemPrompt += `\n\n**IMPORTANT: Do NOT include citations, citation markers, or reference numbers in your response. Respond naturally without any [CITATION:X] or [X] markers. Do not include a "Citations" section at the end.`
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
    const anonymizedMessages = anonymizeMessages(filteredMessages) as MessageAISDK[]
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
      finalEnableSearch &&
      supportsTools &&
      queryText.length > 0 &&
      !shouldPreferUploadContext &&
      hasWebSearchConfigured()
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
      guideline: ["pubmed", "clinical_trials"],
      clinical_trials: ["pubmed", "guideline"],
      synapse: ["scholar_gateway", "pubmed"],
      benchling: ["scholar_gateway", "pubmed"],
      biorender: ["scholar_gateway", "pubmed"],
      cms_coverage: ["guideline", "pubmed"],
      npi_registry: ["cms_coverage", "pubmed"],
      pubmed: ["guideline", "clinical_trials"],
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

      if (hasWebSearchConfigured()) {
        return buildWebFallbackPayload(
          params.connectorId,
          params.query,
          params.maxResults,
          params.medicalOnly
        )
      }

      return primary
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
              query: z.string().min(1).describe("Query to search within uploaded documents"),
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
                results: result.citations.map((citation) => ({
                  index: citation.index,
                  title: citation.title,
                  sourceLabel: citation.sourceLabel,
                  uploadId: citation.uploadId,
                  sourceUnitId: citation.sourceUnitId,
                  sourceUnitType: citation.sourceUnitType,
                  sourceUnitNumber: citation.sourceUnitNumber,
                  sourceOffsetStart: citation.sourceOffsetStart,
                  sourceOffsetEnd: citation.sourceOffsetEnd,
                  url: citation.url,
                  snippet: citation.snippet,
                  score: citation.score,
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
            description: "Search guideline-like sources (NICE if configured, plus Europe PMC guideline records).",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical guideline query"),
              maxResults: z.number().int().min(1).max(10).default(6),
            }),
            execute: async ({ query, maxResults }) => {
              const strictMaxResults = benchStrictMode
                ? Math.max(maxResults, 8)
                : maxResults
              const result = await searchGuidelines(query, strictMaxResults, "US")
              if (result.results.length > 0 || !benchStrictMode) {
                pushRuntimeEvidenceCitations(result)
                return result
              }
              const fallbackResult = await searchGuidelines(
                `${query} guideline`,
                strictMaxResults,
                "GLOBAL"
              )
              pushRuntimeEvidenceCitations(fallbackResult)
              return fallbackResult
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
                return firstAttempt
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
                  warnings: [
                    ...secondAttempt.warnings,
                    "webSearch used broader-query retry after sparse/timeout first attempt.",
                  ],
                }
              }
              return {
                ...firstAttempt,
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

    let runtimeTools: ToolSet = {
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

    let langGraphPlan: Awaited<ReturnType<typeof runClinicalAgentHarness>> | null = null
    if (ENABLE_LANGGRAPH_HARNESS && supportsTools && queryText.trim().length > 0) {
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
      })
      langGraphHarnessTrace = langGraphPlan.trace

      if (langGraphPlan.selectedToolNames.length > 0) {
        const selectedToolNames = new Set(langGraphPlan.selectedToolNames)
        if (!allowScholarGatewayTool) {
          selectedToolNames.delete("scholarGatewaySearch")
        }
        if (preferredFanoutToolNames.length > 0) {
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
        if (filteredEntries.length > 0) {
          runtimeTools = Object.fromEntries(filteredEntries) as ToolSet
        }
      }

      if (langGraphPlan.systemPromptAdditions.length > 0) {
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
            emitToolLifecycleEvent({
              toolName,
              toolCallId,
              lifecycle: "completed",
            })
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
- CITATION DENSITY: For medical content, place citations after each factual sentence whenever evidence exists; avoid bundling multiple distinct claims under one citation.`
      if (benchStrictMode) {
        effectiveSystemPrompt += `\n- BENCH STRICT: If guideline evidence is requested or clinically relevant, run guidelineSearch before finalizing your answer.
- BENCH STRICT: If a tool returns weakly relevant results, rerun once with a narrower query and cite only the focused result set.
- BENCH STRICT: Do not emit bracketed PMID/DOI values as citations; use only [index] citations from provided evidence.
- BENCH STRICT: Do not append manual references sections; keep citations inline only.`
      }
    } else if (shouldEnablePubMedTools) {
      effectiveSystemPrompt += `\n\nYou may use PubMed tools when the question requests latest evidence, guideline updates, or when provided evidence is sparse. Prefer retrieved PubMed records for recency-sensitive claims and cite them explicitly.`
    }

    if (ENABLE_STRICT_CITATION_CONTRACT && finalEnableEvidence) {
      effectiveSystemPrompt += `\n\nSTRICT CITATION CONTRACT:
- Never output unresolved placeholder tokens such as [CITE_PLACEHOLDER_0].
- Only emit numeric bracket citations [n] when they map to returned evidence citations.
- If no evidence citations are available for a claim, omit citation markers for that claim instead of fabricating references.`
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

    if (finalEnableSearch) {
      effectiveSystemPrompt += `\n\nWeb search is explicitly enabled by user toggle.
- Use the webSearch tool when you need fresh or external sources.
- Never claim web-browsing unless webSearch returns results.
- Cite only URLs returned by webSearch or listed in WEB SEARCH SNAPSHOT context.
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
    const routingSummaryForStream = {
      intent: langGraphPlan?.routingSummary?.intent || langGraphPlan?.intent || "general",
      querySnippet: queryText.trim().replace(/\s+/g, " ").slice(0, 140),
      selectedConnectorIds:
        langGraphPlan?.routingSummary?.selectedConnectorIds ||
        langGraphPlan?.selectedConnectorIds ||
        [],
      selectedToolNames: selectedToolNamesForTurn.slice(0, 24),
      modePolicy:
        langGraphPlan?.routingSummary?.modePolicy ||
        langGraphPlan?.modePolicy ||
        null,
      maxSteps: resolvedMaxSteps,
      artifactWorkflowStage,
      learningMode: effectiveLearningMode,
      clinicianMode: effectiveClinicianMode,
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
        evidenceCitationsForStream = dedupeAndReindexCitations(diversityAdjustedPool).slice(0, 12)

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

        if (selectedUploadIds.length > 0) {
          const uploadTrackingSequence = nextTimelineSequence()
          const uploadTrackingCreatedAt = new Date().toISOString()
          writeStreamAnnotation({
            type: "upload-status-tracking",
            sequence: uploadTrackingSequence,
            createdAt: uploadTrackingCreatedAt,
            uploadIds: selectedUploadIds,
          })
          selectedUploadIds.forEach((uploadId) => {
            emitTimelineEvent({
              kind: "upload-status",
              uploadId,
              uploadTitle: null,
              status: "pending",
              progressStage: "queued",
              progressPercent: 0,
              lastError: null,
            })
          })
        }

        if (langGraphHarnessTrace.length > 0) {
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
