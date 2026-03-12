import { createClient } from "@/lib/supabase/server"
import {
  formatBibliography,
  formatInlineCitation,
  normalizeCitationStyle,
  type CitationStyle,
} from "@/lib/citations/formatters"
import type { EvidenceCitation, UploadVisualReference } from "@/lib/evidence/types"
import {
  type OCRStatus,
  type ParsedSourceUnit,
  type ParsedUploadDocument,
  type UploadDocumentKind,
  type UploadSourceUnitType,
} from "@/lib/rag/types"
import { cosineSimilarity, generateEmbedding, generateEmbeddings } from "@/lib/rag/embeddings"
import type { UserUploadDetail, UserUploadListItem } from "./types"
import type { DocumentArtifact, QuizArtifact, QuizArtifactQuestion } from "./artifacts"
import JSZip from "jszip"
import mammoth from "mammoth"
import { imageSize } from "image-size"
import pdfParse from "pdf-parse/lib/pdf-parse.js"

const USER_UPLOAD_BUCKET = "chat-attachments"
const USER_UPLOAD_MAX_FILE_SIZE = 512 * 1024 * 1024
const USER_UPLOAD_PARSER_VERSION = "2026-03-doc-no-preview-v5"
const DEFAULT_CHUNK_SIZE = 1200
const DEFAULT_CHUNK_OVERLAP = 180
const DOCX_SECTION_PARAGRAPH_COUNT = 6

type IngestionProgressStage =
  | "queued"
  | "extracting_pages"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed"

type UploadRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  file_name: string
  mime_type: string
  file_size: number
  storage_bucket: string
  original_file_path: string
  upload_kind: UploadDocumentKind
  status: "pending" | "processing" | "completed" | "failed"
  parser_version: string
  last_error: string | null
  metadata: Record<string, unknown>
  last_ingested_at: string | null
  created_at: string
  updated_at: string
}

export type UploadContextSearchMode =
  | "auto"
  | "page_lookup"
  | "range_lookup"
  | "semantic"
  | "hybrid"

export type UploadTopicContext = {
  activeTopic?: string | null
  lastUploadId?: string | null
  recentPages?: number[]
  recentEvidenceIds?: string[]
  recentEvidenceChunkIds?: string[]
  followUpType?: "clarify" | "next_page" | "previous_page" | "drill_down" | "switch_topic" | "unknown"
}

export type UploadContextSearchIntent = {
  modeResolved: UploadContextSearchMode
  page: number | null
  pageStart: number | null
  pageEnd: number | null
}

export type UploadContextSearchInput = {
  userId: string
  query: string
  apiKey?: string
  embeddingApiKey?: string
  uploadId?: string
  mode?: UploadContextSearchMode
  page?: number
  pageStart?: number
  pageEnd?: number
  topK?: number
  includeNeighborPages?: number
  contextWindowChars?: number
  topicContext?: UploadTopicContext
  maxDurationMs?: number
}

export type UploadContextSearchResult = {
  intent: UploadContextSearchIntent
  citations: EvidenceCitation[]
  pagesReturned: number[]
  warnings: string[]
  topicContext: UploadTopicContext
  metrics: {
    candidateCount: number
    elapsedMs: number
    fallbackUsed: boolean
    fallbackReason:
      | "none"
      | "embedding_timeout"
      | "embedding_auth_error"
      | "embedding_rate_limit"
      | "embedding_provider_mismatch"
      | "embedding_network_error"
      | "embedding_unknown_error"
      | "lexical_only"
    retrievalConfidence: "high" | "medium" | "low"
    sourceUnitCount: number
    maxUnitNumber: number
    textbookScale: boolean
  }
}

export type UploadStructureTopic = {
  label: string
  page: number | null
  sourcePageStart?: number | null
  sourcePageEnd?: number | null
  documentPart?:
    | "toc"
    | "front_matter"
    | "chapter_open"
    | "body"
    | "index"
    | "bibliography"
    | "appendix"
    | "unknown"
  mappedBy?: "direct" | "offset" | "heuristic" | "unknown"
}

export type UploadStructureInspection = {
  uploadId: string | null
  uploadTitle: string | null
  sourceUnitCount: number
  maxUnitNumber: number
  probableTocPages: number[]
  pageOffsetEstimate: number | null
  partDistribution: Record<string, number>
  headingCandidates: string[]
  topicMap: UploadStructureTopic[]
  extractionCoverage: number
  confidence: "high" | "medium" | "low"
  textbookScale: boolean
  warnings: string[]
  inspectedAt: string
}

const DEFAULT_UPLOAD_CONTEXT_TOP_K = 12
const MAX_UPLOAD_CONTEXT_TOP_K = 40
const DEFAULT_UPLOAD_CONTEXT_NEIGHBORS = 1
const DEFAULT_UPLOAD_CONTEXT_BUDGET_MS = 2200
const QUERY_EMBEDDING_TIMEOUT_MS = 900
const MAX_UPLOAD_IDS_PER_SEARCH = 3

type UploadChunkRow = {
  id: string
  upload_id: string
  source_unit_id: string
  chunk_index: number
  chunk_text: string
  source_offset_start: number | null
  source_offset_end: number | null
  metadata: Record<string, unknown> | null
  embedding: number[] | null
}

export type GenerateDocumentFromUploadInput = {
  userId: string
  query: string
  uploadId?: string
  citationStyle?: CitationStyle
  includeReferences?: boolean
  apiKey?: string
  embeddingApiKey?: string
  maxSources?: number
  structureHint?: UploadStructureInspection | null
  enableArtifactV2?: boolean
}

export type GenerateQuizFromUploadInput = {
  userId: string
  query: string
  uploadId?: string
  apiKey?: string
  embeddingApiKey?: string
  topicContext?: UploadTopicContext
  questionCount?: number
}

function sanitizeArtifactText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/\[[^\]]*?\]\([^)]+\)/g, " ")
    .replace(/[_*`#~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function clipTextAtBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  const window = value.slice(0, maxLength)
  const sentenceBreaks = Array.from(window.matchAll(/[.!?]\s+/g))
  const lastSentenceBreak = sentenceBreaks.at(-1)
  if (lastSentenceBreak && typeof lastSentenceBreak.index === "number" && lastSentenceBreak.index > 48) {
    return window.slice(0, lastSentenceBreak.index + 1).trim()
  }
  const wordBreak = window.lastIndexOf(" ")
  if (wordBreak > 48) {
    return `${window.slice(0, wordBreak).trim()}...`
  }
  return `${window.trim()}...`
}

function cleanSnippetForArtifact(value: string, maxLength = 220): string {
  const normalized = sanitizeArtifactText(value)
  if (!normalized) return ""
  if (normalized.length <= maxLength) return normalized
  return clipTextAtBoundary(normalized, maxLength)
}

function looksLikeExtractionNoise(value: string): boolean {
  const lowered = value.toLowerCase()
  if (!lowered) return true
  if (/<[a-z]+:[^>]+>/.test(lowered)) return true
  if (/(^|[\s>])a:(tc|txbody|bodypr|lststyle|ppr|rpr|t)\b/.test(lowered)) return true
  if (/(xmlns|schema|pptx|docx|xml|utf-8|w:|r:|a:|p:)/.test(lowered)) return true
  if (/([a-z]{1,2}\d{2,}|[^\w\s]{5,})/.test(value)) return true
  const digitRatio = ((value.match(/\d/g) || []).length / Math.max(value.length, 1))
  if (digitRatio > 0.24 && !/\b(page|slide|chapter)\b/i.test(value)) return true
  const symbolCount = (value.match(/[<>/=]/g) || []).length
  return symbolCount > Math.max(16, Math.floor(value.length * 0.12))
}

function shouldIncludeReferencesForQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  return /\b(reference|references|citation|citations|bibliography|harvard|apa|vancouver)\b/.test(
    normalized
  )
}

function inferCitationStyleFromQuery(
  query: string,
  fallback: CitationStyle
): CitationStyle {
  const normalized = query.toLowerCase()
  if (/\bvancouver\b/.test(normalized)) return "vancouver"
  if (/\bapa\b/.test(normalized)) return "apa"
  if (/\bharvard\b/.test(normalized)) return "harvard"
  return fallback
}

type DocumentShape = "study-plan" | "study-notes" | "summary" | "review"

function inferDocumentShape(query: string): DocumentShape {
  const normalized = query.toLowerCase()
  if (/\bstudy\s+plan\b|\brevision\s+plan\b/.test(normalized)) return "study-plan"
  if (/\bnotes?\b/.test(normalized)) return "study-notes"
  if (/\bsummary|summarise|summarize\b/.test(normalized)) return "summary"
  return "review"
}

function isLikelyOpenAIEmbeddingKey(value?: string | null): boolean {
  if (!value) return false
  const token = value.trim()
  if (!token) return false
  if (/^sk-ant-/i.test(token)) return false
  if (/^sk-or-/i.test(token)) return false
  if (/^xai-/i.test(token)) return false
  if (/^AIza/i.test(token)) return false
  return /^sk-(proj-)?/i.test(token)
}

function classifyEmbeddingFallbackReason(
  error: unknown
):
  | "embedding_timeout"
  | "embedding_auth_error"
  | "embedding_rate_limit"
  | "embedding_provider_mismatch"
  | "embedding_network_error"
  | "embedding_unknown_error" {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase()
  if (message.includes("timed out") || message.includes("timeout")) {
    return "embedding_timeout"
  }
  if (
    message.includes("incorrect api key") ||
    message.includes("invalid_api_key") ||
    message.includes("unauthorized") ||
    message.includes("authentication")
  ) {
    return "embedding_auth_error"
  }
  if (message.includes("rate limit") || message.includes("429")) {
    return "embedding_rate_limit"
  }
  if (
    message.includes("provider") ||
    message.includes("not valid for this endpoint") ||
    message.includes("organization")
  ) {
    return "embedding_provider_mismatch"
  }
  if (
    message.includes("fetch failed") ||
    message.includes("econn") ||
    message.includes("socket") ||
    message.includes("network")
  ) {
    return "embedding_network_error"
  }
  return "embedding_unknown_error"
}

function isLikelyBibliographyNoise(value: string): boolean {
  const normalized = sanitizeArtifactText(value)
  if (!normalized) return true
  const lower = normalized.toLowerCase()
  const hasReferenceSignal =
    /\b(references?|bibliography|further reading|citation|citations|doi|pmid)\b/.test(lower) ||
    /\bet al\b/.test(lower)
  const hasJournalStyleSignal =
    /\b\d{4}\s*;?\s*\d{1,3}\s*(?:\(|:)\s*\d{1,4}/.test(lower) ||
    /\bvol(?:ume)?\b/.test(lower)
  const hasLinkSignal = /(https?:\/\/|www\.)/.test(lower)
  const hasDenseIndexing = ((normalized.match(/\d+/g) || []).length / Math.max(1, normalized.length)) > 0.12
  return (
    (hasReferenceSignal && (hasJournalStyleSignal || hasLinkSignal)) ||
    (hasReferenceSignal && hasDenseIndexing) ||
    /\bchapter\s+\d+\b.*\bpage\s+\d+\b/i.test(normalized)
  )
}

function normalizeHeadingCandidate(value: string): string {
  return value
    .replace(/[^\w\s:/(),.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96)
}

function looksLikeHeadingLine(value: string): boolean {
  const line = normalizeHeadingCandidate(value)
  if (line.length < 6 || line.length > 96) return false
  if (/^\d+$/.test(line)) return false
  if (/^(references?|index|appendix)$/i.test(line)) return false
  if (/^(page|p)\s*\d+$/i.test(line)) return false
  const allCapsRatio = (line.match(/[A-Z]/g) || []).length / Math.max(1, (line.match(/[A-Za-z]/g) || []).length)
  return (
    /^\d+(\.\d+){0,3}\s+[A-Za-z]/.test(line) ||
    /^chapter\s+\d+/i.test(line) ||
    /^section\s+\d+/i.test(line) ||
    allCapsRatio > 0.72
  )
}

function extractTopicRowsFromTocText(text: string): UploadStructureTopic[] {
  const rows: UploadStructureTopic[] = []
  const seen = new Set<string>()
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const dotted = line.match(/^(.{4,90}?)\s*\.{2,}\s*(\d{1,4})$/)
    const plain = line.match(/^(.{4,90}?)\s+(\d{1,4})$/)
    const match = dotted || plain
    if (!match) continue
    const label = normalizeHeadingCandidate(match[1])
    const page = Number.parseInt(match[2], 10)
    if (!label || !Number.isFinite(page) || page <= 0) continue
    const key = `${label.toLowerCase()}:${page}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ label, page, mappedBy: "unknown", documentPart: "toc" })
    if (rows.length >= 24) break
  }
  return rows
}

function classifyDocumentPart(
  text: string,
  unitNumber: number,
  maxUnitNumber: number
):
  | "toc"
  | "front_matter"
  | "chapter_open"
  | "body"
  | "index"
  | "bibliography"
  | "appendix"
  | "unknown" {
  const excerpt = sanitizeArtifactText(text).slice(0, 2200).toLowerCase()
  if (!excerpt) return "unknown"
  const earlyPages = unitNumber <= Math.max(10, Math.floor(maxUnitNumber * 0.08))
  if (
    /\b(table of contents|contents)\b/.test(excerpt) ||
    (excerpt.match(/\.{2,}\s*\d{1,4}/g) || []).length >= 4
  ) {
    return "toc"
  }
  if (
    /\b(first published|edition|isbn|copyright|oxford university press|preface|foreword)\b/.test(
      excerpt
    ) &&
    earlyPages
  ) {
    return "front_matter"
  }
  if (/\b(references|bibliography|further reading)\b/.test(excerpt)) {
    return "bibliography"
  }
  if (
    /\b(index)\b/.test(excerpt) &&
    ((excerpt.match(/\b[a-z][a-z-]{2,}\s+\d{1,4}\b/g) || []).length >= 5 || unitNumber > maxUnitNumber - 30)
  ) {
    return "index"
  }
  if (/\bappendix\b/.test(excerpt)) {
    return "appendix"
  }
  if (/^(chapter|part|section)\s+\d+/im.test(excerpt)) {
    return "chapter_open"
  }
  return "body"
}

function lineToSearchToken(value: string): string {
  return sanitizeArtifactText(value).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim()
}

function mapTopicsToSourceRanges(
  topics: UploadStructureTopic[],
  sourceUnits: Array<{ unit_number: number; extracted_text: string | null }>,
  maxTopics: number
): { mappedTopics: UploadStructureTopic[]; pageOffsetEstimate: number | null } {
  if (topics.length === 0 || sourceUnits.length === 0) {
    return { mappedTopics: topics.slice(0, maxTopics), pageOffsetEstimate: null }
  }
  const searchableUnits = sourceUnits.map((unit) => ({
    unitNumber: unit.unit_number,
    token: lineToSearchToken(String(unit.extracted_text || "").slice(0, 1800)),
  }))
  const offsets: number[] = []
  const mapped: UploadStructureTopic[] = topics.slice(0, maxTopics).map((topic) => {
    const printedPage = typeof topic.page === "number" ? topic.page : null
    const topicToken = lineToSearchToken(topic.label)
    let directMatch: number | null = null
    if (topicToken.length >= 6) {
      const matched = searchableUnits.find((unit) => unit.token.includes(topicToken))
      if (matched) {
        directMatch = matched.unitNumber
      }
    }
    if (directMatch && printedPage && printedPage > 0) {
      offsets.push(directMatch - printedPage)
    }
    return {
      ...topic,
      sourcePageStart: directMatch ?? null,
      sourcePageEnd: null,
      mappedBy: directMatch ? ("direct" as const) : ("unknown" as const),
      documentPart: topic.documentPart || ("body" as const),
    }
  })

  const sortedOffsets = offsets.sort((a, b) => a - b)
  const pageOffsetEstimate =
    sortedOffsets.length > 0
      ? sortedOffsets[Math.floor(sortedOffsets.length / 2)]
      : null

  for (const topic of mapped) {
    if (topic.sourcePageStart || !pageOffsetEstimate || !topic.page || topic.page <= 0) continue
    const estimated = topic.page + pageOffsetEstimate
    if (estimated > 0) {
      topic.sourcePageStart = estimated
      topic.mappedBy = "offset"
    }
  }

  const mappedBySource = mapped
    .filter((topic) => typeof topic.sourcePageStart === "number")
    .sort((a, b) => (a.sourcePageStart || 0) - (b.sourcePageStart || 0))
  for (let index = 0; index < mappedBySource.length; index += 1) {
    const current = mappedBySource[index]
    const next = mappedBySource[index + 1]
    if (!current.sourcePageStart) continue
    const start = Math.max(1, current.sourcePageStart)
    const end = next?.sourcePageStart
      ? Math.max(start, next.sourcePageStart - 1)
      : Math.max(start, start + 8)
    current.sourcePageStart = start
    current.sourcePageEnd = end
  }

  return {
    mappedTopics: mapped.slice(0, maxTopics),
    pageOffsetEstimate,
  }
}

function isLikelyNonBodySnippet(value: string): boolean {
  const cleaned = sanitizeArtifactText(value).toLowerCase()
  if (!cleaned) return true
  if (isLikelyBibliographyNoise(cleaned)) return true
  if (looksLikeExtractionNoise(cleaned)) return true
  if (
    /\b(table of contents|first published|edition|copyright|isbn|index|appendix|references?)\b/.test(
      cleaned
    )
  ) {
    return true
  }
  if ((cleaned.match(/\d{1,4}\s*[,;]\s*\d{1,4}/g) || []).length >= 2) return true
  return false
}

