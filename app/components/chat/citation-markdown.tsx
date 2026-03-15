"use client"

import { parseCitationMarkers } from "@/lib/citations/parser"
import { JournalCitationTag } from "./journal-citation-tag"
import { EvidenceCitationPill } from "./evidence-citation-pill"
import type { CitationData } from "./citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { Markdown } from "@/components/prompt-kit/markdown"
import { useMemo } from "react"
import React from "react"
import type { Components } from "react-markdown"

interface CitationMarkdownProps {
  children: string
  citations: Map<number, CitationData>
  className?: string
  evidenceCitations?: EvidenceCitation[]
}

function stripInternalCitationTokens(value: string): string {
  if (!value) return value
  return value
    .replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
    .replace(/\[tool\s+[^\]]+\]/gi, "")
    .replace(/\[source\s+[^\]]+\]/gi, "")
    .replace(/\[doc\s+[^\]]+\]/gi, "")
}

function stripInternalRuntimeTokensPreservePlaceholders(value: string): string {
  if (!value) return value
  return value
    .replace(/\[tool\s+[^\]]+\]/gi, "")
    .replace(/\[source\s+[^\]]+\]/gi, "")
    .replace(/\[doc\s+[^\]]+\]/gi, "")
}

function resolveNamedMarkerIndices(
  markerText: string,
  citations: Map<number, CitationData>
): number[] {
  if (citations.size === 0) return []

  const normalizedMarker = markerText.toLowerCase().trim()
  if (!normalizedMarker) return []
  const stopwords = new Set([
    "for",
    "and",
    "the",
    "with",
    "from",
    "this",
    "that",
    "are",
    "drug",
    "drugs",
    "label",
    "labels",
    "data",
  ])

  const markerTokens = normalizedMarker
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopwords.has(token))

  const wantsOpenFda = normalizedMarker.includes("openfda") || normalizedMarker.includes("fda")

  const scored = Array.from(citations.entries())
    .map(([index, citation]) => {
      const haystack = `${citation.title || ""} ${citation.journal || ""} ${citation.url || ""}`.toLowerCase()
      let score = 0

      for (const token of markerTokens) {
        if (haystack.includes(token)) {
          score += 1
        }
      }

      if (wantsOpenFda) {
        if (
          haystack.includes("open.fda.gov") ||
          haystack.includes("fda.gov") ||
          haystack.includes("openfda")
        ) {
          score += 3
        }
      }

      return { index, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length > 0) {
    return scored.slice(0, 3).map((entry) => entry.index)
  }

  // For generic named references with exactly one source, map to that source.
  if (citations.size === 1) {
    const first = citations.keys().next()
    if (!first.done) {
      return [first.value]
    }
  }

  return []
}

function collectNamedMarkers(
  text: string,
  existingMarkers: ReturnType<typeof parseCitationMarkers>,
  citations: Map<number, CitationData>,
  includeUnresolved = false
) {
  const namedMarkers: ReturnType<typeof parseCitationMarkers> = []
  let depth = 0
  let startIndex = -1

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === "[") {
      if (depth === 0) {
        startIndex = i
      }
      depth += 1
      continue
    }

    if (char !== "]" || depth <= 0) {
      continue
    }

    depth -= 1
    if (depth !== 0 || startIndex < 0) {
      continue
    }

    const endIndex = i + 1
    const fullMatch = text.slice(startIndex, endIndex)
    const overlapsExisting = existingMarkers.some(
      (existing) => startIndex < existing.endIndex && endIndex > existing.startIndex
    )
    if (overlapsExisting) {
      startIndex = -1
      continue
    }

    const inner = fullMatch.slice(1, -1).trim()
    if (!inner || !/[A-Za-z]/.test(inner)) {
      startIndex = -1
      continue
    }
    if (/^CITATION\s*:/i.test(inner) || /^PMID\s*:/i.test(inner)) {
      startIndex = -1
      continue
    }

    const normalizedInner = inner
      .replace(/\[\d+(?:\s*(?:,|-)\s*\d+)*\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!normalizedInner) {
      startIndex = -1
      continue
    }

    const indices = resolveNamedMarkerIndices(normalizedInner, citations)
    if (indices.length > 0 || includeUnresolved) {
      namedMarkers.push({
        type: "named",
        indices,
        startIndex,
        endIndex,
        fullMatch,
        quoteText: normalizedInner,
      })
    }

    startIndex = -1
  }

  return namedMarkers
}

