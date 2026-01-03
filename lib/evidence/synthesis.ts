/**
 * Evidence Synthesis Service
 * The core "brain" that retrieves evidence, synthesizes responses, and maps citations
 */

import { 
  searchMedicalEvidence, 
  resultsToCitations, 
  buildEvidenceContext,
  isMedicalQuery 
} from './search';
import type { 
  EvidenceSynthesisResult, 
  EvidenceCitation, 
  EvidenceSearchOptions,
  EvidenceContext 
} from './types';

export interface SynthesisOptions extends EvidenceSearchOptions {
  includeContext?: boolean;
  enhanceSystemPrompt?: boolean;
}

/**
 * Full evidence synthesis pipeline:
 * 1. Search medical evidence using hybrid search
 * 2. Build context for LLM
 * 3. Return evidence context for chat integration
 */
export async function synthesizeEvidence(
  options: SynthesisOptions
): Promise<{
  context: EvidenceContext;
  shouldUseEvidence: boolean;
  searchTimeMs: number;
}> {
  const startTime = performance.now();
  
  const {
    query,
    maxResults = 8,
    minEvidenceLevel = 5,
    includeContext = true,
  } = options;

  // Check if this is a medical query worth searching
  const shouldUseEvidence = isMedicalQuery(query);
  
  if (!shouldUseEvidence) {
    return {
      context: {
        citations: [],
        formattedContext: '',
        systemPromptAddition: '',
      },
      shouldUseEvidence: false,
      searchTimeMs: performance.now() - startTime,
    };
  }

  try {
    // Search for relevant evidence
    const results = await searchMedicalEvidence({
      ...options,
      maxResults,
      minEvidenceLevel,
    });

    // Convert to citations
    const citations = resultsToCitations(results);

    // Build context for LLM
    const context = includeContext 
      ? buildEvidenceContext(citations)
      : { citations, formattedContext: '', systemPromptAddition: '' };

    return {
      context,
      shouldUseEvidence: citations.length > 0,
      searchTimeMs: performance.now() - startTime,
    };
  } catch (error) {
    console.error('[Evidence Synthesis] Error:', error);
    // Return empty context on error - don't block the chat
    return {
      context: {
        citations: [],
        formattedContext: '',
        systemPromptAddition: '',
      },
      shouldUseEvidence: false,
      searchTimeMs: performance.now() - startTime,
    };
  }
}

/**
 * Build the full evidence-enhanced system prompt
 */
export function buildEvidenceSystemPrompt(
  basePrompt: string,
  evidenceContext: EvidenceContext
): string {
  if (!evidenceContext.systemPromptAddition) {
    return basePrompt;
  }

  return `${basePrompt}

${evidenceContext.systemPromptAddition}

### EVIDENCE CONTENT:
${evidenceContext.formattedContext}`;
}

/**
 * Parse citation markers from LLM response and map to citations
 * Handles formats: [1], [1,2], [1-3], [CITATION:1]
 */
export function parseCitationMarkers(
  response: string,
  citations: EvidenceCitation[]
): Map<number, EvidenceCitation> {
  const citationMap = new Map<number, EvidenceCitation>();
  
  // Match various citation formats
  const patterns = [
    /\[(\d+(?:,\s*\d+)*)\]/g,           // [1], [1,2], [1, 2, 3]
    /\[(\d+)-(\d+)\]/g,                  // [1-3]
    /\[CITATION:(\d+)\]/g,               // [CITATION:1]
  ];

  // Extract all cited indices
  const citedIndices = new Set<number>();
  
  // Simple numeric citations [1], [1,2]
  const simpleMatches = response.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g);
  for (const match of simpleMatches) {
    const indices = match[1].split(',').map(s => parseInt(s.trim(), 10));
    indices.forEach(i => citedIndices.add(i));
  }

  // Range citations [1-3]
  const rangeMatches = response.matchAll(/\[(\d+)-(\d+)\]/g);
  for (const match of rangeMatches) {
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    for (let i = start; i <= end; i++) {
      citedIndices.add(i);
    }
  }

  // CITATION format
  const citationMatches = response.matchAll(/\[CITATION:(\d+)\]/g);
  for (const match of citationMatches) {
    citedIndices.add(parseInt(match[1], 10));
  }

  // Map indices to citations
  citedIndices.forEach(index => {
    const citation = citations.find(c => c.index === index);
    if (citation) {
      citationMap.set(index, citation);
    }
  });

  return citationMap;
}

/**
 * Generate evidence summary statistics
 */
export function generateEvidenceSummary(citations: EvidenceCitation[]): {
  totalSources: number;
  highestEvidenceLevel: number;
  studyTypes: Record<string, number>;
  yearRange: { min: number; max: number } | null;
} {
  if (citations.length === 0) {
    return {
      totalSources: 0,
      highestEvidenceLevel: 5,
      studyTypes: {},
      yearRange: null,
    };
  }

  // Count study types
  const studyTypes: Record<string, number> = {};
  citations.forEach(c => {
    const type = c.studyType || 'Unknown';
    studyTypes[type] = (studyTypes[type] || 0) + 1;
  });

  // Get year range
  const years = citations
    .map(c => c.year)
    .filter((y): y is number => y !== null);
  
  const yearRange = years.length > 0
    ? { min: Math.min(...years), max: Math.max(...years) }
    : null;

  return {
    totalSources: citations.length,
    highestEvidenceLevel: Math.min(...citations.map(c => c.evidenceLevel)),
    studyTypes,
    yearRange,
  };
}

/**
 * Format response with proper citation rendering hints
 * This adds metadata for the frontend to render citations properly
 */
export function formatResponseWithCitations(
  response: string,
  citations: EvidenceCitation[]
): {
  content: string;
  citations: EvidenceCitation[];
  citationMap: Record<number, EvidenceCitation>;
} {
  const citationMap: Record<number, EvidenceCitation> = {};
  
  // Build citation map for quick lookup
  citations.forEach(c => {
    citationMap[c.index] = c;
  });

  // The response already has [1], [2] markers from the LLM
  // We just need to return the citation data for the frontend
  return {
    content: response,
    citations,
    citationMap,
  };
}

