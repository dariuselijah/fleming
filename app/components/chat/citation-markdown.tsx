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
  // Build evidence citation map for fast lookup
  const evidenceCitationMap = useMemo(() => {
    if (!evidenceCitations || evidenceCitations.length === 0) return null
    const map = new Map<number, EvidenceCitation>()
    evidenceCitations.forEach(c => map.set(c.index, c))
    return map
  }, [evidenceCitations])
  
  // CRITICAL: If we have no evidence citations, don't render citation markers
  // This prevents broken citations from appearing when evidence mode is off
  const shouldRenderCitations = evidenceCitations && evidenceCitations.length > 0
  
  // Parse citation markers from text - handle both [CITATION:1] and [1] formats
  const markers = useMemo(() => {
    // If we don't have evidence citations, don't parse markers (they'll be shown as plain text)
    if (!shouldRenderCitations) {
      return []
    }
    
    // First try the standard parser for [CITATION:X] format
    let result = parseCitationMarkers(children)
    
    // Also look for simple [1] pattern - this is what evidence mode uses
    // Only do this if we have evidence citations to match them to
    if (result.length === 0) {
      // Parse simple [1], [2,3], [1-3] patterns manually
      const simplePattern = /\[(\d+(?:[\s,]+\d+)*(?:-\d+)?)\]/g
      let match
      while ((match = simplePattern.exec(children)) !== null) {
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
    
    return result
  }, [children, shouldRenderCitations])
  
  // Replace citation markers with unique placeholders BEFORE markdown processing
  // Use a format that react-markdown won't escape or treat specially
  const { processedText, markerMap } = useMemo(() => {
    let text = children
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
  }, [children, markers])
  

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
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  // Match the placeholder format [CITE_PLACEHOLDER_0]
  const placeholderRegex = /\[CITE_PLACEHOLDER_(\d+)\]/g
  let match: RegExpExecArray | null
  
  while ((match = placeholderRegex.exec(text)) !== null) {
    // Capture match values before callbacks
    const matchIndex = match.index
    const matchLength = match[0].length
    
    // Add text before placeholder
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex))
    }
    
    // Add citation component
    const placeholder = match[0]
    const marker = markerMap.get(placeholder)
    if (marker) {
      // If we have evidence citations, render EvidenceCitationPill for each
      if (evidenceCitationMap && evidenceCitationMap.size > 0) {
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
        } else {
          // Fallback if no evidence citation found for this index
          const indices = marker.indices.join(',')
          parts.push(
            <span
              key={`fallback-evidence-${matchIndex}`}
              className="bg-zinc-700/80 text-zinc-100 inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium mx-0.5"
            >
              [{indices}]
            </span>
          )
        }
      } else {
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
        } else {
          // If no citations found, show a fallback pill with just the numbers
          // This ensures citations always render, even if data isn't loaded yet
          const indices = marker.indices.join(',')
          parts.push(
            <span
              key={`fallback-citation-${matchIndex}`}
              className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700 inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all relative z-10 shadow-sm hover:bg-green-200 dark:hover:bg-green-900/50"
            >
              [{indices}]
            </span>
          )
        }
      }
    }
    
    lastIndex = matchIndex + matchLength
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  
  return parts.length > 0 ? parts : text
}
