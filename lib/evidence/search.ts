/**
 * Evidence Search Service
 * Hybrid search (semantic + keyword) using the medical_evidence table
 */

import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/rag/embeddings';
import type { 
  MedicalEvidenceResult, 
  EvidenceCitation, 
  EvidenceSearchOptions,
  EvidenceContext 
} from './types';

/**
 * Search medical evidence using hybrid search (semantic + full-text)
 * Uses the hybrid_medical_search RPC function with Reciprocal Rank Fusion
 */
export async function searchMedicalEvidence(
  options: EvidenceSearchOptions
): Promise<MedicalEvidenceResult[]> {
  const {
    query,
    maxResults = 10,
    minEvidenceLevel = 5, // Include all by default
    studyTypes,
    meshTerms,
    minYear,
    semanticWeight = 1.0,
    keywordWeight = 1.0,
    recencyWeight = 0.1,
    evidenceBoost = 0.2,
  } = options;

  const supabase = await createClient();
  
  if (!supabase) {
    throw new Error('Failed to create Supabase client');
  }

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Call the hybrid search RPC function
  // @ts-expect-error - hybrid_medical_search is a custom RPC function not in generated types
  const { data, error } = await supabase.rpc('hybrid_medical_search', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_count: maxResults,
    full_text_weight: keywordWeight,
    semantic_weight: semanticWeight,
    recency_weight: recencyWeight,
    evidence_boost: evidenceBoost,
    min_evidence_level: minEvidenceLevel,
    filter_study_types: studyTypes || null,
    filter_mesh_terms: meshTerms || null,
    min_year: minYear || null,
  });

  if (error) {
    console.error('[Evidence Search] Hybrid search failed:', error);
    throw new Error(`Evidence search failed: ${error.message}`);
  }

  return (data || []) as MedicalEvidenceResult[];
}

/**
 * Convert search results to citation format
 */
export function resultsToCitations(results: MedicalEvidenceResult[]): EvidenceCitation[] {
  return results.map((result, index) => ({
    index: index + 1,
    pmid: result.pmid,
    title: result.title,
    journal: result.journal_name,
    year: result.publication_year,
    doi: result.doi,
    authors: result.authors || [],
    evidenceLevel: result.evidence_level,
    studyType: result.study_type,
    sampleSize: result.sample_size,
    meshTerms: result.mesh_terms || [],
    url: result.pmid 
      ? `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`
      : result.doi 
        ? `https://doi.org/${result.doi}`
        : null,
    snippet: result.content.substring(0, 300) + (result.content.length > 300 ? '...' : ''),
    score: result.score,
  }));
}

/**
 * Build context for LLM from evidence citations
 */
export function buildEvidenceContext(citations: EvidenceCitation[]): EvidenceContext {
  // Format citations for context
  const formattedContext = citations.map((c) => {
    const authorStr = c.authors.length > 0 
      ? c.authors.slice(0, 3).join(', ') + (c.authors.length > 3 ? ' et al.' : '')
      : 'Unknown authors';
    
    return `[${c.index}] ${c.title}
Source: ${c.journal}${c.year ? ` (${c.year})` : ''}
Authors: ${authorStr}
Evidence Level: ${c.evidenceLevel} (${getEvidenceLevelLabel(c.evidenceLevel)})
${c.studyType ? `Study Type: ${c.studyType}` : ''}
${c.sampleSize ? `Sample Size: n=${c.sampleSize}` : ''}
${c.meshTerms.length > 0 ? `MeSH Terms: ${c.meshTerms.slice(0, 5).join(', ')}` : ''}

Content:
${c.snippet}
---`;
  }).join('\n\n');

  // Build system prompt addition
  const systemPromptAddition = buildEvidenceSystemPrompt(citations);

  return {
    citations,
    formattedContext,
    systemPromptAddition,
  };
}

/**
 * Build system prompt for evidence-based responses
 */
