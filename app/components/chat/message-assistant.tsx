import {
  Message,
  MessageAction,
  MessageActions,
} from "@/components/prompt-kit/message"
import { ProcessingLoader } from "@/components/prompt-kit/processing-loader"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ENABLE_CHAT_ACTIVITY_TIMELINE_V2,
  ENABLE_CHART_DRILLDOWN_SUBLOOP,
} from "@/lib/config"
import type { Message as MessageAISDK } from "@ai-sdk/react"
import { ArrowClockwise, Check, Copy, ClipboardText } from "@phosphor-icons/react"
import type { ChartDrilldownPayload } from "../charts/chat-chart"
import { AssistantInlineParts } from "./assistant-inline-parts"
import { ActivityTimeline } from "./activity/activity-timeline"
import { buildChatActivityTimeline } from "./activity/build-timeline"
import type {
  OptimisticTaskBoardState,
  ReferencedUploadStatus,
} from "./activity/types"
import { getSources } from "./get-sources"
import { SearchImages } from "./search-images"
import { YouTubeResults, type YouTubeResultItem } from "./youtube-results"
import { ReferencesSection } from "./references-section"
import { TrustSummaryCard } from "./trust-summary-card"
import { extractCitationsFromSources, extractCitationsFromWebSearch, extractJournalFromUrl, extractYearFromUrl } from "./citation-utils"
import type { CitationData } from "./citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { parseCitationMarkers, getUniqueCitationIndices } from "@/lib/citations/parser"
import { useMemo, useCallback, useEffect, useState, useRef, useReducer } from "react"
import { parseLearningCard } from "@/lib/medical-student-learning"
import { LearningCard } from "./learning-card"
import { detectClinicalCommand } from "@/app/components/clinical-blocks/clinical-response-block"
import { ClinicalDocumentCard } from "@/app/components/clinical-blocks/clinical-document-card"
import { PrescriptionCard } from "@/app/components/clinical-blocks/prescription-card"
import { detectCommandFromUserMessage, buildClinicalDocument } from "@/lib/clinical-workspace"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import { splitTrailingSourceAppendix } from "./source-appendix"
import {
  DocumentArtifactCard,
  InteractiveQuizArtifactCard,
} from "./generated-artifact-cards"
import { DrilldownPanel } from "./drilldown-panel"
import {
  buildDataPointId,
  getDrilldownCacheEntry,
  markDrilldownEntryAdded,
  setDrilldownCacheEntry,
  useDrilldownCacheStore,
} from "./drilldown-cache-store"
import {
  drilldownStateReducer,
  INITIAL_DRILLDOWN_STATE,
} from "./use-drilldown-state"

function parseArtifactFromToolResult(
  result: unknown
): DocumentArtifact | QuizArtifact | null {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const candidate = result as { artifactType?: string }
    if (candidate.artifactType === "document" || candidate.artifactType === "quiz") {
      return result as DocumentArtifact | QuizArtifact
    }
  }
  return null
}

function isDocumentArtifact(value: unknown): value is DocumentArtifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as DocumentArtifact).artifactType === "document" &&
      typeof (value as DocumentArtifact).artifactId === "string" &&
      Array.isArray((value as DocumentArtifact).sections)
  )
}

function isQuizArtifact(value: unknown): value is QuizArtifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as QuizArtifact).artifactType === "quiz" &&
      typeof (value as QuizArtifact).artifactId === "string" &&
      Array.isArray((value as QuizArtifact).questions)
  )
}

function parseFilenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/filename="?([^"]+)"?/i)
  return match?.[1] || null
}

type DrilldownApiResponse = {
  query?: unknown
  response?: unknown
  citations?: unknown
  error?: unknown
}

function buildDrilldownQuery(payload: ChartDrilldownPayload): string {
  const series = payload.seriesLabel || payload.seriesKey || "Selected datapoint"
  const xSegment =
    typeof payload.xValue === "string" || typeof payload.xValue === "number"
      ? `${payload.xKey}=${payload.xValue}`
      : payload.xKey
  const valueSegment =
    typeof payload.value === "string" || typeof payload.value === "number"
      ? `value=${payload.value}`
      : "value=selected"
  const dataLabel = `${series} (${xSegment}, ${valueSegment})`
  const source = payload.source || payload.chartTitle || "the chart source"
  return `Analyze this specific data point: ${dataLabel} from ${source}. Provide the underlying clinical trial evidence.`
}

function normalizeDrilldownCitations(raw: unknown): EvidenceCitation[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is EvidenceCitation => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      ...item,
      index: typeof item.index === "number" ? item.index : index + 1,
      title: typeof item.title === "string" ? item.title : `Citation ${index + 1}`,
      journal:
        typeof item.journal === "string"
          ? item.journal
          : typeof item.sourceLabel === "string"
            ? item.sourceLabel
            : "Source",
      authors: Array.isArray(item.authors) ? item.authors : [],
      evidenceLevel: typeof item.evidenceLevel === "number" ? item.evidenceLevel : 3,
      meshTerms: Array.isArray(item.meshTerms) ? item.meshTerms : [],
      sourceType:
        typeof item.sourceType === "string" ? item.sourceType : "medical_evidence",
    }))
}

type MessageAssistantProps = {
  messageId: string
  children: string
  isLast?: boolean
  hasScrollAnchor?: boolean
  copied?: boolean
  copyToClipboard?: () => void
  onReload?: () => void
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
  parts?: MessageAISDK["parts"]
  annotations?: Array<{ type?: string; refinement?: unknown; warnings?: unknown }>
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  evidenceCitations?: EvidenceCitation[]
  contextPrompt?: string
  streamIntroPreview?: string | null
  optimisticTaskBoard?: OptimisticTaskBoardState | null
  referencedUploads?: ReferencedUploadStatus[]
  onDrilldownInsightAdd?: (input: {
    pointId: string
    payload: ChartDrilldownPayload
    query: string
    response: string
    citations: EvidenceCitation[]
  }) => Promise<boolean> | boolean
  discussionInsightCount?: number
}

type ArtifactRefinementChoice = {
  id: string
  label: string
  submitText: string
  requiresCustomInput?: boolean
}

type ArtifactRefinementPayload = {
  title?: string
  question?: string
  helperText?: string
  choices?: ArtifactRefinementChoice[]
  requiredFields?: string[]
  customInputPlaceholder?: string
}

function buildAppendixCitationEntry(
  entry: { title: string; pmid: string; note?: string },
  index: number
): CitationData {
  const title = entry.note ? `${entry.title} (${entry.note})` : entry.title
  return {
    index,
    sourceId: `pmid:${entry.pmid}`,
    title: title || `PMID ${entry.pmid}`,
    authors: [],
    journal: entry.title || "PubMed",
    year: "",
    url: `https://pubmed.ncbi.nlm.nih.gov/${entry.pmid}/`,
    pmid: entry.pmid,
  }
}

function mergeAppendixCitations(
  baseCitations: Map<number, CitationData>,
  appendixEntries: Array<{ title: string; pmid: string; note?: string }>
): Map<number, CitationData> {
  if (appendixEntries.length === 0) return baseCitations

  const merged = new Map<number, CitationData>()
  const seen = new Set<string>()
  let maxIndex = 0

  baseCitations.forEach((citation, index) => {
    merged.set(index, citation)
    maxIndex = Math.max(maxIndex, index)
    const key =
      (citation.sourceId && `source:${citation.sourceId}`) ||
      (citation.pmid && `pmid:${citation.pmid}`) ||
      (citation.url && `url:${citation.url}`) ||
      `title:${(citation.title || "").toLowerCase()}`
    seen.add(key)
  })

  appendixEntries.forEach((entry) => {
    const key = `pmid:${entry.pmid}`
    if (seen.has(key)) return
    maxIndex += 1
    merged.set(maxIndex, buildAppendixCitationEntry(entry, maxIndex))
    seen.add(key)
  })

  return merged
}

function toCitationDataFromEvidence(citation: EvidenceCitation): CitationData {
  return {
    index: citation.index,
    sourceId: citation.sourceId || undefined,
    title: citation.title,
    authors: citation.authors || [],
    journal: citation.journal,
    year: citation.year?.toString() || "",
    url: citation.url || undefined,
    doi: citation.doi || undefined,
    pmid: citation.pmid || undefined,
    evidenceLevel: citation.evidenceLevel,
    studyType: citation.studyType,
    sampleSize: citation.sampleSize,
    meshTerms: citation.meshTerms,
    snippet: citation.snippet,
  } as CitationData
}

function isPlaceholderCitationLabel(value: string | null | undefined): boolean {
  const normalized = (value || "").trim()
  if (!normalized) return true
  return /^Citation\s+\d+$/i.test(normalized) || /^Source$/i.test(normalized)
}

