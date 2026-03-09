import {
  ENABLE_WEB_SEARCH_TOOL,
  ENABLE_UPLOAD_CONTEXT_SEARCH,
  ENABLE_YOUTUBE_TOOL,
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
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import type { UploadContextSearchMode, UploadTopicContext } from "@/lib/uploads/server"
import {
  extractUploadReferenceIds,
  stripUploadReferenceTokens,
} from "@/lib/uploads/reference-tokens"
import type { TopicContext } from "@/app/types/api.types"
import {
  normalizeCitationStyle,
  type CitationStyle,
} from "@/lib/citations/formatters"

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

function buildSafeIntroPreview(query: string): string {
  const normalized = query.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return "I am preparing a grounded response and will stream results as tools complete."
  }
  const snippet = normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
  return `I am preparing a grounded response for "${snippet}" and will stream tool activity inline.`
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
      const parsed = await pdfParse(decoded.buffer)
      const text = String(parsed?.text || "").replace(/\s+/g, " ").trim()
      return text ? text.slice(0, 6000) : null
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

  const chunks: string[] = []
  for (const attachment of attachments) {
    const text = await extractAttachmentText(attachment)
    if (text) {
      chunks.push(
        `Attachment: ${attachment.name || "Untitled"}\nExtracted content preview:\n${text}`
      )
    }
  }

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
  shouldEscalate: boolean;
  matchedSignals: string[];
} {
  const normalized = query.trim();
  if (!normalized) {
    return { shouldEscalate: false, matchedSignals: [] };
  }

  const matchedSignals = HIGH_RISK_EMERGENCY_PATTERNS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ label }) => label);

  const hasUrgentContext = URGENT_CONTEXT_PATTERN.test(normalized);
  const shouldEscalate = matchedSignals.length > 0 || (hasUrgentContext && /\b(pain|shock|stroke|sepsis|bleeding|abdominal|dyspnea|breath)\b/i.test(normalized));

  return { shouldEscalate, matchedSignals };
}

function buildEmergencyEscalationInstruction(matchedSignals: string[]): string {
  const signalText = matchedSignals.length > 0 ? matchedSignals.join(", ") : "urgent red flags";
  return `
EMERGENCY ESCALATION OVERRIDE:
- Emergency intent detected (${signalText}).
- In your final answer, include a direct escalation sentence using explicit wording such as:
  - "Call 911 now."
  - "Go to the emergency department immediately."
- Keep escalation clinically specific and place it near the top of the response.
- After escalation, provide concise stabilization priorities while deferring definitive care to in-person emergency evaluation.
`.trim();
}

const GUIDELINE_INTENT_PATTERN =
  /\b(guideline|guidelines|recommendation|consensus|position statement|evidence-based|first-line|society guidance|practice standard)\b/i
const STRICT_MIN_CITATION_FLOOR = 8
const STRICT_MIN_GUIDELINE_CITATIONS = 1

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

function rankCitationsForQuery(
  citations: EvidenceCitation[],
  queryText: string,
  options?: {
    guidelinePriority?: boolean
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
      const score = overlapScore * 0.7 + evidenceBoost + guidelineBoost
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
  "guidelines",
  "review",
  "adult",
  "adults",
  "patient",
  "patients",
])

function extractClinicalQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
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
  const terms = extractClinicalQueryTerms(query).slice(0, 6)
  if (terms.length === 0) return query
  return terms.map((term) => `${term}[Title/Abstract]`).join(" AND ")
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
  const pendingQuizTopicOptions = Array.isArray(candidate.pendingQuizTopicOptions)
    ? candidate.pendingQuizTopicOptions
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .slice(0, 6)
    : []

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
    followUpType:
      typeof candidate.followUpType === "string"
        ? (candidate.followUpType as TopicContext["followUpType"])
        : "unknown",
    pendingQuizTopicSelection: candidate.pendingQuizTopicSelection === true,
    pendingQuizTopicOptions,
    pendingQuizOriginalQuery:
      typeof candidate.pendingQuizOriginalQuery === "string"
        ? candidate.pendingQuizOriginalQuery.trim().slice(0, 240)
        : null,
    pendingQuizRequestedAt:
      typeof candidate.pendingQuizRequestedAt === "string" &&
      candidate.pendingQuizRequestedAt.trim().length > 0
        ? candidate.pendingQuizRequestedAt.trim()
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
    followUpType: overrideContext?.followUpType ?? baseContext?.followUpType ?? "unknown",
    pendingQuizTopicSelection:
      overrideContext?.pendingQuizTopicSelection ??
      baseContext?.pendingQuizTopicSelection ??
      false,
    pendingQuizTopicOptions:
      overrideContext?.pendingQuizTopicOptions &&
      overrideContext.pendingQuizTopicOptions.length > 0
        ? overrideContext.pendingQuizTopicOptions
        : baseContext?.pendingQuizTopicOptions ?? [],
    pendingQuizOriginalQuery:
      overrideContext?.pendingQuizOriginalQuery ??
      baseContext?.pendingQuizOriginalQuery ??
      null,
    pendingQuizRequestedAt:
      overrideContext?.pendingQuizRequestedAt ??
      baseContext?.pendingQuizRequestedAt ??
      null,
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
    /"[^"]{3,}"/.test(query)
  if (hasTopicSpecificCue) return false
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  return wordCount <= 10
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
    if (normalized.length < 12) return
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
      const sentence = snippet.split(/[.!?]\s/)[0] || snippet
      pushOption(sentence)
    }
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
    pages.length >= 4 ? Math.max(...pages) - Math.min(...pages) : 0
  const isBroad =
    citations.length >= 6 &&
    (unitKeys.size >= 5 || titles.size >= 2 || pageSpread >= 10)

  return {
    isBroad,
    topicOptions: buildTopicOptionsFromUploadCitations(citations),
  }
}

