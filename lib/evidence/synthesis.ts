/**
 * Evidence Synthesis Service
 * The core "brain" that retrieves evidence, synthesizes responses, and maps citations
 */

import { 
  searchMedicalEvidence, 
  resultsToCitations, 
  buildEvidenceContext,
  isMedicalQuery,
  scoreMedicalQuery
} from './search';
import type { 
  EvidenceSynthesisResult, 
  EvidenceCitation, 
  EvidenceSearchOptions,
  EvidenceContext 
} from './types';
import { buildEvidenceSourceId } from "./source-id";
import { parallelRetrieve } from './parallel-retrieval';

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
    maxResults = 20,
    minEvidenceLevel = 5,
    includeContext = true,
    minMedicalConfidence,
    forceEvidence = false,
  } = options;

  // Check if this is a medical query worth searching
  const confidenceThreshold = minMedicalConfidence ?? undefined;
  const medicalSignal = confidenceThreshold
    ? scoreMedicalQuery(query, confidenceThreshold)
    : scoreMedicalQuery(query);
  const shouldUseEvidence = forceEvidence || medicalSignal.isMedical;
  
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
    // Parallel retrieval: run local hybrid search + live PubMed concurrently
    const parallelResult = await parallelRetrieve({
      ...options,
      maxResults,
      minEvidenceLevel,
      skipPubMedIfLocalSufficient: true,
    });

    const results = parallelResult.merged;
    if (parallelResult.sources.pubmed > 0 || parallelResult.sources.connectors > 0) {
      console.log(
        `📚 [PARALLEL RETRIEVAL] Merged ${parallelResult.sources.local} local + ${parallelResult.sources.pubmed} PubMed + ${parallelResult.sources.connectors} connector results (${parallelResult.totalMs}ms${parallelResult.connectorsUsed.length > 0 ? `, connectors: ${parallelResult.connectorsUsed.join(",")}` : ""})`,
      );
    }

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

