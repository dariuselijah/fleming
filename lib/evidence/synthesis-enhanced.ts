/**
 * Enhanced Evidence Synthesis with Contextual Relevance
 * Uses the multi-layer contextual relevance system for world-class citation attribution
 */

import { contextualRelevanceSearch } from './contextual-relevance';
import { buildEvidenceContext } from './search';
import { isMedicalQuery } from './search';
import type { 
  EvidenceContext,
  EvidenceCitation 
} from './types';
import type { QueryUnderstanding } from './contextual-relevance';

export interface EnhancedSynthesisOptions {
  query: string;
  maxResults?: number;
  minEvidenceLevel?: number;
  enableReranking?: boolean;
  minContextualScore?: number;
  includeContext?: boolean;
  apiKey?: string;
}

export interface EnhancedSynthesisResult {
  context: EvidenceContext;
  shouldUseEvidence: boolean;
  searchTimeMs: number;
  queryUnderstanding: QueryUnderstanding;
  rerankingStats: {
    initialCount: number;
    afterReranking: number;
    averageContextualScore: number;
    signalsUsed: string[];
  };
}

/**
 * Enhanced evidence synthesis with contextual relevance
 * This ensures only truly relevant articles are included
 */
export async function synthesizeEvidenceEnhanced(
  options: EnhancedSynthesisOptions
): Promise<EnhancedSynthesisResult> {
  const startTime = performance.now();
  
  const {
    query,
    maxResults = 8,
    minEvidenceLevel = 5,
    enableReranking = true,
    minContextualScore = 0.6, // Balanced threshold - ensures quality while getting results
    includeContext = true,
    apiKey,
  } = options;

  // Check if this is a medical query
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
      queryUnderstanding: {
        primaryIntent: 'general',
        secondaryIntents: [],
        questionType: 'factual',
        specificity: 'low',
        entities: {
          conditions: [],
          drugs: [],
          procedures: [],
          symptoms: [],
          tests: [],
          anatomy: [],
          demographics: [],
          outcomes: [],
        },
        requiresTreatment: false,
        requiresDiagnosis: false,
        requiresMechanism: false,
        requiresOutcome: false,
        requiresSafety: false,
        requiresDosing: false,
        requiresGuidelines: false,
        requiresComparison: false,
        semanticQuery: query,
        keywordQuery: query,
        entityQuery: query,
        meshQuery: [],
        medicalDomain: [],
        specialty: [],
        urgency: 'low',
        complexity: 'simple',
      },
      rerankingStats: {
        initialCount: 0,
        afterReranking: 0,
        averageContextualScore: 0,
        signalsUsed: [],
      },
    };
  }

  try {
    // Use enhanced search with contextual reranking
    const searchResult = await contextualRelevanceSearch({
      query,
      maxResults,
      minContextualScore,
      enableReranking,
      apiKey,
    });

    // Build context for LLM
    const context = includeContext 
      ? buildEvidenceContext(searchResult.citations)
      : { 
          citations: searchResult.citations, 
          formattedContext: '', 
          systemPromptAddition: '' 
        };

    return {
      context,
      shouldUseEvidence: searchResult.citations.length > 0,
      searchTimeMs: performance.now() - startTime,
      queryUnderstanding: searchResult.queryUnderstanding,
      rerankingStats: searchResult.rerankingStats,
    };
  } catch (error) {
    console.error('[Enhanced Evidence Synthesis] Error:', error);
    return {
      context: {
        citations: [],
        formattedContext: '',
        systemPromptAddition: '',
      },
      shouldUseEvidence: false,
      searchTimeMs: performance.now() - startTime,
      queryUnderstanding: {
        primaryIntent: 'general',
        secondaryIntents: [],
        questionType: 'factual',
        specificity: 'low',
        entities: {
          conditions: [],
          drugs: [],
          procedures: [],
          symptoms: [],
          tests: [],
          anatomy: [],
          demographics: [],
          outcomes: [],
        },
        requiresTreatment: false,
        requiresDiagnosis: false,
        requiresMechanism: false,
        requiresOutcome: false,
        requiresSafety: false,
        requiresDosing: false,
        requiresGuidelines: false,
        requiresComparison: false,
        semanticQuery: query,
        keywordQuery: query,
        entityQuery: query,
        meshQuery: [],
        medicalDomain: [],
        specialty: [],
        urgency: 'low',
        complexity: 'simple',
      },
      rerankingStats: {
        initialCount: 0,
        afterReranking: 0,
        averageContextualScore: 0,
        signalsUsed: [],
      },
    };
  }
}

