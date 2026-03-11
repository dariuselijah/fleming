import {
  Message,
  MessageAction,
  MessageActions,
} from "@/components/prompt-kit/message"
import { ProcessingLoader } from "@/components/prompt-kit/processing-loader"
import { cn } from "@/lib/utils"
import { ENABLE_CHAT_ACTIVITY_TIMELINE_V2 } from "@/lib/config"
import type { Message as MessageAISDK } from "@ai-sdk/react"
import { ArrowClockwise, Check, Copy } from "@phosphor-icons/react"
import { AssistantInlineParts } from "./assistant-inline-parts"
import { ActivityTimeline } from "./activity/activity-timeline"
import { buildChatActivityTimeline } from "./activity/build-timeline"
import type { ReferencedUploadStatus } from "./activity/types"
import { getSources } from "./get-sources"
import { SearchImages } from "./search-images"
import { YouTubeResults, type YouTubeResultItem } from "./youtube-results"
import { ReferencesSection } from "./references-section"
import { TrustSummaryCard } from "./trust-summary-card"
import { extractCitationsFromSources, extractCitationsFromWebSearch, extractJournalFromUrl, extractYearFromUrl } from "./citation-utils"
import type { CitationData } from "./citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { parseCitationMarkers, getUniqueCitationIndices } from "@/lib/citations/parser"
import { useMemo, useCallback, useEffect, useState, useRef } from "react"
import { parseLearningCard } from "@/lib/medical-student-learning"
import { LearningCard } from "./learning-card"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import { splitTrailingSourceAppendix } from "./source-appendix"
import {
  DocumentArtifactCard,
  InteractiveQuizArtifactCard,
} from "./generated-artifact-cards"

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
  referencedUploads?: ReferencedUploadStatus[]
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

