/**
 * Evidence Search Service
 * Hybrid search (semantic + keyword) using the medical_evidence table
 */

import { generateEmbedding } from '../rag/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { 
  MedicalEvidenceResult, 
  EvidenceCitation, 
  EvidenceSearchOptions,
  EvidenceContext 
} from './types';

export type MedicalQuerySignal = {
  score: number;
  isMedical: boolean;
  signals: string[];
};

type SupabaseClientType = SupabaseClient;

async function getServerClient(): Promise<SupabaseClientType | null> {
  try {
    const { createClient } = await import('../supabase/server');
    return (await createClient()) as SupabaseClientType | null;
  } catch (error) {
    console.error('[Evidence Search] Failed to load server Supabase client:', error);
    return null;
  }
}

const DEFAULT_MEDICAL_CONFIDENCE = 0.35;
const MAX_FALLBACK_TOKENS = 6;
const DEFAULT_CANDIDATE_MULTIPLIER = 6;
const US_GUIDELINE_ORG_PATTERN =
  /\b(aha|acc|acp|ada|acog|aafp|cdc|nih|idsa|nccn|uspstf|sccm|ats)\b/i;
const HIGH_AUTHORITY_STUDY_TYPE_PATTERN =
  /\b(guideline|recommendation|consensus|position statement|meta-analysis|systematic|randomized|rct)\b/i;
const MEDICAL_QUERY_SYNONYM_EXPANSIONS: Record<string, string[]> = {
  htn: ["hypertension", "high blood pressure"],
  cap: ["community acquired pneumonia", "community-acquired pneumonia"],
  copd: ["chronic obstructive pulmonary disease"],
  ckd: ["chronic kidney disease"],
  hfref: ["heart failure reduced ejection fraction", "heart failure with reduced ejection fraction"],
  afib: ["atrial fibrillation"],
  acs: ["acute coronary syndrome"],
  uti: ["urinary tract infection"],
  sepsis: ["septic shock", "sepsis bundle"],
  "abdominal pain": ["acute abdomen", "abdominal pain workup", "red flags"],
};

const MEDICAL_SIGNAL_PATTERNS: Array<{
  regex: RegExp;
  weight: number;
  label: string;
}> = [
  { regex: /\b(disease|disorder|syndrome|infection|cancer|tumor|diabetes|hypertension|asthma|copd|heart failure|stroke)\b/i, weight: 0.35, label: 'condition' },
  { regex: /\b(treatment|therapy|medication|drug|surgery|procedure|intervention|dose|dosing)\b/i, weight: 0.25, label: 'treatment' },
  { regex: /\b(diagnosis|symptom|sign|prognosis|risk|screening|prevention|guideline|protocol)\b/i, weight: 0.2, label: 'clinical' },
  { regex: /\b(evidence|study|trial|research|meta-analysis|review|efficacy|safety|outcome)\b/i, weight: 0.2, label: 'evidence' },
  { regex: /\b(blood pressure|heart rate|glucose|cholesterol|kidney|liver|lung|brain)\b/i, weight: 0.15, label: 'physiology' },
  { regex: /\b(cardiology|oncology|neurology|psychiatry|pediatric|geriatric|emergency)\b/i, weight: 0.15, label: 'specialty' },
  { regex: /\b(antibiotic|anticoagulant|statin|insulin|metformin|ssri|snri|beta blocker|ace inhibitor|arb|sglt2|glp-1)\b/i, weight: 0.25, label: 'medication' },
];

const SHORT_MEDICAL_TOKENS = new Set([
  'bp',
  'hr',
  'rr',
  'a1c',
  'ldl',
  'hdl',
  'bmi',
  'egfr',
  'ckd',
  'copd',
  'uti',
  'mi',
  'acs',
  'af',
  'rct',
  'ptsd',
]);

function normalizeQueryText(query: string): string {
  return query
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeQueryText(query).toLowerCase();
  const tokens = normalized
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 3);

  const shortTokens = normalized
    .split(' ')
    .map(token => token.trim())
    .filter(token => SHORT_MEDICAL_TOKENS.has(token));

  return Array.from(new Set([...tokens, ...shortTokens]));
}