function inferSectionPlanFromTopics(
  query: string,
  topics: UploadStructureTopic[],
  headingCandidates: string[]
): UploadStructureTopic[] {
  const normalizedQuery = query.toLowerCase()
  const queryTerms = buildQueryTerms(query)
  const filteredTopics = topics.filter((topic) => {
    const labelLower = topic.label.toLowerCase()
    if (!labelLower) return false
    if (/\b(reference|references|index|appendix|edition|copyright)\b/.test(labelLower)) return false
    if (
      topic.documentPart === "toc" ||
      topic.documentPart === "front_matter" ||
      topic.documentPart === "index" ||
      topic.documentPart === "bibliography"
    ) {
      return false
    }
    if (normalizedQuery.length < 6) return true
    if (queryTerms.length === 0) return true
    return queryTerms.some((term) => labelLower.includes(term))
  })
  if (filteredTopics.length >= 3) {
    const scored = filteredTopics
      .map((topic) => {
        const labelLower = topic.label.toLowerCase()
        const queryOverlap = queryTerms.filter((term) => labelLower.includes(term)).length
        const hasMappedRange =
          typeof topic.sourcePageStart === "number" && typeof topic.sourcePageEnd === "number"
        const hasMappedStart = typeof topic.sourcePageStart === "number"
        const score =
          queryOverlap * 3 +
          (hasMappedRange ? 3 : 0) +
          (hasMappedStart ? 1 : 0) +
          (topic.mappedBy === "direct" ? 2 : topic.mappedBy === "offset" ? 1 : 0)
        return { topic, score }
      })
      .sort((a, b) => b.score - a.score)
      .map((item) => item.topic)
    return scored.slice(0, 8)
  }
  const fallback = headingCandidates
    .filter((value) => !/\b(reference|references|index|appendix)\b/i.test(value))
    .slice(0, 8)
    .map((label) => ({
      label,
      page: null,
      mappedBy: "heuristic" as const,
      documentPart: "body" as const,
    }))
  return fallback.length > 0
    ? fallback
    : [
        { label: "Core concepts and definitions", page: null },
        { label: "Clinical interpretation and key mechanisms", page: null },
        { label: "Applied scenarios and exam-relevant points", page: null },
      ]
}

function synthesizeSectionHighlights(
  sectionLabel: string,
  sectionCitations: EvidenceCitation[],
  includeReferences: boolean,
  citationStyle: CitationStyle,
  maxLines = 3
): string {
  if (sectionCitations.length === 0) {
    return `- ${sectionLabel}: No strong excerpt matched this section in the current retrieval window.`
  }
  const lines = sectionCitations
    .slice(0, maxLines)
    .map((citation) => {
      const snippet = cleanSnippetForArtifact(citation.snippet || citation.title || "", 180)
      if (!snippet) return null
      const location = citation.pageLabel ? ` (${citation.pageLabel})` : ""
      const cite = includeReferences ? ` ${formatInlineCitation(citation, citationStyle)}` : ""
      return `- ${snippet}${location}${cite}`
    })
    .filter((line): line is string => Boolean(line))
  return lines.length > 0
    ? lines.join("\n")
    : `- ${sectionLabel}: No strong excerpt matched this section in the current retrieval window.`
}

function buildSectionPriorityList(
  sectionPlan: UploadStructureTopic[],
  includeReferences: boolean,
  sectionCitations: Map<string, EvidenceCitation[]>,
  citationStyle: CitationStyle,
  maxLines = 6
): string {
  const lines: string[] = []
  for (const section of sectionPlan.slice(0, maxLines)) {
    const sectionLabel = cleanSnippetForArtifact(section.label, 90) || "Core section"
    const location =
      typeof section.sourcePageStart === "number" && typeof section.sourcePageEnd === "number"
        ? ` (Pages ${section.sourcePageStart}-${section.sourcePageEnd})`
        : typeof section.sourcePageStart === "number"
          ? ` (Page ${section.sourcePageStart})`
          : typeof section.page === "number" && section.page > 0
            ? ` (Printed page ${section.page})`
            : ""
    const firstCitation = (sectionCitations.get(section.label) || [])[0]
    const cite = includeReferences && firstCitation ? ` ${formatInlineCitation(firstCitation, citationStyle)}` : ""
    lines.push(`- ${sectionLabel}${location}${cite}`)
  }
  return lines.length > 0 ? lines.join("\n") : "- No section priorities were detected."
}

function filterArtifactSectionContent(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      if (!line.trim()) return false
      const normalized = line.replace(/^[-\d\.\sQ:]+/, "").trim()
      return !isLikelyNonBodySnippet(normalized)
    })
  return lines.join("\n")
}

function extractQuizSentences(value: string): string[] {
  const normalized = sanitizeArtifactText(value)
  if (!normalized) return []
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 28)
    .filter((sentence) => !looksLikeExtractionNoise(sentence))
}

function buildQuizStatementFromCitation(citation: EvidenceCitation): string {
  const snippet = citation.snippet || citation.title || ""
  const candidateSentences = extractQuizSentences(snippet)
    .map((sentence) => normalizeQuizOptionText(sentence, 220))
    .filter((sentence) => !isWeakQuizStatement(sentence))
  const sentence = candidateSentences[0] || cleanSnippetForArtifact(snippet, 160)
  const fallback = cleanSnippetForArtifact(citation.title || "Key concept from the uploaded material", 140)
  const base = sentence || fallback
  if (!base) return "The uploaded material emphasizes a key concept in this topic."
  return /[.!?]$/.test(base) ? base : `${base}.`
}

function isWeakQuizStatement(value: string): boolean {
  const normalized = sanitizeArtifactText(value).toLowerCase()
  if (!normalized || normalized.length < 40) return true
  if (
    /\b(edition|copyright|first published|table of contents|index|references?|department|part ii)\b/.test(
      normalized
    )
  ) {
    return true
  }
  if (/^\w+\s+\w+\s+\w+\s+\w+\.?$/.test(normalized) && normalized.length < 60) {
    return true
  }
  return false
}

function normalizeQuizTopicKey(value: string): string {
  const tokens = sanitizeArtifactText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 6)
  return tokens.join(" ")
}

function extractQuizFocusFromQuery(query: string): string {
  const lines = query
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const explicitTopicLine = lines.find((line) => /^topic\s*:/i.test(line))
  if (explicitTopicLine) {
    const topic = explicitTopicLine.replace(/^topic\s*:/i, "").trim()
    if (topic.length > 0) return cleanSnippetForArtifact(topic, 90)
  }
  const explicitPages = lines.find((line) => /^pages?\s*:/i.test(line))
  if (explicitPages) {
    return cleanSnippetForArtifact(explicitPages, 90)
  }
  const firstRichLine =
    lines.find(
      (line) =>
        line.length >= 18 &&
        !/^selected uploads\s*:/i.test(line) &&
        !/^depth\s*:/i.test(line) &&
        !/^format\s*:/i.test(line) &&
        !/^length\s*:/i.test(line) &&
        !/^question count\s*:/i.test(line) &&
        !/^difficulty\s*:/i.test(line) &&
        !/^question style\s*:/i.test(line)
    ) || ""
  if (firstRichLine.length > 0) {
    return cleanSnippetForArtifact(firstRichLine, 90)
  }
  return cleanSnippetForArtifact(query, 90)
}

type QuizDifficulty = "easy" | "medium" | "hard"
type QuizQuestionStyle = "single_best_answer" | "clinical_application" | "mixed"

type QuizGenerationSettings = {
  questionCount: number
  difficulty: QuizDifficulty
  style: QuizQuestionStyle
  scopeLabel: string
  pageStart?: number
  pageEnd?: number
}

function parseQuizGenerationSettings(
  query: string,
  fallbackQuestionCount: number
): QuizGenerationSettings {
  const normalized = query.replace(/\r/g, "")
  const questionCountMatch =
    normalized.match(/\bquestions?\s*:?\s*(\d{1,2})\b/i) ||
    normalized.match(/\b(\d{1,2})\s*(?:questions?|mcqs?)\b/i)
  const questionCount = clamp(
    questionCountMatch?.[1] ? Number.parseInt(questionCountMatch[1], 10) : fallbackQuestionCount,
    3,
    12
  )
  const difficulty: QuizDifficulty =
    /\bhard|advanced|board[-\s]?style\b/i.test(normalized)
      ? "hard"
      : /\beasy|introductory|basic\b/i.test(normalized)
        ? "easy"
        : "medium"
  const style: QuizQuestionStyle =
    /\bcase[-\s]?based|clinical|scenario\b/i.test(normalized)
      ? "clinical_application"
      : /\bmixed\b/i.test(normalized)
        ? "mixed"
        : "single_best_answer"
  const explicitPages =
    normalized.match(/\bpages?\s*:?\s*(\d+)\s*(?:-|–|to)\s*(\d+)\b/i) ||
    normalized.match(/\bpages?\s+(\d+)\s*(?:-|–|to)\s*(\d+)\b/i)
  const singlePage =
    normalized.match(/\bpage\s*:?\s*(\d+)\b/i) || normalized.match(/\bpage\s+(\d+)\b/i)
  const pageStart = explicitPages?.[1]
    ? Number.parseInt(explicitPages[1], 10)
    : singlePage?.[1]
      ? Number.parseInt(singlePage[1], 10)
      : undefined
  const pageEnd = explicitPages?.[2]
    ? Number.parseInt(explicitPages[2], 10)
    : pageStart
  const scopeLabel = extractQuizFocusFromQuery(query)
  return {
    questionCount,
    difficulty,
    style,
    scopeLabel,
    pageStart,
    pageEnd,
  }
}

function normalizeQuizOptionText(value: string, maxLength = 260): string {
  const normalized = sanitizeArtifactText(value)
  if (!normalized) return ""
  if (normalized.length <= maxLength) {
    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
  }

  const window = normalized.slice(0, maxLength)
  const sentenceMatches = Array.from(window.matchAll(/[.!?]\s+/g))
  const sentenceMatch = sentenceMatches.at(-1)
  if (sentenceMatch && typeof sentenceMatch.index === "number") {
    const clipped = window.slice(0, sentenceMatch.index + 1).trim()
    return clipped.length > 0 ? clipped : `${window.trim()}.`
  }

  const wordBreak = window.lastIndexOf(" ")
  const clipped = (wordBreak > 40 ? window.slice(0, wordBreak) : window).trim()
  return clipped.length > 0
    ? `${clipped}.`
    : `${normalized.slice(0, maxLength).trim()}.`
}

function buildQuizPromptFromCitation(
  citation: EvidenceCitation,
  quizFocus: string,
  statement: string,
  style: QuizQuestionStyle = "single_best_answer"
): string {
  const statementSeed = cleanSnippetForArtifact(statement, 110)
  const concept = statementSeed.split(/[.:;!?]/)[0]?.trim() || statementSeed
  const topicSeed = cleanSnippetForArtifact(concept || quizFocus || citation.title || "", 80)
  const pageHint = citation.pageLabel ? ` (${citation.pageLabel})` : ""
  if (style === "clinical_application") {
    return `Based on the uploaded material${pageHint}, which option best applies this concept in a clinical scenario about "${topicSeed}"?`
  }
  if (style === "mixed") {
    return `Based on the uploaded material${pageHint}, which option is the strongest supported answer about "${topicSeed}"?`
  }
  return `Based on the uploaded material${pageHint}, which statement is best supported about "${topicSeed}"?`
}

function createPlausibleDistractor(
  correctStatement: string,
  quizFocus: string,
  relatedTopic: string
): string {
  const replacements: Array<[RegExp, string]> = [
    [/\b(increase|increases|increased|elevated|higher)\b/i, "decreased"],
    [/\b(decrease|decreases|decreased|lower|reduced)\b/i, "increased"],
    [/\b(first-line|first line)\b/i, "second-line"],
    [/\b(primary|main)\b/i, "secondary"],
    [/\b(associated with|linked to)\b/i, "unrelated to"],
  ]
  let mutated = correctStatement
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(mutated)) {
      mutated = mutated.replace(pattern, replacement)
      break
    }
  }
  if (mutated !== correctStatement) {
    return normalizeQuizOptionText(mutated, 220)
  }
  const seed = cleanSnippetForArtifact(relatedTopic || quizFocus || "this topic", 70)
  return normalizeQuizOptionText(
    `The uploaded material primarily attributes ${seed} to an alternative mechanism not described in the cited excerpt.`,
    220
  )
}

function extractQuizFactsFromCitation(citation: EvidenceCitation, maxFacts = 2): string[] {
  const source = sanitizeArtifactText(`${citation.snippet || ""} ${citation.title || ""}`)
  if (!source) return []
  const candidates = extractQuizSentences(source)
    .map((sentence) => normalizeQuizOptionText(sentence, 220))
    .filter((sentence) => sentence.length > 40)
    .filter((sentence) => !isWeakQuizStatement(sentence))
  const unique = Array.from(new Set(candidates))
  return unique.slice(0, Math.max(1, maxFacts))
}

function scoreQuizCitationFit(
  citation: EvidenceCitation,
  settings: QuizGenerationSettings,
  query: string
): number {
  const haystack = `${citation.title || ""} ${citation.snippet || ""}`.toLowerCase()
  const keywords = extractQuizQueryKeywords(query)
  const overlap = keywords.filter((keyword) => haystack.includes(keyword)).length
  const overlapScore = keywords.length > 0 ? overlap / keywords.length : 0
  const pageMatch =
    typeof settings.pageStart === "number" &&
    typeof citation.sourceUnitNumber === "number" &&
    citation.sourceUnitNumber >= settings.pageStart &&
    citation.sourceUnitNumber <= (settings.pageEnd || settings.pageStart)
      ? 0.45
      : 0
  const pageLabelBoost = citation.pageLabel ? 0.08 : 0
  const qualityPenalty = isLikelyNonBodySnippet(citation.snippet || "") ? -1 : 0
  return overlapScore + pageMatch + pageLabelBoost + qualityPenalty
}

function isVerifiedQuizCandidate(
  citation: EvidenceCitation,
  statement: string,
  settings: QuizGenerationSettings,
  query: string
): boolean {
  if (!statement || isWeakQuizStatement(statement)) return false
  const excerpt = sanitizeArtifactText(citation.snippet || citation.title || "")
  if (!excerpt || excerpt.length < 35) return false
  const statementKey = normalizeQuizTopicKey(statement)
  const excerptKey = normalizeQuizTopicKey(excerpt)
  if (!statementKey || !excerptKey) return false
  const hasTopicOverlap = statementKey
    .split(" ")
    .filter(Boolean)
    .some((token) => excerptKey.includes(token))
  if (!hasTopicOverlap) return false
  if (scoreQuizCitationFit(citation, settings, query) < 0.15) return false
  return true
}

function computeTokenOverlapRatio(left: string, right: string): number {
  const leftTokens = normalizeQuizTopicKey(left).split(" ").filter(Boolean)
  const rightTokens = new Set(normalizeQuizTopicKey(right).split(" ").filter(Boolean))
  if (leftTokens.length === 0 || rightTokens.size === 0) return 0
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length
  return overlap / Math.max(leftTokens.length, 1)
}

function isValidDistractorCandidate(
  citation: EvidenceCitation,
  candidate: string,
  correct: string,
  settings: QuizGenerationSettings,
  query: string
): boolean {
  const normalized = normalizeQuizOptionText(candidate, 220)
  if (!normalized) return false
  if (normalized === correct) return false
  if (isWeakQuizStatement(normalized)) return false
  if (/^(all|none|both)\b/i.test(normalized)) return false

  const overlapWithCorrect = computeTokenOverlapRatio(normalized, correct)
  if (overlapWithCorrect > 0.9) return false

  const excerpt = sanitizeArtifactText(citation.snippet || citation.title || "").toLowerCase()
  const candidateTokens = normalizeQuizTopicKey(normalized).split(" ").filter(Boolean)
  const topicalOverlap = candidateTokens.filter((token) => excerpt.includes(token)).length
  if (candidateTokens.length > 0 && topicalOverlap === 0) return false

  // Keep distractors in the same conceptual neighborhood as the query/citation,
  // but block options that are clearly low-signal.
  if (scoreQuizCitationFit(citation, settings, query) < 0.08) return false
  return true
}

function dedupeQuizCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const deduped = new Map<string, EvidenceCitation>()
  citations.forEach((citation) => {
    const key =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      citation.chunkId ||
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

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split(".")
  return parts.length > 1 ? parts.at(-1)!.toLowerCase() : ""
}

function detectUploadKind(fileName: string, mimeType: string): UploadDocumentKind {
  const ext = getFileExtension(fileName)
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf"
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) {
    return "pptx"
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return "docx"
  }
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") return "text"
  return "other"
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractXmlText(xml: string, regex: RegExp): string[] {
  const values: string[] = []
  const matches = xml.matchAll(regex)
  for (const match of matches) {
    if (match[1]) {
      values.push(decodeXmlEntities(match[1]))
    }
  }
  return values
}

function buildParagraphsFromDocxXml(xml: string): Array<{ text: string; relationshipIds: string[] }> {
  const paragraphMatches = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? []
  return paragraphMatches
    .map((paragraphXml) => {
      const text = extractXmlText(paragraphXml, /<w:t[^>]*>([\s\S]*?)<\/w:t>/g).join("")
      const relationshipIds = Array.from(
        paragraphXml.matchAll(/r:embed="([^"]+)"/g)
      ).map((match) => match[1])
      return {
        text: text.replace(/\s+/g, " ").trim(),
        relationshipIds,
      }
    })
    .filter((paragraph) => paragraph.text.length > 0 || paragraph.relationshipIds.length > 0)
}