function resolveSymbolicEvidenceMarkerIndices(
  markerText: string,
  evidenceCitationMap: Map<number, EvidenceCitation>
): number[] {
  const normalized = markerText.toLowerCase().trim()
  const match = normalized.match(/^([a-z][a-z0-9-]*)[_\-\s]*(\d+)$/)
  if (!match) return []

  const markerType = match[1]
  const ordinal = Number.parseInt(match[2], 10)
  if (!Number.isFinite(ordinal) || ordinal < 1) return []

  const allCitations = Array.from(evidenceCitationMap.values()).sort(
    (left, right) => left.index - right.index
  )
  if (allCitations.length === 0) return []

  const filtered = allCitations.filter((citation) => {
    const journal = (citation.journal || "").toLowerCase()
    const title = (citation.title || "").toLowerCase()
    const sourceLabel = (citation.sourceLabel || "").toLowerCase()
    const url = (citation.url || "").toLowerCase()
    const studyType = (citation.studyType || "").toLowerCase()

    if (markerType.startsWith("guideline")) {
      return (
        /guideline|consensus|position statement|kdigo|nice|esc|acc\/aha|ada/i.test(
          `${journal} ${title} ${sourceLabel}`
        )
      )
    }
    if (markerType === "pubmed") {
      return Boolean(citation.pmid) || url.includes("pubmed")
    }
    if (markerType.startsWith("trial")) {
      return /trial|randomized|rct/i.test(studyType)
    }
    if (markerType.startsWith("upload")) {
      return citation.sourceType === "user_upload"
    }
    if (markerType.includes("chembl")) {
      return /chembl/.test(`${journal} ${title} ${sourceLabel} ${url}`)
    }
    if (markerType.includes("biorxiv")) {
      return /biorxiv/.test(`${journal} ${title} ${sourceLabel} ${url}`)
    }
    if (markerType.includes("scholar")) {
      return /scholar|google scholar/.test(`${journal} ${title} ${sourceLabel} ${url}`)
    }
    // citation/source fallback: any evidence citation
    return true
  })

  const pool = filtered.length > 0 ? filtered : allCitations
  const selected = pool[ordinal - 1]
  return selected ? [selected.index] : []
}