### CITATION-CLAIM ALIGNMENT RULES:
1. Every factual clinical claim MUST be immediately followed by its citation marker [N].
2. Only cite a source if the cited text DIRECTLY supports the specific claim. Do not cite tangentially related sources.
3. If a drug name, dosage, or specific recommendation is mentioned, the citation MUST contain that drug/dosage/recommendation.
4. When sources conflict, explicitly state the conflict: "Source [1] recommends X, while source [2] suggests Y."
5. Never fabricate citation numbers. Only use [1] through [${evidenceContext.citations.length}].
6. For guideline recommendations, include the strength and evidence level when available (e.g., "Class I, Level A").
7. IMPORTANT: Use at LEAST 3 different citations throughout your response. Spread citations across multiple claims. Do NOT rely on a single source for the entire answer.
8. Prefer citing published PubMed articles and guidelines over trial registrations (ClinicalTrials.gov). Trial registrations are NOT evidence — they only prove a trial exists.
9. When citing a landmark trial (e.g., PARADIGM-HF, DAPA-HF, ARISTOTLE, AASK), cite the specific source that contains the trial data, not a secondary review.
10. Never use transcript provenance tags like [T], [E], or [H]. Those are for dictation/workspace notes only. In this evidence-grounded mode use ONLY numbered markers [1]–[${evidenceContext.citations.length}] tied to the evidence list below.

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
  const citationBySourceId = new Map<string, EvidenceCitation>();
  citations.forEach((citation) => {
    const primaryId = buildEvidenceSourceId(citation).toLowerCase();
    citationBySourceId.set(primaryId, citation);
    // Also index UUID segments for fuzzy matching (LLM sometimes abbreviates sourceIds)
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const uuids = [primaryId, citation.sourceId || "", citation.url || ""]
      .join(" ")
      .match(uuidPattern);
    if (uuids) {
      for (const uuid of uuids) {
        if (!citationBySourceId.has(uuid.toLowerCase())) {
          citationBySourceId.set(uuid.toLowerCase(), citation);
        }
      }
    }
  });

  function resolveSourceId(sourceId: string): EvidenceCitation | undefined {
    const exact = citationBySourceId.get(sourceId);
    if (exact) return exact;
    // Substring fallback for abbreviated sourceIds
    if (sourceId.length >= 8) {
      for (const [key, citation] of citationBySourceId) {
        if (key.includes(sourceId) || sourceId.includes(key)) return citation;
      }
    }
    return undefined;
  }

  // Source-id citations [CITE_<sourceId>] / [CITE_<sourceId1>,<sourceId2>]
  const sourceIdMatches = response.matchAll(/\[CITE_([A-Za-z0-9:._\/-]+(?:\s*,\s*[A-Za-z0-9:._\/-]+)*)\]/g);
  for (const match of sourceIdMatches) {
    const values = match[1]
      .split(/\s*,\s*/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    values.forEach((sourceId) => {
      const citation = resolveSourceId(sourceId);
      if (citation) {
        citedIndices.add(citation.index);
      }
    });
  }
  
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

/**
 * Extract and verify citations from LLM response
 * This is the CRITICAL function that ensures only referenced citations are saved
 * 
 * @param responseText - The LLM-generated response text
 * @param allRetrievedCitations - All citations that were retrieved and provided to the LLM
 * @returns Only the citations that are actually referenced in the response
 */
export function extractReferencedCitations(
  responseText: string,
  allRetrievedCitations: EvidenceCitation[]
): {
  referencedCitations: EvidenceCitation[];
  citationIndices: number[];
  hasCitations: boolean;
  verificationStats: {
    totalRetrieved: number;
    totalReferenced: number;
    missingCitations: number[];
    fallbackAdded: number;
  };
} {
  if (!responseText || allRetrievedCitations.length === 0) {
    return {
      referencedCitations: [],
      citationIndices: [],
      hasCitations: false,
      verificationStats: {
        totalRetrieved: allRetrievedCitations.length,
        totalReferenced: 0,
        missingCitations: [],
        fallbackAdded: 0,
      },
    };
  }

  // Parse citation markers from response
  const citationMap = parseCitationMarkers(responseText, allRetrievedCitations);
  const referencedIndices = Array.from(citationMap.keys()).sort((a, b) => a - b);
  
  // Get only the citations that were actually referenced
  const referencedCitations = referencedIndices
    .map(index => citationMap.get(index))
    .filter((c): c is EvidenceCitation => c !== undefined);

  const fallbackAdded = 0;

  const finalIndices = referencedCitations
    .map(citation => citation.index)
    .sort((a, b) => a - b);

  // Find citations that were retrieved but not included (potential issues)
  const allIndices = new Set(allRetrievedCitations.map(c => c.index));
  const referencedSet = new Set(finalIndices);
  const missingCitations = Array.from(allIndices).filter(i => !referencedSet.has(i));
  const hasCitations = referencedCitations.length > 0;

  // Log for debugging
  if (hasCitations) {
    console.log(`📚 [CITATION EXTRACTION] Found ${referencedCitations.length} referenced citations out of ${allRetrievedCitations.length} retrieved`);
    if (fallbackAdded > 0) {
      console.warn(
        `📚 [CITATION EXTRACTION] Added ${fallbackAdded} fallback citations to maintain minimum evidence references`
      );
    }
    if (missingCitations.length > 0) {
      console.log(`📚 [CITATION EXTRACTION] Warning: ${missingCitations.length} retrieved citations were not referenced: [${missingCitations.join(', ')}]`);
    }
  } else if (allRetrievedCitations.length > 0) {
    console.warn(`📚 [CITATION EXTRACTION] No citation markers found in response despite ${allRetrievedCitations.length} citations being provided`);
  }

  return {
    referencedCitations,
    citationIndices: finalIndices,
    hasCitations,
    verificationStats: {
      totalRetrieved: allRetrievedCitations.length,
      totalReferenced: referencedCitations.length,
      missingCitations,
      fallbackAdded,
    },
  };
}