function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  const normalized = normalizeExtractedText(text)
  if (!normalized) return []

  const chunks: Array<{ text: string; start: number; end: number }> = []
  const maxChunkChars = Math.max(220, chunkSize)
  const overlapChars = Math.max(0, Math.min(overlap, Math.floor(maxChunkChars * 0.5)))
  let cursor = 0

  while (cursor < normalized.length) {
    const tentativeEnd = Math.min(cursor + maxChunkChars, normalized.length)
    let end = tentativeEnd

    if (tentativeEnd < normalized.length) {
      const lowerBound = Math.max(cursor + Math.floor(maxChunkChars * 0.55), cursor + 1)
      const window = normalized.slice(lowerBound, tentativeEnd + 1)
      const paragraphBreak = window.lastIndexOf("\n\n")
      if (paragraphBreak >= 0) {
        end = lowerBound + paragraphBreak + 2
      } else {
        const sentenceMatches = Array.from(window.matchAll(/[.!?]\s+/g))
        const sentenceMatch = sentenceMatches.at(-1)
        if (sentenceMatch && typeof sentenceMatch.index === "number") {
          end = lowerBound + sentenceMatch.index + sentenceMatch[0].length
        } else {
          const spaceBreak = window.lastIndexOf(" ")
          if (spaceBreak >= 0) {
            end = lowerBound + spaceBreak + 1
          }
        }
      }
    }

    if (end <= cursor) {
      end = Math.min(cursor + maxChunkChars, normalized.length)
    }

    const rawSlice = normalized.slice(cursor, end)
    const leadingTrim = rawSlice.length - rawSlice.trimStart().length
    const trailingTrim = rawSlice.length - rawSlice.trimEnd().length
    const start = cursor + leadingTrim
    const finalEnd = end - trailingTrim
    if (finalEnd > start) {
      chunks.push({
        text: normalized.slice(start, finalEnd),
        start,
        end: finalEnd,
      })
    }

    if (finalEnd >= normalized.length) {
      break
    }

    const nextCursor = Math.max(finalEnd - overlapChars, cursor + 1)
    cursor = nextCursor
  }

  return chunks
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function scoreChunkQuality(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  const charCount = normalized.length
  if (!normalized) {
    return {
      score: 0,
      charCount: 0,
      alphaRatio: 0,
      noisyRatio: 1,
      uniqueTokenCount: 0,
    }
  }

  const letterCount = (normalized.match(/[A-Za-z]/g) ?? []).length
  const digitCount = (normalized.match(/[0-9]/g) ?? []).length
  const symbolCount = (normalized.match(/[^A-Za-z0-9\s]/g) ?? []).length
  const tokens = normalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const uniqueTokenCount = new Set(tokens).size
  const alphaRatio = letterCount / Math.max(1, charCount)
  const noisyRatio = (digitCount + symbolCount) / Math.max(1, charCount)

  const lengthScore = Math.min(1, charCount / 320)
  const alphaScore = Math.min(1, alphaRatio / 0.5)
  const lexicalScore = Math.min(1, uniqueTokenCount / 16)
  const cleanScore = Math.max(0, 1 - Math.max(0, noisyRatio - 0.45) * 2.2)

  const score = Number(
    (lengthScore * 0.34 + alphaScore * 0.28 + lexicalScore * 0.24 + cleanScore * 0.14).toFixed(3)
  )

  return {
    score,
    charCount,
    alphaRatio: Number(alphaRatio.toFixed(3)),
    noisyRatio: Number(noisyRatio.toFixed(3)),
    uniqueTokenCount,
  }
}

function isChunkQualityAcceptable(metrics: ReturnType<typeof scoreChunkQuality>) {
  if (metrics.charCount < 55) return false
  if (metrics.uniqueTokenCount < 8) return false
  return metrics.score >= 0.38
}

async function extractPdfPages(buffer: Buffer): Promise<{
  pageCount: number
  pageTexts: string[]
  info: Record<string, unknown>
}> {
  const pageTextByNumber = new Map<number, string>()
  const parsed = await pdfParse(buffer, {
    max: 0,
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      const items = Array.isArray(textContent?.items) ? textContent.items : []
      const lines: string[] = []
      let currentLine: string[] = []
      let lastY: number | null = null

      for (const item of items) {
        const value = typeof item?.str === "string" ? item.str.trim() : ""
        if (!value) continue
        const y =
          Array.isArray(item?.transform) && typeof item.transform[5] === "number"
            ? item.transform[5]
            : null

        // Start a new line when the text item jumps vertically.
        if (currentLine.length > 0 && y !== null && lastY !== null && Math.abs(y - lastY) > 2.5) {
          lines.push(currentLine.join(" "))
          currentLine = []
        }
        currentLine.push(value)
        lastY = y
      }

      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "))
      }

      const extractedText = normalizeExtractedText(lines.join("\n"))
      const pageNumber =
        typeof pageData?.pageIndex === "number" ? Number(pageData.pageIndex) + 1 : pageTextByNumber.size + 1
      pageTextByNumber.set(pageNumber, extractedText)

      // pdf-parse expects a string return for each page.
      return extractedText || " "
    }
  })

  const pageCount = Math.max(parsed.numpages || 0, pageTextByNumber.size || 1)
  const pageTexts = Array.from({ length: pageCount }, (_, index) => pageTextByNumber.get(index + 1) || "")
  let info = (parsed.info as Record<string, unknown>) || {}

  if (pageTexts.every((value) => !value) && typeof parsed.text === "string" && parsed.text.trim()) {
    pageTexts[0] = normalizeExtractedText(parsed.text)
  }

  // If pagerender failed to provide per-page text but parser has a text body, keep it.
  if (pageTexts[0] === "" && typeof parsed.text === "string" && parsed.text.trim()) {
    pageTexts[0] = normalizeExtractedText(parsed.text)
  }

  // Fallback merge: on low coverage, try classic parser output and fill sparse pages by index.
  const extractedPageCount = pageTexts.filter((text) => text.length > 0).length
  const lowCoverageThreshold = Math.max(2, Math.floor(pageCount * 0.55))
  if (extractedPageCount < lowCoverageThreshold) {
    try {
      const fallbackParsed = await pdfParse(buffer)
      const fallbackPages = String(fallbackParsed.text || "")
        .split(/\f+/)
        .map((page) => normalizeExtractedText(page))
        .filter((page) => page.length > 0)

      if (fallbackPages.length > 0) {
        const candidateCount = Math.min(pageCount, fallbackPages.length)
        for (let index = 0; index < candidateCount; index += 1) {
          if (!pageTexts[index] || pageTexts[index].length < 48) {
            pageTexts[index] = fallbackPages[index]
          }
        }
        info = {
          ...info,
          fallbackMergeApplied: true,
          fallbackPageCandidates: fallbackPages.length,
        }
      }
    } catch {
      // Ignore fallback parse errors and continue with best-effort extraction.
    }
  }

  return {
    pageCount,
    pageTexts,
    info,
  }
}

function extractLoosePdfText(buffer: Buffer, maxChars = 12000): string {
  // Keep fallback parsing bounded to avoid high memory usage on large PDFs.
  const sample = buffer.subarray(0, Math.min(buffer.length, 4 * 1024 * 1024))
  const latin = sample.toString("latin1")

  const parenthetical = Array.from(latin.matchAll(/\(([^()]{12,420})\)/g))
    .map((match) => match[1] || "")
    .filter((value) => /[A-Za-z]{3,}/.test(value))
  const asciiRuns = latin.match(/[A-Za-z][A-Za-z0-9 ,.;:()'"\/\\\-]{24,}/g) ?? []

  const merged = normalizeExtractedText(
    [...parenthetical.slice(0, 140), ...asciiRuns.slice(0, 160)].join("\n")
  )
  if (!merged) return ""
  const clipped = merged.slice(0, maxChars)
  return clipTextAtBoundary(clipped, maxChars)
}

function formatSourceLabel(unitType: UploadSourceUnitType, unitNumber: number) {
  if (unitType === "image") return "Image"
  return `${unitType.charAt(0).toUpperCase()}${unitType.slice(1)} ${unitNumber}`
}

function pickExcerpt(text: string, maxLength = 260) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

const QUIZ_QUERY_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "uploaded",
  "material",
  "materials",
  "document",
  "documents",
  "file",
  "files",
  "quiz",
  "questions",
  "question",
  "difficulty",
  "format",
  "style",
  "topic",
  "pages",
  "page",
])

function extractQuizQueryKeywords(query: string): string[] {
  return sanitizeArtifactText(query)
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !QUIZ_QUERY_STOP_WORDS.has(token))
    .slice(0, 8)
}

function pickFocusedExcerpt(text: string, query: string, maxLength = 260) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.length <= maxLength) return normalized
  const keywords = extractQuizQueryKeywords(query)
  const lowered = normalized.toLowerCase()
  const pivot =
    keywords
      .map((keyword) => lowered.indexOf(keyword))
      .find((index) => typeof index === "number" && index >= 0) ?? 0
  const start = Math.max(0, pivot - Math.floor(maxLength * 0.3))
  const end = Math.min(normalized.length, start + maxLength)
  const window = normalized.slice(start, end).trim()
  const prefix = start > 0 ? "..." : ""
  const suffix = end < normalized.length ? "..." : ""
  return `${prefix}${window}${suffix}`.trim()
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in (error as Record<string, unknown>)) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim().length > 0) {
      return message
    }
  }
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== "{}") {
        return serialized
      }
    } catch {
      // ignore JSON serialization issues
    }
  }
  return "Unknown error"
}

function isTransientUploadError(error: unknown): boolean {
  const message = errorMessageFromUnknown(error).toLowerCase()
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket") ||
    message.includes("temporar")
  )
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseNumericPageRef(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function buildQueryTerms(query: string, topic?: string | null) {
  const combined = `${query} ${topic || ""}`.toLowerCase()
  return combined
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)
}

function inferUploadContextIntent(params: {
  query: string
  page?: number | null
  pageStart?: number | null
  pageEnd?: number | null
  mode?: UploadContextSearchMode
  topicContext?: UploadTopicContext
}): {
  modeResolved: UploadContextSearchMode
  page: number | null
  pageStart: number | null
  pageEnd: number | null
} {
  const query = params.query.toLowerCase()
  let explicitPage = params.page ?? null
  let explicitStart = params.pageStart ?? null
  let explicitEnd = params.pageEnd ?? null

  const rangeMatch = query.match(/\b(?:pages?|pp\.?)\s*(\d+)\s*(?:-|to)\s*(\d+)\b/i)
  if (rangeMatch) {
    explicitStart = parseNumericPageRef(rangeMatch[1])
    explicitEnd = parseNumericPageRef(rangeMatch[2])
  }

  const singlePageMatch = query.match(/\b(?:page|p\.?)\s*(\d+)\b/i)
  if (singlePageMatch && explicitPage === null && explicitStart === null) {
    explicitPage = parseNumericPageRef(singlePageMatch[1])
  }

  if (/\bnext page\b/i.test(query)) {
    const lastPage = params.topicContext?.recentPages?.[0]
    if (typeof lastPage === "number" && lastPage > 0) {
      explicitPage = lastPage + 1
    }
  }
  if (/\b(previous|prior) page\b/i.test(query)) {
    const lastPage = params.topicContext?.recentPages?.[0]
    if (typeof lastPage === "number" && lastPage > 1) {
      explicitPage = lastPage - 1
    }
  }

  let modeResolved: UploadContextSearchMode = params.mode || "auto"
  if (modeResolved === "auto") {
    if (explicitStart && explicitEnd && explicitEnd >= explicitStart) {
      modeResolved = "range_lookup"
    } else if (explicitPage) {
      modeResolved = "page_lookup"
    } else if (
      params.topicContext?.activeTopic ||
      /\b(section|chapter|topic|summarize|explain|compare|difference)\b/i.test(query)
    ) {
      modeResolved = "hybrid"
    } else {
      modeResolved = "semantic"
    }
  }

  return {
    modeResolved,
    page: explicitPage,
    pageStart: explicitStart,
    pageEnd: explicitEnd,
  }
}

function normalizeTopicContext(topicContext?: UploadTopicContext): UploadTopicContext {
  const recentPages = Array.from(
    new Set((topicContext?.recentPages ?? []).filter((value) => Number.isFinite(value) && value > 0))
  ).slice(0, 6)

  const recentEvidenceIds = Array.from(
    new Set(
      [
        ...(topicContext?.recentEvidenceIds ?? []),
        ...(topicContext?.recentEvidenceChunkIds ?? []),
      ].filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  ).slice(0, 10)

  return {
    activeTopic: topicContext?.activeTopic?.trim() || null,
    lastUploadId: topicContext?.lastUploadId?.trim() || null,
    recentPages,
    recentEvidenceIds,
    followUpType: topicContext?.followUpType || "unknown",
  }
}

function adaptiveCandidateCap(mode: UploadContextSearchMode, topK: number) {
  if (mode === "page_lookup") {
    return clamp(topK * 20, 90, 520)
  }
  if (mode === "range_lookup") {
    return clamp(topK * 24, 120, 780)
  }
  if (mode === "hybrid") {
    return clamp(topK * 80, 260, 2400)
  }
  return clamp(topK * 68, 220, 1800)
}

function computeLexicalOverlap(queryTerms: string[], text: string) {
  if (queryTerms.length === 0) return 0
  const haystack = text.toLowerCase()
  let matches = 0
  for (const term of queryTerms) {
    if (haystack.includes(term)) {
      matches += 1
    }
  }
  return matches / queryTerms.length
}

function getChunkQualityScore(row: UploadChunkRow) {
  const stored = row.metadata?.chunkQualityScore
  if (typeof stored === "number") {
    return stored
  }
  return scoreChunkQuality(String(row.chunk_text || "")).score
}

function chunkSourceUnitNumber(row: UploadChunkRow) {
  const raw = row.metadata?.unitNumber
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw
  }
  return null
}

function inferFollowUpType(query: string): UploadTopicContext["followUpType"] {
  const normalized = query.toLowerCase()
  if (/\bnext page\b/.test(normalized)) return "next_page"
  if (/\b(previous|prior) page\b/.test(normalized)) return "previous_page"
  if (/\b(clarify|what do you mean|can you explain)\b/.test(normalized)) return "clarify"
  if (/\b(switch|different topic|new topic)\b/.test(normalized)) return "switch_topic"
  if (/\b(more detail|drill down|expand|go deeper)\b/.test(normalized)) return "drill_down"
  return "unknown"
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(null), timeoutMs)
  })
  const result = await Promise.race([promise, timeoutPromise])
  if (timeoutHandle) clearTimeout(timeoutHandle)
  return result as T | null
}

function tryReadImageDimensions(buffer: Buffer) {
  try {
    const dimensions = imageSize(buffer)
    return {
      width: dimensions.width,
      height: dimensions.height,
    }
  } catch {
    return {
      width: undefined,
      height: undefined,
    }
  }
}

async function extractPdfDocument(buffer: Buffer, title: string): Promise<ParsedUploadDocument> {
  try {
    const { pageCount, pageTexts, info } = await extractPdfPages(buffer)
    const sourceUnits: ParsedSourceUnit[] = []
    const extractedPageCount = pageTexts.filter((text) => text.length > 0).length

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const extractedText = pageTexts[pageNumber - 1] || ""

      sourceUnits.push({
        unitType: "page",
        unitNumber: pageNumber,
        title: `Page ${pageNumber}`,
        extractedText,
        figures: [],
        ocrStatus: extractedText ? "completed" : "pending",
        metadata: {
          pageNumber,
          extractedTextLength: extractedText.length,
        },
      })
    }

    return {
      kind: "pdf",
      title,
      metadata: {
        pageCount,
        extractedPageCount,
        extractionCoverage: pageCount > 0 ? Number((extractedPageCount / pageCount).toFixed(3)) : 0,
        info,
      },
      sourceUnits,
    }
  } catch (primaryError) {
    const primaryMessage = errorMessageFromUnknown(primaryError)
    console.warn("[Uploads] Primary PDF extraction failed, trying fallback parser:", primaryMessage)

    try {
      const fallbackParsed = await pdfParse(buffer)
      const fallbackPages = String(fallbackParsed.text || "")
        .split(/\f+/)
        .map((page) => normalizeExtractedText(page))
      const fallbackPageCount = Math.max(
        Number(fallbackParsed.numpages || 0),
        fallbackPages.length,
        1
      )

      const sourceUnits: ParsedSourceUnit[] = []
      for (let pageNumber = 1; pageNumber <= fallbackPageCount; pageNumber += 1) {
        const extractedText = fallbackPages[pageNumber - 1] || ""
        sourceUnits.push({
          unitType: "page",
          unitNumber: pageNumber,
          title: `Page ${pageNumber}`,
          extractedText,
          figures: [],
          ocrStatus: extractedText ? "completed" : "pending",
          metadata: {
            pageNumber,
            extractedTextLength: extractedText.length,
            fallbackParserApplied: true,
            primaryParseError: primaryMessage,
          },
        })
      }

      const extractedPageCount = sourceUnits.filter((unit) => unit.extractedText.length > 0).length
      return {
        kind: "pdf",
        title,
        metadata: {
          pageCount: fallbackPageCount,
          extractedPageCount,
          extractionCoverage:
            fallbackPageCount > 0
              ? Number((extractedPageCount / fallbackPageCount).toFixed(3))
              : 0,
          info: {
            ...((fallbackParsed.info as Record<string, unknown>) || {}),
            fallbackParserApplied: true,
            primaryParseError: primaryMessage,
          },
        },
        sourceUnits,
      }
    } catch (fallbackError) {
      const fallbackMessage = errorMessageFromUnknown(fallbackError)
      console.warn(
        "[Uploads] Fallback PDF extraction failed, returning resilient placeholder:",
        fallbackMessage
      )

      const recoveredText = extractLoosePdfText(buffer)
      const extractedPageCount = recoveredText.length > 0 ? 1 : 0

      return {
        kind: "pdf",
        title,
        metadata: {
          pageCount: 1,
          extractedPageCount,
          extractionCoverage: extractedPageCount > 0 ? 1 : 0,
          info: {
            fallbackParserApplied: true,
            placeholderExtraction: true,
            primaryParseError: primaryMessage,
            fallbackParseError: fallbackMessage,
          },
        },
        sourceUnits: [
          {
            unitType: "page",
            unitNumber: 1,
            title: "Page 1",
            extractedText: recoveredText,
            figures: [],
            ocrStatus: recoveredText ? "completed" : "pending",
            metadata: {
              pageNumber: 1,
              extractedTextLength: recoveredText.length,
              placeholderExtraction: true,
              primaryParseError: primaryMessage,
              fallbackParseError: fallbackMessage,
            },
          },
        ],
      }
    }
  }
}

async function extractPptxDocument(buffer: Buffer, title: string): Promise<ParsedUploadDocument> {
  const zip = await JSZip.loadAsync(buffer)
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => {
      const aNum = Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? "0")
      const bNum = Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? "0")
      return aNum - bNum
    })

  const sourceUnits: ParsedSourceUnit[] = []

  for (const slidePath of slidePaths) {
    const slideNumber = Number(slidePath.match(/slide(\d+)\.xml/i)?.[1] ?? "0")
    const slideXml = await zip.file(slidePath)?.async("text")
    if (!slideXml) continue

    const text = extractXmlText(slideXml, /<a:t[^>]*>([\s\S]*?)<\/a:t>/g)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()

    sourceUnits.push({
      unitType: "slide",
      unitNumber: slideNumber,
      title: `Slide ${slideNumber}`,
      extractedText: text,
      figures: [],
      ocrStatus: "not_required",
      metadata: {
        slideNumber,
      },
    })
  }

  return {
    kind: "pptx",
    title,
    metadata: {
      slideCount: sourceUnits.length,
    },
    sourceUnits,
  }
}

