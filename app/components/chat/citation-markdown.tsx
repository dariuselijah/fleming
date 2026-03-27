"use client"

import { parseCitationMarkers } from "@/lib/citations/parser"
import { EvidenceCitationPill } from "./evidence-citation-pill"
import { InlineEvidenceVisual } from "./inline-evidence-visual"
import type { CitationData } from "./citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import { Markdown } from "@/components/prompt-kit/markdown"
import { buildEvidenceSourceId, normalizeEvidenceSourceId } from "@/lib/evidence/source-id"
import { useMemo } from "react"
import React from "react"
import type { Components } from "react-markdown"

interface CitationMarkdownProps {
  children: string
  citations: Map<number, CitationData>
  className?: string
  evidenceCitations?: EvidenceCitation[]
  onChartDrilldown?: (payload: ChartDrilldownPayload) => void
}

type TextRange = {
  start: number
  end: number
}

function collectFencedCodeRanges(text: string): TextRange[] {
  if (!text) return []
  const ranges: TextRange[] = []
  const fencedCodePattern = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = fencedCodePattern.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return ranges
}

function maskRangesWithSpaces(text: string, ranges: TextRange[]): string {
  if (!text || ranges.length === 0) return text
  let cursor = 0
  let output = ""
  ranges.forEach((range) => {
    if (range.start > cursor) {
      output += text.slice(cursor, range.start)
    }
    output += " ".repeat(Math.max(0, range.end - range.start))
    cursor = range.end
  })
  if (cursor < text.length) {
    output += text.slice(cursor)
  }
  return output
}

function firstSortedMapKey<T>(map: Map<number, T>): number | null {
  const keys = Array.from(map.keys()).sort((a, b) => a - b)
  return keys.length > 0 ? keys[0] : null
}

function stripInternalCitationTokens(value: string): string {
  if (!value) return value
  return value
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

function inferSourceLabelFromUrl(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
    if (host.includes("pubmed.ncbi.nlm.nih.gov") || host.includes("ncbi.nlm.nih.gov")) {
      return "PubMed"
    }
    if (host.includes("clinicaltrials.gov")) {
      return "ClinicalTrials.gov"
    }
    if (host.includes("nice.org.uk")) {
      return "NICE"
    }
    if (host.includes("who.int")) {
      return "WHO"
    }
    if (host.includes("cdc.gov")) {
      return "CDC"
    }
    if (host.includes("fda.gov")) {
      return "FDA"
    }
    return host
  } catch {
    return null
  }
}

function normalizeUrlSourceId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/"
    return `url:${host}${pathname}`.toLowerCase()
  } catch {
    const normalized = rawUrl.trim().toLowerCase()
    return normalized ? `url:${normalized}` : null
  }
}

function extractPmcidToken(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(/\b(PMC\d+)\b/i)
  return match?.[1]?.toUpperCase() || null
}

function buildEvidenceSourceAliases(
  candidate: EvidenceCitation | CitationData
): Set<string> {
  const aliases = new Set<string>()
  aliases.add(buildEvidenceSourceId(candidate).toLowerCase())

  if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
    const normalizedUrlId = normalizeUrlSourceId(candidate.url)
    if (normalizedUrlId) aliases.add(normalizedUrlId)
  }

  const pmcid = extractPmcidToken(
    ("pmcid" in candidate && typeof candidate.pmcid === "string" ? candidate.pmcid : null) ||
      candidate.url ||
      null
  )
  if (pmcid) {
    aliases.add(normalizeEvidenceSourceId(`url:pmc.ncbi.nlm.nih.gov/articles/${pmcid}`))
    aliases.add(normalizeEvidenceSourceId(`url:pmc.ncbi.nlm.nih.gov/articles/${pmcid.toLowerCase()}`))
    aliases.add(normalizeEvidenceSourceId(`url:ncbi.nlm.nih.gov/pmc/articles/${pmcid}`))
    aliases.add(normalizeEvidenceSourceId(`url:ncbi.nlm.nih.gov/pmc/articles/${pmcid.toLowerCase()}`))
  }

  return aliases
}