function isMeaningfulEvidenceCitation(citation: EvidenceCitation): boolean {
  const hasStableLocator = Boolean(
    citation.sourceId?.trim() ||
      citation.pmid?.trim() ||
      citation.doi?.trim() ||
      citation.url?.trim() ||
      citation.uploadId?.trim() ||
      citation.sourceUnitId?.trim()
  )
  const hasNamedSource =
    !isPlaceholderCitationLabel(citation.title) ||
    !isPlaceholderCitationLabel(citation.journal) ||
    !isPlaceholderCitationLabel(citation.sourceLabel)
  const hasContext =
    Boolean(citation.snippet?.trim()) ||
    (Array.isArray(citation.authors) && citation.authors.length > 0) ||
    typeof citation.year === "number" ||
    Boolean(citation.studyType?.trim())

  const indexedMedicalEvidence =
    typeof citation.index === "number" &&
    citation.index > 0 &&
    (citation.sourceType === "medical_evidence" ||
      (typeof citation.evidenceLevel === "number" && citation.evidenceLevel >= 1))

  return (
    hasStableLocator ||
    (hasNamedSource && hasContext) ||
    indexedMedicalEvidence
  )
}

function isMeaningfulCitationData(citation: CitationData): boolean {
  const extendedCitation = citation as CitationData & {
    studyType?: string
    snippet?: string
  }
  const hasStableLocator = Boolean(
    citation.sourceId?.trim() ||
      citation.pmid?.trim() ||
      citation.doi?.trim() ||
      citation.url?.trim()
  )
  const hasNamedSource =
    !isPlaceholderCitationLabel(citation.title) || !isPlaceholderCitationLabel(citation.journal)
  const hasContext =
    (Array.isArray(citation.authors) && citation.authors.length > 0) ||
    Boolean(citation.year?.trim()) ||
    Boolean(extendedCitation.studyType?.trim()) ||
    Boolean(extendedCitation.snippet?.trim())

  return hasStableLocator || (hasNamedSource && hasContext)
}

function evidenceCitationMetadataScore(citation: EvidenceCitation): number {
  let score = 0
  if (citation.title?.trim()) score += 3
  if (citation.journal?.trim()) score += 2
  if (citation.url?.trim()) score += 3
  if (citation.sourceId?.trim()) score += 2
  if (citation.pmid?.trim()) score += 2
  if (citation.doi?.trim()) score += 1
  if (citation.sourceLabel?.trim()) score += 2
  if (citation.sourceType?.trim()) score += 1
  if (citation.studyType?.trim()) score += 1
  if (citation.snippet?.trim()) score += 1
  if (Array.isArray(citation.authors) && citation.authors.length > 0) score += 1
  return score
}

function evidenceCitationSetScore(citations: EvidenceCitation[]): number {
  return citations.reduce((total, citation) => total + evidenceCitationMetadataScore(citation), 0)
}

function shouldReplaceEvidenceCitationSet(
  current: EvidenceCitation[],
  incoming: EvidenceCitation[]
): boolean {
  if (incoming.length === 0) return false
  if (current.length === 0) return true
  const currentScore = evidenceCitationSetScore(current)
  const incomingScore = evidenceCitationSetScore(incoming)
  if (incomingScore > currentScore + 1) return true
  if (incomingScore >= currentScore && incoming.length > current.length) return true
  return false
}

function mergeEvidenceIntoCitations(
  baseCitations: Map<number, CitationData>,
  evidenceCitations: EvidenceCitation[]
): Map<number, CitationData> {
  if (evidenceCitations.length === 0) return baseCitations

  const merged = new Map<number, CitationData>()
  const seen = new Set<string>()
  const indexByKey = new Map<string, number>()
  let maxIndex = 0

  baseCitations.forEach((citation, index) => {
    merged.set(index, citation)
    maxIndex = Math.max(maxIndex, index)
    const citationKey =
      (citation.sourceId && `source:${citation.sourceId}`) ||
      (citation.pmid && `pmid:${citation.pmid}`) ||
      (citation.url && `url:${citation.url}`) ||
      `title:${(citation.title || "").toLowerCase()}`
    seen.add(citationKey)
    indexByKey.set(citationKey, index)
  })

  evidenceCitations.forEach((citation) => {
    const key =
      (citation.sourceId && `source:${citation.sourceId}`) ||
      (citation.pmid && `pmid:${citation.pmid}`) ||
      (citation.url && `url:${citation.url}`) ||
      `title:${(citation.title || "").toLowerCase()}`
    const mapped = toCitationDataFromEvidence(citation)
    const existingIndex = indexByKey.get(key)
    if (typeof existingIndex === "number") {
      const existing = merged.get(existingIndex)
      merged.set(existingIndex, {
        ...(existing || {}),
        ...mapped,
        index: existingIndex,
      })
      return
    }

    const preferredIndex =
      typeof mapped.index === "number" && Number.isFinite(mapped.index) && mapped.index > 0
        ? mapped.index
        : maxIndex + 1
    const targetIndex = merged.has(preferredIndex) ? maxIndex + 1 : preferredIndex
    maxIndex = Math.max(maxIndex, targetIndex)
    merged.set(targetIndex, { ...mapped, index: targetIndex })
    seen.add(key)
    indexByKey.set(key, targetIndex)
  })

  return merged
}

function parseArtifactRefinementPayload(
  annotations: Array<{ type?: string; refinement?: unknown; warnings?: unknown }> | undefined
): ArtifactRefinementPayload | null {
  if (!Array.isArray(annotations) || annotations.length === 0) return null
  const part = annotations.find((item) => item?.type === "artifact-refinement")
  const payload = part?.refinement
  if (!payload || typeof payload !== "object") return null
  const candidate = payload as ArtifactRefinementPayload
  if (!Array.isArray(candidate.choices) || candidate.choices.length === 0) return null
  return {
    title: typeof candidate.title === "string" ? candidate.title : "Refine Generation",
    question:
      typeof candidate.question === "string"
        ? candidate.question
        : "Choose one option to continue.",
    helperText:
      typeof candidate.helperText === "string" ? candidate.helperText : undefined,
    customInputPlaceholder:
      typeof candidate.customInputPlaceholder === "string"
        ? candidate.customInputPlaceholder
        : undefined,
    requiredFields: Array.isArray(candidate.requiredFields)
      ? candidate.requiredFields.map((value) => String(value)).slice(0, 6)
      : [],
    choices: candidate.choices
      .filter(
        (choice): choice is ArtifactRefinementChoice =>
          Boolean(
            choice &&
              typeof choice === "object" &&
              typeof choice.id === "string" &&
              typeof choice.label === "string" &&
              typeof choice.submitText === "string"
          )
      )
      .slice(0, 5),
  }
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase()

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0]
      return id || null
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v")
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/").filter(Boolean)[1]
        return id || null
      }
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/").filter(Boolean)[1]
        return id || null
      }
    }
  } catch {
    return null
  }

  return null
}

function isLikelyYouTubeVideoId(value: string): boolean {
  // Standard YouTube video IDs are 11 characters [A-Za-z0-9_-]
  return /^[A-Za-z0-9_-]{11}$/.test(value)
}

function stripToolCitationArtifacts(text: string): string {
  if (!text) return ""
  return text
    .replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
    .replace(/\bCITE_PLACEHOLDER_\d+\b/gi, "")
    .replace(/\[tool\s+slide\s+([^\]]+)\]/gi, " (slide $1)")
    .replace(/\[tool\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[source\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[doc\s+([^\]]+)\]/gi, " ($1)")
    .replace(/[ \t]{2,}/g, " ")
}

function extractInlinePmidCandidates(text: string): string[] {
  if (!text) return []
  const pmids = new Set<string>()

  const explicitPmidPattern = /\bPMID\s*:\s*(\d{6,10})\b/gi
  let explicitMatch: RegExpExecArray | null
  while ((explicitMatch = explicitPmidPattern.exec(text)) !== null) {
    if (explicitMatch[1]) pmids.add(explicitMatch[1])
  }

  const bracketNumericPattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  let bracketMatch: RegExpExecArray | null
  while ((bracketMatch = bracketNumericPattern.exec(text)) !== null) {
    const values = bracketMatch[1]
      .split(/\s*,\s*/)
      .map((value) => value.trim())
      .filter(Boolean)
    values.forEach((value) => {
      if (/^\d{6,10}$/.test(value)) {
        pmids.add(value)
      }
    })
  }

  return Array.from(pmids)
}