function resolveNamedEvidenceMarkerIndices(
  markerText: string,
  evidenceCitationMap: Map<number, EvidenceCitation>
): number[] {
  const normalizedMarker = markerText.toLowerCase().trim()
  if (!normalizedMarker) return []

  const stopwords = new Set([
    "for",
    "and",
    "the",
    "with",
    "from",
    "this",
    "that",
    "are",
    "of",
    "in",
    "on",
    "to",
    "or",
    "by",
    "latest",
    "recent",
    "evidence",
    "source",
    "sources",
  ])

  const markerTokens = normalizedMarker
    .split(/[^a-z0-9.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopwords.has(token))

  const scored = Array.from(evidenceCitationMap.values())
    .map((citation) => {
      const haystack = [
        citation.title || "",
        citation.journal || "",
        citation.url || "",
        citation.pmid || "",
        citation.doi || "",
        citation.sourceLabel || "",
        citation.studyType || "",
      ]
        .join(" ")
        .toLowerCase()
      let score = 0

      for (const token of markerTokens) {
        if (haystack.includes(token)) score += 1
      }

      if (
        /(biorxiv|bio-rxiv|bio rxiv)/.test(normalizedMarker) &&
        /biorxiv/.test(haystack)
      ) {
        score += 3
      }
      if (
        /(scholar|google scholar|scholar gateway)/.test(normalizedMarker) &&
        /(scholar|google scholar)/.test(haystack)
      ) {
        score += 3
      }
      if (/synapse/.test(normalizedMarker) && /synapse/.test(haystack)) {
        score += 3
      }

      return { index: citation.index, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, 3).map((entry) => entry.index)
}

function resolveSymbolicCitationIndices(
  markerText: string,
  citations: Map<number, CitationData>
): number[] {
  const normalized = markerText.toLowerCase().trim()
  const match = normalized.match(/^([a-z][a-z0-9-]*)[_\-\s]*(\d+)$/)
  if (!match) return []

  const markerType = match[1]
  const ordinal = Number.parseInt(match[2], 10)
  if (!Number.isFinite(ordinal) || ordinal < 1) return []

  const allCitations = Array.from(citations.values()).sort((left, right) => left.index - right.index)
  if (allCitations.length === 0) return []

  const filtered = allCitations.filter((citation) => {
    const title = (citation.title || "").toLowerCase()
    const journal = (citation.journal || "").toLowerCase()
    const url = (citation.url || "").toLowerCase()
    const haystack = `${title} ${journal} ${url}`

    if (markerType.includes("guideline")) {
      return /guideline|consensus|position statement|kdigo|nice|esc|acc\/aha|ada/i.test(haystack)
    }
    if (markerType.includes("pubmed")) {
      return Boolean(citation.pmid) || url.includes("pubmed")
    }
    if (markerType.includes("chembl")) {
      return /chembl/.test(haystack)
    }
    if (markerType.includes("biorxiv")) {
      return /biorxiv/.test(haystack)
    }
    if (markerType.includes("scholar")) {
      return /scholar|google scholar/.test(haystack)
    }
    if (markerType.includes("trial")) {
      return /trial|randomized|rct/.test(haystack)
    }

    return markerType.length >= 3 ? haystack.includes(markerType) : false
  })

  const pool = filtered.length > 0 ? filtered : allCitations
  const selected = pool[ordinal - 1]
  return selected ? [selected.index] : []
}

function collectSymbolicMarkers(
  text: string,
  existingMarkers: ReturnType<typeof parseCitationMarkers>,
  resolver: (markerName: string) => number[]
) {
  const symbolicMarkers: ReturnType<typeof parseCitationMarkers> = []
  const symbolicPattern = /\[([a-z][a-z0-9-]*[_\-\s]*\d+)\]/gi
  let match: RegExpExecArray | null

  while ((match = symbolicPattern.exec(text)) !== null) {
    const markerBody = match[1]?.trim() || ""
    const normalizedBody = markerBody.toLowerCase()
    if (!normalizedBody) continue
    if (/^\d+(?:\s*(?:,|-)\s*\d+)*$/.test(normalizedBody)) continue
    if (
      /^citation\s*:|^pmid\s*:|^doi\s*:|^source\s*:|^tool\s*:|^doc\s*:|^cite_placeholder_/i.test(
        normalizedBody
      )
    ) {
      continue
    }

    const startIndex = match.index
    const endIndex = match.index + match[0].length
    const overlapsExisting = existingMarkers.some(
      (existing) => startIndex < existing.endIndex && endIndex > existing.startIndex
    )
    if (overlapsExisting) continue

    const indices = resolver(normalizedBody)
    symbolicMarkers.push({
      type: "named",
      indices,
      startIndex,
      endIndex,
      fullMatch: match[0],
      quoteText: normalizedBody,
    })
  }

  return symbolicMarkers
}

/**
 * Markdown component that renders citations inline
 * When evidenceCitations are provided, uses EvidenceCitationPill (with favicon + journal name)
 * Otherwise uses JournalCitationTag (for web search results)
 */
export function CitationMarkdown({ 
  children, 
  citations, 
  className,
  evidenceCitations 
}: CitationMarkdownProps) {
  const sanitizedChildren = useMemo(
    () =>
      stripInternalCitationTokens(String(children || ""))
        .replace(/\n{3,}/g, "\n\n"),
    [children]
  )

  // Build evidence citation map for fast lookup
  const evidenceCitationMap = useMemo(() => {
    if (!evidenceCitations || evidenceCitations.length === 0) return null
    const map = new Map<number, EvidenceCitation>()
    evidenceCitations.forEach(c => map.set(c.index, c))
    return map
  }, [evidenceCitations])
  
  // CRITICAL: If we have no evidence citations, don't render citation markers
  // This prevents broken citations from appearing when evidence mode is off
  const shouldRenderCitations =
    (evidenceCitations && evidenceCitations.length > 0) || citations.size > 0
  
  // Parse citation markers from text - handle both [CITATION:1] and [1] formats
  const markers = useMemo(() => {
    // If we don't have evidence citations, don't parse markers (they'll be shown as plain text)
    if (!shouldRenderCitations) {
      return []
    }
    
    // First try the standard parser for [CITATION:X] format
    let result = parseCitationMarkers(sanitizedChildren)
    
    // Also look for simple [1] pattern - this is what evidence mode uses
    // Only do this if we have evidence citations to match them to
    if (result.length === 0) {
      // Parse simple [1], [2,3], [1-3] patterns manually
      const simplePattern = /\[(\d+(?:[\s,]+\d+)*(?:-\d+)?)\]/g
      let match
      while ((match = simplePattern.exec(sanitizedChildren)) !== null) {
        const content = match[1]
        const indices: number[] = []
        
        // Handle ranges like [1-3]
        if (content.includes('-')) {
          const [start, end] = content.split('-').map(s => parseInt(s.trim(), 10))
          for (let i = start; i <= end; i++) {
            indices.push(i)
          }
        } else {
          // Handle comma-separated like [1,2,3] or [1, 2]
          content.split(/[\s,]+/).forEach(s => {
            const num = parseInt(s.trim(), 10)
            if (!isNaN(num)) indices.push(num)
          })
        }
        
        if (indices.length > 0) {
          result.push({
            type: 'numbered' as const,
            indices,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            fullMatch: match[0]
          })
        }
      }
    }

    // Resolve PMID markers to evidence citation indices, e.g. [PMID: 37932704]
    if (evidenceCitationMap && evidenceCitationMap.size > 0) {
      const citationByPmid = new Map<string, number>()
      evidenceCitationMap.forEach((citation) => {
        const pmid = typeof citation.pmid === "string" ? citation.pmid.trim() : ""
        if (pmid) {
          citationByPmid.set(pmid, citation.index)
        }
      })

      // Resolve bare PMID patterns in text, e.g. "PMID: 37932704".
      const barePmidPattern = /\bPMID\s*:\s*(\d{6,10})\b/gi
      let barePmidMatch: RegExpExecArray | null
      while ((barePmidMatch = barePmidPattern.exec(sanitizedChildren)) !== null) {
        const pmid = barePmidMatch[1]?.trim()
        if (!pmid) continue
        const resolvedIndex = citationByPmid.get(pmid)
        if (typeof resolvedIndex !== "number") continue

        const startIndex = barePmidMatch.index
        const endIndex = barePmidMatch.index + barePmidMatch[0].length
        const overlaps = result.some(
          (existing) => startIndex < existing.endIndex && endIndex > existing.startIndex
        )
        if (overlaps) continue

        result.push({
          type: "numbered",
          indices: [resolvedIndex],
          startIndex,
          endIndex,
          fullMatch: barePmidMatch[0],
        })
      }

      const pmidPattern = /\[PMID\s*:\s*(\d+)\]/gi
      let pmidMatch: RegExpExecArray | null
      while ((pmidMatch = pmidPattern.exec(sanitizedChildren)) !== null) {
        const pmid = pmidMatch[1]?.trim()
        if (!pmid) continue
        const resolvedIndex = citationByPmid.get(pmid)
        if (typeof resolvedIndex !== "number") continue

        const startIndex = pmidMatch.index
        const endIndex = pmidMatch.index + pmidMatch[0].length
        const overlaps = result.some(
          (existing) => startIndex < existing.endIndex && endIndex > existing.startIndex
        )
        if (overlaps) continue

        result.push({
          type: "numbered",
          indices: [resolvedIndex],
          startIndex,
          endIndex,
          fullMatch: pmidMatch[0],
        })
      }

      // Resolve symbolic markers used by synthesis prompts, e.g. [guideline_1], [pubmed_2], [chembl_1].
      const symbolicMarkers = collectSymbolicMarkers(sanitizedChildren, result, (markerName) =>
        resolveSymbolicEvidenceMarkerIndices(markerName, evidenceCitationMap)
      )
      result.push(...symbolicMarkers)

      // Resolve free-text bracketed markers in evidence mode, e.g. [bioRxiv 2025.06.10.656785]
      const evidenceAsCitationMap = new Map<number, CitationData>()
      evidenceCitationMap.forEach((citation, index) => {
        evidenceAsCitationMap.set(index, {
          index,
          title: citation.title,
          authors: citation.authors || [],
          journal: citation.journal || "",
          year: citation.year ? String(citation.year) : "",
          url: citation.url || undefined,
          doi: citation.doi || undefined,
          pmid: citation.pmid || undefined,
        })
      })
      const namedMarkers = collectNamedMarkers(
        sanitizedChildren,
        result,
        evidenceAsCitationMap,
        true
      )
      const resolvedNamedMarkers = namedMarkers.map((marker) => {
        if (marker.indices.length > 0) return marker
        const fallbackIndices = resolveNamedEvidenceMarkerIndices(
          marker.quoteText || marker.fullMatch,
          evidenceCitationMap
        )
        return {
          ...marker,
          indices: fallbackIndices,
        }
      })
      result.push(...resolvedNamedMarkers)
    }

    // Resolve named bracket citations for non-evidence mode, e.g.
    // [OpenFDA drug labels for acetaminophen, dapagliflozin, and metformin]
    if (!evidenceCitationMap && citations.size > 0) {
      const symbolicMarkers = collectSymbolicMarkers(sanitizedChildren, result, (markerName) =>
        resolveSymbolicCitationIndices(markerName, citations)
      )
      result.push(...symbolicMarkers)

      const namedMarkers = collectNamedMarkers(sanitizedChildren, result, citations)
      result.push(...namedMarkers)
    }

    result.sort((a, b) => a.startIndex - b.startIndex)
    
    return result
  }, [sanitizedChildren, citations, evidenceCitationMap, shouldRenderCitations])
  
  // Replace citation markers with unique placeholders BEFORE markdown processing
  // Use a format that react-markdown won't escape or treat specially
  const { processedText, markerMap } = useMemo(() => {
    let text = sanitizedChildren
    const map = new Map<string, typeof markers[0]>()
    
    // Replace in reverse order to preserve indices
    for (let i = markers.length - 1; i >= 0; i--) {
      const marker = markers[i]
      // Use a unique placeholder that won't be escaped by markdown
      const placeholder = `[CITE_PLACEHOLDER_${i}]`
      map.set(placeholder, marker)
      text = 
        text.substring(0, marker.startIndex) + 
        placeholder + 
        text.substring(marker.endIndex)
    }
    
    return { processedText: text, markerMap: map }
  }, [sanitizedChildren, markers])
  

  // Custom components for markdown that handle citation placeholders
  // We need to process ALL text nodes to catch citation placeholders
  const components: Partial<Components> = useMemo(() => {
    return {
      // Process paragraphs - this is where most citations appear
      p: ({ children: nodeChildren, ...props }) => {
        return <p {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</p>
      },
      // Process list items
      li: ({ children: nodeChildren, ...props }) => {
        return <li {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</li>
      },
      table: ({ children: nodeChildren, ...props }) => {
        return <table {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</table>
      },
      thead: ({ children: nodeChildren, ...props }) => {
        return <thead {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</thead>
      },
      tbody: ({ children: nodeChildren, ...props }) => {
        return <tbody {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</tbody>
      },
      tr: ({ children: nodeChildren, ...props }) => {
        return <tr {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</tr>
      },
      th: ({ children: nodeChildren, ...props }) => {
        return <th {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</th>
      },
      td: ({ children: nodeChildren, ...props }) => {
        return <td {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</td>
      },
      // Process ALL text nodes - this is critical for inline citations
      // react-markdown passes text as children to this component
      text: ({ children: nodeChildren, ...props }) => {
        if (typeof nodeChildren === 'string') {
          const processed = processText(nodeChildren, citations, markerMap, evidenceCitationMap)
          // If processing returned an array, we need to handle it
          if (Array.isArray(processed)) {
            return <>{processed}</>
          }
          return <>{processed}</>
        }
        return <>{nodeChildren}</>
      },
      // Also process other inline elements that might contain citations
      strong: ({ children: nodeChildren, ...props }) => {
        return <strong {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</strong>
      },
      em: ({ children: nodeChildren, ...props }) => {
        return <em {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</em>
      },
      // Process code blocks and inline code
      code: ({ children: nodeChildren, ...props }) => {
        if (typeof nodeChildren === 'string') {
          return <code {...props}>{processText(nodeChildren, citations, markerMap, evidenceCitationMap)}</code>
        }
        return <code {...props}>{processNode(nodeChildren, citations, markerMap, evidenceCitationMap)}</code>
      },
    }
  }, [citations, markerMap, evidenceCitationMap])

  return (
    <Markdown className={className} components={components}>
      {processedText}
    </Markdown>
  )
}

/**
 * Process a React node to replace citation placeholders
 */
function processNode(
  node: React.ReactNode,
  citations: Map<number, CitationData>,
  markerMap: Map<string, ReturnType<typeof parseCitationMarkers>[0]>,
  evidenceCitationMap: Map<number, EvidenceCitation> | null
): React.ReactNode {
  if (typeof node === 'string') {
    return processText(node, citations, markerMap, evidenceCitationMap)
  }
  
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {processNode(child, citations, markerMap, evidenceCitationMap)}
      </React.Fragment>
    ))
  }
  
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    if (props.children) {
      return React.cloneElement(node, {
        ...props,
        children: processNode(props.children, citations, markerMap, evidenceCitationMap)
      } as React.Attributes)
    }
  }
  
  return node
}

/**
 * Process text to replace citation placeholders with citation components
 * Uses EvidenceCitationPill when evidence citations are available
 * Otherwise uses JournalCitationTag for web search results
 */
function processText(
  text: string,
  citations: Map<number, CitationData>,
  markerMap: Map<string, ReturnType<typeof parseCitationMarkers>[0]>,
  evidenceCitationMap: Map<number, EvidenceCitation> | null
): React.ReactNode {
  const sanitizedText = stripInternalRuntimeTokensPreservePlaceholders(text)
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  // Match the placeholder format [CITE_PLACEHOLDER_0]
  const placeholderRegex = /\[CITE_PLACEHOLDER_(\d+)\]/g
  let match: RegExpExecArray | null
  
  while ((match = placeholderRegex.exec(sanitizedText)) !== null) {
    // Capture match values before callbacks
    const matchIndex = match.index
    const matchLength = match[0].length
    
    // Add text before placeholder
    if (matchIndex > lastIndex) {
      parts.push(sanitizedText.substring(lastIndex, matchIndex))
    }
    
    // Add citation component
    const placeholder = match[0]
    const marker = markerMap.get(placeholder)
    if (marker) {
      // If we have evidence citations, render EvidenceCitationPill for each
      if (evidenceCitationMap && evidenceCitationMap.size > 0) {
        const allIndicesResolvable = marker.indices.every((idx) =>
          evidenceCitationMap.has(idx)
        )
        if (!allIndicesResolvable) {
          // Strict contract: unresolved markers should not leak.
          lastIndex = matchIndex + matchLength
          continue
        }

        const evidencePills: React.ReactNode[] = []
        
        marker.indices.forEach((idx) => {
          const evidenceCitation = evidenceCitationMap.get(idx)
          if (evidenceCitation) {
            evidencePills.push(
              <EvidenceCitationPill
                key={`evidence-${idx}-${matchIndex}`}
                citation={evidenceCitation}
                size="sm"
              />
            )
          }
        })
        
        if (evidencePills.length > 0) {
          // Wrap multiple pills with a small gap
          if (evidencePills.length > 1) {
            parts.push(
              <span key={`evidence-group-${matchIndex}`} className="inline-flex items-center gap-1 mx-0.5">
                {evidencePills}
              </span>
            )
          } else {
            parts.push(
              <span key={`evidence-single-${matchIndex}`} className="mx-0.5">
                {evidencePills[0]}
              </span>
            )
          }
        }
      } else {
        if (marker.type === "named") {
          const namedCitations = marker.indices
            .map((idx) => citations.get(idx))
            .filter((c): c is CitationData => c !== undefined)

          if (namedCitations.length > 0) {
            const journalGroups = new Map<string, CitationData[]>()
            namedCitations.forEach((citation) => {
              const journal = citation.journal || "Unknown"
              if (!journalGroups.has(journal)) {
                journalGroups.set(journal, [])
              }
              journalGroups.get(journal)!.push(citation)
            })

            const journalTags: React.ReactNode[] = []
            journalGroups.forEach((groupCitations, journal) => {
              journalTags.push(
                <JournalCitationTag
                  key={`named-journal-${journal}-${matchIndex}`}
                  citations={groupCitations}
                />
              )
            })

            if (journalTags.length > 1) {
              parts.push(
                <span key={`named-citation-group-${matchIndex}`} className="inline-flex items-center gap-1">
                  {journalTags}
                </span>
              )
            } else {
              parts.push(journalTags[0])
            }
          }

          lastIndex = matchIndex + matchLength
          continue
        }

        // Fall back to JournalCitationTag for web search results
        const markerCitations = marker.indices
          .map(idx => citations.get(idx))
          .filter((c): c is CitationData => c !== undefined)
        
        if (markerCitations.length > 0) {
          // Group citations by journal
          const journalGroups = new Map<string, CitationData[]>()
          markerCitations.forEach(citation => {
            const journal = citation.journal || 'Unknown'
            if (!journalGroups.has(journal)) {
              journalGroups.set(journal, [])
            }
            journalGroups.get(journal)!.push(citation)
          })
          
          // Render journal tags for each group
          const journalTags: React.ReactNode[] = []
          journalGroups.forEach((groupCitations, journal) => {
            journalTags.push(
              <JournalCitationTag
                key={`journal-${journal}-${matchIndex}`}
                citations={groupCitations}
              />
            )
          })
          
          // If we have multiple journal groups, wrap them
          if (journalTags.length > 1) {
            parts.push(
              <span key={`citation-group-${matchIndex}`} className="inline-flex items-center gap-1">
                {journalTags}
              </span>
            )
          } else if (journalTags.length === 1) {
            parts.push(journalTags[0])
          }
        }
      }
    }

    lastIndex = matchIndex + matchLength
  }
  
  // Add remaining text
  if (lastIndex < sanitizedText.length) {
    parts.push(sanitizedText.substring(lastIndex))
  }
  
  return parts.length > 0 ? parts : sanitizedText
}
