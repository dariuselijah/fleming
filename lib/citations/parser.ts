/**
 * Citation parser for extracting citation markers from text
 * Supports formats like [CITATION:1], [CITATION:1,2,3], [1], etc.
 */

export interface CitationMarker {
  type: 'citation' | 'numbered' | 'named'
  indices: number[]
  sourceIds?: string[]
  startIndex: number
  endIndex: number
  fullMatch: string
  quoteText?: string
}

/**
 * Parse citation markers from text
 * Supports:
 * - [CITATION:1] or [CITATION:1,2,3]
 * - [CITATION:1:QUOTE:"text"]
 * - [1] or [1,2,3]
 * - (1) or (1,2,3)
 */
export function parseCitationMarkers(text: string): CitationMarker[] {
  const markers: CitationMarker[] = []
  
  // Pattern 0: [CITE_<sourceId>] or [CITE_<sourceIdA>,<sourceIdB>]
  // Example: [CITE_pmid:1578956], [CITE_doi:10.1056/nejmoa2032183]
  const sourceIdPattern = /\[CITE_([A-Za-z0-9:._\/-]+(?:\s*,\s*[A-Za-z0-9:._\/-]+)*)\]/g
  let match
  while ((match = sourceIdPattern.exec(text)) !== null) {
    const sourceIds = match[1]
      .split(/\s*,\s*/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (sourceIds.length === 0) continue
    markers.push({
      type: "named",
      indices: [],
      sourceIds,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      fullMatch: match[0],
    })
  }

  // Pattern 1: [CITATION:1] or [CITATION:1,2,3] or [CITATION:1:QUOTE:"text"]
  const citationPattern = /\[CITATION:(\d+(?:\s*,\s*\d+)*)(?::QUOTE:"([^"]+)")?\]/g
  
  while ((match = citationPattern.exec(text)) !== null) {
    const indices = match[1].split(/\s*,\s*/).map(n => parseInt(n, 10))
    markers.push({
      type: 'citation',
      indices,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      fullMatch: match[0],
      quoteText: match[2]
    })
  }
  
  // Pattern 2: [1] or [1,2,3] (simple numbered citations)
  // Also supports optional internal spaces and semicolon delimiters.
  const numberedPattern = /\[\s*(\d+(?:\s*[,;]\s*\d+)*)\s*\]/g
  while ((match = numberedPattern.exec(text)) !== null) {
    // Skip if already matched as CITATION pattern
    const alreadyMatched = markers.some(m => 
      m.startIndex <= match!.index && m.endIndex >= match!.index + match![0].length
    )
    
    if (!alreadyMatched) {
      const indices = match[1]
        .split(/\s*[,;]\s*/)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n))
      markers.push({
        type: 'numbered',
        indices,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        fullMatch: match[0]
      })
    }
  }

  // Pattern 3: [1-3] (range format)
  const rangePattern = /\[\s*(\d+)\s*-\s*(\d+)\s*\]/g
  while ((match = rangePattern.exec(text)) !== null) {
    const alreadyMatched = markers.some(m =>
      m.startIndex <= match!.index && m.endIndex >= match!.index + match![0].length
    )

    if (!alreadyMatched) {
      const start = parseInt(match[1], 10)
      const end = parseInt(match[2], 10)
      const rangeStart = Math.min(start, end)
      const rangeEnd = Math.max(start, end)
      const indices: number[] = []
      for (let i = rangeStart; i <= rangeEnd; i++) {
        indices.push(i)
      }

      markers.push({
        type: 'numbered',
        indices,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        fullMatch: match[0]
      })
    }
  }
  
  // Pattern 4: (1) or (1,2,3) (parentheses format)
  const parenPattern = /\((\d+(?:\s*,\s*\d+)*)\)/g
  while ((match = parenPattern.exec(text)) !== null) {
    // Skip if already matched
    const alreadyMatched = markers.some(m => 
      m.startIndex <= match!.index && m.endIndex >= match!.index + match![0].length
    )
    
    if (!alreadyMatched) {
      const indices = match[1].split(/\s*,\s*/).map(n => parseInt(n, 10))
      markers.push({
        type: 'numbered',
        indices,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        fullMatch: match[0]
      })
    }
  }
  
  // Sort by start index
  return markers.sort((a, b) => a.startIndex - b.startIndex)
}

/**
 * Replace citation markers in text with React components or HTML
 */
export function replaceCitationMarkers(
  text: string,
  markers: CitationMarker[],
  replacer: (marker: CitationMarker, key: string) => string
): string {
  if (markers.length === 0) return text
  
  // Build replacement string by processing markers in reverse order
  // (to preserve indices)
  let result = text
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i]
    const replacement = replacer(marker, `citation-${i}`)
    result = 
      result.substring(0, marker.startIndex) + 
      replacement + 
      result.substring(marker.endIndex)
  }
  
  return result
}

/**
 * Extract all unique citation indices from markers
 */
export function getUniqueCitationIndices(markers: CitationMarker[]): number[] {
  const indices = new Set<number>()
  markers.forEach(marker => {
    marker.indices.forEach(idx => indices.add(idx))
  })
  return Array.from(indices).sort((a, b) => a - b)
}