function mergeEvidenceIntoCitations(
  baseCitations: Map<number, CitationData>,
  evidenceCitations: EvidenceCitation[]
): Map<number, CitationData> {
  if (evidenceCitations.length === 0) return baseCitations

  const merged = new Map<number, CitationData>()
  const seen = new Set<string>()
  let maxIndex = 0

  baseCitations.forEach((citation, index) => {
    merged.set(index, citation)
    maxIndex = Math.max(maxIndex, index)
    const citationKey =
      (citation.pmid && `pmid:${citation.pmid}`) ||
      (citation.url && `url:${citation.url}`) ||
      `title:${(citation.title || "").toLowerCase()}`
    seen.add(citationKey)
  })

  evidenceCitations.forEach((citation) => {
    const key =
      (citation.pmid && `pmid:${citation.pmid}`) ||
      (citation.url && `url:${citation.url}`) ||
      `title:${(citation.title || "").toLowerCase()}`
    if (seen.has(key)) return

    maxIndex += 1
    const mapped = toCitationDataFromEvidence(citation)
    merged.set(maxIndex, { ...mapped, index: maxIndex })
    seen.add(key)
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
  referencedUploads = [],
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
  
  // Track evidence citations attached to this message payload.
  const hasAttachedEvidenceCitations = evidenceCitations.length > 0
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

    return evidenceCitations.filter((citation) => {
      const citationPmid = typeof citation.pmid === "string" ? citation.pmid.trim() : ""
      return referencedIndices.has(citation.index) || (citationPmid.length > 0 && referencedPmids.has(citationPmid))
    })
  }, [contentToRender, evidenceCitations, hasAttachedEvidenceCitations])
  const displayEvidenceCitations = useMemo(
    () =>
      referencedEvidenceCitations.length > 0
        ? referencedEvidenceCitations
        : evidenceCitations,
    [evidenceCitations, referencedEvidenceCitations]
  )
  const hasEvidenceCitations = displayEvidenceCitations.length > 0
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
      contentToRender && (/\[\d+\]/.test(contentToRender) || /\[PMID\s*:\s*\d+\]/i.test(contentToRender))
    const hasCITATIONMarkers =
      contentToRender && /\[CITATION:\d+/.test(contentToRender)
    
    // Skip source extraction if we have evidence citations OR evidence-style markers
    // Evidence markers indicate this response came from evidence mode, so we should wait
    // for evidence citations to be restored rather than extracting from web sources
    if (hasAttachedEvidenceCitations) {
      console.log('[MessageAssistant] Skipping source extraction - using evidence citations:', evidenceCitations.length)
      return
    }

    // If evidence markers are present and we also have tool/source metadata,
    // allow source extraction to map those markers onto real citations.
    if (hasEvidenceMarkers && sources.length === 0) {
      return
    }
    
    // If we have evidence markers but no citations yet, check sessionStorage
    // This handles the case where state was reset but citations exist in storage
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
      
      if (hasStoredEvidenceCitations) {
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
      
      uniqueIndices.forEach((idx, i) => {
        const url = uniqueUrls[i] || uniqueUrls[idx - 1] || undefined
        
        let finalUrl = url
        if (!finalUrl) {
          // Look for PMID in the citation context
          const marker = markers.find(m => m.indices.includes(idx))
          if (marker) {
            const start = Math.max(0, marker.startIndex - 200)
            const end = Math.min(contentToRender.length, marker.endIndex + 200)
            const citationContext = contentToRender?.substring(start, end) || ""
            const pmidMatch = citationContext.match(/PMID[:\s]+(\d+)/i) || 
                            citationContext.match(/(\d{8})/)?.[1] ||
                            citationContext.match(/pubmed[^\d]*(\d{8,})/i)?.[1]
            if (pmidMatch) {
              finalUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch}`
            }
          }
        } else if (!finalUrl.startsWith('http')) {
          // Add https:// if missing
          finalUrl = `https://${finalUrl}`
        }
        
        const journalName = finalUrl ? extractJournalFromUrl(finalUrl) : undefined
        
        placeholderCitations.set(idx, {
          index: idx,
          title: journalName ? `View on ${journalName}` : `Citation ${idx}`,
          authors: [],
          journal: journalName || `Citation ${idx}`,
          year: finalUrl ? extractYearFromUrl(finalUrl) || '' : '',
          url: finalUrl,
        })
      })
      
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
  }, [contentToRender, evidenceCitations, hasAttachedEvidenceCitations, sources])
  
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

  // Hide dedicated sources section when all fallback entries
  // are placeholders like "Citation 1" with no real metadata.
  const hasOnlyPlaceholderCitations = useMemo(() => {
    if (sourcesCitations.size === 0) return false

    return Array.from(sourcesCitations.values()).every((citation) => {
      const title = (citation.title || "").trim()
      const journal = (citation.journal || "").trim()
      const placeholderPattern = /^Citation\s+\d+$/i
      return (
        placeholderPattern.test(title) &&
        placeholderPattern.test(journal)
      )
    })
  }, [sourcesCitations])
  
  // Check if message has citations or sources
  const hasCitations = activeCitations.size > 0
  const hasSources = sources.length > 0
  // Check if text contains citation markers - now also check for [1], [2] pattern used by evidence mode
  const hasCitationMarkers =
    Boolean(contentToRender) &&
    (/\[CITATION:\d+/.test(contentToRender) ||
      /\[\d+\]/.test(contentToRender) ||
      /\[PMID\s*:\s*\d+\]/i.test(contentToRender))
  // Show citations if we have them, have sources, or have citation markers in text
  const shouldShowCitations = hasCitations || hasSources || hasCitationMarkers
  const showSourcesSection =
    status === "ready" &&
    sourcesCitations.size > 0 &&
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
        streamIntroPreview,
        referencedUploads,
      }),
    [
      annotations,
      inlineFallbackText,
      messageId,
      parts,
      referencedUploads,
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

  const memoizedOnReload = useCallback(() => {
    if (onReload) onReload()
  }, [onReload])

  return (
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

        {contentNullOrEmpty && !hasRenderableActivityTimeline ? (
        isLastStreaming ? <div
            className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
              {streamIntroPreview ? (
                <div className="text-muted-foreground text-sm leading-6">
                  {streamIntroPreview}
                </div>
              ) : (
                <ProcessingLoader />
              )}
            </div> : null
        ) : (
          ENABLE_CHAT_ACTIVITY_TIMELINE_V2 ? (
            <ActivityTimeline
              events={activityTimelineEvents}
              status={status}
              onSuggestion={onSuggestion}
              onWorkflowSuggestion={onWorkflowSuggestion}
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

        {showTrustSummary && (
          <TrustSummaryCard
            content={contentToRender}
            citations={displayEvidenceCitations}
            prompt={contextPrompt}
          />
        )}
        {showSourcesSection && (
          <ReferencesSection citations={sourcesCitations} title="Sources" />
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
  )
}