function buildEvidenceSystemPrompt(citations: EvidenceCitation[]): string {
  if (citations.length === 0) {
    return '';
  }

  return `
## EVIDENCE-BASED RESPONSE GUIDELINES

You have access to ${citations.length} peer-reviewed medical evidence sources. You MUST:

1. **CITE EVERY CLAIM**: Use inline citations [1], [2], etc. for every factual medical statement
2. **PRIORITIZE HIGH EVIDENCE**: Weight meta-analyses (Level 1) and RCTs (Level 2) more heavily
3. **ACKNOWLEDGE LIMITATIONS**: If evidence is from lower-quality studies, mention this
4. **BE PRECISE**: Quote study findings accurately, including sample sizes when available
5. **SYNTHESIZE**: Combine findings from multiple sources when they agree
6. **FLAG CONFLICTS**: Note when sources disagree and explain why

### Citation Format:
- Single citation: "ACE inhibitors reduce mortality [1]"
- Multiple citations: "Blood pressure control improves outcomes [1,2,3]"
- Direct quote: "The study found 'a 23% reduction in cardiovascular events' [1]"

### Evidence Quality Indicators:
- Level 1 (Meta-Analysis/SR): Strongest evidence - prioritize these
- Level 2 (RCT): Strong evidence - reliable for treatment recommendations
- Level 3 (Cohort): Moderate evidence - good for associations
- Level 4 (Case): Weak evidence - mention with caution
- Level 5 (Opinion): Expert opinion - use for context only

### AVAILABLE EVIDENCE:
${citations.map(c => `[${c.index}] ${c.title} (${c.journal}, ${c.year || 'n.d.'}) - Level ${c.evidenceLevel}`).join('\n')}

Respond with a well-structured answer that synthesizes this evidence.`;
}

/**
 * Get human-readable evidence level label
 */
function getEvidenceLevelLabel(level: number): string {
  const labels: Record<number, string> = {
    1: 'Meta-Analysis/Systematic Review',
    2: 'Randomized Controlled Trial',
    3: 'Cohort/Case-Control Study',
    4: 'Case Series/Case Report',
    5: 'Expert Opinion/Review',
  };
  return labels[level] || 'Unknown';
}

/**
 * Check if a query is likely medical/clinical
 */
export function isMedicalQuery(query: string): boolean {
  const medicalPatterns = [
    // Conditions
    /\b(disease|disorder|syndrome|infection|cancer|tumor|diabetes|hypertension|asthma|copd|heart failure|stroke)\b/i,
    // Treatments
    /\b(treatment|therapy|medication|drug|surgery|procedure|intervention|dose|dosing)\b/i,
    // Clinical
    /\b(diagnosis|symptom|sign|prognosis|risk|screening|prevention|guideline|protocol)\b/i,
    // Evidence
    /\b(evidence|study|trial|research|meta-analysis|review|efficacy|safety|outcome)\b/i,
    // Body/Anatomy
    /\b(blood pressure|heart rate|glucose|cholesterol|kidney|liver|lung|brain)\b/i,
    // Medical specialties
    /\b(cardiology|oncology|neurology|psychiatry|pediatric|geriatric|emergency)\b/i,
  ];

  return medicalPatterns.some(pattern => pattern.test(query));
}

/**
 * Extract key medical terms from a query for better search
 */
export function extractMedicalTerms(query: string): string[] {
  const terms: string[] = [];
  
  // Common medical terms to preserve
  const medicalTermPatterns = [
    /\b[A-Z]{2,}(?:-\d+)?\b/g, // Acronyms like ACE, ARB, SGLT2
    /\b\d+\s*mg\b/gi, // Dosages
    /\b(?:type\s*)?[12]\s*diabetes\b/gi, // Diabetes types
    /\b(?:stage\s*)?[IVX]+\b/g, // Cancer stages
  ];

  medicalTermPatterns.forEach(pattern => {
    const matches = query.match(pattern);
    if (matches) {
      terms.push(...matches);
    }
  });

  return [...new Set(terms)];
}