function sourceIdsMatchCitation(
  sourceIds: string[],
  candidate: EvidenceCitation | CitationData
): boolean {
  if (sourceIds.length === 0) return false
  const aliases = buildEvidenceSourceAliases(candidate)
  return sourceIds.some((sourceId) => aliases.has(normalizeEvidenceSourceId(sourceId)))
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

function remapNumberedMarkerIndicesToEvidence(
  indices: number[],
  evidenceCitationMap: Map<number, EvidenceCitation>,
  citationByPmid: Map<string, number>
): number[] {
  const remapped: number[] = []
  const seen = new Set<number>()

  indices.forEach((rawIndex) => {
    if (!Number.isFinite(rawIndex)) return
    if (evidenceCitationMap.has(rawIndex)) {
      if (!seen.has(rawIndex)) {
        seen.add(rawIndex)
        remapped.push(rawIndex)
      }
      return
    }

    const pmidMatch = citationByPmid.get(String(rawIndex))
    if (typeof pmidMatch === "number" && !seen.has(pmidMatch)) {
      seen.add(pmidMatch)
      remapped.push(pmidMatch)
    }
  })

  return remapped
}

function remapMarkerSourceIds(
  markers: ReturnType<typeof parseCitationMarkers>,
  sourceIdToIndex: Map<string, number>
): ReturnType<typeof parseCitationMarkers> {
  return markers.map((marker) => {
    if (!Array.isArray(marker.sourceIds) || marker.sourceIds.length === 0) {
      return marker
    }
    const remapped = marker.sourceIds
      .map((sourceId) => sourceIdToIndex.get(sourceId.toLowerCase()))
      .filter((index): index is number => typeof index === "number")
    if (remapped.length === 0) return marker
    const uniqueRemapped = Array.from(new Set(remapped))
    return {
      ...marker,
      indices: uniqueRemapped,
    }
  })
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
  evidenceCitations,
  onChartDrilldown,
}: CitationMarkdownProps) {
  const sanitizedChildren = useMemo(
    () =>
      stripInternalRuntimeTokensPreservePlaceholders(String(children || ""))
        .replace(/\n{3,}/g, "\n\n"),
    [children]
  )
  const fencedCodeRanges = useMemo(
    () => collectFencedCodeRanges(sanitizedChildren),
    [sanitizedChildren]
  )
  const citationSearchText = useMemo(
    () => maskRangesWithSpaces(sanitizedChildren, fencedCodeRanges),
    [fencedCodeRanges, sanitizedChildren]
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
    let result = parseCitationMarkers(citationSearchText)
    
    // Also look for simple [1] pattern - this is what evidence mode uses
    // Only do this if we have evidence citations to match them to
    if (result.length === 0) {
      // Parse simple [1], [2,3], [1-3] patterns manually
      const simplePattern = /\[(\d+(?:[\s,]+\d+)*(?:-\d+)?)\]/g
      let match
      while ((match = simplePattern.exec(citationSearchText)) !== null) {
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
      const sourceIdToIndex = new Map<string, number>()
      evidenceCitationMap.forEach((citation) => {
        const sourceId = buildEvidenceSourceId(citation).toLowerCase()
        sourceIdToIndex.set(sourceId, citation.index)
      })
      result = remapMarkerSourceIds(result, sourceIdToIndex)

      // Resolve synthesis placeholders (including bare forms), e.g.
      // [CITE_PLACEHOLDER_0] or CITE_PLACEHOLDER_0.
      const placeholderPattern = /\[?\s*CITE_PLACEHOLDER_(\d+)\s*\]?/gi
      let placeholderMatch: RegExpExecArray | null
      const sortedEvidenceIndices = Array.from(evidenceCitationMap.keys()).sort((a, b) => a - b)
      while ((placeholderMatch = placeholderPattern.exec(citationSearchText)) !== null) {
        const ordinal = Number.parseInt(placeholderMatch[1] || "", 10)
        if (!Number.isFinite(ordinal) || ordinal < 0) continue
        const resolvedIndex = sortedEvidenceIndices[ordinal]
        if (typeof resolvedIndex !== "number") continue

        const startIndex = placeholderMatch.index
        const endIndex = placeholderMatch.index + placeholderMatch[0].length
        const overlaps = result.some(
          (existing) => startIndex < existing.endIndex && endIndex > existing.startIndex
        )
        if (overlaps) continue

        result.push({
          type: "numbered",
          indices: [resolvedIndex],
          startIndex,
          endIndex,
          fullMatch: placeholderMatch[0],
        })
      }

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
      while ((barePmidMatch = barePmidPattern.exec(citationSearchText)) !== null) {
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
      while ((pmidMatch = pmidPattern.exec(citationSearchText)) !== null) {
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

      // Remap numeric markers that are actually PMIDs, e.g. [27212091],
      // to the citation index in the current evidence set.
      result = result.map((marker) => {
        if (marker.type !== "numbered") return marker
        const remappedIndices = remapNumberedMarkerIndicesToEvidence(
          marker.indices,
          evidenceCitationMap,
          citationByPmid
        )
        if (remappedIndices.length === 0) return marker
        return {
          ...marker,
          indices: remappedIndices,
        }
      })

      // Resolve symbolic markers used by synthesis prompts, e.g. [guideline_1], [pubmed_2], [chembl_1].
      const symbolicMarkers = collectSymbolicMarkers(citationSearchText, result, (markerName) =>
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
        citationSearchText,
        result,
        evidenceAsCitationMap,
        true
      )
      const fallbackEvidenceIndex = firstSortedMapKey(evidenceCitationMap)
      const resolvedNamedMarkers = namedMarkers.map((marker) => {
        if (marker.indices.length > 0) return marker
        const fallbackIndices = resolveNamedEvidenceMarkerIndices(
          marker.quoteText || marker.fullMatch,
          evidenceCitationMap
        )
        return {
          ...marker,
          indices:
            fallbackIndices.length > 0
              ? fallbackIndices
              : typeof fallbackEvidenceIndex === "number"
                ? [fallbackEvidenceIndex]
                : [],
        }
      })
      result.push(...resolvedNamedMarkers)
    }

    // Resolve named bracket citations for non-evidence mode, e.g.
    // [OpenFDA drug labels for acetaminophen, dapagliflozin, and metformin]
    if (!evidenceCitationMap && citations.size > 0) {
      const sourceIdToIndex = new Map<string, number>()
      citations.forEach((citation, mapIndex) => {
        const resolvedIndex =
          typeof citation.index === "number" && Number.isFinite(citation.index)
            ? citation.index
            : mapIndex
        const sourceId = buildEvidenceSourceId(citation).toLowerCase()
        sourceIdToIndex.set(sourceId, resolvedIndex)
      })
      result = remapMarkerSourceIds(result, sourceIdToIndex)

      const symbolicMarkers = collectSymbolicMarkers(citationSearchText, result, (markerName) =>
        resolveSymbolicCitationIndices(markerName, citations)
      )
      result.push(...symbolicMarkers)

      const namedMarkers = collectNamedMarkers(citationSearchText, result, citations)
      const fallbackCitationIndex = firstSortedMapKey(citations)
      result.push(
        ...namedMarkers.map((marker) =>
          marker.indices.length > 0
            ? marker
            : {
                ...marker,
                indices:
                  typeof fallbackCitationIndex === "number"
                    ? [fallbackCitationIndex]
                    : [],
              }
        )
      )
    }

    result.sort((a, b) => a.startIndex - b.startIndex)
    
    return result
  }, [citationSearchText, citations, evidenceCitationMap, shouldRenderCitations])
  
  // Replace citation markers with unique placeholders BEFORE markdown processing
  // Use a format that react-markdown won't escape or treat specially
  const { processedText: processedTextBase, markerMap } = useMemo(() => {
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

  const { processedText, inlineVisualSourceMap } = useMemo(
    () => buildInlineVisualSourceIdMap(processedTextBase, markerMap, evidenceCitationMap, markers),
    [processedTextBase, markerMap, evidenceCitationMap, markers]
  )
  

  // Custom components for markdown that handle citation placeholders
  // We need to process ALL text nodes to catch citation placeholders
  const components: Partial<Components> = useMemo(() => {
    return {
      // Process paragraphs - this is where most citations appear
      p: ({ children: nodeChildren, ...props }) => {
        const processedChildren = processNode(
          nodeChildren,
          citations,
          markerMap,
          evidenceCitationMap,
          inlineVisualSourceMap
        )
        if (isStandaloneInlineVisualNode(processedChildren)) {
          return <>{processedChildren}</>
        }
        return <p {...props}>{processedChildren}</p>
      },
      // Process list items
      li: ({ children: nodeChildren, ...props }) => {
        return (
          <li {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </li>
        )
      },
      table: ({ children: nodeChildren, ...props }) => {
        return (
          <table {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </table>
        )
      },
      thead: ({ children: nodeChildren, ...props }) => {
        return (
          <thead {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </thead>
        )
      },
      tbody: ({ children: nodeChildren, ...props }) => {
        return (
          <tbody {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </tbody>
        )
      },
      tr: ({ children: nodeChildren, ...props }) => {
        return (
          <tr {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </tr>
        )
      },
      th: ({ children: nodeChildren, ...props }) => {
        return (
          <th {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </th>
        )
      },
      td: ({ children: nodeChildren, ...props }) => {
        return (
          <td {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </td>
        )
      },
      // Process ALL text nodes - this is critical for inline citations
      // react-markdown passes text as children to this component
      text: ({ children: nodeChildren, ...props }) => {
        if (typeof nodeChildren === 'string') {
          const processed = processText(
            nodeChildren,
            citations,
            markerMap,
            evidenceCitationMap,
            inlineVisualSourceMap
          )
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
        return (
          <strong {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </strong>
        )
      },
      em: ({ children: nodeChildren, ...props }) => {
        return (
          <em {...props}>
            {processNode(nodeChildren, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
          </em>
        )
      },
    }
  }, [citations, markerMap, evidenceCitationMap, inlineVisualSourceMap])

  return (
    <Markdown
      className={className}
      components={components}
      onChartDrilldown={onChartDrilldown}
    >
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
  evidenceCitationMap: Map<number, EvidenceCitation> | null,
  inlineVisualSourceMap: Map<string, EvidenceCitation>
): React.ReactNode {
  if (typeof node === 'string') {
    return processText(node, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)
  }
  
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {processNode(child, citations, markerMap, evidenceCitationMap, inlineVisualSourceMap)}
      </React.Fragment>
    ))
  }
  
  if (React.isValidElement(node)) {
    const elementType = typeof node.type === "string" ? node.type : null
    if (elementType === "code" || elementType === "pre") {
      return node
    }
    const props = node.props as { children?: React.ReactNode }
    if (props.children) {
      return React.cloneElement(node, {
        ...props,
        children: processNode(
          props.children,
          citations,
          markerMap,
          evidenceCitationMap,
          inlineVisualSourceMap
        )
      } as React.Attributes)
    }
  }
  
  return node
}

function toEvidenceLikeCitation(
  citation: CitationData,
  fallbackIndex: number
): EvidenceCitation {
  const parsedYear = Number.parseInt(citation.year, 10)
  const inferredSourceLabel = inferSourceLabelFromUrl(citation.url)
  const inferredSourceFromPmid =
    !inferredSourceLabel && citation.pmid ? "PubMed" : null
  return {
    index: citation.index || fallbackIndex,
    sourceId: buildEvidenceSourceId(citation),
    pmid: citation.pmid || null,
    title: citation.title || `Citation ${fallbackIndex}`,
    journal: citation.journal || inferredSourceLabel || inferredSourceFromPmid || "Source",
    year: Number.isFinite(parsedYear) ? parsedYear : null,
    doi: citation.doi || null,
    authors: Array.isArray(citation.authors) ? citation.authors : [],
    evidenceLevel: 3,
    studyType: null,
    sampleSize: null,
    meshTerms: [],
    url: citation.url || null,
    snippet: "",
    score: 0,
    sourceType: "medical_evidence",
    sourceLabel: inferredSourceLabel || inferredSourceFromPmid || citation.journal || "Source",
  }
}

type ResolvedCitationPillProps = {
  index: number
  citations: Map<number, CitationData>
  evidenceCitationMap: Map<number, EvidenceCitation> | null
}

function resolveIndicesFromSourceIds(
  sourceIds: string[],
  citations: Map<number, CitationData>,
  evidenceCitationMap: Map<number, EvidenceCitation> | null
): number[] {
  const wanted = sourceIds.map((sourceId) => sourceId.toLowerCase())
  const resolved = new Set<number>()

  if (evidenceCitationMap) {
    evidenceCitationMap.forEach((citation, index) => {
      if (sourceIdsMatchCitation(wanted, citation)) {
        resolved.add(index)
      }
    })
  }

  citations.forEach((citation, fallbackIndex) => {
    const resolvedIndex =
      typeof citation.index === "number" && Number.isFinite(citation.index)
        ? citation.index
        : fallbackIndex
    if (sourceIdsMatchCitation(wanted, citation)) {
      resolved.add(resolvedIndex)
    }
  })

  return Array.from(resolved).sort((a, b) => a - b)
}

function hasRenderableEvidenceVisual(citation: EvidenceCitation | undefined | null): boolean {
  if (!citation) return false
  const references = [
    ...(citation.previewReference ? [citation.previewReference] : []),
    ...(citation.figureReferences || []),
  ]
  return references.some((reference) => Boolean(reference?.signedUrl))
}

function buildInlineVisualSourceIdMap(
  text: string,
  markerMap: Map<string, ReturnType<typeof parseCitationMarkers>[0]>,
  evidenceCitationMap: Map<number, EvidenceCitation> | null,
  markers: ReturnType<typeof parseCitationMarkers>
): { processedText: string; inlineVisualSourceMap: Map<string, EvidenceCitation> } {
  const inlineVisualSourceMap = new Map<string, EvidenceCitation>()
  if (!evidenceCitationMap || evidenceCitationMap.size === 0) {
    return { processedText: text, inlineVisualSourceMap }
  }

  const seenIndices = new Set<number>()
  const exactSourceMatches = new Set<number>()

  markerMap.forEach((marker) => {
    const markerAny = marker as typeof marker & { sourceIds?: string[] }
    const sourceIds =
      Array.isArray(markerAny.sourceIds) && markerAny.sourceIds.length > 0
        ? markerAny.sourceIds.map((value) => value.toLowerCase())
        : []
    if (sourceIds.length === 0) return

    evidenceCitationMap.forEach((citation, index) => {
      if (sourceIdsMatchCitation(sourceIds, citation) && hasRenderableEvidenceVisual(citation)) {
        exactSourceMatches.add(index)
      }
    })
  })

  let selectedCitation: EvidenceCitation | null = null

  if (exactSourceMatches.size > 0) {
    const exactMatch = Array.from(exactSourceMatches)
      .map((index) => evidenceCitationMap.get(index))
      .find((citation): citation is EvidenceCitation => Boolean(citation))
    if (exactMatch) {
      selectedCitation = exactMatch
    }
  }

  if (!selectedCitation) {
    for (const marker of markers) {
      for (const index of marker.indices) {
        if (seenIndices.has(index)) continue
        seenIndices.add(index)
        const candidate = evidenceCitationMap.get(index)
        if (hasRenderableEvidenceVisual(candidate)) {
          selectedCitation = candidate || null
          break
        }
      }
      if (selectedCitation) break
    }
  }

  if (!selectedCitation) {
    return { processedText: text, inlineVisualSourceMap }
  }

  const sourceId = buildEvidenceSourceId(selectedCitation)
  const visualPlaceholder = `[INLINE_VISUAL_${sourceId}]`
  inlineVisualSourceMap.set(sourceId.toLowerCase(), selectedCitation)

  if (text.includes(visualPlaceholder)) {
    return { processedText: text, inlineVisualSourceMap }
  }

  let insertionIndex = text.length
  let firstRelevantPlaceholderStart = -1
  let firstRelevantPlaceholderEnd = -1

  markerMap.forEach((marker, placeholder) => {
    if (!marker.indices.includes(selectedCitation.index)) return
    const matchIndex = text.indexOf(placeholder)
    if (matchIndex === -1) return
    if (firstRelevantPlaceholderStart === -1 || matchIndex < firstRelevantPlaceholderStart) {
      firstRelevantPlaceholderStart = matchIndex
      firstRelevantPlaceholderEnd = matchIndex + placeholder.length
    }
  })

  if (firstRelevantPlaceholderEnd >= 0) {
    const paragraphBoundary = text.indexOf("\n\n", firstRelevantPlaceholderEnd)
    insertionIndex = paragraphBoundary >= 0 ? paragraphBoundary : text.length
  }

  const before = text.slice(0, insertionIndex).replace(/\n+$/g, "")
  const after = text.slice(insertionIndex).replace(/^\n+/g, "")
  return {
    processedText: [before, visualPlaceholder, after].filter(Boolean).join("\n\n"),
    inlineVisualSourceMap,
  }
}

function isStandaloneInlineVisualNode(node: React.ReactNode): boolean {
  if (typeof node === "string") {
    return node.trim().length === 0
  }

  if (Array.isArray(node)) {
    const meaningfulChildren = node.filter((child) => {
      if (typeof child === "string") return child.trim().length > 0
      return child !== null && child !== undefined && child !== false
    })
    return (
      meaningfulChildren.length > 0 &&
      meaningfulChildren.every((child) => isStandaloneInlineVisualNode(child))
    )
  }

  if (React.isValidElement(node)) {
    if (node.type === React.Fragment) {
      return isStandaloneInlineVisualNode((node.props as { children?: React.ReactNode }).children)
    }
    return node.type === InlineEvidenceVisual
  }

  return false
}

function ResolvedCitationPill({
  index,
  citations,
  evidenceCitationMap,
}: ResolvedCitationPillProps) {
  const evidenceCitation = evidenceCitationMap?.get(index)
  if (evidenceCitation) {
    return <EvidenceCitationPill citation={evidenceCitation} size="sm" />
  }
  const fallbackCitation = citations.get(index)
  if (!fallbackCitation) return null
  return (
    <EvidenceCitationPill
      citation={toEvidenceLikeCitation(fallbackCitation, fallbackCitation.index || index)}
      size="sm"
    />
  )
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
  evidenceCitationMap: Map<number, EvidenceCitation> | null,
  inlineVisualSourceMap: Map<string, EvidenceCitation>
): React.ReactNode {
  const sanitizedText = stripInternalRuntimeTokensPreservePlaceholders(text)
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const placeholderRegex =
    /\[INLINE_VISUAL_([A-Za-z0-9:._\/-]+)\]|\[?\s*CITE_PLACEHOLDER_(\d+)\s*\]?|\[CITE_([A-Za-z0-9:._\/-]+(?:\s*,\s*[A-Za-z0-9:._\/-]+)*)\]/g
  let match: RegExpExecArray | null
  
  while ((match = placeholderRegex.exec(sanitizedText)) !== null) {
    // Capture match values before callbacks
    const matchIndex = match.index
    const matchLength = match[0].length
    
    // Add text before placeholder
    if (matchIndex > lastIndex) {
      parts.push(sanitizedText.substring(lastIndex, matchIndex))
    }

    const inlineVisualSourceId =
      typeof match[1] === "string" && match[1].trim().length > 0
        ? match[1].trim().toLowerCase()
        : ""

    if (inlineVisualSourceId) {
      const inlineCitation =
        inlineVisualSourceMap.get(inlineVisualSourceId) ||
        resolveIndicesFromSourceIds([inlineVisualSourceId], citations, evidenceCitationMap)
          .map((index) => evidenceCitationMap?.get(index))
          .find(
            (citation): citation is EvidenceCitation =>
              Boolean(citation && hasRenderableEvidenceVisual(citation))
          )

      if (inlineCitation) {
        parts.push(
          <InlineEvidenceVisual
            key={`inline-visual-${inlineVisualSourceId}-${matchIndex}`}
            citation={inlineCitation}
          />
        )
      } else {
        parts.push(match[0])
      }

      lastIndex = matchIndex + matchLength
      continue
    }

    const placeholder = match[0]
    const directSourceIds =
      typeof match[3] === "string" && match[3].trim().length > 0
        ? match[3]
            .split(/\s*,\s*/)
            .map((sourceId) => sourceId.trim().toLowerCase())
            .filter(Boolean)
        : []
    const canonicalPlaceholder = match[2] ? `[CITE_PLACEHOLDER_${match[2]}]` : ""
    const marker =
      markerMap.get(placeholder) ||
      (canonicalPlaceholder ? markerMap.get(canonicalPlaceholder) : undefined) ||
      (directSourceIds.length > 0
        ? {
            type: "named" as const,
            indices: resolveIndicesFromSourceIds(directSourceIds, citations, evidenceCitationMap),
            sourceIds: directSourceIds,
            startIndex: matchIndex,
            endIndex: matchIndex + matchLength,
            fullMatch: placeholder,
          }
        : undefined)
    if (marker) {
      // If we have evidence citations, render EvidenceCitationPill for each
      if (evidenceCitationMap && evidenceCitationMap.size > 0) {
        const allIndicesResolvable = marker.indices.every((idx) =>
          evidenceCitationMap.has(idx)
        )
        if (!allIndicesResolvable) {
          // Never swallow marker text if mapping fails.
          parts.push(marker.fullMatch)
          lastIndex = matchIndex + matchLength
          continue
        }

        const evidencePills: React.ReactNode[] = []
        
        marker.indices.forEach((idx) => {
          if (evidenceCitationMap.get(idx)) {
            evidencePills.push(
              <ResolvedCitationPill
                key={`evidence-${idx}-${matchIndex}`}
                index={idx}
                citations={citations}
                evidenceCitationMap={evidenceCitationMap}
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
          // Preserve original marker if nothing was resolvable.
          parts.push(marker.fullMatch)
        }
      } else {
        if (marker.type === "named") {
          const namedCitations = marker.indices
            .map((idx) => citations.get(idx))
            .filter((c): c is CitationData => c !== undefined)

          if (namedCitations.length > 0) {
            const namedPills = namedCitations.map((citation, i) => (
              <ResolvedCitationPill
                key={`named-pill-${citation.index}-${matchIndex}-${i}`}
                index={citation.index || i + 1}
                citations={citations}
                evidenceCitationMap={evidenceCitationMap}
              />
            ))

            if (namedPills.length > 1) {
              parts.push(
                <span key={`named-citation-group-${matchIndex}`} className="inline-flex items-center gap-1">
                  {namedPills}
                </span>
              )
            } else {
              parts.push(namedPills[0])
            }
          } else {
            parts.push(marker.fullMatch)
          }

          lastIndex = matchIndex + matchLength
          continue
        }

        // Fall back to sleek citation pills for web/search results
        const markerCitations = marker.indices
          .map(idx => citations.get(idx))
          .filter((c): c is CitationData => c !== undefined)
        
        if (markerCitations.length > 0) {
          const citationPills = markerCitations.map((citation, i) => (
            <ResolvedCitationPill
              key={`citation-pill-${citation.index}-${matchIndex}-${i}`}
              index={citation.index || i + 1}
              citations={citations}
              evidenceCitationMap={evidenceCitationMap}
            />
          ))
          
          // If we have multiple journal groups, wrap them
          if (citationPills.length > 1) {
            parts.push(
              <span key={`citation-group-${matchIndex}`} className="inline-flex items-center gap-1">
                {citationPills}
              </span>
            )
          } else if (citationPills.length === 1) {
            parts.push(citationPills[0])
          }
        } else {
          parts.push(marker.fullMatch)
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
