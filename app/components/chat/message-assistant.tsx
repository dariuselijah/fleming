import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message"
import { Loader } from "@/components/prompt-kit/loader"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import type { Message as MessageAISDK } from "@ai-sdk/react"
import { ArrowClockwise, Check, Copy } from "@phosphor-icons/react"
import { getSources } from "./get-sources"
import { Reasoning } from "./reasoning"
import { SearchImages } from "./search-images"
import { SourcesList } from "./sources-list"
import { ToolInvocation } from "./tool-invocation"
import { CitationMarkdown } from "./citation-markdown"
import { ReferencesSection } from "./references-section"
import { EvidenceReferencesSection } from "./evidence-references-section"
import { extractCitationsFromSources, extractCitationsFromWebSearch, extractJournalFromUrl, extractYearFromUrl } from "./citation-utils"
import type { CitationData } from "./citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { parseCitationMarkers, getUniqueCitationIndices } from "@/lib/citations/parser"
import { useMemo, useCallback, useEffect, useState, useRef, memo } from "react"

type MessageAssistantProps = {
  children: string
  isLast?: boolean
  hasScrollAnchor?: boolean
  copied?: boolean
  copyToClipboard?: () => void
  onReload?: () => void
  parts?: MessageAISDK["parts"]
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  evidenceCitations?: EvidenceCitation[]
}