async function extractDocxDocument(buffer: Buffer, title: string): Promise<ParsedUploadDocument> {
  const zip = await JSZip.loadAsync(buffer)
  const documentXml = await zip.file("word/document.xml")?.async("text")
  if (!documentXml) {
    throw new Error("DOCX document.xml not found")
  }

  const paragraphs = buildParagraphsFromDocxXml(documentXml)
  const sourceUnits: ParsedSourceUnit[] = []
  let sectionNumber = 1

  for (let index = 0; index < paragraphs.length; index += DOCX_SECTION_PARAGRAPH_COUNT) {
    const sectionParagraphs = paragraphs.slice(index, index + DOCX_SECTION_PARAGRAPH_COUNT)
    const extractedText = sectionParagraphs.map((paragraph) => paragraph.text).join("\n\n").trim()

    sourceUnits.push({
      unitType: "section",
      unitNumber: sectionNumber,
      title: `Section ${sectionNumber}`,
      extractedText,
      figures: [],
      ocrStatus: "not_required",
      metadata: {
        paragraphStart: index + 1,
        paragraphEnd: index + sectionParagraphs.length,
      },
    })

    sectionNumber += 1
  }

  const mammothResult = await mammoth.extractRawText({ buffer })
  if (sourceUnits.length === 0 && mammothResult.value.trim()) {
    sourceUnits.push({
      unitType: "section",
      unitNumber: 1,
      title: "Document",
      extractedText: mammothResult.value,
      figures: [],
      ocrStatus: "not_required",
      metadata: {},
    })
  }

  return {
    kind: "docx",
    title,
    metadata: {
      sectionCount: sourceUnits.length,
    },
    sourceUnits,
  }
}

async function extractImageDocument(
  buffer: Buffer,
  title: string,
  _mimeType: string
): Promise<ParsedUploadDocument> {
  const dimensions = tryReadImageDimensions(buffer)

  return {
    kind: "image",
    title,
    metadata: {},
    sourceUnits: [
      {
        unitType: "image",
        unitNumber: 1,
        title: "Image",
        extractedText: "",
        figures: [],
        width: dimensions.width,
        height: dimensions.height,
        ocrStatus: "pending",
        metadata: {},
      },
    ],
  }
}

async function extractTextDocument(buffer: Buffer, title: string): Promise<ParsedUploadDocument> {
  const text = buffer.toString("utf-8")
  return {
    kind: "text",
    title,
    metadata: {},
    sourceUnits: [
      {
        unitType: "section",
        unitNumber: 1,
        title: "Document",
        extractedText: text,
        figures: [],
        ocrStatus: "not_required",
        metadata: {},
      },
    ],
  }
}

async function parseUploadDocument(options: {
  buffer: Buffer
  title: string
  fileName: string
  mimeType: string
}): Promise<ParsedUploadDocument> {
  const kind = detectUploadKind(options.fileName, options.mimeType)
  switch (kind) {
    case "pdf":
      return extractPdfDocument(options.buffer, options.title)
    case "pptx":
      return extractPptxDocument(options.buffer, options.title)
    case "docx":
      return extractDocxDocument(options.buffer, options.title)
    case "image":
      return extractImageDocument(options.buffer, options.title, options.mimeType)
    case "text":
      return extractTextDocument(options.buffer, options.title)
    default:
      throw new Error("Unsupported upload type")
  }
}