function extractInlineSourceIdCandidates(text: string): string[] {
  if (!text) return []
  const sourceIds = new Set<string>()
  const sourceIdPattern = /\[CITE[_:]([^\]]+)\]/gi
  let match: RegExpExecArray | null
  while ((match = sourceIdPattern.exec(text)) !== null) {
    const values = (match[1] || "")
      .split(/\s*,\s*/)
      .map((value) =>
        value
          .trim()
          .replace(/^CITE[_:]/i, "")
          .replace(/^["']|["']$/g, "")
          .toLowerCase()
      )
      .filter(Boolean)
    values.forEach((value) => sourceIds.add(value))
  }
  return Array.from(sourceIds)
}

export function MessageAssistant({
  messageId,
  children,
  isLast,
  hasScrollAnchor,
  copied,
  copyToClipboard,
  onReload,
  onSuggestion,
  onWorkflowSuggestion,
  parts,
  annotations,
  status,
  className,
  evidenceCitations = [],
  contextPrompt,
  streamIntroPreview,
  optimisticTaskBoard = null,
  referencedUploads = [],
  onDrilldownInsightAdd,
  discussionInsightCount = 0,
}: MessageAssistantProps) {
  const { card: learningCard, cleanContent } = useMemo(
    () => parseLearningCard(children || ""),
    [children]
  )
  const sanitizedContent = useMemo(
    () =>
      stripToolCitationArtifacts(
        (cleanContent || "").replace(/\[CITE_PLACEHOLDER_\d+\]/g, "")
      ),
    [cleanContent]
  )
  const { contentToRender, trailingSourceEntries } = useMemo(() => {
    const split = splitTrailingSourceAppendix(sanitizedContent)
    return {
      contentToRender: split.cleanText,
      trailingSourceEntries: split.entries,
    }
  }, [sanitizedContent])
  
  // Memoize derived data to prevent unnecessary recalculations during streaming
  const sources = useMemo(() => getSources(parts), [parts])
  
  const contentNullOrEmpty = contentToRender === null || contentToRender === ""
  const isLastStreaming = status === "streaming" && isLast

  const clinicalDocType = useMemo(
    () => contextPrompt ? detectCommandFromUserMessage(contextPrompt) : null,
    [contextPrompt]
  )

  const documentSheetOpen = useWorkspaceStore((s) => s.documentSheet.isOpen)
  const documentSheetDoc = useWorkspaceStore((s) => s.documentSheet.contentDocument)

  const stableClinicalDocumentId = useMemo(() => {
    if (!documentSheetOpen || !documentSheetDoc || !clinicalDocType) return null
    if (clinicalDocType !== documentSheetDoc.type) return null
    return documentSheetDoc.id
  }, [documentSheetOpen, documentSheetDoc, clinicalDocType])

  const clinicalDocument = useMemo(() => {
    if (!clinicalDocType || contentToRender === null || contentToRender === undefined)
      return null
    if (contentToRender === "" && clinicalDocType !== "prescribe") return null
    const doc = buildClinicalDocument(
      messageId,
      clinicalDocType,
      contentToRender,
      !!isLastStreaming,
      undefined,
      stableClinicalDocumentId,
      {
        sourcesParseInput: sanitizedContent,
        trailingPmidSources:
          trailingSourceEntries.length > 0 ? trailingSourceEntries : undefined,
      },
    )
    const rx = doc.prescriptionItems?.length ?? 0
    const bodyLen = doc.content.trim().length
    if (isLastStreaming) {
      if (bodyLen < 12 && rx === 0) return null
      return doc
    }
    if (bodyLen <= 50 && rx === 0) return null
    return doc
  }, [
    clinicalDocType,
    contentToRender,
    messageId,
    isLastStreaming,
    stableClinicalDocumentId,
    sanitizedContent,
    trailingSourceEntries,
  ])

  const openDocumentContent = useWorkspaceStore((s) => s.openDocumentContent)
  const updateDocumentContent = useWorkspaceStore((s) => s.updateDocumentContent)
  const upsertSessionDocument = useWorkspaceStore((s) => s.upsertSessionDocument)
  const ingestClinicalNoteText = useWorkspaceStore((s) => s.ingestClinicalNoteText)
  const docSheetIsOpen = useWorkspaceStore((s) => s.documentSheet.isOpen)
  const docSheetContentId = useWorkspaceStore((s) => s.documentSheet.contentDocument?.id)

  useEffect(() => {
    if (!clinicalDocument || !isLast) return
    if (docSheetIsOpen && docSheetContentId === clinicalDocument.id) {
      updateDocumentContent(clinicalDocument.content, !!isLastStreaming, {
        sources: clinicalDocument.sources,
        prescriptionItems: clinicalDocument.prescriptionItems,
      })
    }
  }, [clinicalDocument, isLast, isLastStreaming, docSheetIsOpen, docSheetContentId, updateDocumentContent])

  const sessionDocRegisteredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!clinicalDocument || isLastStreaming || !isLast) return
    const registrationKey = `${messageId}:${clinicalDocument.id}`
    if (sessionDocRegisteredRef.current === registrationKey) return
    sessionDocRegisteredRef.current = registrationKey
    const pid = useWorkspaceStore.getState().activePatientId
    if (!pid) return
    upsertSessionDocument(pid, {
      id: clinicalDocument.id,
      messageId,
      status: "draft",
      document: { ...clinicalDocument, isStreaming: false },
      updatedAt: new Date().toISOString(),
    })
    if (clinicalDocument.content?.trim()) {
      ingestClinicalNoteText(pid, clinicalDocument.content, "Assistant note")
    }
  }, [
    clinicalDocument,
    ingestClinicalNoteText,
    isLast,
    isLastStreaming,
    messageId,
    upsertSessionDocument,
  ])

  const handleExpandDocument = useCallback((doc: typeof clinicalDocument) => {
    if (doc) openDocumentContent(doc)
  }, [openDocumentContent])

  const hasRenderableTimelineParts = useMemo(
    () =>
      Array.isArray(parts) &&
      parts.some(
        (part) =>
          part.type === "text" ||
          part.type === "tool-invocation" ||
          part.type === "reasoning"
      ),
    [parts]
  )
  
  // Keep evidence citations sticky through post-stream state transitions.
  const [stickyEvidenceCitations, setStickyEvidenceCitations] = useState<EvidenceCitation[]>([])
  useEffect(() => {
    if (evidenceCitations.length === 0) return
    setStickyEvidenceCitations((previous) =>
      shouldReplaceEvidenceCitationSet(previous, evidenceCitations)
        ? evidenceCitations
        : previous
    )
  }, [evidenceCitations])
  const effectiveEvidenceCitations =
    evidenceCitations.length > 0 ? evidenceCitations : stickyEvidenceCitations
  const hasAttachedEvidenceCitations = effectiveEvidenceCitations.length > 0
  const referencedEvidenceCitations = useMemo(() => {
    if (!hasAttachedEvidenceCitations || !contentToRender) {
      return []
    }

    const markers = parseCitationMarkers(contentToRender)
    const referencedIndices = new Set(getUniqueCitationIndices(markers))
    const referencedPmids = new Set<string>()
    const pmidPattern = /\[PMID\s*:\s*(\d+)\]/gi
    let pmidMatch: RegExpExecArray | null
    while ((pmidMatch = pmidPattern.exec(contentToRender)) !== null) {
      if (pmidMatch[1]) {
        referencedPmids.add(pmidMatch[1])
      }
    }

    if (referencedIndices.size === 0 && referencedPmids.size === 0) {
      return []
    }

    return effectiveEvidenceCitations.filter((citation) => {
      const citationPmid = typeof citation.pmid === "string" ? citation.pmid.trim() : ""
      return referencedIndices.has(citation.index) || (citationPmid.length > 0 && referencedPmids.has(citationPmid))
    })
  }, [contentToRender, effectiveEvidenceCitations, hasAttachedEvidenceCitations])
  const displayEvidenceCitations = useMemo(
    () =>
      referencedEvidenceCitations.length > 0
        ? referencedEvidenceCitations
        : effectiveEvidenceCitations,
    [effectiveEvidenceCitations, referencedEvidenceCitations]
  )
  const meaningfulEvidenceCitations = useMemo(
    () => displayEvidenceCitations.filter(isMeaningfulEvidenceCitation),
    [displayEvidenceCitations]
  )
  const hasEvidenceCitations = meaningfulEvidenceCitations.length > 0
  const artifactRefinement = useMemo(
    () => parseArtifactRefinementPayload(annotations),
    [annotations]
  )
  const hasQuizArtifactInParts = useMemo(
    () =>
      Array.isArray(parts) &&
      parts.some((part: any) => {
        if (part?.type === "tool-invocation" && part?.toolInvocation?.state === "result") {
          const artifact = parseArtifactFromToolResult(part?.toolInvocation?.result)
          return artifact?.artifactType === "quiz"
        }
        if (part?.type === "metadata" && part?.metadata) {
          const quizArtifacts = (part.metadata as { quizArtifacts?: unknown[] }).quizArtifacts
          return Array.isArray(quizArtifacts) && quizArtifacts.length > 0
        }
        return false
      }),
    [parts]
  )
  const hasRefinementToolInParts = useMemo(
    () =>
      Array.isArray(parts) &&
      parts.some((part: any) => {
        if (part?.type !== "tool-invocation") return false
        const toolName = String(part?.toolInvocation?.toolName || "")
        if (!/refine.*requirements/i.test(toolName)) return false
        return true
      }),
    [parts]
  )
  const shouldRenderAnnotationRefinementFallback = Boolean(
    artifactRefinement &&
      onSuggestion &&
      !hasRefinementToolInParts &&
      !hasQuizArtifactInParts
  )
  const [customRefinementInput, setCustomRefinementInput] = useState("")
  const [refinementSelectedChoiceId, setRefinementSelectedChoiceId] = useState<string | null>(
    null
  )
  const [refinementSubmittedText, setRefinementSubmittedText] = useState<string | null>(null)
  const [refinementSubmitState, setRefinementSubmitState] = useState<
    "idle" | "submitting" | "submitted"
  >("idle")
  const isRefinementLocked = refinementSubmitState !== "idle"
  const [drilldownState, drilldownDispatch] = useReducer(
    drilldownStateReducer,
    INITIAL_DRILLDOWN_STATE
  )
  const drilldownAbortRef = useRef<AbortController | null>(null)
  const [isAddingDrilldownInsight, setIsAddingDrilldownInsight] = useState(false)
  const [didAddDrilldownInsight, setDidAddDrilldownInsight] = useState(false)
  const drilldownCacheEntries = useDrilldownCacheStore((state) => state.entries)
  const latestAddedPointId = useDrilldownCacheStore((state) => state.latestAddedPointId)
  const touchLatestAdded = useDrilldownCacheStore((state) => state.touchLatestAdded)
  const syncedInsightCount = useMemo(
    () =>
      Object.values(drilldownCacheEntries).filter((entry) => entry.isAddedToDiscussion)
        .length,
    [drilldownCacheEntries]
  )
  const latestAddedDrilldownEntry = useMemo(
    () =>
      latestAddedPointId && drilldownCacheEntries[latestAddedPointId]
        ? drilldownCacheEntries[latestAddedPointId]
        : null,
    [drilldownCacheEntries, latestAddedPointId]
  )
  const isActiveDrilldownSynced = useMemo(
    () =>
      Boolean(
        drilldownState.pointId &&
          drilldownCacheEntries[drilldownState.pointId]?.isAddedToDiscussion
      ),
    [drilldownCacheEntries, drilldownState.pointId]
  )
  const [shouldPulseInsightPill, setShouldPulseInsightPill] = useState(false)
  const lastPulsedInsightPointIdRef = useRef<string | null>(null)

  useEffect(() => {
    const currentPointId = latestAddedDrilldownEntry?.pointId
    if (!currentPointId) return
    if (lastPulsedInsightPointIdRef.current === currentPointId) return
    lastPulsedInsightPointIdRef.current = currentPointId
    setShouldPulseInsightPill(true)
    const timeoutId = window.setTimeout(() => {
      setShouldPulseInsightPill(false)
    }, 1800)
    return () => window.clearTimeout(timeoutId)
  }, [latestAddedDrilldownEntry?.pointId])

  useEffect(() => {
    return () => {
      drilldownAbortRef.current?.abort()
      drilldownAbortRef.current = null
    }
  }, [])

  const runDrilldownAnalysis = useCallback(
    async (
      payload: ChartDrilldownPayload,
      options?: {
        forceRefresh?: boolean
      }
    ) => {
      if (!ENABLE_CHART_DRILLDOWN_SUBLOOP) return
      const pointId = buildDataPointId(payload)
      if (!options?.forceRefresh) {
        const cached = getDrilldownCacheEntry(pointId)
        if (cached) {
          drilldownDispatch({
            type: "HYDRATE_DRILLDOWN_CACHE",
            payload: {
              runId: `cached-${cached.cachedAt}`,
              pointId,
              context: payload,
              query: cached.query,
              response: cached.response,
              citations: cached.citations,
            },
          })
          touchLatestAdded(cached.isAddedToDiscussion ? cached.pointId : latestAddedPointId)
          return
        }
      }
      const runId = `${messageId}-drilldown-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const query = buildDrilldownQuery(payload)

      drilldownDispatch({
        type: "SET_DRILLDOWN_CONTEXT",
        payload: { runId, pointId, context: payload, query },
      })
      setIsAddingDrilldownInsight(false)
      setDidAddDrilldownInsight(false)

      drilldownAbortRef.current?.abort()
      const controller = new AbortController()
      drilldownAbortRef.current = controller

      try {
        drilldownDispatch({
          type: "SET_DRILLDOWN_PHASE",
          payload: { phase: "retrieving" },
        })
        const response = await fetch("/api/chat/drilldown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            payload,
            parentPrompt: contextPrompt || null,
          }),
        })

        drilldownDispatch({
          type: "SET_DRILLDOWN_PHASE",
          payload: { phase: "appraising" },
        })

        const data = (await response.json()) as DrilldownApiResponse
        if (!response.ok) {
          const errorText =
            typeof data?.error === "string" && data.error.trim().length > 0
              ? data.error
              : "Drill-down analysis failed."
          throw new Error(errorText)
        }

        if (drilldownAbortRef.current !== controller) return

        drilldownDispatch({
          type: "SET_DRILLDOWN_PHASE",
          payload: { phase: "synthesizing" },
        })

        const responseText = typeof data?.response === "string" ? data.response : ""
        const citationsFromApi = normalizeDrilldownCitations(data?.citations)
        setDrilldownCacheEntry({
          pointId,
          payload,
          query: typeof data?.query === "string" ? data.query : query,
          response: responseText,
          citations: citationsFromApi,
          cachedAt: Date.now(),
        })
        drilldownDispatch({
          type: "SET_DRILLDOWN_RESULT",
          payload: {
            response: responseText,
            citations: citationsFromApi,
          },
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const errorText =
          error instanceof Error ? error.message : "Unable to complete drill-down analysis."
        drilldownDispatch({
          type: "SET_DRILLDOWN_ERROR",
          payload: { error: errorText },
        })
      } finally {
        if (drilldownAbortRef.current === controller) {
          drilldownAbortRef.current = null
        }
      }
    },
    [contextPrompt, latestAddedPointId, messageId, touchLatestAdded]
  )

  const handleChartDrilldown = useCallback(
    (payload: ChartDrilldownPayload) => {
      void runDrilldownAnalysis(payload)
    },
    [runDrilldownAnalysis]
  )

  const handleRetryDrilldown = useCallback(() => {
    if (!drilldownState.context) return
    void runDrilldownAnalysis(drilldownState.context, { forceRefresh: true })
  }, [drilldownState.context, runDrilldownAnalysis])

  const handleOpenSyncedInsight = useCallback(() => {
    if (!latestAddedDrilldownEntry) return
    touchLatestAdded(latestAddedDrilldownEntry.pointId)
    void runDrilldownAnalysis(latestAddedDrilldownEntry.payload)
  }, [latestAddedDrilldownEntry, runDrilldownAnalysis, touchLatestAdded])

  const handlePromoteDrilldownToChat = useCallback(() => {
    if (isAddingDrilldownInsight || didAddDrilldownInsight) return
    if (drilldownState.response.trim().length === 0 || !drilldownState.context) return
    const pointId =
      drilldownState.pointId || buildDataPointId(drilldownState.context)
    const query = drilldownState.query || "Drill-down insight"
    const response = drilldownState.response.trim()
    const citations = drilldownState.citations

    const fallbackSubmit = onWorkflowSuggestion || onSuggestion

    setIsAddingDrilldownInsight(true)
    ;(async () => {
      try {
        let integrated = false
        if (onDrilldownInsightAdd) {
          integrated = await Promise.resolve(
            onDrilldownInsightAdd({
              pointId,
              payload: drilldownState.context!,
              query,
              response,
              citations,
            })
          )
        } else if (fallbackSubmit) {
          fallbackSubmit(
            [
              "Add this drill-down insight to the main discussion:",
              "",
              `Drill-down request: ${query}`,
              "",
              response,
            ].join("\n")
          )
          integrated = true
        }

        if (!integrated) {
          setIsAddingDrilldownInsight(false)
          return
        }

        markDrilldownEntryAdded(pointId, true)
        touchLatestAdded(pointId)
        setDidAddDrilldownInsight(true)
        setIsAddingDrilldownInsight(false)
        setTimeout(() => {
          drilldownAbortRef.current?.abort()
          drilldownAbortRef.current = null
          drilldownDispatch({ type: "CLOSE_DRILLDOWN_PANEL" })
          setDidAddDrilldownInsight(false)
        }, 800)
      } catch {
        setIsAddingDrilldownInsight(false)
      }
    })()
  }, [
    didAddDrilldownInsight,
    drilldownState.citations,
    drilldownState.context,
    drilldownState.pointId,
    drilldownState.query,
    drilldownState.response,
    isAddingDrilldownInsight,
    onDrilldownInsightAdd,
    onSuggestion,
    onWorkflowSuggestion,
    touchLatestAdded,
  ])

  const handleDrilldownPanelOpenChange = useCallback((open: boolean) => {
    if (open) return
    drilldownAbortRef.current?.abort()
    drilldownAbortRef.current = null
    drilldownDispatch({ type: "CLOSE_DRILLDOWN_PANEL" })
    setIsAddingDrilldownInsight(false)
    setDidAddDrilldownInsight(false)
  }, [])

  useEffect(() => {
    setCustomRefinementInput("")
    setRefinementSelectedChoiceId(null)
    setRefinementSubmittedText(null)
    setRefinementSubmitState("idle")
  }, [artifactRefinement?.title, artifactRefinement?.question])

  const submitAnnotationRefinement = useCallback(
    (payload: string, choiceId?: string) => {
      const value = payload.trim()
      if (!value || !shouldRenderAnnotationRefinementFallback) return
      const submitHandler = onWorkflowSuggestion || onSuggestion
      if (!submitHandler || isRefinementLocked) return
      setRefinementSelectedChoiceId(choiceId || null)
      setRefinementSubmittedText(value)
      setRefinementSubmitState("submitting")
      submitHandler(value)
      setRefinementSubmitState("submitted")
      setCustomRefinementInput("")
    },
    [
      isRefinementLocked,
      onSuggestion,
      onWorkflowSuggestion,
      shouldRenderAnnotationRefinementFallback,
    ]
  )
  
  // Convert evidence citations to CitationData format for rendering
  const evidenceCitationMap = useMemo(() => {
    if (!hasEvidenceCitations) return new Map<number, CitationData>()
    
    const map = new Map<number, CitationData>()
    displayEvidenceCitations.forEach((citation) => {
      map.set(citation.index, toCitationDataFromEvidence(citation))
    })
    return map
  }, [displayEvidenceCitations, hasEvidenceCitations])
  
  // Extract and fetch citations from sources (fallback when no evidence citations)
  const [citations, setCitations] = useState<Map<number, CitationData>>(new Map())
  const [isLoadingCitations, setIsLoadingCitations] = useState(false)
  const lastSourcesKeyRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  
  useEffect(() => {
    // CRITICAL: Check if text contains evidence-style markers [1], [2] etc.
    // If so, this is an evidence-backed response and we should NOT extract from web sources
    // even if evidenceCitations state is temporarily empty (e.g., during restore)
    const hasEvidenceMarkers =
      contentToRender &&
      (/\[\d+\]/.test(contentToRender) ||
        /\[PMID\s*:\s*\d+\]/i.test(contentToRender) ||
        /\[CITE[_:][^\]]+\]/i.test(contentToRender))
    const hasCITATIONMarkers =
      contentToRender && /\[CITATION:\d+/.test(contentToRender)
    
    // Skip source extraction if we have evidence citations OR evidence-style markers
    // Evidence markers indicate this response came from evidence mode, so we should wait
    // for evidence citations to be restored rather than extracting from web sources
    if (hasAttachedEvidenceCitations) {
      console.log('[MessageAssistant] Skipping source extraction - using evidence citations:', effectiveEvidenceCitations.length)
      return
    }

    const hasPmidStyleMarkers =
      Boolean(contentToRender) && /\[\s*\d{6,10}(?:\s*[,;]\s*\d{6,10})*\s*\]/.test(contentToRender)

    // If we have ordinal evidence markers like [1], [2] but no citations yet, check sessionStorage.
    // For PMID-style markers like [1578956], we should NOT block fallback synthesis from text.
    if (hasEvidenceMarkers && !hasCITATIONMarkers) {
      let hasStoredEvidenceCitations = false
      if (typeof window !== 'undefined') {
        try {
          const latest = sessionStorage.getItem('evidenceCitations:latest')
          if (latest) {
            const latestData = JSON.parse(latest)
            if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
              const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 60000) // 1 minute
              if (isRecent) {
                hasStoredEvidenceCitations = true
                console.log('[MessageAssistant] Found evidence markers [1] and stored citations - waiting for restore, skipping source extraction')
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      if (hasStoredEvidenceCitations && !hasPmidStyleMarkers) {
        // Don't extract from sources - evidence citations will be restored soon
        return
      }
    }
    
    // Check if we have citation markers in the text - check both formats
    const hasCitationMarkers = hasCITATIONMarkers || hasEvidenceMarkers
    
    // Create a key from sources to detect changes
    const sourcesKey = sources.map(s => s.url).sort().join('|')
    
    // Extract citations whenever we have sources, even during streaming
    if (sources.length > 0) {
      // Prevent duplicate loading - only load if sources changed or we haven't loaded yet
      if (lastSourcesKeyRef.current === sourcesKey && hasLoadedRef.current) {
        return
      }
      
      lastSourcesKeyRef.current = sourcesKey
      hasLoadedRef.current = true
      setIsLoadingCitations(true)
      
      // Check if sources are from web search (PubMed, JAMA, NEJM, etc.)
      const hasWebSearchSources = sources.some(s => 
        s.url?.includes('pubmed') || 
        s.url?.includes('jama') || 
        s.url?.includes('nejm') ||
        s.url?.includes('nature.com') ||
        s.url?.includes('science.org') ||
        s.url?.includes('thelancet.com') ||
        s.url?.includes('bmj.com') ||
        s.url?.includes('cell.com') ||
        s.url?.includes('aafp.org') ||
        s.url?.includes('uptodate.com')
      )
      
      // Use web search extraction if we have web search sources
      const extractionFn = hasWebSearchSources 
        ? extractCitationsFromWebSearch 
        : extractCitationsFromSources
      
      // Use current content or empty string if still streaming
      const contentToUse = contentToRender || ""
      
      extractionFn(sources, contentToUse)
        .then((extractedCitations) => {
          // Only update if we got citations
          if (extractedCitations.size > 0) {
            setCitations(extractedCitations)
          }
          setIsLoadingCitations(false)
        })
        .catch((error) => {
          console.error("[MessageAssistant] Error extracting citations:", error)
          setIsLoadingCitations(false)
        })
    } else if (hasCitationMarkers) {
      // Only create placeholder citations if we haven't loaded from sources yet
      // Check if we already have citations loaded
      if (hasLoadedRef.current) {
        return // Don't overwrite existing citations
      }
      
      const markers = parseCitationMarkers(contentToRender || "")
      const uniqueIndices = getUniqueCitationIndices(markers)
      const placeholderCitations = new Map<number, CitationData>()
      const inlinePmids = extractInlinePmidCandidates(contentToRender || "")
      const inlineSourceIds = extractInlineSourceIdCandidates(contentToRender || "")
      
      // Try to extract URLs from the text - be more aggressive
      const urlPattern = /https?:\/\/[^\s\)\]\[]+/g
      const allUrls = (contentToRender || "").match(urlPattern) || []
      
      // Also try to extract PubMed/JAMA/NEJM URLs specifically (more patterns)
      const pubmedUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d+)/gi
      const jamaUrlPattern = /(?:https?:\/\/)?(?:www\.)?jamanetwork\.com\/[^\s\)\]\[]+/gi
      const nejmUrlPattern = /(?:https?:\/\/)?(?:www\.)?nejm\.org\/[^\s\)\]\[]+/gi
      
      // Also look for domain patterns without full URLs
      const domainPattern = /(?:pubmed|jama|nejm|nature|science|thelancet|bmj|cell|aafp|uptodate)\.(?:org|com|net)[^\s\)\]\[]*/gi
      const domainUrls = (contentToRender || "").match(domainPattern) || []
      
      const pubmedUrls = (contentToRender || "").match(pubmedUrlPattern) || []
      const jamaUrls = (contentToRender || "").match(jamaUrlPattern) || []
      const nejmUrls = (contentToRender || "").match(nejmUrlPattern) || []
      
      const medicalUrls = [...pubmedUrls, ...jamaUrls, ...nejmUrls, ...domainUrls, ...allUrls]
      const uniqueUrls = Array.from(new Set(medicalUrls))
      const hasLikelyPmidOnlyCitations =
        uniqueIndices.length > 0 && uniqueIndices.every((idx) => idx >= 100000 && idx <= 9999999999)
      
      uniqueIndices.forEach((idx, i) => {
        const url = uniqueUrls[i] || uniqueUrls[idx - 1] || undefined
        
        let finalUrl = url
        let inferredPmid: string | undefined
        if (idx >= 100000 && idx <= 9999999999) {
          inferredPmid = String(idx)
          finalUrl = finalUrl || `https://pubmed.ncbi.nlm.nih.gov/${idx}/`
        }
        if (!finalUrl) {
          // Look for PMID in the citation context
          const marker = markers.find(m => m.indices.includes(idx))
          if (marker) {
            const start = Math.max(0, marker.startIndex - 200)
            const end = Math.min(contentToRender.length, marker.endIndex + 200)
            const citationContext = contentToRender?.substring(start, end) || ""
            const pmidMatch = citationContext.match(/PMID[:\s]+(\d+)/i) || 
                            citationContext.match(/(\d{6,10})/)?.[1] ||
                            citationContext.match(/pubmed[^\d]*(\d{6,10})/i)?.[1]
            if (pmidMatch) {
              const pmid = Array.isArray(pmidMatch) ? pmidMatch[1] : pmidMatch
              inferredPmid = pmid
              finalUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
            }
          }
        } else if (!finalUrl.startsWith('http')) {
          // Add https:// if missing
          finalUrl = `https://${finalUrl}`
        }
        
        if (!inferredPmid && finalUrl?.includes("pubmed.ncbi.nlm.nih.gov")) {
          const pmidFromUrl = finalUrl.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,10})/i)?.[1]
          if (pmidFromUrl) inferredPmid = pmidFromUrl
        }

        const journalName = finalUrl ? extractJournalFromUrl(finalUrl) : undefined
        
        placeholderCitations.set(idx, {
          index: idx,
          sourceId: inferredPmid ? `pmid:${inferredPmid}` : undefined,
          title:
            inferredPmid
              ? `PMID ${inferredPmid}`
              : journalName
                ? `View on ${journalName}`
                : hasLikelyPmidOnlyCitations
                  ? `PMID ${idx}`
                  : `Citation ${idx}`,
          authors: [],
          journal:
            inferredPmid || hasLikelyPmidOnlyCitations
              ? "PubMed"
              : journalName || `Citation ${idx}`,
          year: finalUrl ? extractYearFromUrl(finalUrl) || '' : '',
          url: finalUrl,
          pmid: inferredPmid,
        })
      })

      // If marker parsing failed but explicit PMIDs exist, still synthesize citations.
      if (placeholderCitations.size === 0 && inlinePmids.length > 0) {
        inlinePmids.forEach((pmid) => {
          const index = Number.parseInt(pmid, 10)
          placeholderCitations.set(index, {
            index,
            sourceId: `pmid:${pmid}`,
            title: `PMID ${pmid}`,
            authors: [],
            journal: "PubMed",
            year: "",
            url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            pmid,
          })
        })
      }

      if (placeholderCitations.size === 0 && inlineSourceIds.length > 0) {
        inlineSourceIds.forEach((sourceId, i) => {
          const fallbackIndex = i + 1
          if (sourceId.startsWith("pmid:")) {
            const pmid = sourceId.replace(/^pmid:/, "").trim()
            if (!/^\d{6,10}$/.test(pmid)) return
            const index = Number.parseInt(pmid, 10)
            placeholderCitations.set(index, {
              index,
              sourceId: `pmid:${pmid}`,
              title: `PMID ${pmid}`,
              authors: [],
              journal: "PubMed",
              year: "",
              url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
              pmid,
            })
            return
          }
          if (sourceId.startsWith("doi:")) {
            const doi = sourceId.replace(/^doi:/, "").trim()
            if (!doi) return
            placeholderCitations.set(fallbackIndex, {
              index: fallbackIndex,
              sourceId: `doi:${doi}`,
              title: `DOI ${doi}`,
              authors: [],
              journal: "DOI Source",
              year: "",
              url: `https://doi.org/${doi}`,
              doi,
            })
            return
          }
          if (sourceId.startsWith("url:")) {
            const rawUrl = sourceId.replace(/^url:/, "").trim()
            if (!rawUrl) return
            const normalizedUrl = /^https?:\/\//i.test(rawUrl)
              ? rawUrl
              : `https://${rawUrl}`
            placeholderCitations.set(fallbackIndex, {
              index: fallbackIndex,
              sourceId: `url:${rawUrl}`,
              title: "Source",
              authors: [],
              journal: extractJournalFromUrl(normalizedUrl) || "Source",
              year: extractYearFromUrl(normalizedUrl) || "",
              url: normalizedUrl,
            })
            return
          }
          placeholderCitations.set(fallbackIndex, {
            index: fallbackIndex,
            sourceId,
            title: sourceId,
            authors: [],
            journal: "Source",
            year: "",
          })
        })
      }
      
      if (placeholderCitations.size > 0) {
        setCitations(placeholderCitations)
        hasLoadedRef.current = true // Mark as loaded to prevent overwriting
      }
    } else if (sources.length === 0 && !hasCitationMarkers) {
      // Only clear citations if we have no sources and no markers
      // But don't clear if we've already loaded citations
      if (!hasLoadedRef.current) {
        setCitations(new Map())
      }
    }
    // Include evidenceCitations to ensure we re-check when they arrive
  }, [contentToRender, effectiveEvidenceCitations, hasAttachedEvidenceCitations, sources])
  
  const mergedCitations = useMemo(
    () => mergeAppendixCitations(citations, trailingSourceEntries),
    [citations, trailingSourceEntries]
  )

  // Use evidence citations if available, otherwise fall back to web search citations
  const activeCitations = hasEvidenceCitations ? evidenceCitationMap : mergedCitations
  const sourcesCitations = useMemo(
    () => mergeEvidenceIntoCitations(mergedCitations, displayEvidenceCitations),
    [displayEvidenceCitations, mergedCitations]
  )
  const meaningfulSourcesCitations = useMemo(() => {
    const filtered = new Map<number, CitationData>()
    sourcesCitations.forEach((citation, index) => {
      if (isMeaningfulCitationData(citation)) {
        filtered.set(index, citation)
      }
    })
    return filtered
  }, [sourcesCitations])

  // Hide dedicated sources section when all fallback entries
  // are placeholders like "Citation 1" with no real metadata.
  const hasOnlyPlaceholderCitations = useMemo(() => {
    if (meaningfulSourcesCitations.size === 0) return false

    return Array.from(meaningfulSourcesCitations.values()).every((citation) => {
      const title = (citation.title || "").trim()
      const journal = (citation.journal || "").trim()
      const placeholderPattern = /^Citation\s+\d+$/i
      return (
        placeholderPattern.test(title) &&
        placeholderPattern.test(journal)
      )
    })
  }, [meaningfulSourcesCitations])
  
  // Check if message has citations or sources
  const hasCitations = activeCitations.size > 0
  const hasSources = sources.length > 0
  // Check if text contains citation markers - now also check for [1], [2] pattern used by evidence mode
  const hasCitationMarkers =
    Boolean(contentToRender) &&
    (/\[CITATION:\d+/.test(contentToRender) ||
      /\[\d+\]/.test(contentToRender) ||
      /\[PMID\s*:\s*\d+\]/i.test(contentToRender) ||
      /\[CITE[_:][^\]]+\]/i.test(contentToRender))
  // Show citations if we have them, have sources, or have citation markers in text
  const shouldShowCitations = hasCitations || hasSources || hasCitationMarkers
  const showSourcesSection =
    status === "ready" &&
    meaningfulSourcesCitations.size > 0 &&
    !isLastStreaming &&
    !hasOnlyPlaceholderCitations
  const showTrustSummary =
    status === "ready" &&
    hasEvidenceCitations &&
    !isLastStreaming
  
  // Memoize search image results processing
  const searchImageResults = useMemo(() => 
    parts
      ?.filter(
        (part) =>
          part.type === "tool-invocation" &&
          part.toolInvocation?.state === "result" &&
          part.toolInvocation?.toolName === "imageSearch" &&
          part.toolInvocation?.result?.content?.[0]?.type === "images"
      )
      .flatMap((part) => {
        try {
          return part.type === "tool-invocation" &&
            part.toolInvocation?.state === "result" &&
            part.toolInvocation?.toolName === "imageSearch" &&
            part.toolInvocation?.result?.content?.[0]?.type === "images"
              ? (part.toolInvocation?.result?.content?.[0]?.results ?? [])
              : []
        } catch (error) {
          console.warn("Error processing image search results:", error)
          return []
        }
      }) ?? [], [parts]
  )

  const youtubeResults = useMemo(
    () =>
      parts
        ?.filter(
          (part) =>
            part.type === "tool-invocation" &&
            part.toolInvocation?.state === "result" &&
            part.toolInvocation?.toolName === "youtubeSearch"
        )
        .flatMap((part) => {
          if (part.type !== "tool-invocation" || part.toolInvocation?.state !== "result") {
            return []
          }

          const result = part.toolInvocation.result as
            | { results?: unknown[] }
            | unknown[]
            | null
            | undefined
          const rawItems = Array.isArray(result)
            ? result
            : result && typeof result === "object" && Array.isArray(result.results)
              ? result.results
              : []
          return rawItems.filter(
            (item): item is YouTubeResultItem =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  "videoId" in item &&
                  "url" in item &&
                  "title" in item &&
                  "channelTitle" in item &&
                  typeof (item as { videoId: unknown }).videoId === "string" &&
                  isLikelyYouTubeVideoId((item as { videoId: string }).videoId) &&
                  typeof (item as { url: unknown }).url === "string" &&
                  /youtube\.com\/watch\?v=|youtu\.be\//i.test(
                    (item as { url: string }).url
                  )
              )
          )
        }) ?? [],
    [parts]
  )

  const youtubeResultsFromContent = useMemo(() => {
    if (!contentToRender) return []

    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi
    const bareUrlRegex = /https?:\/\/[^\s)\]]+/gi
    const candidates: Array<{ title?: string; url: string }> = []

    let markdownMatch: RegExpExecArray | null = markdownLinkRegex.exec(contentToRender)
    while (markdownMatch) {
      candidates.push({
        title: markdownMatch[1],
        url: markdownMatch[2],
      })
      markdownMatch = markdownLinkRegex.exec(contentToRender)
    }

    const bareMatches = contentToRender.match(bareUrlRegex) || []
    for (const url of bareMatches) {
      candidates.push({ url })
    }

    const dedupedByVideoId = new Map<string, YouTubeResultItem>()
    for (const candidate of candidates) {
      const videoId = extractYouTubeVideoId(candidate.url)
      if (!videoId) continue
      if (dedupedByVideoId.has(videoId)) continue

      dedupedByVideoId.set(videoId, {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: candidate.title?.trim() || "YouTube video",
        description: "",
        channelTitle: "youtube.com",
        publishedAt: null,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      })
    }

    return Array.from(dedupedByVideoId.values()).slice(0, 8)
  }, [contentToRender])

  const effectiveYoutubeResults =
    (youtubeResults.length > 0 ? youtubeResults : youtubeResultsFromContent)
      .filter((item, index, arr) => {
        const firstIdx = arr.findIndex(
          (candidate) =>
            candidate.videoId === item.videoId && candidate.url === item.url
        )
        return firstIdx === index
      })
      .slice(0, 9)

  const artifactPayloads = useMemo(() => {
    if (!parts || !Array.isArray(parts)) return []
    const artifacts: Array<DocumentArtifact | QuizArtifact> = []
    for (const part of parts as any[]) {
      if (part?.type === "tool-invocation" && part?.toolInvocation?.state === "result") {
        const artifact = parseArtifactFromToolResult(part?.toolInvocation?.result)
        if (artifact) {
          artifacts.push(artifact)
        }
      }
      if (part?.type === "metadata" && part?.metadata) {
        const metadata = part.metadata as {
          documentArtifacts?: unknown[]
          quizArtifacts?: unknown[]
        }
        if (Array.isArray(metadata.documentArtifacts)) {
          artifacts.push(...metadata.documentArtifacts.filter(isDocumentArtifact))
        }
        if (Array.isArray(metadata.quizArtifacts)) {
          artifacts.push(...metadata.quizArtifacts.filter(isQuizArtifact))
        }
      }
    }
    const deduped = new Map<string, DocumentArtifact | QuizArtifact>()
    for (const artifact of artifacts) {
      const key = `${artifact.artifactType}:${artifact.artifactId}`
      if (!deduped.has(key)) {
        deduped.set(key, artifact)
      }
    }
    return Array.from(deduped.values())
  }, [parts])

  const documentArtifacts = artifactPayloads.filter(
    (artifact): artifact is DocumentArtifact => artifact.artifactType === "document"
  )
  const quizArtifacts = artifactPayloads.filter(
    (artifact): artifact is QuizArtifact => artifact.artifactType === "quiz"
  )
  const inlineFallbackText = useMemo(() => {
    if (contentToRender && contentToRender.trim().length > 0) {
      return contentToRender
    }
    if (artifactPayloads.length === 0) return contentToRender
    if (documentArtifacts.length > 0 && quizArtifacts.length === 0) {
      return "Here is your generated document."
    }
    if (quizArtifacts.length > 0 && documentArtifacts.length === 0) {
      return "Here is your generated quiz."
    }
    return "Your generated artifacts are ready below."
  }, [artifactPayloads.length, contentToRender, documentArtifacts.length, quizArtifacts.length])
  const activityTimelineEvents = useMemo(
    () =>
      buildChatActivityTimeline({
        messageId,
        parts,
        annotations: (annotations || []) as any,
        fallbackText: inlineFallbackText,
        status,
        streamIntroPreview,
        optimisticTaskBoard,
        referencedUploads,
      }),
    [
      annotations,
      inlineFallbackText,
      messageId,
      parts,
      optimisticTaskBoard,
      referencedUploads,
      status,
      streamIntroPreview,
    ]
  )
  const hasRenderableActivityTimeline = ENABLE_CHAT_ACTIVITY_TIMELINE_V2
    ? activityTimelineEvents.length > 0
    : hasRenderableTimelineParts
  const [exportingArtifactId, setExportingArtifactId] = useState<string | null>(null)

  const handleDocumentExport = useCallback(async (artifact: DocumentArtifact, format: "pdf" | "docx") => {
    setExportingArtifactId(`${artifact.artifactId}:${format}`)
    try {
      const response = await fetch("/api/documents/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          format,
          artifact,
        }),
      })
      if (!response.ok) {
        throw new Error("Failed to export document")
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = blobUrl
      anchor.download =
        parseFilenameFromContentDisposition(
          response.headers.get("Content-Disposition")
        ) || `${artifact.title || "document-artifact"}.${format}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error("[Artifact Export] Failed:", error)
    } finally {
      setExportingArtifactId(null)
    }
  }, [])

  // Memoize handlers to prevent unnecessary re-renders
  const memoizedCopyToClipboard = useCallback(() => {
    if (copyToClipboard) copyToClipboard()
  }, [copyToClipboard])

  const [fullAnalysisCopied, setFullAnalysisCopied] = useState(false)
  const handleCopyFullAnalysis = useCallback(() => {
    const citations = displayEvidenceCitations.length > 0 ? displayEvidenceCitations : []
    // Build an index mapping from original citation index to sequential number
    const indexMap = new Map<number, number>()
    const sortedCitations = [...citations].sort((a, b) => a.index - b.index)
    sortedCitations.forEach((c, i) => indexMap.set(c.index, i + 1))

    // Remap citation markers in response text to sequential numbering
    let responseText = contentToRender || children || ""
    indexMap.forEach((newIdx, oldIdx) => {
      responseText = responseText.replace(
        new RegExp(`\\[${oldIdx}\\]`, "g"),
        `[__SEQ_${newIdx}__]`
      )
    })
    responseText = responseText.replace(/__SEQ_(\d+)__/g, "$1")

    const lines: string[] = []
    lines.push("=== FLEMING FULL RESPONSE ===\n")
    lines.push(responseText)
    lines.push("\n\n=== EVIDENCE SOURCES (" + sortedCitations.length + ") ===\n")
    sortedCitations.forEach((c, i) => {
      const seqNum = i + 1
      lines.push(`[${seqNum}] ${c.title || "Untitled"}`)
      const meta: string[] = []
      if (c.journal) meta.push(`Journal: ${c.journal}`)
      if (c.year) meta.push(`Year: ${c.year}`)
      if (c.evidenceLevel) meta.push(`Evidence Level: L${c.evidenceLevel}`)
      if (c.studyType) meta.push(`Study Type: ${c.studyType}`)
      if (c.pmid) meta.push(`PMID: ${c.pmid}`)
      if (c.doi) meta.push(`DOI: ${c.doi}`)
      if (c.url) meta.push(`URL: ${c.url}`)
      if (c.sourceId) meta.push(`Source ID: ${c.sourceId}`)
      if (c.sourceType) meta.push(`Source Type: ${c.sourceType}`)
      if (c.sourceLabel) meta.push(`Source Label: ${c.sourceLabel}`)
      if (Array.isArray(c.authors) && c.authors.length > 0) meta.push(`Authors: ${c.authors.join(", ")}`)
      if (c.sampleSize) meta.push(`Sample Size: ${c.sampleSize}`)
      if (Array.isArray(c.meshTerms) && c.meshTerms.length > 0) meta.push(`MeSH: ${c.meshTerms.join(", ")}`)
      if (c.snippet) meta.push(`Snippet: ${c.snippet.slice(0, 200)}`)
      if (meta.length > 0) lines.push("  " + meta.join(" | "))
      lines.push("")
    })
    lines.push("=== END ===")
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setFullAnalysisCopied(true)
      setTimeout(() => setFullAnalysisCopied(false), 2000)
    })
  }, [contentToRender, children, displayEvidenceCitations])

  const memoizedOnReload = useCallback(() => {
    if (onReload) onReload()
  }, [onReload])

  const totalSyncedInsightCount = Math.max(
    discussionInsightCount,
    syncedInsightCount
  )

  return (
    <>
      <Message
        className={cn(
          "group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
          hasScrollAnchor && "min-h-scroll-anchor",
          className
        )}
      >
        <div className={cn("flex min-w-full flex-col gap-2", isLast && "pb-8")}>
        {searchImageResults.length > 0 && (
          <SearchImages results={searchImageResults} />
        )}

        {learningCard && <LearningCard card={learningCard} />}

        {clinicalDocument &&
        (clinicalDocument.content.trim().length > 50 ||
          clinicalDocument.isStreaming ||
          (clinicalDocument.type === "prescribe" &&
            (clinicalDocument.prescriptionItems?.length ?? 0) > 0)) ? (
          <>
            {clinicalDocument.type === "prescribe" &&
              (clinicalDocument.prescriptionItems?.length ?? 0) > 0 && (
                <PrescriptionCard items={clinicalDocument.prescriptionItems!} />
              )}
            {(clinicalDocument.content.trim().length > 50 ||
              clinicalDocument.isStreaming) && (
              <ClinicalDocumentCard
                document={clinicalDocument}
                onExpand={handleExpandDocument}
                messageId={messageId}
              />
            )}
          </>
        ) : contentNullOrEmpty && !hasRenderableActivityTimeline ? (
          isLastStreaming ? (
            <div className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
              {streamIntroPreview ? (
                <div className="text-muted-foreground text-sm leading-6">
                  {streamIntroPreview}
                </div>
              ) : (
                <ProcessingLoader />
              )}
            </div>
          ) : null
        ) : (
          ENABLE_CHAT_ACTIVITY_TIMELINE_V2 ? (
            <ActivityTimeline
              events={activityTimelineEvents}
              status={status}
              onSuggestion={onSuggestion}
              onWorkflowSuggestion={onWorkflowSuggestion}
              onChartDrilldown={handleChartDrilldown}
              isDrilldownModeActive={
                drilldownState.open && drilldownState.status === "running"
              }
              shouldShowCitations={shouldShowCitations}
              citations={activeCitations}
              evidenceCitations={hasEvidenceCitations ? displayEvidenceCitations : undefined}
              onExportDocument={handleDocumentExport}
              exportingArtifactId={exportingArtifactId}
            />
          ) : (
            <AssistantInlineParts
              parts={parts}
              fallbackText={inlineFallbackText}
              status={status}
              onSuggestion={onSuggestion}
              onWorkflowSuggestion={onWorkflowSuggestion}
              shouldShowCitations={shouldShowCitations}
              citations={activeCitations}
              evidenceCitations={hasEvidenceCitations ? displayEvidenceCitations : undefined}
              streamIntroPreview={streamIntroPreview}
              onChartDrilldown={handleChartDrilldown}
            />
          )
        )}

        {artifactRefinement && shouldRenderAnnotationRefinementFallback ? (
          <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3.5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Refine Generation
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {artifactRefinement.title || "Refine Generation"}
                </p>
                <p className="mt-1 text-sm">
                  {artifactRefinement.question || "Choose one option to continue."}
                </p>
                {artifactRefinement.helperText ? (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {artifactRefinement.helperText}
                  </p>
                ) : null}
              </div>

              {artifactRefinement.requiredFields &&
              artifactRefinement.requiredFields.length > 0 ? (
                <div className="rounded-md border border-border/70 bg-muted/25 p-2">
                  <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                    Required Details
                  </p>
                  <p className="mt-1 text-xs">
                    {artifactRefinement.requiredFields.join(" • ")}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                {refinementSubmitState === "idle"
                  ? (artifactRefinement.choices || [])
                      .filter((choice) => !choice.requiresCustomInput)
                      .map((choice) => (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() =>
                            submitAnnotationRefinement(choice.submitText, choice.id)
                          }
                          disabled={isRefinementLocked}
                          className={cn(
                            "hover:bg-accent/50 flex w-full items-start gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-75",
                            refinementSelectedChoiceId === choice.id &&
                              "border-primary/60 bg-primary/5"
                          )}
                        >
                          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/70 text-[11px] font-semibold text-foreground/80">
                            {choice.id}
                          </span>
                          <span>{choice.label}</span>
                        </button>
                      ))
                  : null}
              </div>

              {(artifactRefinement.choices || []).some(
                (choice) => choice.requiresCustomInput
              ) && refinementSubmitState === "idle" ? (
                <div className="rounded-md border border-border bg-background p-2.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    E. Custom requirements (blank)
                  </p>
                  <textarea
                    value={customRefinementInput}
                    onChange={(event) => setCustomRefinementInput(event.target.value)}
                    disabled={isRefinementLocked}
                    placeholder={
                      artifactRefinement.customInputPlaceholder ||
                      "Type your custom requirements here"
                    }
                    className="mt-2 min-h-[78px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        submitAnnotationRefinement(customRefinementInput, "E")
                      }}
                      disabled={
                        customRefinementInput.trim().length === 0 || isRefinementLocked
                      }
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
                    >
                      {isRefinementLocked ? "Submitted" : "Submit custom requirements"}
                    </button>
                  </div>
                </div>
              ) : null}
              {refinementSubmitState !== "idle" ? (
                <div className="rounded-md border border-border/70 bg-muted/30 px-2.5 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Submitted
                  </p>
                  <p className="mt-1 text-xs text-foreground/90">
                    {refinementSubmitState === "submitting"
                      ? "Sending your quiz requirements..."
                      : "Requirements submitted. Generating quiz..."}
                  </p>
                  {refinementSelectedChoiceId ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Selected option: {refinementSelectedChoiceId}
                    </p>
                  ) : null}
                  {refinementSubmittedText ? (
                    <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                      {refinementSubmittedText}
                    </p>
                  ) : null}
                </div>
              ) : null}
          </div>
        ) : null}

        {!ENABLE_CHAT_ACTIVITY_TIMELINE_V2 &&
        (documentArtifacts.length > 0 || quizArtifacts.length > 0) && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Generated Artifacts
            </p>
            <div className="mt-2 space-y-2">
              {documentArtifacts.map((artifact) => (
                <DocumentArtifactCard
                  key={artifact.artifactId}
                  artifact={artifact}
                  onExport={handleDocumentExport}
                  exportingArtifactId={exportingArtifactId}
                />
              ))}
              {quizArtifacts.map((artifact) => (
                <InteractiveQuizArtifactCard
                  key={artifact.artifactId}
                  artifact={artifact}
                />
              ))}
            </div>
          </div>
        )}

        {effectiveYoutubeResults.length > 0 && (
          <YouTubeResults results={effectiveYoutubeResults} />
        )}

        {isLast &&
        latestAddedDrilldownEntry &&
        totalSyncedInsightCount > 0 ? (
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={handleOpenSyncedInsight}
            className={cn(
              "h-7 rounded-full px-3 text-[11px] font-medium text-foreground/90 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.55)]",
              shouldPulseInsightPill && "animate-pulse"
            )}
          >
            <Check className="size-3.5" weight="bold" />
            Insight Added • {totalSyncedInsightCount}
          </Button>
        ) : null}

        {showTrustSummary && (
          <TrustSummaryCard
            content={contentToRender}
            citations={meaningfulEvidenceCitations}
            prompt={contextPrompt}
          />
        )}
        {showSourcesSection && (
          <ReferencesSection citations={meaningfulSourcesCitations} title="Sources" />
        )}

        {Boolean(isLastStreaming || contentNullOrEmpty) ? null : (
          <MessageActions
            className={cn(
              "-ml-2 flex gap-0 opacity-0 transition-opacity group-hover:opacity-100"
            )}
          >
            <MessageAction
              tooltip={copied ? "Copied!" : "Copy text"}
              side="bottom"
            >
              <button
                className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
                aria-label="Copy text"
                onClick={memoizedCopyToClipboard}
                type="button"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </MessageAction>
            {hasEvidenceCitations && (
              <MessageAction
                tooltip={fullAnalysisCopied ? "Copied with sources!" : "Copy with all sources"}
                side="bottom"
              >
                <button
                  className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
                  aria-label="Copy full analysis with sources"
                  onClick={handleCopyFullAnalysis}
                  type="button"
                >
                  {fullAnalysisCopied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <ClipboardText className="size-4" />
                  )}
                </button>
              </MessageAction>
            )}
            {isLast ? (
              <MessageAction
                tooltip="Regenerate"
                side="bottom"
                delayDuration={0}
              >
                <button
                  className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
                  aria-label="Regenerate"
                  onClick={memoizedOnReload}
                  type="button"
                >
                  <ArrowClockwise className="size-4" />
                </button>
              </MessageAction>
            ) : null}
          </MessageActions>
        )}
        </div>
      </Message>
      <DrilldownPanel
        open={drilldownState.open}
        onOpenChange={handleDrilldownPanelOpenChange}
        context={drilldownState.context}
        query={drilldownState.query}
        status={drilldownState.status}
        response={drilldownState.response}
        citations={drilldownState.citations}
        error={drilldownState.error}
        tasks={drilldownState.tasks}
        onRetry={handleRetryDrilldown}
        onPromoteToChat={handlePromoteDrilldownToChat}
        isAddingInsight={isAddingDrilldownInsight}
        didAddInsight={didAddDrilldownInsight}
        isSyncedToDiscussion={isActiveDrilldownSynced}
      />
    </>
  )
}