// Memoize component to prevent re-renders when props haven't changed
// Only re-render when content actually changes (for last message during streaming)
export const MessageAssistant = memo(function MessageAssistant({
  children,
  isLast,
  hasScrollAnchor,
  copied,
  copyToClipboard,
  onReload,
  parts,
  status,
  className,
  evidenceCitations = [],
}: MessageAssistantProps) {
  const { preferences } = useUserPreferences()
  
  // Memoize derived data to prevent unnecessary recalculations during streaming
  const sources = useMemo(() => getSources(parts), [parts])
  const toolInvocationParts = useMemo(() => 
    parts?.filter((part) => part.type === "tool-invocation"), [parts]
  )
  const reasoningParts = useMemo(() => 
    parts?.find((part) => part.type === "reasoning"), [parts]
  )
  
  const contentNullOrEmpty = children === null || children === ""
  const isLastStreaming = status === "streaming" && isLast
  
  // Track if we're using evidence citations (from medical_evidence database)
  const hasEvidenceCitations = evidenceCitations.length > 0
  
  // Convert evidence citations to CitationData format for rendering
  const evidenceCitationMap = useMemo(() => {
    if (!hasEvidenceCitations) return new Map<number, CitationData>()
    
    const map = new Map<number, CitationData>()
    evidenceCitations.forEach((citation) => {
      map.set(citation.index, {
        index: citation.index,
        title: citation.title,
        authors: citation.authors || [],
        journal: citation.journal,
        year: citation.year?.toString() || '',
        url: citation.url || undefined,
        doi: citation.doi || undefined,
        // Extra evidence-specific fields stored in the CitationData
        evidenceLevel: citation.evidenceLevel,
        studyType: citation.studyType,
        sampleSize: citation.sampleSize,
        meshTerms: citation.meshTerms,
        snippet: citation.snippet,
      } as CitationData)
    })
    return map
  }, [evidenceCitations, hasEvidenceCitations])
  
  // Extract and fetch citations from sources (fallback when no evidence citations)
  const [citations, setCitations] = useState<Map<number, CitationData>>(new Map())
  const [isLoadingCitations, setIsLoadingCitations] = useState(false)
  const lastSourcesKeyRef = useRef<string>('')
  const hasLoadedRef = useRef(false)
  
  // Optimize: Use refs to track previous values and avoid expensive operations during streaming
  const prevChildrenRef = useRef(children)
  const prevSourcesKeyRef = useRef<string>('')
  const isStreamingRef = useRef(status === "streaming" && isLast)
  
  useEffect(() => {
    // Skip expensive operations if we're streaming and content hasn't changed significantly
    // Only check every N characters during streaming to reduce computation
    const isStreaming = status === "streaming" && isLast
    isStreamingRef.current = isStreaming
    
    // During streaming, only run expensive checks every 50 characters or so
    if (isStreaming) {
      const contentChanged = prevChildrenRef.current !== children
      const significantChange = contentChanged && 
        Math.abs((children?.length || 0) - (prevChildrenRef.current?.length || 0)) > 50
      
      if (!significantChange) {
        // Content hasn't changed significantly, skip expensive operations
        return
      }
    }
    
    prevChildrenRef.current = children
    
    // CRITICAL: Check if text contains evidence-style markers [1], [2] etc.
    // If so, this is an evidence-backed response and we should NOT extract from web sources
    // even if evidenceCitations state is temporarily empty (e.g., during restore)
    const hasEvidenceMarkers = children && /\[\d+\]/.test(children)
    const hasCITATIONMarkers = children && /\[CITATION:\d+/.test(children)
    
    // Skip source extraction if we have evidence citations OR evidence-style markers
    // Evidence markers indicate this response came from evidence mode, so we should wait
    // for evidence citations to be restored rather than extracting from web sources
    if (evidenceCitations.length > 0) {
      console.log('[MessageAssistant] Skipping source extraction - using evidence citations:', evidenceCitations.length)
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
    
    // Only process if sources actually changed (not just children update during streaming)
    if (sourcesKey === prevSourcesKeyRef.current && isStreaming) {
      // Sources haven't changed and we're streaming - skip expensive extraction
      return
    }
    
    prevSourcesKeyRef.current = sourcesKey
    
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
      const contentToUse = children || ""
      
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
      
      const markers = parseCitationMarkers(children || "")
      const uniqueIndices = getUniqueCitationIndices(markers)
      const placeholderCitations = new Map<number, CitationData>()
      
      // Try to extract URLs from the text - be more aggressive
      const urlPattern = /https?:\/\/[^\s\)\]\[]+/g
      const allUrls = (children || "").match(urlPattern) || []
      
      // Also try to extract PubMed/JAMA/NEJM URLs specifically (more patterns)
      const pubmedUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d+)/gi
      const jamaUrlPattern = /(?:https?:\/\/)?(?:www\.)?jamanetwork\.com\/[^\s\)\]\[]+/gi
      const nejmUrlPattern = /(?:https?:\/\/)?(?:www\.)?nejm\.org\/[^\s\)\]\[]+/gi
      
      // Also look for domain patterns without full URLs
      const domainPattern = /(?:pubmed|jama|nejm|nature|science|thelancet|bmj|cell|aafp|uptodate)\.(?:org|com|net)[^\s\)\]\[]*/gi
      const domainUrls = (children || "").match(domainPattern) || []
      
      const pubmedUrls = (children || "").match(pubmedUrlPattern) || []
      const jamaUrls = (children || "").match(jamaUrlPattern) || []
      const nejmUrls = (children || "").match(nejmUrlPattern) || []
      
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
            const end = Math.min(children.length, marker.endIndex + 200)
            const citationContext = children?.substring(start, end) || ""
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
    // Optimize: Only run expensive operations when not streaming or when streaming completes
    // Use a ref to track if we're currently streaming to avoid expensive work
  }, [sources, evidenceCitations, children, status, isLast])
  
  // Use evidence citations if available, otherwise fall back to web search citations
  const activeCitations = hasEvidenceCitations ? evidenceCitationMap : citations
  
  // Check if message has citations or sources
  const hasCitations = activeCitations.size > 0
  const hasSources = sources.length > 0
  // Check if text contains citation markers - now also check for [1], [2] pattern used by evidence mode
  const hasCitationMarkers = children && (/\[CITATION:\d+/.test(children) || /\[\d+\]/.test(children))
  // Show citations if we have them, have sources, or have citation markers in text
  const shouldShowCitations = hasCitations || hasSources || hasCitationMarkers
  const showReferences = status === "ready" && hasCitations && !isLastStreaming
  const showEvidenceReferences = status === "ready" && hasEvidenceCitations && !isLastStreaming
  
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
        {reasoningParts && reasoningParts.reasoning && (
          <Reasoning
            reasoning={reasoningParts.reasoning}
            isStreaming={status === "streaming"}
          />
        )}

        {toolInvocationParts &&
          toolInvocationParts.length > 0 &&
          preferences.showToolInvocations && (
            <ToolInvocation toolInvocations={toolInvocationParts} />
          )}

        {searchImageResults.length > 0 && (
          <SearchImages results={searchImageResults} />
        )}
        

        {contentNullOrEmpty ? (
        isLastStreaming ? <div
            className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
              <Loader>Thinking...</Loader>
            </div> : null
        ) : shouldShowCitations ? (
          <CitationMarkdown
            className={cn(
              "prose dark:prose-invert relative min-w-full bg-transparent p-0",
              "prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
            )}
            citations={activeCitations}
            evidenceCitations={hasEvidenceCitations ? evidenceCitations : undefined}
          >
            {children}
          </CitationMarkdown>
        ) : (
          <MessageContent
            className={cn(
              "prose dark:prose-invert relative min-w-full bg-transparent p-0",
              "prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
            )}
            markdown={true}
          >
            {children}
          </MessageContent>
        )}

        {showEvidenceReferences && <EvidenceReferencesSection citations={evidenceCitations} />}
        {showReferences && !showEvidenceReferences && <ReferencesSection citations={citations} />}

        {sources && sources.length > 0 && <SourcesList sources={sources} />}

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
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo
  // Only re-render if these props change
  if (prevProps.isLast !== nextProps.isLast) return false
  if (prevProps.status !== nextProps.status) return false
  if (prevProps.hasScrollAnchor !== nextProps.hasScrollAnchor) return false
  if (prevProps.className !== nextProps.className) return false
  if (prevProps.copied !== nextProps.copied) return false
  
  // For the last message, always update during streaming (content changes)
  // For other messages, only update if content changed
  if (nextProps.isLast) {
    // Last message - always update during streaming
    if (prevProps.children !== nextProps.children) return false
  } else {
    // Non-last messages - only update if content changed
    if (prevProps.children !== nextProps.children) return false
  }
  
  // Check parts array changes (but don't deep compare - too expensive)
  if (prevProps.parts !== nextProps.parts) {
    if (prevProps.parts?.length !== nextProps.parts?.length) return false
  }
  
  // Check evidenceCitations changes
  if (prevProps.evidenceCitations !== nextProps.evidenceCitations) {
    if (prevProps.evidenceCitations?.length !== nextProps.evidenceCitations?.length) return false
  }
  
  // Props are equal, skip re-render
  return true
})
