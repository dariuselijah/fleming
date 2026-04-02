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
  EvidenceContext,
  EvidenceFilterPreset,
} from './types';
import { buildEvidenceSourceId } from "./source-id";
import { getEvidenceCache, setEvidenceCache, hashQuery, normaliseQueryForCache } from '../cache/retrieval-cache';
import { getSemanticCache, setSemanticCache } from '../cache/semantic-cache';
import {
  nextQueryId,
  startTimer,
  recordRetrievalMetrics,
  type RetrievalTimings,
} from '../metrics/retrieval-metrics';
import { crossEncoderRerank } from '../rag/cross-encoder-reranker';
import { generateHyDEEmbedding, expandClinicalShorthand } from '../rag/query-optimizer';
import { getMeshGraph } from '../knowledge-graph/mesh-graph';

/**
 * Resolve filter presets into concrete EvidenceSearchOptions overrides.
 * Presets stack – multiple presets produce the tightest intersection.
 */
function resolveFilterPresets(
  presets: EvidenceFilterPreset[] | undefined,
  opts: EvidenceSearchOptions,
): Partial<EvidenceSearchOptions> {
  if (!presets || presets.length === 0) return {};

  const overrides: Partial<EvidenceSearchOptions> = {};
  const currentYear = new Date().getFullYear();

  for (const preset of presets) {
    switch (preset) {
      case "guidelines_only":
        overrides.minEvidenceLevel = Math.min(overrides.minEvidenceLevel ?? 5, 1);
        overrides.studyTypes = [
          ...(overrides.studyTypes ?? []),
          "Guideline",
          "Practice Guideline",
          "Consensus",
        ];
        break;
      case "rcts_and_above":
        overrides.minEvidenceLevel = Math.min(overrides.minEvidenceLevel ?? 5, 2);
        break;
      case "high_evidence":
        overrides.minEvidenceLevel = Math.min(overrides.minEvidenceLevel ?? 5, 3);
        break;
      case "meta_analyses":
        overrides.studyTypes = [
          ...(overrides.studyTypes ?? []),
          "Meta-Analysis",
          "Systematic Review",
        ];
        break;
      case "recent_5y":
        overrides.minYear = Math.max(overrides.minYear ?? 0, currentYear - 5);
        break;
      case "recent_10y":
        overrides.minYear = Math.max(overrides.minYear ?? 0, currentYear - 10);
        break;
    }
  }

  return overrides;
}

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
const MIN_CITABLE_KEYWORD_OVERLAP = 0.22;
const MIN_CITABLE_RESULTS_FLOOR = 4;
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
  const hasPublicationId = Boolean(result.pmid || result.doi);
  const metadataCompletenessBoost = hasPublicationId ? 0.15 : -0.1;

  return (
    evidenceBoost +
    studyTypeBoost +
    sourceAuthorityBoost +
    contentLengthBoost +
    metadataCompletenessBoost
  );
}