export class UserUploadService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null

  constructor(supabase?: Awaited<ReturnType<typeof createClient>>) {
    this.supabase = supabase ?? null
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    if (!this.supabase) {
      throw new Error("Supabase client not available")
    }
    return this.supabase
  }

  validateUploadInput({
    fileName,
    mimeType,
    fileSize,
  }: {
    fileName: string
    mimeType: string
    fileSize: number
  }) {
    if (fileSize > USER_UPLOAD_MAX_FILE_SIZE) {
      throw new Error(`Files must be ${USER_UPLOAD_MAX_FILE_SIZE / (1024 * 1024)}MB or smaller`)
    }

    const uploadKind = detectUploadKind(fileName, mimeType)
    if (!["pdf", "pptx", "docx", "image", "text"].includes(uploadKind)) {
      throw new Error("Supported uploads are PDF, PPTX, DOCX, images, and text documents")
    }
    return uploadKind
  }

  async validateUploadFile(file: File) {
    return this.validateUploadInput({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    })
  }

  async createPendingUpload({
    userId,
    fileName,
    mimeType,
    fileSize,
    title,
  }: {
    userId: string
    fileName: string
    mimeType: string
    fileSize: number
    title?: string
  }) {
    const uploadKind = this.validateUploadInput({
      fileName,
      mimeType,
      fileSize,
    })
    const supabase = await this.getSupabase()
    const uploadId = crypto.randomUUID()
    const safeName = sanitizeFileName(fileName || `${uploadId}.${getFileExtension(fileName)}`)
    const originalPath = `user-uploads/${userId}/${uploadId}/original/${safeName}`
    const uploadTitle = title?.trim() || fileName.replace(/\.[^.]+$/, "") || "Uploaded document"

    const { data, error } = await (supabase as any)
      .from("user_uploads")
      .insert({
        id: uploadId,
        user_id: userId,
        title: uploadTitle,
        file_name: fileName,
        mime_type: mimeType || "application/octet-stream",
        file_size: fileSize,
        storage_bucket: USER_UPLOAD_BUCKET,
        original_file_path: originalPath,
        upload_kind: uploadKind,
        status: "pending",
        parser_version: USER_UPLOAD_PARSER_VERSION,
        metadata: {},
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to create upload record: ${error?.message ?? "Unknown error"}`)
    }

    return {
      uploadId: data.id as string,
      bucket: USER_UPLOAD_BUCKET,
      filePath: data.original_file_path as string,
      uploadKind,
      title: data.title as string,
    }
  }

  async createAndIngestUpload({
    userId,
    file,
    title,
  }: {
    userId: string
    file: File
    title?: string
  }) {
    const supabase = await this.getSupabase()
    const pendingUpload = await this.createPendingUpload({
      userId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      title,
    })

    const uploadArrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(uploadArrayBuffer)
    const { error: storageError } = await supabase.storage
      .from(USER_UPLOAD_BUCKET)
      .upload(pendingUpload.filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      })

    if (storageError) {
      throw new Error(`Failed to upload document: ${storageError.message}`)
    }

    await this.ingestStoredUpload(userId, pendingUpload.uploadId)
    return this.getUploadListItem(userId, pendingUpload.uploadId)
  }

  async listUploads(userId: string): Promise<UserUploadListItem[]> {
    const supabase = await this.getSupabase()
    const { data: uploads, error } = await (supabase as any)
      .from("user_uploads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(`Failed to list uploads: ${error.message}`)
    }

    const items = await Promise.all(
      (uploads ?? []).map((upload: UploadRow) => this.buildUploadListItem(upload))
    )
    return items
  }

  async getUploadListItem(userId: string, uploadId: string): Promise<UserUploadListItem | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from("user_uploads")
      .select("*")
      .eq("user_id", userId)
      .eq("id", uploadId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load upload: ${error.message}`)
    }
    if (!data) {
      return null
    }
    return this.buildUploadListItem(data as UploadRow)
  }

  async getUploadDetail(userId: string, uploadId: string): Promise<UserUploadDetail | null> {
    const supabase = await this.getSupabase()
    const [uploadResult, sourceUnitsResult, chunkResult, assetResult] = await Promise.all([
      (supabase as any)
        .from("user_uploads")
        .select("*")
        .eq("id", uploadId)
        .eq("user_id", userId)
        .maybeSingle(),
      (supabase as any)
        .from("user_upload_source_units")
        .select("*")
        .eq("upload_id", uploadId)
        .eq("user_id", userId)
        .order("unit_number", { ascending: true }),
      (supabase as any)
        .from("user_upload_chunks")
        .select(
          "id, source_unit_id, chunk_index, chunk_text, source_offset_start, source_offset_end, metadata"
        )
        .eq("upload_id", uploadId)
        .eq("user_id", userId)
        .order("source_unit_id", { ascending: true })
        .order("chunk_index", { ascending: true }),
      (supabase as any)
        .from("user_upload_assets")
        .select("id, asset_type")
        .eq("upload_id", uploadId)
        .eq("user_id", userId),
    ])

    if (uploadResult.error) {
      throw new Error(`Failed to load upload: ${uploadResult.error.message}`)
    }
    if (!uploadResult.data) {
      return null
    }
    if (sourceUnitsResult.error) {
      throw new Error(`Failed to load source units: ${sourceUnitsResult.error.message}`)
    }
    if (chunkResult.error) {
      throw new Error(`Failed to load chunks: ${chunkResult.error.message}`)
    }
    if (assetResult.error) {
      throw new Error(`Failed to load upload assets: ${assetResult.error.message}`)
    }

    const upload = uploadResult.data as UploadRow
    const chunkRows = (chunkResult.data ?? []) as Array<{
      id: string
      source_unit_id: string
      chunk_index: number
      chunk_text: string
      source_offset_start: number | null
      source_offset_end: number | null
      metadata: Record<string, unknown> | null
    }>
    const chunksByUnit = new Map<string, typeof chunkRows>()
    for (const row of chunkRows) {
      const current = chunksByUnit.get(row.source_unit_id) ?? []
      current.push(row)
      chunksByUnit.set(row.source_unit_id, current)
    }

    const sourceUnits = await Promise.all(
      ((sourceUnitsResult.data ?? []) as any[]).map(async (unit) => {
        const previewUrl =
          unit.preview_path && unit.preview_bucket
            ? await this.safeCreateSignedUrl(unit.preview_bucket, unit.preview_path)
            : null

        return {
          id: unit.id as string,
          unitType: unit.unit_type as "page" | "slide" | "image" | "section",
          unitNumber: unit.unit_number as number,
          title: unit.title as string | null,
          extractedText: (unit.extracted_text as string) || "",
          ocrStatus: (unit.ocr_status as OCRStatus | null) ?? null,
          previewUrl,
          previewBucket: (unit.preview_bucket as string | null) ?? null,
          previewPath: (unit.preview_path as string | null) ?? null,
          previewMimeType: (unit.preview_mime_type as string | null) ?? null,
          width: (unit.width as number | null) ?? null,
          height: (unit.height as number | null) ?? null,
          chunks: (chunksByUnit.get(unit.id) ?? []).map((chunk) => ({
            id: chunk.id,
            chunkIndex: chunk.chunk_index,
            chunkText: chunk.chunk_text,
            sourceOffsetStart: chunk.source_offset_start,
            sourceOffsetEnd: chunk.source_offset_end,
            metadata: chunk.metadata ?? {},
          })),
        }
      })
    )

    const originalFileUrl = await this.safeCreateSignedUrl(upload.storage_bucket, upload.original_file_path)

    return {
      id: upload.id,
      title: upload.title,
      fileName: upload.file_name,
      mimeType: upload.mime_type,
      uploadKind: upload.upload_kind,
      status: upload.status,
      createdAt: upload.created_at,
      updatedAt: upload.updated_at,
      sourceUnitCount: sourceUnits.length,
      figureCount: assetResult.data?.filter((asset: any) => asset.asset_type === "figure").length ?? 0,
      originalFilePath: upload.original_file_path,
      originalFileUrl,
      storageBucket: upload.storage_bucket,
      sourceUnits,
    }
  }

  async deleteUpload(userId: string, uploadId: string) {
    const supabase = await this.getSupabase()
    const [uploadResult, assetsResult, unitsResult] = await Promise.all([
      (supabase as any)
        .from("user_uploads")
        .select("*")
        .eq("id", uploadId)
        .eq("user_id", userId)
        .maybeSingle(),
      (supabase as any)
        .from("user_upload_assets")
        .select("file_path")
        .eq("upload_id", uploadId)
        .eq("user_id", userId),
      (supabase as any)
        .from("user_upload_source_units")
        .select("preview_path")
        .eq("upload_id", uploadId)
        .eq("user_id", userId),
    ])

    if (uploadResult.error) {
      throw new Error(`Failed to load upload for deletion: ${uploadResult.error.message}`)
    }
    if (!uploadResult.data) {
      return
    }

    const paths = new Set<string>([uploadResult.data.original_file_path])
    for (const asset of assetsResult.data ?? []) {
      if (asset.file_path) paths.add(asset.file_path)
    }
    for (const unit of unitsResult.data ?? []) {
      if (unit.preview_path) paths.add(unit.preview_path)
    }

    if (paths.size > 0) {
      await supabase.storage.from(USER_UPLOAD_BUCKET).remove([...paths])
    }

    const { error } = await (supabase as any)
      .from("user_uploads")
      .delete()
      .eq("id", uploadId)
      .eq("user_id", userId)

    if (error) {
      throw new Error(`Failed to delete upload: ${error.message}`)
    }
  }

  async reprocessUpload(userId: string, uploadId: string) {
    return this.ingestStoredUpload(userId, uploadId, { reprocess: true, resume: true })
  }

  async ingestStoredUpload(
    userId: string,
    uploadId: string,
    options?: { reprocess?: boolean; resume?: boolean }
  ) {
    const supabase = await this.getSupabase()
    const { data: upload, error } = await (supabase as any)
      .from("user_uploads")
      .select("*")
      .eq("id", uploadId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !upload) {
      throw new Error(`Upload not found: ${error?.message ?? "Unknown error"}`)
    }

    const { data: jobData, error: jobError } = await (supabase as any)
      .from("upload_ingestion_jobs")
      .insert({
        upload_id: uploadId,
        user_id: userId,
        status: "pending",
        parser_version: USER_UPLOAD_PARSER_VERSION,
        metadata: { reprocess: options?.reprocess === true },
      })
      .select()
      .single()

    if (jobError || !jobData) {
      throw new Error(`Failed to create reprocess job: ${jobError?.message ?? "Unknown error"}`)
    }

    const storageDownload = await supabase.storage
      .from(upload.storage_bucket)
      .download(upload.original_file_path)

    if (storageDownload.error || !storageDownload.data) {
      throw new Error(`Failed to download original upload: ${storageDownload.error?.message ?? "Unknown error"}`)
    }

    const buffer = Buffer.from(await storageDownload.data.arrayBuffer())
      await this.ingestUploadRecord(uploadId, buffer, jobData.id, options)
    return this.getUploadListItem(userId, uploadId)
  }

  private async resolveSearchUploadIds({
    userId,
    uploadId,
    topicContext,
  }: {
    userId: string
    uploadId?: string
    topicContext?: UploadTopicContext
  }) {
    const supabase = await this.getSupabase()
    if (uploadId) {
      const { data } = await (supabase as any)
        .from("user_uploads")
        .select("id")
        .eq("id", uploadId)
        .eq("user_id", userId)
        .eq("status", "completed")
        .maybeSingle()
      if (data?.id) {
        return [data.id as string]
      }
    }

    const requestedLastUploadId = topicContext?.lastUploadId
    const { data: uploads, error } = await (supabase as any)
      .from("user_uploads")
      .select("id, status, last_ingested_at, updated_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("last_ingested_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(MAX_UPLOAD_IDS_PER_SEARCH + 1)

    if (error || !Array.isArray(uploads) || uploads.length === 0) {
      return []
    }

    const prioritized = uploads.map((row: any) => String(row.id))
    if (requestedLastUploadId && prioritized.includes(requestedLastUploadId)) {
      return [requestedLastUploadId, ...prioritized.filter((id) => id !== requestedLastUploadId)].slice(
        0,
        MAX_UPLOAD_IDS_PER_SEARCH
      )
    }
    return prioritized.slice(0, MAX_UPLOAD_IDS_PER_SEARCH)
  }

  private async lookupByPage({
    userId,
    uploadId,
    page,
    includeNeighborPages,
    candidateCap,
  }: {
    userId: string
    uploadId: string
    page: number
    includeNeighborPages: number
    candidateCap: number
  }): Promise<{ rows: UploadChunkRow[]; warnings: string[] }> {
    const supabase = await this.getSupabase()
    const rangeStart = Math.max(1, page - includeNeighborPages)
    const rangeEnd = page + includeNeighborPages
    const { data: units, error: unitError } = await (supabase as any)
      .from("user_upload_source_units")
      .select("id")
      .eq("user_id", userId)
      .eq("upload_id", uploadId)
      .gte("unit_number", rangeStart)
      .lte("unit_number", rangeEnd)
      .order("unit_number", { ascending: true })

    if (unitError || !Array.isArray(units) || units.length === 0) {
      return {
        rows: [],
        warnings: [`No source units found for page ${page}.`],
      }
    }

    const unitIds = units.map((row: any) => String(row.id))
    const { data: rows, error: chunkError } = await (supabase as any)
      .from("user_upload_chunks")
      .select(
        "id, upload_id, source_unit_id, chunk_index, chunk_text, source_offset_start, source_offset_end, metadata, embedding"
      )
      .eq("user_id", userId)
      .eq("upload_id", uploadId)
      .in("source_unit_id", unitIds)
      .order("chunk_index", { ascending: true })
      .limit(candidateCap)

    if (chunkError || !Array.isArray(rows)) {
      return {
        rows: [],
        warnings: ["Unable to load page chunks for the requested upload."],
      }
    }
    return {
      rows: rows as UploadChunkRow[],
      warnings: [],
    }
  }

  private async lookupByRange({
    userId,
    uploadId,
    pageStart,
    pageEnd,
    candidateCap,
  }: {
    userId: string
    uploadId: string
    pageStart: number
    pageEnd: number
    candidateCap: number
  }): Promise<{ rows: UploadChunkRow[]; warnings: string[] }> {
    const supabase = await this.getSupabase()
    const boundedStart = Math.min(pageStart, pageEnd)
    const boundedEnd = Math.max(pageStart, pageEnd)
    const { data: units, error: unitError } = await (supabase as any)
      .from("user_upload_source_units")
      .select("id")
      .eq("user_id", userId)
      .eq("upload_id", uploadId)
      .gte("unit_number", boundedStart)
      .lte("unit_number", boundedEnd)
      .order("unit_number", { ascending: true })

    if (unitError || !Array.isArray(units) || units.length === 0) {
      return {
        rows: [],
        warnings: [`No source units found for pages ${boundedStart}-${boundedEnd}.`],
      }
    }

    const unitIds = units.map((row: any) => String(row.id))
    const { data: rows, error: chunkError } = await (supabase as any)
      .from("user_upload_chunks")
      .select(
        "id, upload_id, source_unit_id, chunk_index, chunk_text, source_offset_start, source_offset_end, metadata, embedding"
      )
      .eq("user_id", userId)
      .eq("upload_id", uploadId)
      .in("source_unit_id", unitIds)
      .order("chunk_index", { ascending: true })
      .limit(candidateCap)

    if (chunkError || !Array.isArray(rows)) {
      return {
        rows: [],
        warnings: ["Unable to load range chunks for the requested upload."],
      }
    }
    return {
      rows: rows as UploadChunkRow[],
      warnings: [],
    }
  }

  private async semanticLookup({
    userId,
    uploadIds,
    candidateCap,
  }: {
    userId: string
    uploadIds: string[]
    candidateCap: number
  }): Promise<{ rows: UploadChunkRow[]; warnings: string[] }> {
    const supabase = await this.getSupabase()
    let query = (supabase as any)
      .from("user_upload_chunks")
      .select(
        "id, upload_id, source_unit_id, chunk_index, chunk_text, source_offset_start, source_offset_end, metadata, embedding"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(candidateCap)

    if (uploadIds.length === 1) {
      query = query.eq("upload_id", uploadIds[0])
    } else {
      query = query.in("upload_id", uploadIds)
    }

    const { data: rows, error } = await query
    if (error || !Array.isArray(rows)) {
      return {
        rows: [],
        warnings: ["Unable to load semantic candidates from uploads."],
      }
    }
    return {
      rows: rows as UploadChunkRow[],
      warnings: [],
    }
  }

  private async hybridLookup({
    userId,
    uploadIds,
    candidateCap,
    topicContext,
  }: {
    userId: string
    uploadIds: string[]
    candidateCap: number
    topicContext: UploadTopicContext
  }): Promise<{ rows: UploadChunkRow[]; warnings: string[] }> {
    const semantic = await this.semanticLookup({
      userId,
      uploadIds,
      candidateCap: Math.max(120, Math.floor(candidateCap * 0.72)),
    })

    const contextualRows: UploadChunkRow[] = []
    const warnings = [...semantic.warnings]
    if (topicContext.recentPages && topicContext.recentPages.length > 0 && uploadIds.length > 0) {
      const anchorPage = topicContext.recentPages[0]
      const contextual = await this.lookupByRange({
        userId,
        uploadId: uploadIds[0],
        pageStart: Math.max(1, anchorPage - 1),
        pageEnd: anchorPage + 1,
        candidateCap: Math.max(60, Math.floor(candidateCap * 0.3)),
      })
      contextualRows.push(...contextual.rows)
      warnings.push(...contextual.warnings)
    }

    const merged = new Map<string, UploadChunkRow>()
    for (const row of semantic.rows) {
      merged.set(row.id, row)
    }
    for (const row of contextualRows) {
      if (!merged.has(row.id)) {
        merged.set(row.id, row)
      }
    }

    return {
      rows: Array.from(merged.values()).slice(0, candidateCap),
      warnings,
    }
  }

  async uploadContextSearch(input: UploadContextSearchInput): Promise<UploadContextSearchResult> {
    const startedAt = Date.now()
    const topicContext = normalizeTopicContext(input.topicContext)
    const intent = inferUploadContextIntent({
      query: input.query,
      page: input.page ?? null,
      pageStart: input.pageStart ?? null,
      pageEnd: input.pageEnd ?? null,
      mode: input.mode,
      topicContext,
    })

    const topK = clamp(input.topK ?? DEFAULT_UPLOAD_CONTEXT_TOP_K, 1, MAX_UPLOAD_CONTEXT_TOP_K)
    const includeNeighborPages = clamp(
      input.includeNeighborPages ?? DEFAULT_UPLOAD_CONTEXT_NEIGHBORS,
      0,
      4
    )
    const maxDurationMs = clamp(input.maxDurationMs ?? DEFAULT_UPLOAD_CONTEXT_BUDGET_MS, 600, 8000)
    const warnings: string[] = []
    const supabase = await this.getSupabase()

    const uploadIds = await this.resolveSearchUploadIds({
      userId: input.userId,
      uploadId: input.uploadId || topicContext.lastUploadId || undefined,
      topicContext,
    })

    if (uploadIds.length === 0) {
      return {
        intent,
        citations: [],
        pagesReturned: [],
        warnings: ["No completed uploads available for retrieval."],
        topicContext,
        metrics: {
          candidateCount: 0,
          elapsedMs: Date.now() - startedAt,
          fallbackUsed: false,
          fallbackReason: "none",
          retrievalConfidence: "low",
          sourceUnitCount: 0,
          maxUnitNumber: 0,
          textbookScale: false,
        },
      }
    }

    const scopeUploadId = uploadIds[0]
    const sourceUnitScopeQuery = await (supabase as any)
      .from("user_upload_source_units")
      .select("unit_number", { count: "exact" })
      .eq("user_id", input.userId)
      .eq("upload_id", scopeUploadId)
      .order("unit_number", { ascending: false })
      .limit(1)
    const sourceUnitCount =
      typeof sourceUnitScopeQuery.count === "number" ? sourceUnitScopeQuery.count : 0
    const maxUnitNumber =
      Array.isArray(sourceUnitScopeQuery.data) &&
      typeof sourceUnitScopeQuery.data[0]?.unit_number === "number"
        ? sourceUnitScopeQuery.data[0].unit_number
        : 0
    const textbookScale = sourceUnitCount >= 80 || maxUnitNumber >= 80

    const candidateCap = adaptiveCandidateCap(intent.modeResolved, topK)
    let candidateRows: UploadChunkRow[] = []

    if (intent.modeResolved === "page_lookup") {
      const selectedUpload = uploadIds[0]
      if (uploadIds.length > 1) {
        warnings.push("Page lookup scoped to your most recent upload for precision.")
      }
      if (!intent.page) {
        warnings.push("Page lookup requested but no page number was detected.")
      } else {
        const pageLookup = await this.lookupByPage({
          userId: input.userId,
          uploadId: selectedUpload,
          page: intent.page,
          includeNeighborPages,
          candidateCap,
        })
        candidateRows = pageLookup.rows
        warnings.push(...pageLookup.warnings)
      }
    } else if (intent.modeResolved === "range_lookup") {
      const selectedUpload = uploadIds[0]
      if (uploadIds.length > 1) {
        warnings.push("Range lookup scoped to your most recent upload for precision.")
      }
      if (!intent.pageStart || !intent.pageEnd) {
        warnings.push("Range lookup requested but page bounds were incomplete.")
      } else {
        const rangeLookup = await this.lookupByRange({
          userId: input.userId,
          uploadId: selectedUpload,
          pageStart: intent.pageStart,
          pageEnd: intent.pageEnd,
          candidateCap,
        })
        candidateRows = rangeLookup.rows
        warnings.push(...rangeLookup.warnings)
      }
    } else if (intent.modeResolved === "hybrid") {
      const hybrid = await this.hybridLookup({
        userId: input.userId,
        uploadIds,
        candidateCap,
        topicContext,
      })
      candidateRows = hybrid.rows
      warnings.push(...hybrid.warnings)
    } else {
      const semantic = await this.semanticLookup({
        userId: input.userId,
        uploadIds,
        candidateCap,
      })
      candidateRows = semantic.rows
      warnings.push(...semantic.warnings)
    }

    if (candidateRows.length === 0) {
      return {
        intent,
        citations: [],
        pagesReturned: [],
        warnings: warnings.length > 0 ? warnings : ["No matching upload content found."],
        topicContext: {
          ...topicContext,
          lastUploadId: uploadIds[0] || topicContext.lastUploadId || null,
          followUpType: inferFollowUpType(input.query),
        },
        metrics: {
          candidateCount: 0,
          elapsedMs: Date.now() - startedAt,
          fallbackUsed: false,
          fallbackReason: "none",
          retrievalConfidence: "low",
          sourceUnitCount,
          maxUnitNumber,
          textbookScale,
        },
      }
    }

    const queryTerms = buildQueryTerms(input.query, topicContext.activeTopic)
    let fallbackUsed = false
    let fallbackReason: UploadContextSearchResult["metrics"]["fallbackReason"] = "none"
    let queryEmbedding: number[] | null = null
    const candidateEmbeddingKey = input.embeddingApiKey || input.apiKey
    const providerMismatchSignal =
      Boolean(candidateEmbeddingKey) && !isLikelyOpenAIEmbeddingKey(candidateEmbeddingKey)
    const embeddingApiKey = isLikelyOpenAIEmbeddingKey(candidateEmbeddingKey)
      ? candidateEmbeddingKey
      : undefined
    try {
      queryEmbedding = await withTimeout(
        generateEmbedding(input.query, embeddingApiKey),
        Math.min(QUERY_EMBEDDING_TIMEOUT_MS, Math.floor(maxDurationMs * 0.55))
      )
    } catch (error) {
      queryEmbedding = null
      fallbackUsed = true
      fallbackReason = classifyEmbeddingFallbackReason(error)
    }
    if (!queryEmbedding) {
      fallbackUsed = true
      if (fallbackReason === "none") {
        fallbackReason = providerMismatchSignal
          ? "embedding_provider_mismatch"
          : "embedding_timeout"
      }
      if (fallbackReason !== "embedding_provider_mismatch") {
        warnings.push(`Embedding unavailable (${fallbackReason}); using lexical fallback.`)
      }
    }

    const activeTopicTerms = buildQueryTerms(topicContext.activeTopic || "", "")
    const recentEvidenceIds = new Set(topicContext.recentEvidenceIds ?? [])
    const recentPages = new Set((topicContext.recentPages ?? []).filter((value) => value > 0))
    const scored = candidateRows
      .map((row) => {
        const text = String(row.chunk_text ?? "")
        const lexicalScore = computeLexicalOverlap(queryTerms, text)
        const qualityScore = getChunkQualityScore(row)
        const bibliographyPenalty = isLikelyBibliographyNoise(text) ? 0.24 : 0
        const pageNumber = chunkSourceUnitNumber(row)
        const embeddingScore =
          queryEmbedding && Array.isArray(row.embedding)
            ? cosineSimilarity(queryEmbedding, row.embedding)
            : 0
        const topicBoost =
          activeTopicTerms.length > 0 && computeLexicalOverlap(activeTopicTerms, text) > 0
            ? 0.08
            : 0
        const evidenceBoost = recentEvidenceIds.has(row.id) ? 0.14 : 0
        const continuityBoost =
          pageNumber && recentPages.has(pageNumber)
            ? 0.06
            : 0

        let pageIntentBoost = 0
        if (intent.modeResolved === "page_lookup" && intent.page && pageNumber) {
          if (pageNumber === intent.page) {
            pageIntentBoost = 0.45
          } else if (Math.abs(pageNumber - intent.page) <= includeNeighborPages) {
            pageIntentBoost = 0.18
          }
        } else if (
          intent.modeResolved === "range_lookup" &&
          intent.pageStart &&
          intent.pageEnd &&
          pageNumber
        ) {
          const minPage = Math.min(intent.pageStart, intent.pageEnd)
          const maxPage = Math.max(intent.pageStart, intent.pageEnd)
          if (pageNumber >= minPage && pageNumber <= maxPage) {
            pageIntentBoost = 0.34
          } else if (pageNumber >= minPage - includeNeighborPages && pageNumber <= maxPage + includeNeighborPages) {
            pageIntentBoost = 0.14
          }
        } else if (intent.modeResolved === "hybrid" && pageNumber && recentPages.has(pageNumber)) {
          pageIntentBoost = 0.12
        }

        const score =
          embeddingScore > 0
            ? embeddingScore * 0.58 +
              lexicalScore * 0.28 +
              qualityScore * 0.14 +
              pageIntentBoost +
              topicBoost +
              continuityBoost +
              evidenceBoost -
              bibliographyPenalty
            : lexicalScore * 0.68 +
              qualityScore * 0.32 +
              pageIntentBoost +
              topicBoost +
              continuityBoost +
              evidenceBoost -
              bibliographyPenalty

        return {
          row,
          score,
          lexicalScore,
          qualityScore,
          bibliographyPenalty,
        }
      })
      .filter(
        (item) =>
          item.score > 0.12 ||
          item.lexicalScore > 0.18 ||
          (item.qualityScore > 0.45 && item.bibliographyPenalty < 0.18)
      )
      .sort((a, b) => b.score - a.score)

    const fallbackScored =
      scored.length > 0
        ? scored
        : candidateRows
            .map((row) => {
              const text = String(row.chunk_text ?? "")
              const lexicalScore = computeLexicalOverlap(queryTerms, text)
              const qualityScore = getChunkQualityScore(row)
              const bibliographyPenalty = isLikelyBibliographyNoise(text) ? 0.2 : 0
              return {
                row,
                score: lexicalScore * 0.72 + qualityScore * 0.28 - bibliographyPenalty,
                lexicalScore,
                qualityScore,
                bibliographyPenalty,
              }
            })
            .filter(
              (item) =>
                item.score > 0.08 ||
                (item.qualityScore > 0.42 && item.bibliographyPenalty < 0.18)
            )
            .sort((a, b) => b.score - a.score)

    if (scored.length === 0 && fallbackScored.length > 0) {
      fallbackUsed = true
      if (fallbackReason === "none") {
        fallbackReason = "lexical_only"
      }
    }

    const selectedRows: Array<{ row: UploadChunkRow; score: number }> = []
    const perUnitCounts = new Map<string, number>()
    for (const candidate of fallbackScored) {
      const unitId = candidate.row.source_unit_id
      const count = perUnitCounts.get(unitId) ?? 0
      if (count >= 3) {
        continue
      }
      selectedRows.push({
        row: candidate.row,
        score: candidate.score,
      })
      perUnitCounts.set(unitId, count + 1)
      if (selectedRows.length >= topK) {
        break
      }
    }

    const selectedUploadIds = [...new Set(selectedRows.map((item) => item.row.upload_id))]
    const selectedSourceUnitIds = [...new Set(selectedRows.map((item) => item.row.source_unit_id))]
    const [uploadsResult, sourceUnitsResult] = await Promise.all([
      (supabase as any).from("user_uploads").select("*").in("id", selectedUploadIds),
      (supabase as any).from("user_upload_source_units").select("*").in("id", selectedSourceUnitIds),
    ])

    const uploadMap = new Map<string, any>((uploadsResult.data ?? []).map((upload: any) => [upload.id, upload]))
    const sourceUnitMap = new Map<string, any>((sourceUnitsResult.data ?? []).map((unit: any) => [unit.id, unit]))

    const citations: EvidenceCitation[] = []
    for (const [index, item] of selectedRows.entries()) {
      const row = item.row
      const upload = uploadMap.get(row.upload_id)
      const sourceUnit = sourceUnitMap.get(row.source_unit_id)
      if (!upload || !sourceUnit) continue

      const deepLinkParams = new URLSearchParams({
        unitType: String(sourceUnit.unit_type),
        unitNumber: String(sourceUnit.unit_number),
        sourceUnitId: String(sourceUnit.id),
        chunkId: String(row.id),
      })
      if (typeof row.source_offset_start === "number") {
        deepLinkParams.set("start", String(row.source_offset_start))
      }
      if (typeof row.source_offset_end === "number") {
        deepLinkParams.set("end", String(row.source_offset_end))
      }
      const searchQuery = String(row.chunk_text ?? "")
        .replace(/\s+/g, " ")
        .trim()
      if (searchQuery.length >= 6) {
        deepLinkParams.set("search", searchQuery.slice(0, 140))
      }
      const viewerUrl = `/uploads/${upload.id}?${deepLinkParams.toString()}`

      citations.push({
        index: index + 1,
        pmid: null,
        title: upload.title,
        journal: upload.title || upload.file_name,
        year: null,
        doi: null,
        authors: [],
        evidenceLevel: 5,
        studyType: `User ${sourceUnit.unit_type}`,
        sampleSize: null,
        meshTerms: [],
        url: viewerUrl,
        snippet: pickFocusedExcerpt(row.chunk_text, input.query, 320) || pickExcerpt(row.chunk_text, 320),
        score: item.score,
        sourceType: "user_upload",
        sourceLabel: `${formatSourceLabel(sourceUnit.unit_type, sourceUnit.unit_number)} • ${upload.file_name}`,
        uploadId: upload.id,
        chunkId: row.id,
        sourceUnitId: sourceUnit.id,
        sourceUnitType: sourceUnit.unit_type,
        sourceUnitNumber: sourceUnit.unit_number,
        sourceOffsetStart: row.source_offset_start ?? null,
        sourceOffsetEnd: row.source_offset_end ?? null,
        uploadFilePath: upload.original_file_path,
        uploadFileName: upload.file_name,
        pageLabel: formatSourceLabel(sourceUnit.unit_type, sourceUnit.unit_number),
        snippetOrigin: sourceUnit.title,
        previewReference: null,
        figureReferences: [],
      })
    }

    const pagesReturned = Array.from(
      new Set(
        citations
          .map((citation) => citation.sourceUnitNumber)
          .filter((value): value is number => typeof value === "number" && value > 0)
      )
    ).sort((a, b) => a - b)

    const nextTopicContext: UploadTopicContext = {
      activeTopic: topicContext.activeTopic || input.query.trim().slice(0, 160),
      lastUploadId: citations[0]?.uploadId || uploadIds[0] || topicContext.lastUploadId || null,
      recentPages:
        pagesReturned.length > 0
          ? pagesReturned.slice(0, 6)
          : (topicContext.recentPages ?? []).slice(0, 6),
      recentEvidenceIds: Array.from(
        new Set([
          ...citations.map((citation) => citation.chunkId).filter((value): value is string => Boolean(value)),
          ...(topicContext.recentEvidenceIds ?? []),
        ])
      ).slice(0, 10),
      followUpType: inferFollowUpType(input.query),
    }
    const retrievalConfidence: UploadContextSearchResult["metrics"]["retrievalConfidence"] =
      citations.length === 0 || fallbackReason !== "none"
        ? "low"
        : citations.length >= Math.max(3, Math.floor(topK * 0.6))
          ? "high"
          : "medium"

    return {
      intent,
      citations,
      pagesReturned,
      warnings,
      topicContext: nextTopicContext,
      metrics: {
        candidateCount: candidateRows.length,
        elapsedMs: Date.now() - startedAt,
        fallbackUsed: fallbackUsed || Date.now() - startedAt > maxDurationMs,
        fallbackReason:
          fallbackReason === "none" && (fallbackUsed || Date.now() - startedAt > maxDurationMs)
            ? "lexical_only"
            : fallbackReason,
        retrievalConfidence,
        sourceUnitCount,
        maxUnitNumber,
        textbookScale,
      },
    }
  }

  async inspectUploadStructure(input: {
    userId: string
    uploadId?: string
    topicContext?: UploadTopicContext
    maxHeadings?: number
    maxTopics?: number
  }): Promise<UploadStructureInspection> {
    const warnings: string[] = []
    const maxHeadings = clamp(input.maxHeadings ?? 18, 6, 32)
    const maxTopics = clamp(input.maxTopics ?? 16, 6, 28)
    const topicContext = normalizeTopicContext(input.topicContext)
    const uploadIds = await this.resolveSearchUploadIds({
      userId: input.userId,
      uploadId: input.uploadId || topicContext.lastUploadId || undefined,
      topicContext,
    })
    if (uploadIds.length === 0) {
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
        warnings: ["No completed upload available for structure inspection."],
        inspectedAt: new Date().toISOString(),
      }
    }

    const selectedUploadId = uploadIds[0]
    const supabase = await this.getSupabase()
    const [uploadResult, sourceUnitsResult, sourceUnitCountResult, maxUnitResult] = await Promise.all([
      (supabase as any)
        .from("user_uploads")
        .select("id, title, file_name, metadata")
        .eq("id", selectedUploadId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (supabase as any)
        .from("user_upload_source_units")
        .select("unit_number, unit_type, title, extracted_text")
        .eq("upload_id", selectedUploadId)
        .eq("user_id", input.userId)
        .order("unit_number", { ascending: true })
        .limit(260),
      (supabase as any)
        .from("user_upload_source_units")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", selectedUploadId)
        .eq("user_id", input.userId),
      (supabase as any)
        .from("user_upload_source_units")
        .select("unit_number")
        .eq("upload_id", selectedUploadId)
        .eq("user_id", input.userId)
        .order("unit_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (sourceUnitsResult.error || !Array.isArray(sourceUnitsResult.data)) {
      return {
        uploadId: selectedUploadId,
        uploadTitle: uploadResult.data?.title || null,
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
        warnings: ["Unable to load source units for structure inspection."],
        inspectedAt: new Date().toISOString(),
      }
    }

    const sourceUnits = sourceUnitsResult.data as Array<{
      unit_number: number
      unit_type: UploadSourceUnitType
      title: string | null
      extracted_text: string | null
    }>
    const sourceUnitCount =
      typeof sourceUnitCountResult.count === "number" ? sourceUnitCountResult.count : sourceUnits.length
    const maxUnitNumber =
      typeof maxUnitResult.data?.unit_number === "number"
        ? maxUnitResult.data.unit_number
        : sourceUnits.at(-1)?.unit_number || 0
    const extractionCoverageRaw =
      typeof (uploadResult.data?.metadata as any)?.extractionCoverage === "number"
        ? Number((uploadResult.data?.metadata as any).extractionCoverage)
        : sourceUnits.length > 0
          ? sourceUnits.filter((unit) => String(unit.extracted_text || "").trim().length > 0).length /
            sourceUnits.length
          : 0
    const extractionCoverage = Number(Math.max(0, Math.min(1, extractionCoverageRaw)).toFixed(3))
    const textbookScale = sourceUnitCount >= 80 || maxUnitNumber >= 80

    const probableTocPages: number[] = []
    const partDistribution: Record<string, number> = {}
    const headingKeySet = new Set<string>()
    const headingCandidatesList: string[] = []
    const topicMap: UploadStructureTopic[] = []
    for (const unit of sourceUnits) {
      const text = String(unit.extracted_text || "").trim()
      if (!text) continue
      const excerpt = text.slice(0, 5200)
      const lower = excerpt.toLowerCase()
      const documentPart = classifyDocumentPart(excerpt, unit.unit_number, maxUnitNumber)
      partDistribution[documentPart] = (partDistribution[documentPart] || 0) + 1
      const tocLines = extractTopicRowsFromTocText(excerpt)
      const tocScore =
        (/\b(table of contents|contents)\b/.test(lower) ? 2 : 0) +
        (tocLines.length >= 4 ? 1 : 0) +
        ((excerpt.match(/\.{2,}\s*\d{1,4}/g) || []).length >= 3 ? 1 : 0)
      if (tocScore >= 2 && unit.unit_number > 0) {
        probableTocPages.push(unit.unit_number)
      }
      for (const row of tocLines) {
        if (topicMap.length >= maxTopics) break
        if (!topicMap.some((existing) => existing.label.toLowerCase() === row.label.toLowerCase())) {
          topicMap.push({
            ...row,
            documentPart: "body",
            mappedBy: row.mappedBy || "unknown",
          })
        }
      }

      const lines = excerpt
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
      const sampledLines = [
        ...lines.slice(0, 6),
        ...lines.slice(Math.max(0, Math.floor(lines.length * 0.35)), Math.floor(lines.length * 0.35) + 4),
        ...lines.slice(Math.max(0, Math.floor(lines.length * 0.7)), Math.floor(lines.length * 0.7) + 4),
      ]
      for (const line of sampledLines) {
        if (!looksLikeHeadingLine(line)) continue
        const normalized = normalizeHeadingCandidate(line)
        const normalizedKey = normalized.toLowerCase()
        if (!normalized || headingKeySet.has(normalizedKey)) continue
        headingKeySet.add(normalizedKey)
        headingCandidatesList.push(normalized)
        if (headingCandidatesList.length >= maxHeadings) break
      }
      if (headingCandidatesList.length >= maxHeadings && topicMap.length >= maxTopics) break
    }

    const headingCandidates = headingCandidatesList.slice(0, maxHeadings)
    if (topicMap.length === 0 && headingCandidates.length > 0) {
      topicMap.push(
        ...headingCandidates
          .slice(0, maxTopics)
          .map((label) => ({
            label,
            page: null,
            documentPart: "body" as const,
            mappedBy: "heuristic" as const,
          }))
      )
    }
    const mappedTopicsResult = mapTopicsToSourceRanges(topicMap, sourceUnits, maxTopics)
    const mappedTopicMap = mappedTopicsResult.mappedTopics
    if (probableTocPages.length === 0) {
      warnings.push("No explicit TOC pages were detected; structure map uses heading heuristics.")
    }
    const confidence: UploadStructureInspection["confidence"] =
      mappedTopicMap.length >= 6 &&
      probableTocPages.length > 0 &&
      mappedTopicMap.filter((topic) => typeof topic.sourcePageStart === "number").length >= 3
        ? "high"
        : mappedTopicMap.length >= 3 || headingCandidates.length >= 5
          ? "medium"
          : "low"

    return {
      uploadId: selectedUploadId,
      uploadTitle: uploadResult.data?.title || uploadResult.data?.file_name || null,
      sourceUnitCount,
      maxUnitNumber,
      probableTocPages: Array.from(new Set(probableTocPages)).slice(0, 8),
      pageOffsetEstimate: mappedTopicsResult.pageOffsetEstimate,
      partDistribution,
      headingCandidates,
      topicMap: mappedTopicMap.slice(0, maxTopics),
      extractionCoverage,
      confidence,
      textbookScale,
      warnings,
      inspectedAt: new Date().toISOString(),
    }
  }

  async retrieveUploadCitations({
    userId,
    query,
    apiKey,
    embeddingApiKey,
    maxResults = 4,
  }: {
    userId: string
    query: string
    apiKey?: string
    embeddingApiKey?: string
    maxResults?: number
  }): Promise<EvidenceCitation[]> {
    const result = await this.uploadContextSearch({
      userId,
      query,
      apiKey,
      embeddingApiKey,
      topK: Math.max(1, maxResults),
      mode: "auto",
    })
    return result.citations.slice(0, maxResults)
  }

  async generateDocumentFromUpload(
    input: GenerateDocumentFromUploadInput
  ): Promise<DocumentArtifact> {
    const requestedStyle = normalizeCitationStyle(input.citationStyle)
    const citationStyle = inferCitationStyleFromQuery(input.query, requestedStyle)
    const includeReferences =
      input.includeReferences ?? shouldIncludeReferencesForQuery(input.query)
    const documentShape = inferDocumentShape(input.query)
    const artifactV2Enabled = input.enableArtifactV2 !== false
    const maxSources = clamp(input.maxSources ?? 8, 3, 16)
    const search = await this.uploadContextSearch({
      userId: input.userId,
      query: input.query,
      uploadId: input.uploadId,
      apiKey: input.apiKey,
      embeddingApiKey: input.embeddingApiKey,
      mode: "hybrid",
      topK: maxSources,
      includeNeighborPages: 1,
      maxDurationMs: 2600,
    })

    const preparedCitations = search.citations
      .slice(0, maxSources + 4)
      .map((citation) => {
        const raw = citation.snippet || citation.title || ""
        const cleanedSnippet = cleanSnippetForArtifact(raw, 340)
        return {
          ...citation,
          snippet: cleanedSnippet || cleanSnippetForArtifact(citation.title || "", 220),
        }
      })
      .filter((citation) => {
        const candidate = citation.snippet || citation.title || ""
        return (
          candidate.length > 24 &&
          !looksLikeExtractionNoise(candidate) &&
          !isLikelyBibliographyNoise(candidate)
        )
      })

    const fallbackCitations = search.citations
      .slice(0, maxSources)
      .filter((citation) => {
        const candidate = citation.snippet || citation.title || ""
        return !looksLikeExtractionNoise(candidate) && !isLikelyBibliographyNoise(candidate)
      })
    const citationPool =
      preparedCitations.length > 0
        ? preparedCitations.slice(0, maxSources)
        : fallbackCitations
    const seenSourceUnits = new Set<string>()
    const diversifiedCitations: typeof citationPool = []
    for (const citation of citationPool) {
      const unitKey =
        citation.sourceUnitId ||
        (citation.sourceUnitType && citation.sourceUnitNumber
          ? `${citation.sourceUnitType}:${citation.sourceUnitNumber}`
          : "")
      if (unitKey && seenSourceUnits.has(unitKey)) continue
      if (unitKey) seenSourceUnits.add(unitKey)
      diversifiedCitations.push(citation)
      if (diversifiedCitations.length >= maxSources) break
    }
    for (const citation of citationPool) {
      if (diversifiedCitations.length >= maxSources) break
      if (!diversifiedCitations.includes(citation)) {
        diversifiedCitations.push(citation)
      }
    }
    const citations = diversifiedCitations.slice(0, maxSources)
    const uploadId = citations[0]?.uploadId ?? input.uploadId ?? null
    const uploadTitle =
      citations[0]?.uploadFileName ||
      citations[0]?.sourceLabel ||
      (uploadId ? (await this.getUploadListItem(input.userId, uploadId))?.title : null) ||
      null

    const structureInspection =
      artifactV2Enabled &&
      (uploadId || search.topicContext.lastUploadId)
        ? input.structureHint ||
          (await this.inspectUploadStructure({
            userId: input.userId,
            uploadId: uploadId || search.topicContext.lastUploadId || undefined,
            topicContext: search.topicContext,
            maxHeadings: 18,
            maxTopics: 14,
          }))
        : null
    const sectionPlan = artifactV2Enabled
      ? inferSectionPlanFromTopics(
          input.query,
          structureInspection?.topicMap ?? [],
          structureInspection?.headingCandidates ?? []
        )
      : []
    const initialTargetedSections = sectionPlan.slice(
      0,
      structureInspection?.textbookScale ? 8 : 5
    )
    const isCitationWithinSectionRange = (
      citation: EvidenceCitation,
      section: UploadStructureTopic
    ): boolean => {
      if (
        typeof section.sourcePageStart !== "number" &&
        typeof section.sourcePageEnd !== "number" &&
        typeof section.page !== "number"
      ) {
        return true
      }
      if (typeof citation.sourceUnitNumber !== "number") return false
      if (
        typeof section.sourcePageStart === "number" &&
        typeof section.sourcePageEnd === "number"
      ) {
        return (
          citation.sourceUnitNumber >= section.sourcePageStart &&
          citation.sourceUnitNumber <= section.sourcePageEnd
        )
      }
      if (typeof section.sourcePageStart === "number") {
        return Math.abs(citation.sourceUnitNumber - section.sourcePageStart) <= 2
      }
      if (typeof section.page === "number") {
        return Math.abs(citation.sourceUnitNumber - section.page) <= 2
      }
      return true
    }
    const sectionSearches = artifactV2Enabled
      ? await Promise.all(
          initialTargetedSections.map(async (section) => {
            const result = await this.uploadContextSearch({
              userId: input.userId,
              query: `${input.query}\nFocus section: ${section.label}`,
              uploadId: uploadId || search.topicContext.lastUploadId || undefined,
              apiKey: input.apiKey,
              embeddingApiKey: input.embeddingApiKey,
              mode: "hybrid",
              topK: 5,
              includeNeighborPages:
                typeof section.sourcePageStart === "number" || typeof section.page === "number"
                  ? 0
                  : 1,
              page:
                typeof section.sourcePageStart === "number" &&
                typeof section.sourcePageEnd !== "number"
                  ? section.sourcePageStart
                  : typeof section.page === "number"
                    ? section.page
                    : undefined,
              pageStart:
                typeof section.sourcePageStart === "number" &&
                typeof section.sourcePageEnd === "number"
                  ? section.sourcePageStart
                  : undefined,
              pageEnd:
                typeof section.sourcePageStart === "number" &&
                typeof section.sourcePageEnd === "number"
                  ? section.sourcePageEnd
                  : undefined,
              maxDurationMs: 1900,
            })
            return {
              section,
              citations: result.citations.filter((citation) => {
                const candidate = citation.snippet || citation.title || ""
                return (
                  !isLikelyNonBodySnippet(candidate) &&
                  isCitationWithinSectionRange(citation, section)
                )
              }),
              warnings: result.warnings,
            }
          })
        )
      : []
    const requiredBodyEvidence = structureInspection?.textbookScale ? 2 : 1
    const validatedSectionEntries = sectionSearches
      .map((entry) => ({
        ...entry,
        citations: entry.citations
          .filter((citation) => !isLikelyNonBodySnippet(citation.snippet || citation.title || ""))
          .slice(0, 4),
      }))
      .filter((entry) => entry.citations.length >= requiredBodyEvidence)
    const targetedSections = validatedSectionEntries.map((entry) => entry.section)
    const sectionCitationMap = new Map<string, EvidenceCitation[]>()
    const sectionWarnings: string[] = []
    for (const item of validatedSectionEntries) {
      sectionCitationMap.set(item.section.label, item.citations.slice(0, 4))
      if (item.warnings.length > 0) {
        sectionWarnings.push(...item.warnings)
      }
    }

    const curatedCitationPool = [...citations]
    for (const item of validatedSectionEntries) {
      curatedCitationPool.push(...item.citations)
    }
    const seenCitationKey = new Set<string>()
    const curatedCitations = curatedCitationPool.filter((citation) => {
      const key =
        citation.chunkId ||
        citation.sourceUnitId ||
        `${citation.sourceUnitType || "unit"}:${citation.sourceUnitNumber || citation.index}`
      if (seenCitationKey.has(key)) return false
      seenCitationKey.add(key)
      return true
    })
    const orderedCitations = [...curatedCitations].sort((a, b) => {
      const left =
        typeof a.sourceUnitNumber === "number" ? a.sourceUnitNumber : Number.MAX_SAFE_INTEGER
      const right =
        typeof b.sourceUnitNumber === "number" ? b.sourceUnitNumber : Number.MAX_SAFE_INTEGER
      return left - right
    })
    const artifactCitations = orderedCitations.filter((citation) => {
      const candidate = citation.snippet || citation.title || ""
      return !isLikelyNonBodySnippet(candidate)
    })
    const bibliography = includeReferences
      ? formatBibliography(artifactCitations.slice(0, maxSources), citationStyle).map((entry) => ({
          index: entry.index,
          entry: entry.entry,
        }))
      : []
    const maxObservedPage = Math.max(
      0,
      ...artifactCitations
        .map((citation) =>
          typeof citation.sourceUnitNumber === "number" ? citation.sourceUnitNumber : 0
        )
    )
    const isTextbookScale =
      /\b(textbook|chapter|book|manual|handbook)\b/i.test(input.query) ||
      structureInspection?.textbookScale === true ||
      maxObservedPage >= 80 ||
      orderedCitations.length >= 8
    const keyPointLimit = isTextbookScale ? 6 : 7
    const studyStepLimit = isTextbookScale ? 6 : 5
    const recallLimit = isTextbookScale ? 5 : 4
    const evidenceLimit = isTextbookScale ? 8 : 6

    const summaryParagraph =
      artifactCitations.length > 0
        ? `This ${documentShape.replace("-", " ")} synthesizes "${input.query}" using structured retrieval across ${Math.max(1, targetedSections.length)} topic blocks from your uploaded material.`
        : `No high-confidence excerpts were found for "${input.query}". Upload a more relevant document or refine your query for better coverage.`

    const executiveSnapshot =
      artifactCitations.length > 0
        ? targetedSections.length > 0
          ? targetedSections
              .slice(0, 4)
              .map((section) => {
                const sectionCitations = sectionCitationMap.get(section.label) || []
                const leadCitation = sectionCitations[0]
                const snippet = cleanSnippetForArtifact(
                  leadCitation?.snippet || section.label,
                  160
                )
                if (!snippet) return null
                const location =
                  typeof section.sourcePageStart === "number" &&
                    typeof section.sourcePageEnd === "number"
                    ? ` (Pages ${section.sourcePageStart}-${section.sourcePageEnd})`
                    : typeof section.sourcePageStart === "number"
                      ? ` (Page ${section.sourcePageStart})`
                      : typeof section.page === "number" && section.page > 0
                        ? ` (Printed page ${section.page})`
                        : leadCitation?.pageLabel
                          ? ` (${leadCitation.pageLabel})`
                          : ""
                const cite =
                  includeReferences && leadCitation
                    ? ` ${formatInlineCitation(leadCitation, citationStyle)}`
                    : ""
                return `- ${snippet}${location}${cite}`
              })
              .filter((line): line is string => Boolean(line))
              .join("\n")
          : artifactCitations
              .slice(0, Math.min(4, artifactCitations.length))
              .map((citation) => {
                const snippet = cleanSnippetForArtifact(
                  citation.snippet || citation.title || "",
                  160
                )
                if (!snippet) return null
                const location = citation.pageLabel ? ` (${citation.pageLabel})` : ""
                const cite = includeReferences
                  ? ` ${formatInlineCitation(citation, citationStyle)}`
                  : ""
                return `- ${snippet}${location}${cite}`
              })
              .filter((line): line is string => Boolean(line))
              .join("\n")
        : "- No concise highlights were extracted from the current material."

    const keyPoints =
      artifactCitations.length > 0
        ? targetedSections.length > 0
          ? buildSectionPriorityList(
              targetedSections.slice(0, keyPointLimit),
              includeReferences,
              sectionCitationMap,
              citationStyle,
              keyPointLimit
            )
          : artifactCitations
              .slice(0, keyPointLimit)
              .map((citation) => {
                const snippet = cleanSnippetForArtifact(
                  citation.snippet || citation.title || "",
                  200
                )
                if (!snippet) return null
                const location = citation.pageLabel ? ` (${citation.pageLabel})` : ""
                const cite = includeReferences
                  ? ` ${formatInlineCitation(citation, citationStyle)}`
                  : ""
                return `- ${snippet}${location}${cite}`
              })
              .filter((line): line is string => Boolean(line))
              .join("\n")
        : "- No directly relevant excerpt was extracted from the selected upload."

    const studyPlanSection =
      artifactCitations.length > 0
        ? targetedSections.length > 0
          ? targetedSections
              .slice(0, studyStepLimit)
              .map((section, index) => {
                const location =
                  typeof section.sourcePageStart === "number" &&
                    typeof section.sourcePageEnd === "number"
                    ? ` (Pages ${section.sourcePageStart}-${section.sourcePageEnd})`
                    : typeof section.sourcePageStart === "number"
                      ? ` (Page ${section.sourcePageStart})`
                      : typeof section.page === "number" && section.page > 0
                        ? ` (Printed page ${section.page})`
                        : ""
                const leadCitation = (sectionCitationMap.get(section.label) || [])[0]
                const cite =
                  includeReferences && leadCitation
                    ? ` ${formatInlineCitation(leadCitation, citationStyle)}`
                    : ""
                return `${index + 1}. Review ${section.label}${location}; summarize the mechanism, clinical relevance, and one exam trap.${cite}`
              })
              .join("\n")
          : artifactCitations
              .slice(0, studyStepLimit)
              .map((citation, index) => {
                const location = citation.pageLabel ? ` (${citation.pageLabel})` : ""
                const cite = includeReferences
                  ? ` ${formatInlineCitation(citation, citationStyle)}`
                  : ""
                return `${index + 1}. Review ${citation.title || "core concept"}${location}; capture 3 takeaways and one clinical pearl.${cite}`
              })
              .join("\n")
        : "1. Review the uploaded material once for broad orientation.\n2. Build concise notes by theme.\n3. Re-test yourself with short recall prompts."

    const recallPrompts =
      artifactCitations.length > 0
        ? targetedSections.length > 0
          ? targetedSections
              .slice(0, recallLimit)
              .map((section, index) => {
                const leadCitation = (sectionCitationMap.get(section.label) || [])[0]
                const seed = cleanSnippetForArtifact(
                  leadCitation?.snippet || section.label,
                  120
                )
                return `- Q${index + 1}: Teach back "${section.label}" in your own words and cite the key page clue -> ${seed}`
              })
              .join("\n")
          : artifactCitations
              .slice(0, recallLimit)
              .map((citation, index) => {
                const seed = cleanSnippetForArtifact(
                  citation.snippet || citation.title || "",
                  120
                )
                return `- Q${index + 1}: Explain this concept in your own words -> ${seed}`
              })
              .join("\n")
        : "- Define the key syndrome patterns from this topic.\n- List first-line management options and contraindications."

    const evidenceReview =
      artifactCitations.length > 0
        ? targetedSections.length > 0
          ? targetedSections
              .slice(0, evidenceLimit)
              .map((section, idx) => {
                const sectionCitations = sectionCitationMap.get(section.label) || []
                const heading = `### Section ${idx + 1}: ${section.label}`
                const body = synthesizeSectionHighlights(
                  section.label,
                  sectionCitations,
                  includeReferences,
                  citationStyle,
                  3
                )
                return `${heading}\n${body}`
              })
              .join("\n\n")
          : artifactCitations
              .slice(0, evidenceLimit)
              .map((citation, idx) => {
                const heading = `### Source ${idx + 1}: ${citation.title || "Untitled source"}`
                const body =
                  cleanSnippetForArtifact(citation.snippet || citation.title || "", 300) ||
                  "No snippet available."
                const location = citation.pageLabel ? `\n- Location: ${citation.pageLabel}` : ""
                const marker = includeReferences
                  ? `\n- Citation: ${formatInlineCitation(citation, citationStyle)}`
                  : ""
                return `${heading}\n- Summary: ${body}${location}${marker}`
              })
              .join("\n\n")
        : "No evidence excerpts were available to build this section."

    const traceabilityCitations =
      targetedSections.length > 0
        ? targetedSections
            .flatMap((section) => sectionCitationMap.get(section.label) || [])
            .filter((citation, index, array) => {
              const key =
                citation.chunkId ||
                citation.sourceUnitId ||
                `${citation.sourceUnitType || "unit"}:${citation.sourceUnitNumber || citation.index}`
              return array.findIndex((candidate) => {
                const candidateKey =
                  candidate.chunkId ||
                  candidate.sourceUnitId ||
                  `${candidate.sourceUnitType || "unit"}:${candidate.sourceUnitNumber || candidate.index}`
                return candidateKey === key
              }) === index
            })
        : artifactCitations
    const referencesHeading = includeReferences
      ? `References (${citationStyle.toUpperCase()})`
      : "Source Traceability"
    const referenceSection =
      bibliography.length > 0
        ? bibliography.map((entry) => `${entry.index}. ${entry.entry}`).join("\n")
        : traceabilityCitations.length > 0
          ? traceabilityCitations
              .slice(0, 10)
              .map((citation, index) => {
                const location = citation.pageLabel ? ` (${citation.pageLabel})` : ""
                return `${index + 1}. ${citation.title || "Uploaded source"}${location}`
              })
              .join("\n")
          : "No references available."

    const titleSuffix =
      documentShape === "study-plan"
        ? "Study Plan"
        : documentShape === "study-notes"
          ? "Study Notes"
          : documentShape === "summary"
            ? "Summary"
            : "Review"
    const title = uploadTitle
      ? `${uploadTitle} - ${titleSuffix}`
      : `${titleSuffix} - ${input.query.slice(0, 72)}`

    const shapeSpecificSections: DocumentArtifact["sections"] =
      documentShape === "study-plan"
        ? [
            { heading: "Executive Snapshot", content: executiveSnapshot },
            { heading: "Learning Goal", content: summaryParagraph },
            { heading: "Priority Topics", content: keyPoints },
            { heading: "Step-by-Step Study Plan", content: studyPlanSection },
            { heading: "Active Recall Prompts", content: recallPrompts },
          ]
        : documentShape === "study-notes"
          ? [
              { heading: "Executive Snapshot", content: executiveSnapshot },
              { heading: "Topic Overview", content: summaryParagraph },
              { heading: "High-Yield Notes", content: keyPoints },
              { heading: "Source Highlights", content: evidenceReview },
            ]
          : documentShape === "summary"
            ? [
                { heading: "Executive Snapshot", content: executiveSnapshot },
                { heading: "Summary", content: summaryParagraph },
                { heading: "Key Takeaways", content: keyPoints },
                { heading: "Source Highlights", content: evidenceReview },
              ]
            : [
                { heading: "Executive Snapshot", content: executiveSnapshot },
                { heading: "Executive Summary", content: summaryParagraph },
                { heading: "Key Points", content: keyPoints },
                { heading: "Evidence Review", content: evidenceReview },
              ]

    const validatedShapeSections = shapeSpecificSections
      .map((section) => ({
        ...section,
        content: filterArtifactSectionContent(section.content),
      }))
      .filter((section) => section.content.trim().length > 0)
    if (validatedShapeSections.length < shapeSpecificSections.length) {
      sectionWarnings.push(
        "Artifact quality gate removed non-body snippets (TOC/front matter/index/reference noise)."
      )
    }
    const sections = [...validatedShapeSections, { heading: referencesHeading, content: referenceSection }]

    const markdownBody = sections
      .map((section) => `## ${section.heading}\n${section.content}`)
      .join("\n\n")
    const markdown = `# ${title}\n\n${markdownBody}\n`
    const warningSet = new Set<string>([
      ...search.warnings,
      ...sectionWarnings,
      ...(structureInspection?.warnings ?? []),
    ])
    if (search.metrics.retrievalConfidence === "low") {
      warningSet.add("Retrieval confidence is low; refine your topic or page range for stronger grounding.")
    }
    if (structureInspection && structureInspection.confidence === "low") {
      warningSet.add("Upload structure map confidence is low; consider specifying chapter/page scope.")
    }

    return {
      artifactType: "document",
      artifactId: crypto.randomUUID(),
      title,
      query: input.query,
      citationStyle,
      includeReferences,
      markdown,
      sections,
      bibliography,
      citations: traceabilityCitations.slice(0, Math.max(maxSources + 4, 8)),
      warnings: Array.from(warningSet),
      uploadId,
      uploadTitle,
      generatedAt: new Date().toISOString(),
    }
  }

  async generateQuizFromUpload(input: GenerateQuizFromUploadInput): Promise<QuizArtifact> {
    const requestedQuestionCount = clamp(input.questionCount ?? 5, 3, 10)
    const topicContext = normalizeTopicContext(input.topicContext)
    const normalizedQuery = sanitizeArtifactText(input.query)
    const queryTokenCount = normalizedQuery.split(/\s+/).filter(Boolean).length
    const hasExplicitScopeCue =
      /\b(topic|chapter|section|focus(?:ed)?\s+on|about|regarding|pages?|pp?\.?)\b/i.test(
        normalizedQuery
      )
    const settings = parseQuizGenerationSettings(input.query, requestedQuestionCount)
    const effectiveQuery =
      queryTokenCount <= 8 && !hasExplicitScopeCue && topicContext.activeTopic
        ? `${normalizedQuery} ${topicContext.activeTopic}`.trim()
        : normalizedQuery || input.query
    const structureInspection = await this.inspectUploadStructure({
      userId: input.userId,
      uploadId: input.uploadId || topicContext.lastUploadId || undefined,
      topicContext,
    })
    const structureTopicHint =
      !hasExplicitScopeCue && structureInspection.topicMap.length > 0
        ? cleanSnippetForArtifact(structureInspection.topicMap[0]?.label || "", 90)
        : ""
    const retrievalQuery =
      structureTopicHint &&
      !effectiveQuery.toLowerCase().includes(structureTopicHint.toLowerCase())
        ? `${effectiveQuery}\nTopic: ${structureTopicHint}`
        : effectiveQuery
    const quizFocus = settings.scopeLabel || extractQuizFocusFromQuery(retrievalQuery)
    const search = await this.uploadContextSearch({
      userId: input.userId,
      query: retrievalQuery,
      uploadId: input.uploadId || topicContext.lastUploadId || undefined,
      apiKey: input.apiKey,
      embeddingApiKey: input.embeddingApiKey,
      mode: "auto",
      topK: Math.max(settings.questionCount * 4, 12),
      includeNeighborPages: typeof settings.pageStart === "number" ? 0 : 1,
      topicContext,
      maxDurationMs: 3000,
    })

    const warningSet = new Set<string>([
      ...search.warnings,
      ...(structureInspection.warnings ?? []),
    ])
    if (structureInspection.confidence === "low") {
      warningSet.add("Structure inspection confidence is low; explicit topic or page scope will improve quiz quality.")
    }

    const citations = search.citations
      .map((citation) => ({
        ...citation,
        snippet:
          pickFocusedExcerpt(citation.snippet || citation.title || "", retrievalQuery, 280) ||
          citation.snippet ||
          citation.title ||
          "",
      }))
      .filter((citation) => {
        const candidate = citation.snippet || citation.title || ""
        return !isLikelyNonBodySnippet(candidate)
      })
      .sort(
        (a, b) =>
          scoreQuizCitationFit(b, settings, retrievalQuery) -
          scoreQuizCitationFit(a, settings, retrievalQuery)
      )
      .slice(0, Math.max(settings.questionCount * 4, 16))

    if (citations.length === 0) {
      throw new Error("I couldn't find grounded passages for a reliable quiz. Please specify a topic or page range.")
    }

    const statementPoolRaw = citations
      .flatMap((citation) => {
        const extractedFacts = extractQuizFactsFromCitation(
          citation,
          settings.difficulty === "hard" ? 3 : 2
        )
        const facts =
          extractedFacts.length > 0
            ? extractedFacts
            : [normalizeQuizOptionText(buildQuizStatementFromCitation(citation), 260)]
        return facts.map((statement) => ({
          citation,
          statement: normalizeQuizOptionText(statement, 260),
          topicKey: normalizeQuizTopicKey(citation.snippet || citation.title || statement),
          score: scoreQuizCitationFit(citation, settings, retrievalQuery),
        }))
      })
      .filter((item) => item.statement.length > 24)
      .filter((item) => !isWeakQuizStatement(item.statement))
      .filter((item) =>
        isVerifiedQuizCandidate(item.citation, item.statement, settings, retrievalQuery)
      )
    const seenStatement = new Set<string>()
    const statementPool = statementPoolRaw.filter((item) => {
      const key = normalizeQuizTopicKey(item.statement)
      if (!key || seenStatement.has(key)) return false
      seenStatement.add(key)
      return true
    }).sort((a, b) => b.score - a.score)

    const fallbackOptions = [
      normalizeQuizOptionText(
        `The uploaded material presents a related interpretation of ${quizFocus} that differs in mechanism.`,
        220
      ),
      normalizeQuizOptionText(
        `The uploaded material links this topic to a different diagnostic emphasis than the cited excerpt.`,
        220
      ),
      normalizeQuizOptionText(
        `The uploaded material prioritizes a different management framing for this topic.`,
        220
      ),
      normalizeQuizOptionText(
        `The uploaded material places this finding in an alternative clinical context.`,
        220
      ),
    ]

    const diverseQuestionSource: Array<{
      citation: EvidenceCitation
      statement: string
      topicKey: string
      score: number
    }> = []
    const seenTopicKeys = new Set<string>()
    for (const candidate of statementPool) {
      if (diverseQuestionSource.length >= settings.questionCount) break
      if (!candidate.topicKey || seenTopicKeys.has(candidate.topicKey)) continue
      seenTopicKeys.add(candidate.topicKey)
      diverseQuestionSource.push(candidate)
    }
    for (const candidate of statementPool) {
      if (diverseQuestionSource.length >= settings.questionCount) break
      if (!diverseQuestionSource.some((existing) => existing.statement === candidate.statement)) {
        diverseQuestionSource.push(candidate)
      }
    }
    const questionSource =
      diverseQuestionSource.length > 0
        ? diverseQuestionSource
        : citations.slice(0, settings.questionCount).map((citation) => {
            const statement = normalizeQuizOptionText(
              citation.snippet || citation.title || "Core concept from the uploaded material.",
              260
            )
            return {
              citation,
              statement,
              topicKey: normalizeQuizTopicKey(statement),
              score: scoreQuizCitationFit(citation, settings, retrievalQuery),
            }
          })

    const questionDrafts = questionSource
      .map((item, index) => {
      const citation = item.citation
      const correct = item.statement
      const peerStatements = statementPool
        .filter(
          (candidate) =>
            candidate.statement !== correct &&
            candidate.topicKey !== item.topicKey
        )
        .sort((a, b) => b.score - a.score)
      const distractorCandidates = peerStatements.map((candidate) => candidate.statement)
      const backupDistractors = statementPool
        .map((candidate) => candidate.statement)
        .filter((candidate) => candidate !== correct)
      const orderedDistractors = [...distractorCandidates, ...backupDistractors]
      const uniqueDistractors = Array.from(new Set(orderedDistractors))
      const distractorOffset =
        uniqueDistractors.length > 0 ? (index * 2) % uniqueDistractors.length : 0
      const rotatedDistractors = uniqueDistractors
        .slice(distractorOffset)
        .concat(uniqueDistractors.slice(0, distractorOffset))
      const selectedDistractors: string[] = []
      const considerDistractor = (candidate: string) => {
        const normalized = normalizeQuizOptionText(candidate, 220)
        if (
          isValidDistractorCandidate(citation, normalized, correct, settings, retrievalQuery) &&
          !selectedDistractors.includes(normalized)
        ) {
          selectedDistractors.push(normalized)
        }
      }
      rotatedDistractors.forEach((candidate) => {
        if (selectedDistractors.length < 3) {
          considerDistractor(candidate)
        }
      })
      for (let fillIndex = 0; selectedDistractors.length < 3; fillIndex += 1) {
        const syntheticDistractor =
          fillIndex % 2 === 0
            ? createPlausibleDistractor(correct, quizFocus, citation.title || "")
            : fallbackOptions[(index + fillIndex) % fallbackOptions.length]
        considerDistractor(syntheticDistractor)
        if (fillIndex > 8) break
      }
      if (selectedDistractors.length < 3) {
        for (const fallback of fallbackOptions) {
          if (selectedDistractors.length >= 3) break
          considerDistractor(fallback)
        }
      }
      if (selectedDistractors.length < 3) {
        return null
      }
      const uniqueOptions = [correct, ...selectedDistractors.slice(0, 3)]

      const rotation = index % uniqueOptions.length
      const rotatedOptions = uniqueOptions.slice(rotation).concat(uniqueOptions.slice(0, rotation))
      const correctOptionIndex = rotatedOptions.findIndex((value) => value === correct)
      const explanationSnippet = cleanSnippetForArtifact(citation.snippet || citation.title || "", 220)
      const inline = formatInlineCitation(citation, "vancouver")
      const explanation = explanationSnippet
        ? `Supported by ${citation.pageLabel || "the uploaded material"}: "${explanationSnippet}" ${inline} The distractors were not directly supported by the cited excerpt.`
        : `This choice directly reflects the cited uploaded excerpt ${inline}.`
      const styleForQuestion: QuizQuestionStyle =
        settings.style === "mixed"
          ? index % 2 === 0
            ? "single_best_answer"
            : "clinical_application"
          : settings.style

      return {
        question: {
          id: `quiz-q-${index + 1}`,
          prompt: buildQuizPromptFromCitation(citation, quizFocus, correct, styleForQuestion),
          options: rotatedOptions,
          correctOptionIndex: correctOptionIndex >= 0 ? correctOptionIndex : 0,
          explanation,
          citationIndices: [citation.index],
        },
        citation,
        verificationScore: scoreQuizCitationFit(citation, settings, retrievalQuery),
      }
    })
      .filter(
        (
          draft
        ): draft is {
          question: QuizArtifactQuestion
          citation: EvidenceCitation
          verificationScore: number
        } => draft !== null
      )

    const verifiedQuestionDrafts = questionDrafts
      .filter((draft) =>
        isVerifiedQuizCandidate(
          draft.citation,
          draft.question.options[draft.question.correctOptionIndex] || "",
          settings,
          retrievalQuery
        )
      )
      .sort((a, b) => b.verificationScore - a.verificationScore)

    if (verifiedQuestionDrafts.length < settings.questionCount) {
      warningSet.add(
        `Only ${verifiedQuestionDrafts.length} strongly grounded question${verifiedQuestionDrafts.length === 1 ? "" : "s"} passed quiz verification.`
      )
    }

    const finalizedDrafts = verifiedQuestionDrafts.slice(0, settings.questionCount)
    if (finalizedDrafts.length === 0) {
      throw new Error("I couldn't verify enough grounded questions. Please narrow the topic or specify pages.")
    }

    const finalizedCitationPool = dedupeQuizCitations(
      finalizedDrafts.map((draft) => draft.citation)
    )
    const citationIndexMap = new Map<number, number>()
    finalizedCitationPool.forEach((citation) => {
      const original = finalizedDrafts.find(
        (draft) =>
          draft.citation.url === citation.url ||
          draft.citation.chunkId === citation.chunkId ||
          draft.citation.title === citation.title
      )?.citation.index
      if (typeof original === "number") {
        citationIndexMap.set(original, citation.index)
      }
    })

    const questions: QuizArtifactQuestion[] = finalizedDrafts.map((draft) => ({
      ...draft.question,
      citationIndices: draft.question.citationIndices.map(
        (index) => citationIndexMap.get(index) || index
      ),
    }))

    const uploadId =
      finalizedCitationPool[0]?.uploadId ??
      citations[0]?.uploadId ??
      input.uploadId ??
      search.topicContext.lastUploadId ??
      null
    const uploadTitle =
      finalizedCitationPool[0]?.uploadFileName ||
      citations[0]?.uploadFileName ||
      finalizedCitationPool[0]?.sourceLabel ||
      citations[0]?.sourceLabel ||
      (uploadId ? (await this.getUploadListItem(input.userId, uploadId))?.title : null) ||
      null

    if (search.metrics.retrievalConfidence !== "high") {
      warningSet.add(
        "Quiz grounding may improve if you specify a narrower topic or explicit page range."
      )
    }
    if (finalizedCitationPool.length < questions.length) {
      warningSet.add("Some questions share the same source excerpt; narrower scope should improve coverage.")
    }

    return {
      artifactType: "quiz",
      artifactId: crypto.randomUUID(),
      title: uploadTitle ? `${uploadTitle} - Quiz` : `Quiz - ${retrievalQuery.slice(0, 72)}`,
      query: retrievalQuery,
      questions,
      citations: finalizedCitationPool,
      warnings: Array.from(warningSet),
      uploadId,
      uploadTitle,
      generatedAt: new Date().toISOString(),
    }
  }

  private async buildUploadListItem(upload: UploadRow): Promise<UserUploadListItem> {
    const supabase = await this.getSupabase()
    const [unitCountResult, figureCountResult, jobResult] = await Promise.all([
      (supabase as any)
        .from("user_upload_source_units")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", upload.id),
      (supabase as any)
        .from("user_upload_assets")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", upload.id)
        .eq("asset_type", "figure"),
      (supabase as any)
        .from("upload_ingestion_jobs")
        .select("id, status, attempt_count, error_message, updated_at, metadata")
        .eq("upload_id", upload.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const previewUrl =
      upload.status === "completed" && (upload.upload_kind === "pdf" || upload.upload_kind === "image")
        ? await this.safeCreateSignedUrl(upload.storage_bucket, upload.original_file_path)
        : null

    return {
      id: upload.id,
      title: upload.title,
      description: upload.description,
      fileName: upload.file_name,
      mimeType: upload.mime_type,
      fileSize: upload.file_size,
      uploadKind: upload.upload_kind,
      status: upload.status,
      createdAt: upload.created_at,
      updatedAt: upload.updated_at,
      lastError: upload.last_error,
      previewUrl,
      previewLabel:
        upload.upload_kind === "pdf"
          ? "Cover"
          : upload.upload_kind === "image"
            ? "Image"
            : null,
      sourceUnitCount: unitCountResult.count ?? 0,
      figureCount: figureCountResult.count ?? 0,
      latestJob: jobResult.data
        ? {
            id: jobResult.data.id,
            status: jobResult.data.status,
            attemptCount: jobResult.data.attempt_count,
            errorMessage: jobResult.data.error_message,
            updatedAt: jobResult.data.updated_at,
            progressStage: jobResult.data.metadata?.progressStage ?? null,
            progressPercent:
              typeof jobResult.data.metadata?.progressPercent === "number"
                ? jobResult.data.metadata.progressPercent
                : null,
          }
        : null,
    }
  }

  private async safeCreateSignedUrl(bucket: string, path: string) {
    const supabase = await this.getSupabase()
    const signed = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    if (signed.error) {
      return null
    }
    return signed.data.signedUrl
  }

  private async buildVisualReference(asset: any, sourceUnit: any): Promise<UploadVisualReference | null> {
    if (!asset?.file_path) return null
    const signedUrl = await this.safeCreateSignedUrl(asset.storage_bucket || USER_UPLOAD_BUCKET, asset.file_path)
    if (!signedUrl) return null
    return {
      assetId: asset.id,
      type: asset.asset_type,
      label: asset.label || formatSourceLabel(sourceUnit.unit_type, sourceUnit.unit_number),
      caption: asset.caption,
      signedUrl,
      fullUrl: signedUrl,
      contentType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      storageBucket: asset.storage_bucket || USER_UPLOAD_BUCKET,
      filePath: asset.file_path,
      sourceUnitId: sourceUnit.id,
      sourceUnitType: sourceUnit.unit_type,
      sourceUnitNumber: sourceUnit.unit_number,
    }
  }

  private async updateJobProgress(
    jobId: string,
    stage: IngestionProgressStage,
    progressPercent: number,
    metadata?: Record<string, unknown>
  ) {
    try {
      const supabase = await this.getSupabase()
      await (supabase as any)
        .from("upload_ingestion_jobs")
        .update({
          status: stage === "ready" ? "completed" : stage === "failed" ? "failed" : "processing",
          metadata: {
            progressStage: stage,
            progressPercent,
            ...(metadata || {}),
          },
        })
        .eq("id", jobId)
    } catch (error) {
      console.warn(
        "[Uploads] Progress update skipped:",
        errorMessageFromUnknown(error)
      )
    }
  }

  private async assertUploadStillExists(uploadId: string) {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from("user_uploads")
      .select("id")
      .eq("id", uploadId)
      .maybeSingle()

    if (error) {
      throw new Error(`Unable to verify upload state: ${error.message}`)
    }
    if (!data) {
      throw new Error("Upload deleted during processing")
    }
  }

  private async ingestUploadRecord(
    uploadId: string,
    buffer: Buffer,
    jobId: string,
    options?: { reprocess?: boolean; resume?: boolean }
  ) {
    const supabase = await this.getSupabase()
    const { data: upload, error } = await (supabase as any)
      .from("user_uploads")
      .select("*")
      .eq("id", uploadId)
      .single()

    if (error || !upload) {
      throw new Error(`Failed to load upload record: ${error?.message ?? "Unknown error"}`)
    }

    await Promise.all([
      (supabase as any)
        .from("user_uploads")
        .update({
          status: "processing",
          last_error: null,
        })
        .eq("id", uploadId),
      (supabase as any)
        .from("upload_ingestion_jobs")
        .update({
          status: "processing",
          attempt_count: 1,
          started_at: new Date().toISOString(),
          error_message: null,
          metadata: {
            progressStage: "extracting_pages",
            progressPercent: 12,
          },
        })
        .eq("id", jobId),
    ])

    try {
      const shouldReset = options?.reprocess === true && options?.resume !== true
      if (shouldReset) {
        await Promise.all([
          (supabase as any).from("user_upload_chunk_assets").delete().eq("chunk_id", "__never__"),
          (supabase as any).from("user_upload_chunks").delete().eq("upload_id", uploadId),
          (supabase as any).from("user_upload_assets").delete().eq("upload_id", uploadId),
          (supabase as any).from("user_upload_source_units").delete().eq("upload_id", uploadId),
        ])
      }

      const parsed = await parseUploadDocument({
        buffer,
        title: upload.title,
        fileName: upload.file_name,
        mimeType: upload.mime_type,
      })

      await this.updateJobProgress(jobId, "chunking", 34, {
        kind: parsed.kind,
        sourceUnitCount: parsed.sourceUnits.length,
      })

      const createdSourceUnits: Array<{
        id: string
        unit: ParsedSourceUnit
        previewAssetId: string | null
        figureAssetIds: string[]
      }> = []

      const totalUnits = Math.max(1, parsed.sourceUnits.length)
      const sourceUnitPayloads = parsed.sourceUnits.map((unit) => ({
        upload_id: uploadId,
        user_id: upload.user_id,
        unit_type: unit.unitType,
        unit_number: unit.unitNumber,
        title: unit.title || null,
        extracted_text: unit.extractedText || "",
        preview_bucket: null,
        preview_path: null,
        preview_mime_type: null,
        width: unit.width ?? null,
        height: unit.height ?? null,
        ocr_status: unit.ocrStatus || "not_required",
        metadata: unit.metadata || {},
      }))

      const sourceUnitIdByKey = new Map<string, string>()
      const sourceUnitBatchSize = 120
      for (let start = 0; start < sourceUnitPayloads.length; start += sourceUnitBatchSize) {
        const end = Math.min(start + sourceUnitBatchSize, sourceUnitPayloads.length)
        const payloadBatch = sourceUnitPayloads.slice(start, end)
        const { data: sourceUnitBatch, error: sourceUnitBatchError } = await (supabase as any)
          .from("user_upload_source_units")
          .upsert(payloadBatch, { onConflict: "upload_id,unit_type,unit_number" })
          .select("id, unit_type, unit_number")

        if (sourceUnitBatchError || !Array.isArray(sourceUnitBatch)) {
          throw new Error(
            `Failed to insert source units batch: ${sourceUnitBatchError?.message ?? "Unknown error"}`
          )
        }

        for (const row of sourceUnitBatch) {
          sourceUnitIdByKey.set(`${row.unit_type}:${row.unit_number}`, row.id)
        }

        await this.assertUploadStillExists(uploadId)
        const chunkingProgress = 34 + Math.round((end / totalUnits) * 28)
        await this.updateJobProgress(jobId, "chunking", Math.min(62, chunkingProgress), {
          kind: parsed.kind,
          sourceUnitCount: end,
          processedUnits: end,
          totalUnits,
        })
      }

      for (const unit of parsed.sourceUnits) {
        const sourceUnitId = sourceUnitIdByKey.get(`${unit.unitType}:${unit.unitNumber}`)
        if (!sourceUnitId) {
          throw new Error(`Unable to resolve source unit id for ${unit.unitType} ${unit.unitNumber}`)
        }
        createdSourceUnits.push({
          id: sourceUnitId,
          unit,
          previewAssetId: null,
          figureAssetIds: [],
        })
      }

      await this.updateJobProgress(jobId, "chunking", 62, {
        kind: parsed.kind,
        sourceUnitCount: createdSourceUnits.length,
      })

      let globalChunkIndex = 0
      const chunkSeed = createdSourceUnits.flatMap(({ id, unit, previewAssetId, figureAssetIds }) => {
        const candidates = chunkText(unit.extractedText).map((chunk) => ({
          chunk,
          quality: scoreChunkQuality(chunk.text),
        }))
        const preferred = candidates.filter((item) => isChunkQualityAcceptable(item.quality))
        const selected =
          preferred.length > 0
            ? preferred
            : candidates
                .filter((item) => item.quality.charCount >= 45)
                .sort((a, b) => b.quality.score - a.quality.score)
                .slice(0, Math.min(4, candidates.length))
        const fallbackSelected = selected.length > 0 ? selected : candidates.slice(0, Math.min(1, candidates.length))

        return fallbackSelected.map(({ chunk, quality }, index) => ({
          upload_id: uploadId,
          user_id: upload.user_id,
          source_unit_id: id,
          preview_asset_id: previewAssetId,
          chunk_index: globalChunkIndex++,
          chunk_text: chunk.text,
          source_offset_start: chunk.start,
          source_offset_end: chunk.end,
          metadata: {
            unitType: unit.unitType,
            unitNumber: unit.unitNumber,
            unitChunkIndex: index,
            figureAssetIds,
            chunkQualityScore: quality.score,
            chunkQuality: quality,
          },
          figureAssetIds,
        }))
      })

      const embeddings: Array<number[] | null> = new Array(chunkSeed.length).fill(null)
      if (chunkSeed.length > 0) {
        await this.updateJobProgress(jobId, "embedding", 82, {
          kind: parsed.kind,
          sourceUnitCount: createdSourceUnits.length,
          chunkCount: chunkSeed.length,
        })

        try {
          const allEmbeddings = await generateEmbeddings(
            chunkSeed.map((chunk) => chunk.chunk_text),
            process.env.OPENAI_API_KEY,
            {
              batchSize: 192,
              parallelBatches: 4,
            }
          )
          for (let index = 0; index < allEmbeddings.length; index += 1) {
            embeddings[index] = allEmbeddings[index]
          }
        } catch {
          // Keep null embeddings and continue so ingestion can still complete.
        }

        await this.updateJobProgress(jobId, "embedding", 96, {
          kind: parsed.kind,
          sourceUnitCount: createdSourceUnits.length,
          chunkCount: chunkSeed.length,
          embeddedChunks: chunkSeed.length,
          totalChunks: chunkSeed.length,
        })
      }

      const chunkBatchSize = 220
      const totalChunkBatches = Math.max(1, Math.ceil(Math.max(1, chunkSeed.length) / chunkBatchSize))
      for (let start = 0; start < chunkSeed.length; start += chunkBatchSize) {
        const end = Math.min(start + chunkBatchSize, chunkSeed.length)
        const chunkBatchPayload = chunkSeed.slice(start, end).map((chunk, indexWithinBatch) => ({
          upload_id: chunk.upload_id,
          user_id: chunk.user_id,
          source_unit_id: chunk.source_unit_id,
          preview_asset_id: null,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.chunk_text,
          source_offset_start: chunk.source_offset_start,
          source_offset_end: chunk.source_offset_end,
          embedding: embeddings[start + indexWithinBatch] ?? null,
          metadata: chunk.metadata,
        }))

        let batchInserted = false
        let lastChunkBatchError: unknown = null
        for (let attempt = 1; attempt <= 4; attempt += 1) {
          try {
            const { error: chunkBatchError } = await (supabase as any)
              .from("user_upload_chunks")
              .upsert(chunkBatchPayload, { onConflict: "upload_id,chunk_index" })
            if (!chunkBatchError) {
              batchInserted = true
              break
            }
            lastChunkBatchError = chunkBatchError
            if (!isTransientUploadError(chunkBatchError) || attempt === 4) {
              break
            }
          } catch (error) {
            lastChunkBatchError = error
            if (!isTransientUploadError(error) || attempt === 4) {
              break
            }
          }
          await sleep(220 * attempt)
        }

        if (!batchInserted) {
          throw new Error(`Failed to insert chunk batch: ${errorMessageFromUnknown(lastChunkBatchError)}`)
        }

        await this.assertUploadStillExists(uploadId)
        const chunkBatchIndex = Math.floor(start / chunkBatchSize) + 1
        const insertProgress = 96 + Math.round((chunkBatchIndex / totalChunkBatches) * 3)
        await this.updateJobProgress(jobId, "embedding", Math.min(99, insertProgress), {
          kind: parsed.kind,
          sourceUnitCount: createdSourceUnits.length,
          chunkCount: chunkSeed.length,
          insertedChunks: end,
          totalChunks: chunkSeed.length,
        })
      }

      await (supabase as any)
        .from("user_upload_chunks")
        .delete()
        .eq("upload_id", uploadId)
        .gte("chunk_index", chunkSeed.length)

      await Promise.all([
        (supabase as any)
          .from("user_uploads")
          .update({
            status: "completed",
            last_error: null,
            last_ingested_at: new Date().toISOString(),
            parser_version: USER_UPLOAD_PARSER_VERSION,
            metadata: parsed.metadata,
          })
          .eq("id", uploadId),
        (supabase as any)
          .from("upload_ingestion_jobs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            metadata: {
              progressStage: "ready",
              progressPercent: 100,
              sourceUnitCount: parsed.sourceUnits.length,
              chunkCount: chunkSeed.length,
            },
          })
          .eq("id", jobId),
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error"
      await Promise.all([
        (supabase as any)
          .from("user_uploads")
          .update({
            status: "failed",
            last_error: message,
          })
          .eq("id", uploadId),
        (supabase as any)
          .from("upload_ingestion_jobs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: message,
            metadata: {
              progressStage: "failed",
              progressPercent: 100,
            },
          })
          .eq("id", jobId),
      ])
      throw error
    }
  }
}