function sanitizeLikeToken(token: string): string {
  return token.replace(/[%_]/g, '\\$&');
}

function getCandidateCount(maxResults: number, candidateMultiplier?: number): number {
  const multiplier = candidateMultiplier ?? DEFAULT_CANDIDATE_MULTIPLIER;
  const requested = Math.max(maxResults, Math.round(maxResults * multiplier));
  return Math.min(Math.max(requested, maxResults), 200);
}

function expandMedicalQuery(query: string): string {
  const terms = extractMedicalTerms(query);
  const normalized = query.toLowerCase();
  const synonymTerms = Object.entries(MEDICAL_QUERY_SYNONYM_EXPANSIONS).flatMap(
    ([needle, synonyms]) => (normalized.includes(needle) ? synonyms : [])
  );
  if (terms.length === 0 && synonymTerms.length === 0) return query;

  const lower = query.toLowerCase();
  const extraTerms = [...terms, ...synonymTerms].filter(
    term => !lower.includes(term.toLowerCase())
  );
  if (extraTerms.length === 0) return query;

  return `${query} ${extraTerms.slice(0, 10).join(" ")}`.trim();
}

function computeKeywordOverlapScore(query: string, haystack: string): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;

  const normalizedHaystack = haystack.toLowerCase();
  let hits = 0;
  tokens.forEach(token => {
    if (normalizedHaystack.includes(token)) hits += 1;
  });

  return hits / tokens.length;
}

function computeUsFirstEvidenceBoost(result: MedicalEvidenceResult): number {
  const studyType = (result.study_type || "").toLowerCase();
  const journal = (result.journal_name || "").toLowerCase();
  const title = (result.title || "").toLowerCase();
  const meshTerms = [...(result.mesh_terms || []), ...(result.major_mesh_terms || [])].map(
    (term) => term.toLowerCase()
  );

  let boost = 0;

  if (studyType.includes("guideline")) boost += 0.45;
  if (studyType.includes("meta-analysis") || studyType.includes("systematic")) boost += 0.2;
  if (studyType.includes("randomized") || studyType.includes("rct")) boost += 0.15;
  if (studyType.includes("case report")) boost -= 0.1;

  if (
    meshTerms.some(
      (term) => term.includes("region:us") || term.includes("country:us") || term === "us"
    )
  ) {
    boost += 0.4;
  }

  if (
    meshTerms.some((term) =>
      /(organization:|source:).*(aha|acc|acp|ada|acog|aafp|cdc|nih|idsa|nccn|uspstf|sccm|ats)/i.test(
        term
      )
    )
  ) {
    boost += 0.25;
  }

  if (
    US_GUIDELINE_ORG_PATTERN.test(result.journal_name || "") ||
    US_GUIDELINE_ORG_PATTERN.test(result.title || "")
  ) {
    boost += 0.2;
  }

  if (journal.includes("guideline") || title.includes("guideline")) boost += 0.15;

  return boost;
}

function computeCitationWorthinessBoost(result: MedicalEvidenceResult): number {
  const evidenceLevel = typeof result.evidence_level === "number" ? result.evidence_level : 5;
  const evidenceBoost = Math.max(0, 6 - evidenceLevel) * 0.1;
  const studyType = (result.study_type || "").toLowerCase();
  const studyTypeBoost = HIGH_AUTHORITY_STUDY_TYPE_PATTERN.test(studyType) ? 0.2 : 0;
  const sourceAuthorityBoost = US_GUIDELINE_ORG_PATTERN.test(
    `${result.title || ""} ${result.journal_name || ""}`
  )
    ? 0.12
    : 0;
  const contentLengthBoost = Math.min(0.12, (result.content?.length || 0) / 3000);
  const metadataCompletenessBoost = result.pmid || result.doi ? 0.05 : 0;

  return (
    evidenceBoost +
    studyTypeBoost +
    sourceAuthorityBoost +
    contentLengthBoost +
    metadataCompletenessBoost
  );
}