function extractMedicalEntities(query: string): string[] {
  const q = query.toLowerCase();
  const entities: string[] = [];
  const drugPattern = /\b(metformin|insulin|warfarin|heparin|enoxaparin|apixaban|rivaroxaban|dabigatran|edoxaban|aspirin|clopidogrel|ticagrelor|amiodarone|digoxin|lisinopril|losartan|valsartan|sacubitril|amlodipine|metoprolol|carvedilol|bisoprolol|atorvastatin|rosuvastatin|simvastatin|fluconazole|voriconazole|posaconazole|vancomycin|meropenem|piperacillin|ceftriaxone|azithromycin|doxycycline|levofloxacin|ciprofloxacin|trimethoprim|nitrofurantoin|isoniazid|rifampin|ethambutol|pyrazinamide|levodopa|carbidopa|donepezil|memantine|lamotrigine|valproate|carbamazepine|phenytoin|gabapentin|pregabalin|sumatriptan|pembrolizumab|nivolumab|ipilimumab|vemurafenib|dabrafenib|trametinib|imatinib|osimertinib|semaglutide|liraglutide|empagliflozin|dapagliflozin|canagliflozin|sitagliptin|pioglitazone|levothyroxine|prednisone|hydrocortisone|dexamethasone|methylprednisolone|omeprazole|pantoprazole|lansoprazole|infliximab|adalimumab|rituximab|tocilizumab|methotrexate|hydroxychloroquine|colchicine|allopurinol|febuxostat|acetaminophen|ibuprofen|naproxen|morphine|fentanyl|hydromorphone|oxycodone|buprenorphine|naloxone|naltrexone|fluoxetine|sertraline|escitalopram|venlafaxine|duloxetine|bupropion|lithium|quetiapine|olanzapine|aripiprazole|clozapine|haloperidol|lorazepam|midazolam|diazepam|propofol|ketamine|epinephrine|norepinephrine|vasopressin|dobutamine|milrinone|alteplase|tenecteplase|heparin|bivalirudin|fondaparinux)\b/gi;
  const diseasePattern = /\b(hypertension|diabetes|heart failure|atrial fibrillation|stroke|copd|asthma|pneumonia|sepsis|meningitis|endocarditis|tuberculosis|hiv|hepatitis|cirrhosis|pancreatitis|cholecystitis|appendicitis|diverticulitis|crohn|colitis|celiac|ibs|gerd|nafld|ckd|aki|nephrotic|glomerulonephritis|lupus|rheumatoid|gout|osteoarthritis|spondylitis|vasculitis|psoriasis|eczema|dermatitis|melanoma|lymphoma|leukemia|myeloma|breast cancer|lung cancer|colorectal|prostate cancer|pancreatic cancer|glioblastoma|meningioma|epilepsy|migraine|parkinson|alzheimer|multiple sclerosis|myasthenia|guillain|huntington|als|pulmonary embolism|dvt|aortic stenosis|mitral|cardiomyopathy|pericarditis|myocarditis|aneurysm|dissection|preeclampsia|eclampsia|gestational diabetes|placenta previa|sickle cell|thalassemia|hemophilia|itp|ttp|hit|dic|anaphylaxis|angioedema|asthma|ards|pneumothorax|pleural effusion|pulmonary hypertension|sarcoidosis|amyloidosis|histiocytosis|erdheim|langerhans)\b/gi;
  const procedurePattern = /\b(ecmo|cabg|pci|tavr|ablation|cardioversion|dialysis|crrt|transplant|lobectomy|colectomy|cholecystectomy|appendectomy|intubation|tracheostomy|thoracostomy|paracentesis|thoracentesis|lumbar puncture|bronchoscopy|colonoscopy|endoscopy|catheterization|stenting|biopsy|resection)\b/gi;

  for (const pattern of [drugPattern, diseasePattern, procedurePattern]) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(q)) !== null) {
      entities.push(m[1].toLowerCase());
    }
  }
  return [...new Set(entities)];
}

