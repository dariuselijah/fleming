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
  }
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
  maxSources?: number
}

export type GenerateQuizFromUploadInput = {
  userId: string
  query: string
  uploadId?: string
  apiKey?: string
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
  const sentence = extractQuizSentences(snippet)[0] || cleanSnippetForArtifact(snippet, 160)
  const fallback = cleanSnippetForArtifact(citation.title || "Key concept from the uploaded material", 140)
  const base = sentence || fallback
  if (!base) return "The uploaded material emphasizes a key concept in this topic."
  return /[.!?]$/.test(base) ? base : `${base}.`
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
  query: string,
  statement: string
): string {
  const topicSeed = cleanSnippetForArtifact(citation.title || query || statement, 70)
  return `Which statement best matches the uploaded material about "${topicSeed}"?`
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

function formatSourceLabel(unitType: UploadSourceUnitType, unitNumber: number) {
  if (unitType === "image") return "Image"
  return `${unitType.charAt(0).toUpperCase()}${unitType.slice(1)} ${unitNumber}`
}

function pickExcerpt(text: string, maxLength = 260) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
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
        },
      }
    }

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
        },
      }
    }

    const queryTerms = buildQueryTerms(input.query, topicContext.activeTopic)
    let fallbackUsed = false
    let queryEmbedding: number[] | null = null
    try {
      queryEmbedding = await withTimeout(
        generateEmbedding(input.query, input.apiKey),
        Math.min(QUERY_EMBEDDING_TIMEOUT_MS, Math.floor(maxDurationMs * 0.55))
      )
    } catch {
      queryEmbedding = null
    }
    if (!queryEmbedding) {
      fallbackUsed = true
      warnings.push("Embedding timeout reached; using lexical fallback.")
    }

    const activeTopicTerms = buildQueryTerms(topicContext.activeTopic || "", "")
    const recentEvidenceIds = new Set(topicContext.recentEvidenceIds ?? [])
    const recentPages = new Set((topicContext.recentPages ?? []).filter((value) => value > 0))
    const scored = candidateRows
      .map((row) => {
        const text = String(row.chunk_text ?? "")
        const lexicalScore = computeLexicalOverlap(queryTerms, text)
        const qualityScore = getChunkQualityScore(row)
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
              evidenceBoost
            : lexicalScore * 0.68 +
              qualityScore * 0.32 +
              pageIntentBoost +
              topicBoost +
              continuityBoost +
              evidenceBoost

        return {
          row,
          score,
          lexicalScore,
          qualityScore,
        }
      })
      .filter((item) => item.score > 0.12 || item.lexicalScore > 0.18 || item.qualityScore > 0.45)
      .sort((a, b) => b.score - a.score)

    const fallbackScored =
      scored.length > 0
        ? scored
        : candidateRows
            .map((row) => {
              const text = String(row.chunk_text ?? "")
              const lexicalScore = computeLexicalOverlap(queryTerms, text)
              const qualityScore = getChunkQualityScore(row)
              return {
                row,
                score: lexicalScore * 0.72 + qualityScore * 0.28,
                lexicalScore,
                qualityScore,
              }
            })
            .filter((item) => item.score > 0.08 || item.qualityScore > 0.42)
            .sort((a, b) => b.score - a.score)

    if (scored.length === 0 && fallbackScored.length > 0) {
      fallbackUsed = true
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

    const supabase = await this.getSupabase()
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
        snippet: pickExcerpt(row.chunk_text, 320),
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
      },
    }
  }

  async retrieveUploadCitations({
    userId,
    query,
    apiKey,
    maxResults = 4,
  }: {
    userId: string
    query: string
    apiKey?: string
    maxResults?: number
  }): Promise<EvidenceCitation[]> {
    const result = await this.uploadContextSearch({
      userId,
      query,
      apiKey,
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
    const maxSources = clamp(input.maxSources ?? 8, 3, 16)
    const search = await this.uploadContextSearch({
      userId: input.userId,
      query: input.query,
      uploadId: input.uploadId,
      apiKey: input.apiKey,
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
        return candidate.length > 24 && !looksLikeExtractionNoise(candidate)
      })

    const fallbackCitations = search.citations
      .slice(0, maxSources)
      .filter((citation) => !looksLikeExtractionNoise(citation.snippet || citation.title || ""))
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
    const orderedCitations = [...citations].sort((a, b) => {
      const left = typeof a.sourceUnitNumber === "number" ? a.sourceUnitNumber : Number.MAX_SAFE_INTEGER
      const right = typeof b.sourceUnitNumber === "number" ? b.sourceUnitNumber : Number.MAX_SAFE_INTEGER
      return left - right
    })

    const bibliography = includeReferences
      ? formatBibliography(citations, citationStyle).map((entry) => ({
          index: entry.index,
          entry: entry.entry,
        }))
      : []
    const uploadId = citations[0]?.uploadId ?? input.uploadId ?? null
    const uploadTitle =
      citations[0]?.uploadFileName ||
      citations[0]?.sourceLabel ||
      (uploadId ? (await this.getUploadListItem(input.userId, uploadId))?.title : null) ||
      null
    const maxObservedPage = Math.max(
      0,
      ...orderedCitations
        .map((citation) =>
          typeof citation.sourceUnitNumber === "number" ? citation.sourceUnitNumber : 0
        )
    )
    const isTextbookScale =
      /\b(textbook|chapter|book|manual|handbook)\b/i.test(input.query) ||
      maxObservedPage >= 80 ||
      orderedCitations.length >= 8
    const keyPointLimit = isTextbookScale ? 6 : 7
    const studyStepLimit = isTextbookScale ? 6 : 5
    const recallLimit = isTextbookScale ? 5 : 4
    const evidenceLimit = isTextbookScale ? 8 : 6

    const summaryParagraph =
      citations.length > 0
        ? `This ${documentShape.replace("-", " ")} synthesizes "${input.query}" using ${citations.length} high-signal excerpts from your uploaded material.`
        : `No high-confidence excerpts were found for "${input.query}". Upload a more relevant document or refine your query for better coverage.`

    const executiveSnapshot =
      orderedCitations.length > 0
        ? orderedCitations
            .slice(0, Math.min(4, orderedCitations.length))
            .map((citation) => {
              const snippet = cleanSnippetForArtifact(citation.snippet || citation.title || "", 160)
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
      citations.length > 0
        ? orderedCitations
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
      citations.length > 0
        ? orderedCitations
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
      citations.length > 0
        ? orderedCitations
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
      citations.length > 0
        ? orderedCitations
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

    const referencesHeading = includeReferences
      ? `References (${citationStyle.toUpperCase()})`
      : "Source Traceability"
    const referenceSection =
      bibliography.length > 0
        ? bibliography.map((entry) => `${entry.index}. ${entry.entry}`).join("\n")
        : citations.length > 0
          ? citations
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

    const sections = [
      ...shapeSpecificSections,
      { heading: referencesHeading, content: referenceSection },
    ]

    const markdownBody = sections
      .map((section) => `## ${section.heading}\n${section.content}`)
      .join("\n\n")
    const markdown = `# ${title}\n\n${markdownBody}\n`

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
      citations,
      warnings: search.warnings,
      uploadId,
      uploadTitle,
      generatedAt: new Date().toISOString(),
    }
  }

  async generateQuizFromUpload(input: GenerateQuizFromUploadInput): Promise<QuizArtifact> {
    const questionCount = clamp(input.questionCount ?? 5, 3, 10)
    const search = await this.uploadContextSearch({
      userId: input.userId,
      query: input.query,
      uploadId: input.uploadId,
      apiKey: input.apiKey,
      mode: "hybrid",
      topK: Math.max(questionCount + 3, 8),
      includeNeighborPages: 1,
      maxDurationMs: 2600,
    })

    const citations = search.citations.slice(0, Math.max(questionCount + 2, 6))
    const statementPool = citations
      .map((citation) => {
        const statement = buildQuizStatementFromCitation(citation)
        return {
          citation,
          statement: normalizeQuizOptionText(statement, 260),
        }
      })
      .filter((item) => item.statement.length > 24)

    const fallbackOptions = [
      `The uploaded material states that ${input.query} has no clinical relevance.`,
      `The uploaded material claims there are no phases or progression patterns in ${input.query}.`,
      `The uploaded material indicates management decisions are random and not evidence-informed.`,
      `The uploaded material says symptoms are never linked to neurological mechanisms.`,
    ]

    const questionSource =
      statementPool.length > 0
        ? statementPool.slice(0, questionCount)
        : citations.slice(0, questionCount).map((citation) => ({
            citation,
            statement: normalizeQuizOptionText(
              citation.snippet || citation.title || "Core concept from the uploaded material.",
              260
            ),
          }))

    const questions: QuizArtifactQuestion[] = questionSource.map((item, index) => {
      const citation = item.citation
      const correct = item.statement
      const distractors = statementPool
        .map((candidate) => candidate.statement)
        .filter((candidate) => candidate !== correct)
        .slice(0, 8)
      const optionCandidates = [correct, ...distractors, ...fallbackOptions]
      const uniqueOptions = Array.from(new Set(optionCandidates)).slice(0, 4)
      while (uniqueOptions.length < 4) {
        uniqueOptions.push(
          `Alternative interpretation ${uniqueOptions.length + 1} from the topic.`
        )
      }

      const rotation = index % uniqueOptions.length
      const rotatedOptions = uniqueOptions.slice(rotation).concat(uniqueOptions.slice(0, rotation))
      const correctOptionIndex = rotatedOptions.findIndex((value) => value === correct)
      const explanationSnippet = cleanSnippetForArtifact(citation.snippet || citation.title || "", 220)
      const inline = formatInlineCitation(citation, "vancouver")
      const explanation = explanationSnippet
        ? `Supported by uploaded material: "${explanationSnippet}" ${inline} Other options represent different or unsupported interpretations.`
        : `This choice directly reflects the cited uploaded excerpt ${inline}.`

      return {
        id: `quiz-q-${index + 1}`,
        prompt: buildQuizPromptFromCitation(citation, input.query, correct),
        options: rotatedOptions,
        correctOptionIndex: correctOptionIndex >= 0 ? correctOptionIndex : 0,
        explanation,
        citationIndices: [citation.index],
      }
    })

    const uploadId = citations[0]?.uploadId ?? input.uploadId ?? null
    const uploadTitle =
      citations[0]?.uploadFileName ||
      citations[0]?.sourceLabel ||
      (uploadId ? (await this.getUploadListItem(input.userId, uploadId))?.title : null) ||
      null

    return {
      artifactType: "quiz",
      artifactId: crypto.randomUUID(),
      title: uploadTitle ? `${uploadTitle} - Quiz` : `Quiz - ${input.query.slice(0, 72)}`,
      query: input.query,
      questions,
      citations,
      warnings: search.warnings,
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