function rerankResults(query: string, results: MedicalEvidenceResult[]): MedicalEvidenceResult[] {
  if (results.length <= 1) return results;

  const scored = results.map(result => {
    const text = `${result.title} ${result.content}`;
    const overlapScore = computeKeywordOverlapScore(query, text);
    const baseScore = typeof result.score === 'number' ? result.score : 0;
    const usFirstBoost = computeUsFirstEvidenceBoost(result);
    const citationWorthinessBoost = computeCitationWorthinessBoost(result);
    const combinedScore =
      baseScore + overlapScore * 0.35 + usFirstBoost + citationWorthinessBoost;

    return {
      ...result,
      score: combinedScore,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

async function fallbackKeywordSearch(
  supabase: SupabaseClientType,
  options: EvidenceSearchOptions,
  candidateCount: number
): Promise<MedicalEvidenceResult[]> {
  const tokens = tokenizeQuery(options.query)
    .slice(0, MAX_FALLBACK_TOKENS)
    .map(token => sanitizeLikeToken(token));

  if (tokens.length === 0) {
    return [];
  }

  const orFilters = tokens
    .flatMap(token => [`title.ilike.%${token}%`, `content.ilike.%${token}%`])
    .join(',');

  let queryBuilder = (supabase as any)
    .from('medical_evidence')
    .select(
      [
        'id',
        'content',
        'content_with_context',
        'title',
        'journal_name',
        'publication_year',
        'doi',
        'authors',
        'evidence_level',
        'study_type',
        'sample_size',
        'mesh_terms',
        'major_mesh_terms',
        'chemicals',
        'section_type',
        'pmid',
      ].join(', ')
    )
    .or(orFilters)
    .limit(candidateCount);

  if (typeof options.minEvidenceLevel === 'number') {
    queryBuilder = queryBuilder.lte('evidence_level', options.minEvidenceLevel);
  }

  if (options.studyTypes && options.studyTypes.length > 0) {
    queryBuilder = queryBuilder.in('study_type', options.studyTypes);
  }

  if (options.minYear) {
    queryBuilder = queryBuilder.gte('publication_year', options.minYear);
  }

  queryBuilder = queryBuilder
    .order('evidence_level', { ascending: true })
    .order('publication_year', { ascending: false });

  const { data, error } = await queryBuilder;

  if (error) {
    console.warn('[Evidence Search] Fallback keyword search failed:', error.message);
    return [];
  }

  const rows = (data || []) as unknown as MedicalEvidenceResult[];
  return rows.map(row => ({
    ...row,
    score: 0,
  }));
}

/**
 * Search medical evidence using hybrid search (semantic + full-text)
 * Uses the hybrid_medical_search RPC function with Reciprocal Rank Fusion
 */
export async function searchMedicalEvidence(
  options: EvidenceSearchOptions
): Promise<MedicalEvidenceResult[]> {
  const {
    query,
    maxResults = 12,
    minEvidenceLevel = 5, // Include all by default
    studyTypes,
    meshTerms,
    minYear,
    semanticWeight = 1.0,
    keywordWeight = 1.0,
    recencyWeight = 0.1,
    evidenceBoost = 0.2,
    candidateMultiplier,
    enableRerank = true,
    queryExpansion = true,
    supabaseClient: providedSupabaseClient,
  } = options;

  const supabase = providedSupabaseClient ?? (await getServerClient());
  
  if (!supabase) {
    throw new Error('Failed to create Supabase client');
  }
  const supabaseClient = supabase as SupabaseClientType;

  const expandedQuery = queryExpansion ? expandMedicalQuery(query) : query;
  const candidateCount = getCandidateCount(maxResults, candidateMultiplier);

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(expandedQuery);

  // Call the hybrid search RPC function
  const { data, error } = await supabaseClient.rpc('hybrid_medical_search', {
    query_text: expandedQuery,
    query_embedding: queryEmbedding,
    match_count: candidateCount,
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
    console.warn('[Evidence Search] Hybrid search failed, using fallback:', error.message);
    const fallbackResults = await fallbackKeywordSearch(supabaseClient, options, candidateCount);
    const rerankedFallback = enableRerank ? rerankResults(query, fallbackResults) : fallbackResults;
    return rerankedFallback.slice(0, maxResults);
  }

  const results = (data || []) as MedicalEvidenceResult[];
  const reranked = enableRerank ? rerankResults(query, results) : results;
  return reranked.slice(0, maxResults);
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
 * ENHANCED: More explicit citation requirements to ensure LLM generates citations
 */
function buildEvidenceSystemPrompt(citations: EvidenceCitation[]): string {
  if (citations.length === 0) {
    return '';
  }

  return `
## ⚠️ CRITICAL: EVIDENCE-BASED RESPONSE REQUIREMENTS ⚠️

You have access to ${citations.length} peer-reviewed medical evidence sources. You MUST follow these rules:

### MANDATORY CITATION RULES:
1. **EVERY factual medical claim MUST be followed by a citation in square brackets**
   - Format: [1], [2], [3] for single citations
   - Format: [1,2,3] for multiple citations supporting the same claim
   - Format: [1-3] for ranges (use sparingly)
   
2. **DO NOT make claims without citations** - If you cannot cite it, say "This information is not available in the provided sources"

3. **CITE IMMEDIATELY after each claim**, not at the end of paragraphs
   - ✅ CORRECT: "ACE inhibitors reduce mortality [1]. They are first-line therapy [2]."
   - ❌ WRONG: "ACE inhibitors reduce mortality. They are first-line therapy. [1,2]"

4. **PRIORITIZE HIGH EVIDENCE**: Weight meta-analyses (Level 1) and RCTs (Level 2) more heavily than lower-quality studies

5. **BE PRECISE**: Quote study findings accurately, including sample sizes when available

6. **SYNTHESIZE**: Combine findings from multiple sources when they agree: "Multiple studies show X [1,2,3]"

7. **FLAG CONFLICTS**: Note when sources disagree: "Some studies show X [1], while others show Y [2]"

### Citation Examples:
- Single: "Hypertension affects 30% of adults [1]"
- Multiple: "Blood pressure control improves outcomes [1,2,3]"
- With context: "A meta-analysis of 50,000 patients found a 23% reduction in cardiovascular events [1]"

### Evidence Quality Indicators:
- **Level 1** (Meta-Analysis/Systematic Review): Strongest evidence - prioritize these
- **Level 2** (Randomized Controlled Trial): Strong evidence - reliable for treatment recommendations
- **Level 3** (Cohort/Case-Control): Moderate evidence - good for associations
- **Level 4** (Case Series/Report): Weak evidence - mention with caution
- **Level 5** (Expert Opinion/Review): Expert opinion - use for context only

### AVAILABLE EVIDENCE (YOU MUST USE THESE):
${citations.map(c => `[${c.index}] ${c.title} (${c.journal}, ${c.year || 'n.d.'}) - Level ${c.evidenceLevel}${c.studyType ? ` (${c.studyType})` : ''}`).join('\n')}

### REMINDER: 
- Every medical fact needs a citation [X]
- Multiple facts need multiple citations [X,Y,Z]
- If you cannot cite it, say so explicitly
- DO NOT invent citations or use citations that don't exist

Now respond with a well-structured, evidence-based answer that properly cites every claim.`;
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
export function scoreMedicalQuery(
  query: string,
  minConfidence: number = DEFAULT_MEDICAL_CONFIDENCE
): MedicalQuerySignal {
  const normalized = query.toLowerCase();
  let score = 0;
  const signals: string[] = [];

  MEDICAL_SIGNAL_PATTERNS.forEach(pattern => {
    if (pattern.regex.test(query)) {
      score += pattern.weight;
      signals.push(pattern.label);
    }
  });

  if (/\b\d+(?:\.\d+)?\s?(mg|mcg|g|ml|units|iu|mmhg|meq\/l|mmol\/l)\b/i.test(normalized)) {
    score += 0.25;
    signals.push('dosage');
  }

  if (/\b(a1c|hba1c|ldl|hdl|bmi|egfr|creatinine|ast|alt|bun|tsh|wbc)\b/i.test(normalized)) {
    score += 0.2;
    signals.push('lab');
  }

  const tokens = tokenizeQuery(normalized);
  if (tokens.length >= 5) {
    score += 0.1;
    signals.push('multi-term');
  }

  const boundedScore = Math.min(score, 1);
  return {
    score: boundedScore,
    isMedical: boundedScore >= minConfidence,
    signals,
  };
}

export function isMedicalQuery(query: string): boolean {
  return scoreMedicalQuery(query).isMedical;
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