function rerankResults(query: string, results: MedicalEvidenceResult[]): MedicalEvidenceResult[] {
  if (results.length <= 1) return results;

  const queryEntities = extractMedicalEntities(query);

  const scored = results.map(result => {
    const text = `${result.title} ${result.content}`;
    const overlapScore = computeKeywordOverlapScore(query, text);
    const baseScore = typeof result.score === 'number' ? result.score : 0;
    const usFirstBoost = computeUsFirstEvidenceBoost(result);
    const citationWorthinessBoost = computeCitationWorthinessBoost(result);

    // Aggressive off-topic penalty: anything below 15% keyword overlap gets crushed
    let relevancePenalty = 0;
    if (overlapScore < 0.08) relevancePenalty = -1.2;
    else if (overlapScore < 0.15) relevancePenalty = -0.6;
    else if (overlapScore < 0.22) relevancePenalty = -0.2;

    // Full-text chunks contain richer detail (methods, results, discussion)
    const sectionType = (result as any).section_type || "";
    const fullTextBoost = sectionType.startsWith("full_text_") ? 0.12 : 0;

    // Deprioritize trial registrations (ClinicalTrials.gov) — they're not evidence
    const journalOrSource = (result.journal_name || "").toLowerCase();
    const studyType = (result.study_type || "").toLowerCase();
    const isTrialRegistration = journalOrSource.includes("clinicaltrials.gov") || studyType.includes("registry");
    const trialRegistrationPenalty = isTrialRegistration ? -0.8 : 0;

    // Entity-match signal: penalize results that don't mention key entities from the query
    let entityMatchBoost = 0;
    if (queryEntities.length > 0) {
      const resultText = `${result.title || ""} ${result.content || ""}`.toLowerCase();
      const matched = queryEntities.filter(e => resultText.includes(e)).length;
      const ratio = matched / queryEntities.length;
      if (ratio === 0) entityMatchBoost = -0.5;
      else if (ratio < 0.3) entityMatchBoost = -0.2;
      else if (ratio >= 0.7) entityMatchBoost = 0.15;
    }

    const combinedScore =
      baseScore + overlapScore * 0.7 + usFirstBoost + citationWorthinessBoost + relevancePenalty + fullTextBoost + entityMatchBoost + trialRegistrationPenalty;

    return {
      ...result,
      score: combinedScore,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function filterLowRelevanceResults(
  query: string,
  results: MedicalEvidenceResult[],
  maxResults: number
): MedicalEvidenceResult[] {
  if (results.length === 0) return results;
  const scored = results.map(result => {
    const overlap = computeKeywordOverlapScore(
      query,
      `${result.title || ''} ${result.content || ''} ${result.journal_name || ''}`
    );
    return { result, overlap };
  });

  const filtered = scored
    .filter(item => item.overlap >= MIN_CITABLE_KEYWORD_OVERLAP)
    .map(item => item.result);

  // Only keep the floor if we'd otherwise return almost nothing
  if (filtered.length >= 2) return filtered.slice(0, maxResults);
  const minimumKeepCount = Math.min(maxResults, MIN_CITABLE_RESULTS_FLOOR);
  return filtered.length >= minimumKeepCount ? filtered : results;
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
  // Apply filter presets first, then let explicit options override
  const presetOverrides = resolveFilterPresets(options.filterPresets, options);
  const {
    query,
    maxResults = 20,
    minEvidenceLevel = presetOverrides.minEvidenceLevel ?? 5,
    studyTypes = presetOverrides.studyTypes,
    meshTerms,
    minYear = presetOverrides.minYear,
    semanticWeight = 1.0,
    keywordWeight = 1.0,
    recencyWeight = 0.1,
    evidenceBoost = 0.2,
    candidateMultiplier,
    enableRerank = true,
    queryExpansion = true,
    supabaseClient: providedSupabaseClient,
  } = { ...options, ...presetOverrides, ...options };

  const qid = nextQueryId();
  const totalTimer = startTimer();
  const timings: RetrievalTimings = { embeddingMs: 0, searchMs: 0, rerankMs: 0, fetchMs: 0, totalMs: 0 };

  // L1 cache: check Redis for previously computed results
  const cached = await getEvidenceCache<MedicalEvidenceResult[]>(query);
  if (cached && cached.length > 0) {
    timings.totalMs = totalTimer();
    recordRetrievalMetrics({
      queryId: qid, query, timestamp: Date.now(), timings,
      resultCount: cached.length, cacheHit: true, cacheLevel: "L1", source: "evidence",
    });
    return cached.slice(0, maxResults);
  }

  const supabase = providedSupabaseClient ?? (await getServerClient());
  
  if (!supabase) {
    throw new Error('Failed to create Supabase client');
  }
  const supabaseClient = supabase as SupabaseClientType;

  const shorthandExpanded = expandClinicalShorthand(query);
  let expandedQuery = queryExpansion ? expandMedicalQuery(shorthandExpanded) : shorthandExpanded;

  // MeSH graph expansion – append synonyms/narrower terms when available
  const meshGraph = getMeshGraph();
  if (meshGraph.size > 0) {
    const meshExpansions = meshGraph.expandQuery(expandedQuery);
    if (meshExpansions.length > 0) {
      expandedQuery = `${expandedQuery} ${meshExpansions.slice(0, 6).join(" ")}`;
    }
  }
  const candidateCount = getCandidateCount(maxResults, candidateMultiplier);

  const embTimer = startTimer();
  const queryEmbedding = await generateHyDEEmbedding(expandedQuery);
  timings.embeddingMs = embTimer();

  // Semantic cache: check for near-duplicate queries via embedding similarity
  try {
    const semanticHit = await getSemanticCache<MedicalEvidenceResult[]>(queryEmbedding);
    if (semanticHit && semanticHit.length > 0) {
      timings.totalMs = totalTimer();
      recordRetrievalMetrics({
        queryId: qid, query, timestamp: Date.now(), timings,
        resultCount: semanticHit.length, cacheHit: true, cacheLevel: "semantic", source: "evidence",
      });
      return semanticHit.slice(0, maxResults);
    }
  } catch { /* non-fatal */ }

  const searchTimer = startTimer();
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
  timings.searchMs = searchTimer();

  if (error) {
    console.warn('[Evidence Search] Hybrid search failed, using fallback:', error.message);
    const fallbackResults = await fallbackKeywordSearch(supabaseClient, options, candidateCount);
    const rerankTimer = startTimer();
    const rerankedFallback = enableRerank ? rerankResults(query, fallbackResults) : fallbackResults;
    timings.rerankMs = rerankTimer();
    const relevanceFilteredFallback = filterLowRelevanceResults(query, rerankedFallback, maxResults);
    timings.totalMs = totalTimer();
    const fallbackFinal = relevanceFilteredFallback.slice(0, maxResults);
    recordRetrievalMetrics({
      queryId: qid, query, timestamp: Date.now(), timings,
      resultCount: fallbackFinal.length, cacheHit: false, cacheLevel: "miss", source: "evidence",
      topScore: fallbackFinal[0]?.score,
    });
    return fallbackFinal;
  }

  const results = (data || []) as MedicalEvidenceResult[];
  const rerankTimer = startTimer();
  let reranked = enableRerank ? rerankResults(query, results) : results;
  // Cross-encoder reranking: refine top-k ordering when enabled
  const crossEncoderResult = await crossEncoderRerank(query, reranked);
  if (crossEncoderResult.method !== "none") {
    reranked = crossEncoderResult.results;
  }
  timings.rerankMs = rerankTimer();
  const relevanceFiltered = filterLowRelevanceResults(query, reranked, maxResults);
  const finalResults = relevanceFiltered.slice(0, maxResults);
  timings.totalMs = totalTimer();

  recordRetrievalMetrics({
    queryId: qid, query, timestamp: Date.now(), timings,
    resultCount: finalResults.length, cacheHit: false, cacheLevel: "miss", source: "evidence",
    topScore: finalResults[0]?.score,
    avgScore: finalResults.length > 0
      ? finalResults.reduce((s, r) => s + r.score, 0) / finalResults.length
      : undefined,
  });

  // Store in L1 cache (fire-and-forget)
  setEvidenceCache(query, finalResults).catch(() => {});

  // Store in semantic cache for near-duplicate query matching
  const queryHashForSemantic = hashQuery(normaliseQueryForCache(query));
  setSemanticCache(queryHashForSemantic, queryEmbedding, finalResults).catch(() => {});

  return finalResults;
}

/**
 * Convert search results to citation format
 */
export function resultsToCitations(results: MedicalEvidenceResult[]): EvidenceCitation[] {
  return results.map((result, index) => ({
    index: index + 1,
    sourceId: buildEvidenceSourceId({
      pmid: result.pmid,
      doi: result.doi,
      title: result.title,
      journal: result.journal_name,
      url: result.pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`
        : result.doi
          ? `https://doi.org/${result.doi}`
          : null,
    }),
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
    snippet: result.content.substring(0, 1200) + (result.content.length > 1200 ? '...' : ''),
    score: result.score,
  }));
}

/**
 * Build context for LLM from evidence citations
 */
export function buildEvidenceContext(citations: EvidenceCitation[]): EvidenceContext {
  const hasUserUploads = citations.some((citation) => citation.sourceType === "user_upload")
  // Format citations for context
  const formattedContext = citations.map((c) => {
    const authorStr = c.authors.length > 0 
      ? c.authors.slice(0, 3).join(', ') + (c.authors.length > 3 ? ' et al.' : '')
      : 'Unknown authors';
    const sourceLine = c.sourceType === "user_upload"
      ? `Source: ${c.sourceLabel || c.journal}${c.pageLabel ? ` (${c.pageLabel})` : ''}`
      : `Source: ${c.journal}${c.year ? ` (${c.year})` : ''}`
    const evidenceLine = c.sourceType === "user_upload"
      ? `Source Type: Private user upload`
      : `Evidence Level: ${c.evidenceLevel} (${getEvidenceLevelLabel(c.evidenceLevel)})`
    
    return `[${c.index}] ${c.title}
Source ID: ${c.sourceId || `idx:${c.index}`}
${sourceLine}
Authors: ${authorStr}
${evidenceLine}
${c.studyType ? `Study Type: ${c.studyType}` : ''}
${c.sampleSize ? `Sample Size: n=${c.sampleSize}` : ''}
${c.meshTerms.length > 0 ? `MeSH Terms: ${c.meshTerms.slice(0, 5).join(', ')}` : ''}

Content:
${c.snippet}
---`;
  }).join('\n\n');

  // Build system prompt addition
  const systemPromptAddition = buildEvidenceSystemPrompt(citations, hasUserUploads);

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
function buildEvidenceSystemPrompt(citations: EvidenceCitation[], hasUserUploads: boolean): string {
  if (citations.length === 0) {
    return '';
  }

  return `
## EVIDENCE-BASED RESPONSE CONTRACT

You have ${citations.length} indexed sources${hasUserUploads ? " (includes private uploads)" : ""}. Follow this contract exactly.

### RESPONSE STRUCTURE
1. **Lead with a definitive clinical recommendation.** The first paragraph must directly answer the question with a concrete, actionable statement supported by the strongest citation(s). Be authoritative — do not hedge if the evidence is clear.
2. **Evidence synthesis by theme, not by source.** Organize by clinical priority. Each major section should cite multiple distinct sources. Weave findings from different studies together rather than citing one study per section.
3. **Quantitative precision is mandatory when available.** Extract specific numbers from source snippets: ORs, HRs, CIs, NNTs, sensitivity/specificity, sample sizes, absolute risk reductions. "A meta-analysis found X" is weak; "A meta-analysis (n=12,000) found OR 2.3 (95% CI 1.4–3.8)" is strong. If the source snippet includes a number, include it.
4. **Close with clinical nuance.** Conflicts, limitations, gaps, or targeted follow-up questions go at the end—not throughout.

### CITATION RULES (CRITICAL — follow precisely)
- **Format:** ONLY use numeric bracket markers: [1], [2], [3,4]. Do NOT use [pubmed_XXXXX], [pmid:XXXXX], or any identifier-based format — ONLY the index number shown in the evidence list.
- Multiple sources for one claim: [1,2] or [1-3].
- Cite immediately after EACH factual claim, not at paragraph end.
- **MANDATORY distribution:** You MUST cite at least ${Math.min(citations.length, Math.max(4, Math.ceil(citations.length * 0.5)))} DISTINCT sources across your response. Scan ALL ${citations.length} sources and actively look for claims each source can support. Do NOT over-rely on [1] — spread citations across the full source list. Every numbered source that is relevant to ANY part of your answer should be cited at least once.
- **Evidence hierarchy:** Prefer Level 1–2 sources (meta-analyses, RCTs); cite Level 3–5 for clinical context.
- **Silent omission rule:** If you lack a citation for a claim, rewrite the claim using the closest available evidence OR state it as clinical context without a marker. NEVER annotate "(no citation)" or similar disclaimers.
- DO NOT fabricate citations or cite sources not in the provided list.
- DO NOT cite a source just to hit the count — only cite sources whose content genuinely supports the claim.

### AVAILABLE EVIDENCE:
${citations.map(c => {
  const idLabel = c.sourceId || `idx:${c.index}`
  if (c.sourceType === "user_upload") {
    return `[${c.index}] (sourceId: ${idLabel}) ${c.title} (${c.sourceLabel || "Private upload"})${c.studyType ? ` - ${c.studyType}` : ''}`
  }
  return `[${c.index}] (sourceId: ${idLabel}) ${c.title} (${c.journal}, ${c.year || 'n.d.'}) - Level ${c.evidenceLevel}${c.studyType ? ` (${c.studyType})` : ''}`
}).join('\n')}

### QUALITY LEVELS:
- L1: Meta-Analysis/Systematic Review — strongest, prioritize these
- L2: RCT — strong, use for treatment recommendations
- L3: Cohort/Case-Control — moderate, good for associations
- L4: Case Series/Report — weak, mention with caution
- L5: Expert Opinion — use for context only

### FORMAT CONSTRAINTS
- Keep ALL citations inline in the answer body. Do NOT append a trailing references list, bibliography, or "Citations:" section at the end.
- Do not list citation details (journal, year, PMID) in a separate section — the citation pills already display this metadata.

Respond with an authoritative, evidence-dense clinical synthesis. Write at attending-to-attending level.`;
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