function resolveQuizTopicReply(query: string, options: string[]): {
  resolvedTopic: string | null
  wantsAllTopics: boolean
} {
  const normalized = query.trim()
  if (!normalized) {
    return { resolvedTopic: null, wantsAllTopics: false }
  }
  if (/\b(all topics?|everything|whole (?:file|document|book)|mixed)\b/i.test(normalized)) {
    return { resolvedTopic: null, wantsAllTopics: true }
  }
  for (const option of options) {
    if (normalized.toLowerCase().includes(option.toLowerCase())) {
      return { resolvedTopic: option, wantsAllTopics: false }
    }
  }
  if (isGenericQuizRequest(normalized)) {
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
    followUpType: baseContext?.followUpType ?? "unknown",
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
  artifactIntent?: "none" | "document" | "quiz"
  citationStyle?: CitationStyle
  allowMultipleArtifacts?: boolean
}

export async function POST(req: Request) {
  try {
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
    } = (await req.json()) as ChatRequest

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

    let effectiveChatId = chatId

    // CRITICAL: Check rate limits FIRST - fail fast before any other work
    let validatedSupabase: Awaited<ReturnType<typeof validateAndTrackUsage>> = null
    if (userId !== "temp") {
      try {
        validatedSupabase = await validateAndTrackUsage({
          userId,
          model,
          isAuthenticated,
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
              ? (messages[messages.length - 1]?.content as string)
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

    const lastUserMessage = messages.filter(m => m.role === "user").pop()
    const rawQueryText =
      typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""
    const selectedUploadIds = extractUploadReferenceIds(rawQueryText)
    const selectedUploadIdHint = selectedUploadIds[0]
    const queryText = stripUploadReferenceTokens(rawQueryText)
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
    const artifactIntent =
      artifactIntentFromRequest === "document" || artifactIntentFromRequest === "quiz"
        ? artifactIntentFromRequest
        : "none"
    const allowMultipleArtifacts =
      allowMultipleArtifactsFromRequest === true || detectExplicitMultiArtifactRequest(queryText)
    const resolvedCitationStyle = normalizeCitationStyle(citationStyleFromRequest)
    const allowBibliographyInOutput = artifactIntent === "document"
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

    const clinicianRoleFromResolvedRole =
      effectiveUserRole === "doctor" || effectiveUserRole === "medical_student"
    const finalEnableEvidence =
      enableEvidenceFromClient === true || clinicianRoleFromResolvedRole
    const hasWebSearchSupport = Boolean(modelConfig?.webSearch)
    const finalEnableSearch =
      ENABLE_WEB_SEARCH_TOOL &&
      enableSearchFromClient === true &&
      hasWebSearchSupport
    const shouldRunWebSearchPreflight = finalEnableSearch && queryText.length > 0
    const streamIntroPreview = buildSafeIntroPreview(queryText)
    const minEvidenceLevelForQuery = clinicianRoleFromResolvedRole ? 3 : 5

    const uploadService = new UserUploadService()
    const uploadSearchMode: UploadContextSearchMode =
      /\b(page|pp?\.?)\s*\d+/i.test(queryText) || /\bpages?\s*\d+\s*(?:-|to)\s*\d+\b/i.test(queryText)
        ? "auto"
        : "hybrid"
    const shouldRunEvidenceSynthesis = finalEnableEvidence && queryText.length > 0
    const shouldRunUploadContextSearch =
      ENABLE_UPLOAD_CONTEXT_SEARCH &&
      isAuthenticated &&
      userId !== "temp" &&
      queryText.length > 0
    const webSearchPreflightPromise = shouldRunWebSearchPreflight
      ? runWithTimeBudget<Awaited<ReturnType<typeof searchWeb>> | null>(
          "WEB_SEARCH_PREFLIGHT",
          async () =>
            searchWeb(queryText, {
              maxResults: 4,
              timeoutMs: 1200,
              retries: 1,
              medicalOnly: clinicianRoleFromResolvedRole,
            }),
          1400,
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
            2400,
            null
          )
        : Promise.resolve(null),
      shouldRunUploadContextSearch
        ? runWithTimeBudget(
            "UPLOAD_CONTEXT_SEARCH",
            async () =>
              uploadService
                .uploadContextSearch({
                  userId,
                  query: queryText,
                  apiKey,
                  uploadId: selectedUploadIdHint,
                  mode: uploadSearchMode,
                  topK: 6,
                  includeNeighborPages: 1,
                  topicContext: (effectiveTopicContext ??
                    undefined) as UploadTopicContext | undefined,
                  maxDurationMs: 2200,
                })
                .catch((err) => {
                  console.warn("📚 [UPLOAD RETRIEVAL] Structured retrieval failed:", err)
                  return null
                }),
            2300,
            null
          )
        : Promise.resolve(null),
      webSearchPreflightPromise,
    ])

    const uploadEvidenceCitations =
      uploadContextResult?.citations ??
      (isAuthenticated && userId !== "temp" && queryText.length > 0
        ? await runWithTimeBudget(
            "UPLOAD_LEGACY_CITATIONS",
            async () =>
              uploadService
                .retrieveUploadCitations({
                  userId,
                  query: queryText,
                  apiKey,
                  maxResults: 4,
                })
                .catch((err) => {
                  console.warn("📚 [UPLOAD RETRIEVAL] Legacy retrieval failed:", err)
                  return []
                }),
            1400,
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
      normalizeTopicContext(uploadContextResult?.topicContext)
    )
    const uploadCitationsForBreadth = Array.isArray(uploadContextResult?.citations)
      ? uploadContextResult.citations
      : []
    const topicBreadth = analyzeUploadTopicBreadth(uploadCitationsForBreadth)
    const pendingQuizTopicSelection = resolvedTopicContext?.pendingQuizTopicSelection === true
    const pendingQuizOptions = Array.isArray(resolvedTopicContext?.pendingQuizTopicOptions)
      ? resolvedTopicContext.pendingQuizTopicOptions
      : []
    const quizTopicReplyResolution =
      artifactIntent === "quiz" && pendingQuizTopicSelection
        ? resolveQuizTopicReply(queryText, pendingQuizOptions)
        : { resolvedTopic: null, wantsAllTopics: false }
    const shouldAskQuizTopicFollowup =
      artifactIntent === "quiz" &&
      !pendingQuizTopicSelection &&
      isGenericQuizRequest(queryText) &&
      topicBreadth.isBroad
    let quizQueryOverride: string | undefined = undefined
    let quizLeadInSentence = "Here is your generated quiz."

    if (artifactIntent === "quiz" && pendingQuizTopicSelection) {
      if (quizTopicReplyResolution.wantsAllTopics) {
        quizQueryOverride =
          "Generate a balanced mixed-topic quiz that covers all major themes from the uploaded material."
        quizLeadInSentence = "Here is your generated quiz across all topics."
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          pendingQuizTopicSelection: false,
          pendingQuizTopicOptions: [],
          pendingQuizOriginalQuery: null,
          pendingQuizRequestedAt: null,
          followUpType: "drill_down",
        })
      } else if (quizTopicReplyResolution.resolvedTopic) {
        const resolvedTopic = quizTopicReplyResolution.resolvedTopic
        quizQueryOverride = `Generate a focused quiz on this topic from the uploaded material: ${resolvedTopic}`
        quizLeadInSentence = `Here is your generated quiz on ${resolvedTopic}.`
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          activeTopic: resolvedTopic,
          pendingQuizTopicSelection: false,
          pendingQuizTopicOptions: [],
          pendingQuizOriginalQuery: null,
          pendingQuizRequestedAt: null,
          followUpType: "drill_down",
        })
      } else {
        // If follow-up was asked but reply is still ambiguous, continue gracefully with mixed-topic coverage.
        quizQueryOverride =
          "Generate a mixed-topic quiz across key concepts in the uploaded material."
        quizLeadInSentence =
          "I could not determine a single topic from your reply, so here is a mixed-topic quiz."
        resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
          pendingQuizTopicSelection: false,
          pendingQuizTopicOptions: [],
          pendingQuizOriginalQuery: null,
          pendingQuizRequestedAt: null,
          followUpType: "drill_down",
        })
      }
    } else if (shouldAskQuizTopicFollowup) {
      const fallbackOptions = [
        "Core definitions and foundational concepts",
        "High-yield mechanisms and processes",
        "Clinical/application-style scenarios",
      ]
      const followupOptions =
        topicBreadth.topicOptions.length > 0 ? topicBreadth.topicOptions : fallbackOptions
      resolvedTopicContext = mergeTopicContexts(resolvedTopicContext, {
        pendingQuizTopicSelection: true,
        pendingQuizTopicOptions: followupOptions,
        pendingQuizOriginalQuery: queryText,
        pendingQuizRequestedAt: new Date().toISOString(),
        followUpType: "clarify",
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
          const fallbackGuidelineCitations = await fetchGuidelineFallbackCitations(
            queryText,
            6
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
        emergencyEscalationIntent.matchedSignals
      )}`
    }

    if (evidenceContext?.shouldUseEvidence && evidenceContext.context.citations.length > 0) {
      effectiveSystemPrompt = buildEvidenceSystemPrompt(effectiveSystemPrompt, evidenceContext.context)
    }

    const attachmentContext = await attachmentContextPromise
    if (attachmentContext) {
      effectiveSystemPrompt += `\n\nUSER ATTACHMENT CONTEXT (from uploaded document content):\n${attachmentContext}\n\nUse this attachment content directly when answering the user's question. If the user asks whether you can see/read the file, explicitly confirm and reference the attachment by name.`
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
        content: stripUploadReferenceTokens(message.content),
      }
    })

    // Filter attachments (sync)
    // Vision models can process both data URLs (base64) and blob URLs directly
    const filteredMessages = messagesSansUploadReferenceTokens.map(message => {
      if (message.experimental_attachments) {
        // Keep only provider-safe visual attachments in model messages.
        // Non-image docs (e.g. PDF) are handled via upload ingestion + retrieval citations.
        const filteredAttachments = message.experimental_attachments
          .filter((attachment: any) => {
            if (!attachment?.url || !attachment?.name) return false
            const contentType = String(
              attachment.contentType || attachment.mimeType || ""
            ).toLowerCase()
            return contentType.startsWith("image/")
          })
          .map((attachment: any) => ({
            ...attachment,
            contentType: attachment.contentType || "application/octet-stream",
          }))
        
        console.log(
          `Processing provider-safe image attachments for message: ${filteredAttachments.length}/${message.experimental_attachments.length} kept`
        )
        if (filteredAttachments.length > 0) {
          console.log('Valid attachments:', filteredAttachments.map(a => ({ 
            name: a.name, 
            contentType: a.contentType,
            url: a.url?.startsWith('blob:') ? 'blob:...' : 
                 a.url?.startsWith('data:') ? 'data:...' : 
                 a.url?.substring(0, 50) + '...' 
          })))
        } else if (message.experimental_attachments.length > 0) {
          console.log(
            "No provider-safe image attachments kept; non-image uploads will be used via upload retrieval citations."
          )
        }
        
        return {
          ...message,
          experimental_attachments: filteredAttachments.length > 0 ? filteredAttachments : undefined
        }
      }
      return message
    })

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
    const shouldEnableWebSearchTool =
      finalEnableSearch &&
      supportsTools &&
      queryText.length > 0 &&
      hasWebSearchConfigured()
    const shouldEnablePubMedTools =
      finalEnableEvidence &&
      supportsTools &&
      queryText.length > 0 &&
      (
        needsFreshEvidence(queryText) ||
        (capturedEvidenceContext?.context?.citations?.length ?? 0) < 4
      )
    const shouldEnableEvidenceTools = finalEnableEvidence && supportsTools && queryText.length > 0
    const shouldEnableArtifactTools =
      shouldEnableEvidenceTools &&
      ENABLE_UPLOAD_CONTEXT_SEARCH &&
      isAuthenticated &&
      userId !== "temp" &&
      !shouldAskQuizTopicFollowup
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

    if (ENABLE_YOUTUBE_TOOL && supportsTools && queryText.length > 0) {
      console.log("[YOUTUBE INTENT]", {
        shouldEnableYoutubeTool,
        reason: youtubeIntentDecision.reason,
        explicitRequest: youtubeIntentDecision.explicitRequest,
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
                  },
                }
              }

              const result = await uploadService.uploadContextSearch({
                userId,
                query,
                apiKey,
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
                maxDurationMs: 2200,
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
          ...(shouldEnableArtifactTools
            ? {
                generateDocumentFromUpload: tool({
                  description:
                    "Create a polished study document artifact from user-uploaded content, with optional references when requested.",
                  parameters: z.object({
                    query: z
                      .string()
                      .min(1)
                      .describe("Document request focus or title prompt"),
                    uploadId: z
                      .string()
                      .min(1)
                      .optional()
                      .describe("Optional upload UUID to scope generation"),
                    citationStyle: z
                      .enum(["harvard", "apa", "vancouver"])
                      .optional(),
                    includeReferences: z
                      .boolean()
                      .optional()
                      .describe(
                        "Whether to force a references section. Leave undefined to infer from the user's request."
                      ),
                    maxSources: z.number().int().min(3).max(16).default(8),
                  }),
                  execute: async ({
                    query,
                    uploadId,
                    citationStyle,
                    includeReferences,
                    maxSources,
                  }) => {
                    documentArtifactCallCount += 1
                    if (!allowMultipleArtifacts && documentArtifactCallCount > 1 && cachedDocumentArtifact) {
                      return cachedDocumentArtifact
                    }
                    const normalizedUploadId =
                      typeof uploadId === "string" && isUuidLike(uploadId) ? uploadId : undefined
                    const artifact = await uploadService.generateDocumentFromUpload({
                      userId,
                      query,
                      uploadId:
                        normalizedUploadId ||
                        (selectedUploadIdHint && isUuidLike(selectedUploadIdHint)
                          ? selectedUploadIdHint
                          : undefined),
                      citationStyle: normalizeCitationStyle(citationStyle || resolvedCitationStyle),
                      includeReferences,
                      apiKey,
                      maxSources,
                    })
                    if (!allowMultipleArtifacts) {
                      cachedDocumentArtifact = artifact as Record<string, unknown>
                    }
                    return artifact
                  },
                }),
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
              // Normalize tool queries to reduce broad, irrelevant retrieval.
              const focusedQuery = buildFocusedPubMedQuery(query)
              const result = await searchPubMed(
                focusedQuery,
                Math.min(maxResults * 3, 30)
              )
              const relevantArticles = result.articles
                .filter((article) =>
                  isTextRelevantToClinicalQuery(
                    `${article.title || ""} ${article.abstract || ""}`,
                    query
                  )
                )
                .slice(0, maxResults)

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
              return {
                totalResults: relevantArticles.length,
                searchedQuery: focusedQuery,
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
              return {
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
                return result
              }
              return searchGuidelines(`${query} guideline`, strictMaxResults, "GLOBAL")
            },
          }),
          clinicalTrialsSearch: tool({
            description: "Search ClinicalTrials.gov v2 for recent or ongoing trials relevant to a clinical question.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical trial search query"),
              maxResults: z.number().int().min(1).max(10).default(5),
            }),
            execute: async ({ query, maxResults }) => {
              return searchClinicalTrials(query, maxResults)
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
              if (webSearchCallCount > 1) {
                return {
                  query,
                  results: [],
                  warnings: [
                    "webSearch already executed for this response; reusing earlier web context.",
                  ],
                  metrics: {
                    cacheHit: false,
                    elapsedMs: 0,
                    retriesUsed: 0,
                    totalCandidates: 0,
                  },
                }
              }

              return searchWeb(query, {
                maxResults,
                timeoutMs: 1800,
                retries: 1,
                medicalOnly,
              })
            },
          }),
        }
      : ({} as ToolSet)

    const runtimeTools: ToolSet = {
      ...webSearchRuntimeTools,
      ...evidenceRuntimeTools,
      ...youtubeRuntimeTools,
    }

    if (shouldEnableEvidenceTools) {
      effectiveSystemPrompt += `\n\nYou may use live evidence tools when needed:
${ENABLE_UPLOAD_CONTEXT_SEARCH ? "- Use uploadContextSearch for user-uploaded documents, especially page-specific prompts (e.g., \"page 50\") and follow-up continuity (\"next page\", \"expand this section\")." : ""}
- ${shouldEnableArtifactTools ? "Use generateDocumentFromUpload when the user asks for a formal write-up/report/document artifact." : "Document artifact generation is unavailable unless upload tools are enabled."}
- ${shouldEnableArtifactTools ? "Use generateQuizFromUpload when the user asks for quiz/MCQ generation from uploaded files." : "Quiz artifact generation is unavailable unless upload tools are enabled."}
- Use pubmedSearch/pubmedLookup for latest literature and PMID-grounded facts.
- Use guidelineSearch for formal recommendations and regional guidance.
- Use clinicalTrialsSearch for ongoing/new evidence.
- Use drugSafetyLookup for contraindications/interactions/renal dosing checks.
- Use evidenceConflictCheck when sources disagree.
- IMPORTANT: Keep tool queries tightly aligned to the user question (specific condition/drug terms, not broad generic terms).
- IMPORTANT: If a tool returns irrelevant records, explicitly discard them and retry with a narrower query before citing evidence.
- IMPORTANT: ${allowBibliographyInOutput ? "For document artifacts, include references only when explicitly requested (e.g., Harvard/APA/Vancouver/citation/ref/bibliography wording)." : "Do not append manual references/bibliography sections; keep citations inline in the answer body only."}
- CITATION DENSITY: For medical content, place citations after each factual sentence whenever evidence exists; avoid bundling multiple distinct claims under one citation.`
      if (benchStrictMode) {
        effectiveSystemPrompt += `\n- BENCH STRICT: If guideline evidence is requested or clinically relevant, run guidelineSearch before finalizing your answer.
- BENCH STRICT: If a tool returns weakly relevant results, rerun once with a narrower query and cite only the focused result set.
- BENCH STRICT: Do not emit bracketed PMID/DOI values as citations; use only [index] citations from provided evidence.
- BENCH STRICT: ${allowBibliographyInOutput ? "For document artifacts, include a references section only when user intent explicitly requires it." : "Do not append manual references sections; keep citations inline only."}`
      }
    } else if (shouldEnablePubMedTools) {
      effectiveSystemPrompt += `\n\nYou may use PubMed tools when the question requests latest evidence, guideline updates, or when provided evidence is sparse. Prefer retrieved PubMed records for recency-sensitive claims and cite them explicitly.`
    }

    if (shouldEnableArtifactTools && artifactIntent === "document") {
      effectiveSystemPrompt += `\n\nDOCUMENT ARTIFACT MODE:
- You MUST call generateDocumentFromUpload exactly once before finalizing the answer.
- If the request asks for Harvard/APA/Vancouver/references, pass that style and includeReferences=true.
- If the request is a study plan/notes/summary without explicit citation intent, do not force a references section.
- Return one concise lead-in sentence only; use exactly: "Here is your generated document."
- Do not paste the full artifact body in plain chat text.`
    } else if (artifactIntent === "quiz" && shouldAskQuizTopicFollowup) {
      const followupOptions = (resolvedTopicContext?.pendingQuizTopicOptions ?? []).slice(0, 4)
      const formattedOptions =
        followupOptions.length > 0
          ? followupOptions.map((option, index) => `${index + 1}. ${option}`).join("\n")
          : "1. Core concepts\n2. Key mechanisms\n3. Applied scenarios"
      effectiveSystemPrompt += `\n\nQUIZ TOPIC CLARIFICATION MODE:
- Do NOT call quiz/document generation tools in this turn.
- Ask exactly one concise follow-up question to choose a quiz topic before generating the quiz.
- Offer these topic options:
${formattedOptions}
- Include this fallback in your question: reply "all topics" for a mixed-topic quiz.
- Keep the response brief (2-4 lines).`
    } else if (shouldEnableArtifactTools && artifactIntent === "quiz") {
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
      shouldEnableArtifactTools && artifactIntent === "document"
        ? ({ type: "tool", toolName: "generateDocumentFromUpload" } as const)
        : shouldEnableArtifactTools && artifactIntent === "quiz"
          ? ({ type: "tool", toolName: "generateQuizFromUpload" } as const)
          : undefined

    const result = streamText({
      model: modelWithSearch,
      system: effectiveSystemPrompt,
      messages: coreMessages,
      tools: runtimeTools,
      ...(artifactToolChoice ? ({ toolChoice: artifactToolChoice } as any) : {}),
      maxSteps:
        artifactIntent === "document" || artifactIntent === "quiz"
          ? 2
          : shouldEnableYoutubeTool
            ? 4
            : 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        const sanitizedResponseMessages = sanitizeAssistantMessagesForStorage(
          (response.messages || []) as any[]
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
                        ? stripUploadReferenceTokens(userMessage.content)
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
              
              // Extract referenced citations from the response
              // CRITICAL: Only extract citations if evidence mode is enabled
              // CRITICAL: Use capturedEvidenceContext to ensure we have the right context
              let citationsToSave: any[] = []
              
              // Only extract citations if evidence mode was enabled
              if (finalEnableEvidence) {
                const contextToUse = capturedEvidenceContext || evidenceContext
                
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
            
            const agentSelections = analyzeMedicalQuery(messages[messages.length - 1].content, medicalContext)
            
            if (agentSelections.length > 0) {
              try {
                const orchestrationInfo = await orchestrateHealthcareAgents(messages[messages.length - 1].content, medicalContext)
                
                // Integrate medical knowledge
                try {
                  const medicalKnowledge = await integrateMedicalKnowledge(messages[messages.length - 1].content, medicalContext, agentSelections)
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
      'Access-Control-Expose-Headers': 'X-Stream-Intro',
      'X-Stream-Intro': Buffer.from(streamIntroPreview, "utf-8").toString("base64"),
    }
    let evidenceCitationsForStream: EvidenceCitation[] = []
    const topicContextForStream = mergeTopicContexts(
      normalizeTopicContext(uploadContextResult?.topicContext),
      normalizeTopicContext(resolvedTopicContext)
    )
    if (finalEnableEvidence) {
      const contextForStream = capturedEvidenceContext || evidenceContext
      if (contextForStream?.context?.citations?.length) {
        evidenceCitationsForStream = dedupeAndReindexCitations(
          rankCitationsForQuery(contextForStream.context.citations, queryText)
        ).slice(0, 12)

        const encodedHeader = encodeEvidenceCitationsHeader(evidenceCitationsForStream)
        if (encodedHeader) {
          responseHeaders["Access-Control-Expose-Headers"] = "X-Evidence-Citations, X-Stream-Intro"
          responseHeaders["X-Evidence-Citations"] = encodedHeader
        }
      }
    }

    return createDataStreamResponse({
      status: 200,
      headers: responseHeaders,
      execute: (writer) => {
        if (topicContextForStream) {
          writer.writeMessageAnnotation(
            {
              type: "topic-context",
              topicContext: topicContextForStream,
            } as unknown as Parameters<typeof writer.writeMessageAnnotation>[0]
          )
        }
        if (evidenceCitationsForStream.length > 0) {
          writer.writeMessageAnnotation(
            {
              type: "evidence-citations",
              citations: evidenceCitationsForStream,
            } as unknown as Parameters<typeof writer.writeMessageAnnotation>[0]
          )
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
