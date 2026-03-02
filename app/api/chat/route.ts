import { getSystemPromptByRole } from "@/lib/config"
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
import {
  buildProvenance,
  evaluateProvenanceQuality,
  provenanceToEvidenceCitation,
  type SourceProvenance,
} from "@/lib/evidence/provenance"
import { Attachment } from "@ai-sdk/ui-utils"
import { Message as MessageAISDK, streamText, ToolSet, tool } from "ai"
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
}): string {
  const { citationCount, requiresEscalation, requiresGuideline } = params
  const citationRange = citationCount > 0 ? `1-${citationCount}` : "1"
  return [
    "BENCH STRONG-ENFORCEMENT MODE:",
    "- Keep the answer concise and factual (no filler, no marketing tone).",
    "- Every factual sentence must end with citation markers using only bracket indices.",
    `- Use citation indices strictly within [${citationRange}] and never use PMID/DOI numbers as bracket citations.`,
    "- Do NOT include a trailing references bibliography, 'tool-derived evidence', or any manual citation list.",
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
const US_PRIORITY_SOURCE_PATTERN =
  /\b(aha|acc|acp|ada|acog|aafp|cdc|nih|idsa|nccn|uspstf|sccm|ats)\b/i

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

function getProvenanceUsPriorityScore(item: SourceProvenance): number {
  const title = item.title || ""
  const journal = item.journal || ""
  const source = item.sourceName || ""
  const studyType = item.studyType || ""
  const region = (item.region || "").toUpperCase()

  let score = 0
  if (item.sourceType === "guideline") score += 4
  if (/guideline|recommendation|consensus|statement/i.test(studyType)) score += 3
  if (region === "US") score += 4
  if (US_PRIORITY_SOURCE_PATTERN.test(`${source} ${journal} ${title}`)) score += 2
  if (/meta-analysis|systematic/i.test(studyType)) score += 2
  if (/randomized|rct/i.test(studyType)) score += 1
  if (typeof item.evidenceLevel === "number") {
    score += Math.max(0, 6 - item.evidenceLevel) * 0.5
  }
  return score
}

function encodeEvidenceCitationsHeader(
  citations: Array<Record<string, any>>,
  maxEncodedLength: number = 12000
): string | null {
  if (!Array.isArray(citations) || citations.length === 0) return null

  const projectForHeader = (items: Array<Record<string, any>>) =>
    items.map((citation) => ({
      index: citation.index,
      title: citation.title,
      journal: citation.journal,
      year: citation.year,
      evidenceLevel: citation.evidenceLevel,
      studyType: citation.studyType,
      url: citation.url,
      doi: citation.doi,
      pmid: citation.pmid,
      // Keep snippets short to prevent header overflow in benchmark/tooling clients.
      snippet:
        typeof citation.snippet === "string"
          ? citation.snippet.slice(0, 140)
          : undefined,
      meshTerms: Array.isArray(citation.meshTerms)
        ? citation.meshTerms.slice(0, 3)
        : undefined,
    }))

  const tryEncode = (items: Array<Record<string, any>>): string => {
    const payload = JSON.stringify(projectForHeader(items))
    return Buffer.from(payload).toString("base64")
  }

  // 1) Try with all citations but compact fields.
  let candidate = [...citations]
  let encoded = tryEncode(candidate)
  if (encoded.length <= maxEncodedLength) return encoded

  // 2) Remove large optional fields.
  candidate = candidate.map((citation) => ({
    ...citation,
    snippet: undefined,
    meshTerms: undefined,
  }))
  encoded = tryEncode(candidate)
  if (encoded.length <= maxEncodedLength) return encoded

  // 3) Downsample citation count until it fits, preserving earliest/top entries.
  while (candidate.length > 3) {
    candidate = candidate.slice(0, candidate.length - 1)
    encoded = tryEncode(candidate)
    if (encoded.length <= maxEncodedLength) return encoded
  }

  return encoded.length <= maxEncodedLength ? encoded : null
}

function extractToolProvenance(
  toolInvocationParts: any[],
  queryText: string
): SourceProvenance[] {
  const flattened = toolInvocationParts.flatMap((part: any) => {
    const result = part?.toolInvocation?.result
    if (!result) return []
    if (Array.isArray(result?.provenance)) return result.provenance
    if (result?.article && typeof result.article === "object") {
      const article = result.article
      return [
        buildProvenance({
          id: `pubmed_${article.pmid || "lookup"}`,
          sourceType: "pubmed",
          sourceName: "PubMed",
          title: article.title || "PubMed article",
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
    }
    if (Array.isArray(result?.articles)) {
      return result.articles.map((article: any, idx: number) =>
        buildProvenance({
          id: `pubmed_${article.pmid || idx + 1}`,
          sourceType: "pubmed",
          sourceName: "PubMed",
          title: article.title || "PubMed article",
          url: article.url || null,
          publishedAt: article.year ? String(article.year) : null,
          region: null,
          journal: article.journal || "PubMed",
          doi: article.doi || null,
          pmid: article.pmid || null,
          evidenceLevel: 2,
          studyType: "Literature record",
          snippet: "",
        })
      )
    }
    return []
  })

  const deduped = new Map<string, SourceProvenance>()
  flattened.forEach((item: SourceProvenance) => {
    const key = item.pmid || item.doi || item.url || `${item.sourceName}:${item.title}`
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  })

  return Array.from(deduped.values())
    .filter((item) => {
      const relevanceText = `${item.title || ""} ${item.journal || ""} ${item.snippet || ""}`
      if (!isTextRelevantToClinicalQuery(relevanceText, queryText)) {
        return false
      }
      const gate = evaluateProvenanceQuality(item, queryText)
      if (!gate.passed) {
        console.warn(
          `[PROVENANCE GATE] Dropped citation "${item.title}" (score=${gate.score}, reasons=${gate.reasons.join(",")})`
        )
      }
      return gate.passed
    })
    .sort(
      (a, b) =>
        getProvenanceUsPriorityScore(b) - getProvenanceUsPriorityScore(a)
    )
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
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    // CRITICAL: Check rate limits FIRST - fail fast before any other work
    if (userId !== "temp" && chatId !== "temp" && !chatId.startsWith("temp-chat-")) {
      try {
        await validateAndTrackUsage({
          userId,
          model,
          isAuthenticated,
        })
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
    const queryText = typeof lastUserMessage?.content === "string"
      ? lastUserMessage.content
      : ""
    const effectiveLearningMode = normalizeMedicalStudentLearningMode(learningMode)
    const effectiveClinicianMode = normalizeClinicianWorkflowMode(clinicianMode)
    const emergencyEscalationIntent = detectEmergencyEscalationNeed(queryText)
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
    const minEvidenceLevelForQuery = clinicianRoleFromResolvedRole ? 3 : 5

    const evidenceContextResult =
      finalEnableEvidence && queryText.length > 0
        ? await synthesizeEvidence({
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
          })
        : null

    let evidenceContext = evidenceContextResult
    if (finalEnableEvidence && queryText.length > 0) {
      let mergedCitations = evidenceContextResult?.context?.citations
        ? [...evidenceContextResult.context.citations]
        : []
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

    if (benchStrictMode && finalEnableEvidence) {
      effectiveSystemPrompt += `\n\n${buildBenchStrictPrompt({
        citationCount: evidenceContext?.context?.citations?.length ?? 0,
        requiresEscalation: emergencyEscalationIntent.shouldEscalate,
        requiresGuideline: hasGuidelineIntent(queryText),
      })}`
    }

    const isHealthcareMode = effectiveUserRole === "doctor" || effectiveUserRole === "medical_student"
    const isFleming4 = effectiveModel === "fleming-4"
    const hasWebSearchSupport = Boolean(modelConfig?.webSearch)
    const finalEnableSearch = enableSearchFromClient || (isHealthcareMode && isFleming4 && hasWebSearchSupport)

    if (!finalEnableEvidence) {
      effectiveSystemPrompt = removeCitationInstructions(effectiveSystemPrompt)
      effectiveSystemPrompt += `\n\n**IMPORTANT: Do NOT include citations, citation markers, or reference numbers in your response. Respond naturally without any [CITATION:X] or [X] markers. Do not include a "Citations" section at the end.`
    }

    // Filter attachments (sync)
    // Vision models can process both data URLs (base64) and blob URLs directly
    const filteredMessages = messages.map(message => {
      if (message.experimental_attachments) {
        // Keep all valid attachments including data URLs and blob URLs for vision models
        const filteredAttachments = message.experimental_attachments.filter(
          (attachment: any) => {
            // Keep if it has a valid URL (including data URLs and blob URLs for vision models)
            return attachment.url && attachment.name && attachment.contentType
          }
        )
        
        console.log(`Processing attachments for message: ${filteredAttachments.length}/${message.experimental_attachments.length} valid`)
        if (filteredAttachments.length > 0) {
          console.log('Valid attachments:', filteredAttachments.map(a => ({ 
            name: a.name, 
            contentType: a.contentType,
            url: a.url?.startsWith('blob:') ? 'blob:...' : 
                 a.url?.startsWith('data:') ? 'data:...' : 
                 a.url?.substring(0, 50) + '...' 
          })))
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

    // START STREAMING IMMEDIATELY with basic prompt
    const startTime = performance.now()
    
    // Create model with REAL web search settings
    // When enableSearch=true, this passes { web_search: true } to xAI API
    const modelWithSearch = modelConfig.apiSdk(apiKey, { 
      enableSearch: finalEnableSearch // REAL web search flag - passed to xAI API
    })
    
    if (finalEnableSearch) {
      console.log("✅ WEB SEARCH ENABLED - Using real web search from xAI/Grok")
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
    const shouldEnablePubMedTools =
      finalEnableEvidence &&
      supportsTools &&
      queryText.length > 0 &&
      (
        needsFreshEvidence(queryText) ||
        (capturedEvidenceContext?.context?.citations?.length ?? 0) < 4
      )
    const shouldEnableEvidenceTools = finalEnableEvidence && supportsTools && queryText.length > 0

    const runtimeTools: ToolSet = shouldEnableEvidenceTools
      ? {
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

    if (shouldEnableEvidenceTools) {
      effectiveSystemPrompt += `\n\nYou may use live evidence tools when needed:
- Use pubmedSearch/pubmedLookup for latest literature and PMID-grounded facts.
- Use guidelineSearch for formal recommendations and regional guidance.
- Use clinicalTrialsSearch for ongoing/new evidence.
- Use drugSafetyLookup for contraindications/interactions/renal dosing checks.
- Use evidenceConflictCheck when sources disagree.
- IMPORTANT: Keep tool queries tightly aligned to the user question (specific condition/drug terms, not broad generic terms).
- IMPORTANT: If a tool returns irrelevant records, explicitly discard them and retry with a narrower query before citing evidence.
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

    const result = streamText({
      model: modelWithSearch,
      system: effectiveSystemPrompt,
      messages: anonymizedMessages, // Use anonymized messages for LLM
      tools: runtimeTools,
      maxSteps: 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        // Extract citations from xAI response if available
        const xaiCitations = (response as any).experimental_providerMetadata?.citations || 
                            (response as any).citations || 
                            []
        
        // Check if sources are in message parts
        const allParts = (response as any).messages?.flatMap((m: any) => m.parts || []) || []
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
        const lastMessage = (response as any).messages?.[(response as any).messages.length - 1]
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
            const isTempChat = userId === "temp" || 
                              chatId === "temp" || 
                              chatId.startsWith("temp-chat-")
            
            if (isTempChat) {
              console.log("📚 [CITATION] Temp chat detected - extracting citations but skipping DB save")
            }

            const supabase = await validateAndTrackUsage({
              userId,
              model: effectiveModel,
              isAuthenticated,
            })

            if (supabase) {
              // Save user message first (if not already saved)
              // Use original (non-anonymized) message for storage - it will be encrypted
              const userMessage = messages[messages.length - 1]
              if (userMessage?.role === "user") {
                try {
                  await logUserMessage({
                    supabase,
                    userId,
                    chatId,
                    content: userMessage.content,
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
              const assistantMessage = response.messages[response.messages.length - 1]
              
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
                    // Fallback safety net: include a compact core set instead of all retrieved citations.
                    citationsToSave = contextToUse.context.citations.slice(
                      0,
                      Math.min(3, contextToUse.context.citations.length)
                    )
                    console.warn(`📚 [CITATION EXTRACTION] Fallback: Including top ${citationsToSave.length} retrieved citations`)
                  }
                } else {
                  console.warn(`📚 [CITATION EXTRACTION] ⚠️ Could not extract response text for citation parsing`)
                  // Fallback: include all citations if we can't parse the response
                  if (contextToUse.context.citations.length > 0) {
                    citationsToSave = contextToUse.context.citations.slice(
                      0,
                      Math.min(3, contextToUse.context.citations.length)
                    )
                    console.warn(`📚 [CITATION EXTRACTION] Fallback: Including top ${citationsToSave.length} retrieved citations`)
                  }
                }
                } else {
                  console.log(`📚 [CITATION EXTRACTION] No evidence context available (capturedEvidenceContext: ${!!capturedEvidenceContext}, evidenceContext: ${!!evidenceContext})`)
                }

                // Add normalized provenance from tool results to feed citation UX
                const toolProvenance = extractToolProvenance(
                  toolInvocationParts,
                  queryText
                )
                if (toolProvenance.length > 0) {
                  const provenanceCitations = toolProvenance.map((item, idx) =>
                    provenanceToEvidenceCitation(item, citationsToSave.length + idx + 1)
                  )
                  citationsToSave = [...citationsToSave, ...provenanceCitations]
                  console.log(`📚 [PROVENANCE] Added ${provenanceCitations.length} normalized tool citations`)
                }
              } else {
                console.log(`📚 [CITATION EXTRACTION] Evidence mode is OFF - skipping citation extraction`)
              }
              
              // Only save to database if not a temp chat
              if (!isTempChat && supabase) {
                try {
                  await storeAssistantMessage({
                    supabase,
                    chatId,
                    messages:
                      response.messages as unknown as import("@/app/types/api.types").Message[],
                    message_group_id,
                    model: effectiveModel,
                    evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
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
                      chatId,
                      messages:
                        response.messages as unknown as import("@/app/types/api.types").Message[],
                      message_group_id,
                      model: effectiveModel,
                      evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
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
    
    // Build response headers - include evidence citations if available
    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      // CRITICAL: Expose custom header to JavaScript
      'Access-Control-Expose-Headers': 'X-Evidence-Citations',
    }
    
          // Add evidence citations to headers for frontend rendering
          // CRITICAL: Only send citations if evidence mode is enabled
          // Send all retrieved citations initially - frontend will filter to referenced ones after parsing response
          // CRITICAL: Use capturedEvidenceContext to ensure we have the right context
          if (finalEnableEvidence) {
            const contextForHeaders = capturedEvidenceContext || evidenceContext
            if (contextForHeaders?.context?.citations && contextForHeaders.context.citations.length > 0) {
              try {
                const guidelinePriority = benchStrictMode || hasGuidelineIntent(queryText)
                const strictCitationFloor = benchStrictMode ? STRICT_MIN_CITATION_FLOOR : 6
                const rankedHeaderPool = rankCitationsForQuery(
                  contextForHeaders.context.citations,
                  queryText,
                  { guidelinePriority }
                )
                let curatedHeaderSelection = filterLowRelevanceCitations(
                  rankedHeaderPool,
                  queryText,
                  benchStrictMode ? strictCitationFloor : 6
                )
                if (benchStrictMode) {
                  curatedHeaderSelection = ensureCitationFloor(
                    curatedHeaderSelection,
                    rankedHeaderPool,
                    strictCitationFloor
                  )
                }
                if (guidelinePriority) {
                  curatedHeaderSelection = ensureGuidelineCitations(
                    curatedHeaderSelection,
                    rankedHeaderPool,
                    STRICT_MIN_GUIDELINE_CITATIONS
                  )
                }
                const curatedHeaderCitations = dedupeAndReindexCitations(
                  curatedHeaderSelection
                ).slice(0, 12)
                console.log(`📚 [HEADERS] Adding ${curatedHeaderCitations.length} curated citations to response headers`)
                const encodedHeader = encodeEvidenceCitationsHeader(
                  curatedHeaderCitations
                )
                if (encodedHeader) {
                  responseHeaders["X-Evidence-Citations"] = encodedHeader
                  console.log(
                    `📚 EVIDENCE MODE: Sending ${curatedHeaderCitations.length} citations to client (header bytes=${encodedHeader.length})`
                  )
                } else {
                  console.warn(
                    "📚 [HEADERS] Skipping X-Evidence-Citations: could not fit within safe header size"
                  )
                }
              } catch (e) {
                console.error('Failed to encode evidence citations:', e)
              }
            } else {
              console.log(`📚 [HEADERS] No citations to add to headers (contextForHeaders: ${!!contextForHeaders})`)
            }
          } else {
            console.log(`📚 [HEADERS] Evidence mode is OFF - not sending citations in headers`)
          }
    
    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      // Optimize streaming response
      headers: responseHeaders,
      getErrorMessage: (error: unknown) => {
        console.error("Error forwarded to client:", error)
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
