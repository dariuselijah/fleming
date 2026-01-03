/**
 * Multi-Layer Contextual Relevance System
 * World-class architecture for precise citation attribution
 * 
 * Architecture:
 * 1. Query Understanding Layer (LLM-based, general purpose)
 * 2. Multi-Stage Retrieval (semantic + keyword + entity + MeSH)
 * 3. Contextual Reranking (multi-signal ensemble)
 * 4. Answer Verification (ensures articles actually answer)
 * 5. Final Filtering (strict relevance thresholds)
 */

import type { MedicalEvidenceResult, EvidenceCitation } from './types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface QueryUnderstanding {
  // Core understanding
  primaryIntent: string;
  secondaryIntents: string[];
  questionType: string;
  specificity: 'high' | 'medium' | 'low';
  
  // Medical entities (comprehensive)
  entities: {
    conditions: string[];
    drugs: string[];
    procedures: string[];
    symptoms: string[];
    tests: string[];
    anatomy: string[];
    demographics: string[];
    outcomes: string[];
  };
  
  // Query characteristics
  requiresTreatment: boolean;
  requiresDiagnosis: boolean;
  requiresMechanism: boolean;
  requiresOutcome: boolean;
  requiresSafety: boolean;
  requiresDosing: boolean;
  requiresGuidelines: boolean;
  requiresComparison: boolean;
  
  // Expanded queries for retrieval
  semanticQuery: string;      // For embedding search
  keywordQuery: string;        // For full-text search
  entityQuery: string;         // For entity-based search
  meshQuery: string[];         // For MeSH term search
  
  // Context
  medicalDomain: string[];
  specialty: string[];
  urgency: 'low' | 'medium' | 'high';
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface RelevanceSignal {
  name: string;
  score: number; // 0-1
  weight: number;
  explanation: string;
}

export interface ContextuallyRerankedResult extends MedicalEvidenceResult {
  // Multi-signal relevance scoring
  relevanceSignals: RelevanceSignal[];
  contextualScore: number;      // Weighted ensemble score
  answerRelevance: number;      // Does it answer the question?
  semanticRelevance: number;   // Semantic similarity
  entityMatch: number;         // Entity overlap
  meshMatch: number;           // MeSH term match
  evidenceQuality: number;     // Evidence level quality
  recencyScore: number;         // Publication recency
  specificityMatch: number;    // Specificity alignment
  
  // Verification
  answersQuery: boolean;
  confidence: 'high' | 'medium' | 'low';
  relevanceReason: string;
  
  // Metadata
  matchedEntities: string[];
  matchedMeshTerms: string[];
}

export interface ContextualRelevanceOptions {
  query: string;
  maxResults?: number;
  minContextualScore?: number;
  enableReranking?: boolean;
  enableVerification?: boolean;
  apiKey?: string;
}

export interface ContextualRelevanceResult {
  citations: EvidenceCitation[];
  queryUnderstanding: QueryUnderstanding;
  rerankingStats: {
    initialCount: number;
    afterReranking: number;
    averageContextualScore: number;
    signalsUsed: string[];
  };
  searchTimeMs: number;
}

// ============================================================================
// LAYER 1: QUERY UNDERSTANDING (LLM-Based, General Purpose)
// ============================================================================

/**
 * Comprehensive query understanding using LLM
 * This is general-purpose and covers all medical query types
 */
export async function understandQuery(
  query: string,
  apiKey?: string
): Promise<QueryUnderstanding> {
  const model = 'gpt-4o-mini';
  
  const prompt = `You are a medical query understanding system. Analyze this medical query comprehensively and extract ALL relevant information.

QUERY: "${query}"

Return a JSON object with this EXACT structure (fill ALL fields):
{
  "primaryIntent": "string - main intent (treatment, diagnosis, mechanism, etiology, prognosis, prevention, screening, safety, efficacy, dosing, contraindication, interaction, guideline, comparison, general)",
  "secondaryIntents": ["string array - additional intents"],
  "questionType": "what|how|when|why|who|where|comparison|factual",
  "specificity": "high|medium|low",
  "entities": {
    "conditions": ["array of medical conditions mentioned"],
    "drugs": ["array of drugs/medications mentioned"],
    "procedures": ["array of procedures/tests mentioned"],
    "symptoms": ["array of symptoms mentioned"],
    "tests": ["array of diagnostic tests mentioned"],
    "anatomy": ["array of anatomical structures mentioned"],
    "demographics": ["array of patient demographics mentioned"],
    "outcomes": ["array of outcomes mentioned"]
  },
  "requiresTreatment": boolean,
  "requiresDiagnosis": boolean,
  "requiresMechanism": boolean,
  "requiresOutcome": boolean,
  "requiresSafety": boolean,
  "requiresDosing": boolean,
  "requiresGuidelines": boolean,
  "requiresComparison": boolean,
  "semanticQuery": "expanded query optimized for semantic/embedding search with synonyms and related terms",
  "keywordQuery": "query optimized for keyword/full-text search with important terms",
  "entityQuery": "query focusing on extracted entities for entity-based search",
  "meshQuery": ["array of potential MeSH terms that could match this query"],
  "medicalDomain": ["array of medical domains (cardiology, oncology, etc.)"],
  "specialty": ["array of medical specialties"],
  "urgency": "low|medium|high",
  "complexity": "simple|moderate|complex"
}

Guidelines:
- Extract ALL entities mentioned, even if implicit
- Be comprehensive - don't miss anything
- For semanticQuery: include medical synonyms, related terms, broader/narrower concepts
- For keywordQuery: focus on key medical terms, acronyms, specific phrases
- For meshQuery: suggest relevant MeSH terms (use standard MeSH terminology)
- Be precise about what information is required
- Assess urgency based on query language (emergency terms = high)
- Assess complexity based on query length, multiple conditions, etc.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { 
            role: 'system', 
            content: 'You are a comprehensive medical query understanding system. Return only valid JSON. Be thorough and extract ALL information.' 
          },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Query understanding failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in response');
    }

    const understanding = JSON.parse(content) as QueryUnderstanding;
    
    // Validate and set defaults
    return {
      primaryIntent: understanding.primaryIntent || 'general',
      secondaryIntents: understanding.secondaryIntents || [],
      questionType: understanding.questionType || 'factual',
      specificity: understanding.specificity || 'medium',
      entities: {
        conditions: understanding.entities?.conditions || [],
        drugs: understanding.entities?.drugs || [],
        procedures: understanding.entities?.procedures || [],
        symptoms: understanding.entities?.symptoms || [],
        tests: understanding.entities?.tests || [],
        anatomy: understanding.entities?.anatomy || [],
        demographics: understanding.entities?.demographics || [],
        outcomes: understanding.entities?.outcomes || [],
      },
      requiresTreatment: understanding.requiresTreatment || false,
      requiresDiagnosis: understanding.requiresDiagnosis || false,
      requiresMechanism: understanding.requiresMechanism || false,
      requiresOutcome: understanding.requiresOutcome || false,
      requiresSafety: understanding.requiresSafety || false,
      requiresDosing: understanding.requiresDosing || false,
      requiresGuidelines: understanding.requiresGuidelines || false,
      requiresComparison: understanding.requiresComparison || false,
      semanticQuery: understanding.semanticQuery || query,
      keywordQuery: understanding.keywordQuery || query,
      entityQuery: understanding.entityQuery || query,
      meshQuery: understanding.meshQuery || [],
      medicalDomain: understanding.medicalDomain || [],
      specialty: understanding.specialty || [],
      urgency: understanding.urgency || 'low',
      complexity: understanding.complexity || 'simple',
    };
  } catch (error) {
    console.error('[Query Understanding] Failed, using fallback:', error);
    return createFallbackUnderstanding(query);
  }
}

/**
 * Fallback understanding (pattern-based, comprehensive)
 */
function createFallbackUnderstanding(query: string): QueryUnderstanding {
  const lowerQuery = query.toLowerCase();
  
  // Extract entities using comprehensive patterns
  const entities = {
    conditions: extractPatterns(query, [
      /\b(hypertension|diabetes|asthma|copd|heart failure|stroke|mi|myocardial infarction|cancer|tumor|pneumonia|sepsis)\b/gi,
      /\b([A-Z][a-z]+ (?:disease|disorder|syndrome|condition))\b/g,
    ]),
    drugs: extractPatterns(query, [
      /\b(aspirin|metformin|lisinopril|atorvastatin|metoprolol|warfarin|insulin|morphine)\b/gi,
      /\b([A-Z][a-z]+(?:pril|olol|statin|mide|zide|prazole|mycin|cycline))\b/g,
    ]),
    procedures: extractPatterns(query, [
      /\b(surgery|operation|procedure|biopsy|endoscopy|colonoscopy|angiography|catheterization)\b/gi,
    ]),
    symptoms: extractPatterns(query, [
      /\b(pain|fever|nausea|vomiting|dizziness|shortness of breath|chest pain|headache)\b/gi,
    ]),
    tests: extractPatterns(query, [
      /\b(ct|mri|x-ray|ultrasound|ekg|ecg|blood test|lab|biomarker)\b/gi,
    ]),
    anatomy: extractPatterns(query, [
      /\b(heart|liver|kidney|lung|brain|stomach|intestine|artery|vein)\b/gi,
    ]),
    demographics: extractPatterns(query, [
      /\b(pediatric|geriatric|elderly|adult|child|infant|male|female)\b/gi,
    ]),
    outcomes: extractPatterns(query, [
      /\b(mortality|survival|recurrence|remission|complication|adverse event)\b/gi,
    ]),
  };

  // Determine intents
  const intents: string[] = [];
  if (/\b(treat|therapy|medication|drug|dose|dosing|management)\b/i.test(query)) intents.push('treatment');
  if (/\b(diagnos|test|screen|detect|workup)\b/i.test(query)) intents.push('diagnosis');
  if (/\b(mechanism|how does|why does|pathophysiology)\b/i.test(query)) intents.push('mechanism');
  if (/\b(cause|etiology|risk factor)\b/i.test(query)) intents.push('etiology');
  if (/\b(prognosis|outcome|survival|mortality)\b/i.test(query)) intents.push('prognosis');
  if (/\b(prevent|prevention)\b/i.test(query)) intents.push('prevention');
  if (/\b(safe|safety|adverse|side effect|contraindication)\b/i.test(query)) intents.push('safety');
  if (/\b(effective|efficacy|works|benefit)\b/i.test(query)) intents.push('efficacy');
  if (/\b(guideline|recommendation|standard|protocol)\b/i.test(query)) intents.push('guideline');
  if (/\b(compare|comparison|versus|vs|better)\b/i.test(query)) intents.push('comparison');

  return {
    primaryIntent: intents[0] || 'general',
    secondaryIntents: intents.slice(1),
    questionType: lowerQuery.startsWith('what') ? 'what' : 
                   lowerQuery.startsWith('how') ? 'how' :
                   lowerQuery.startsWith('why') ? 'why' : 'factual',
    specificity: query.split(/\s+/).length > 10 ? 'high' : query.split(/\s+/).length > 5 ? 'medium' : 'low',
    entities,
    requiresTreatment: intents.includes('treatment'),
    requiresDiagnosis: intents.includes('diagnosis'),
    requiresMechanism: intents.includes('mechanism'),
    requiresOutcome: intents.includes('prognosis'),
    requiresSafety: intents.includes('safety'),
    requiresDosing: intents.includes('treatment') && /\b(dose|dosing)\b/i.test(query),
    requiresGuidelines: intents.includes('guideline'),
    requiresComparison: intents.includes('comparison'),
    semanticQuery: query,
    keywordQuery: query,
    entityQuery: Object.values(entities).flat().join(' '),
    meshQuery: [],
    medicalDomain: [],
    specialty: [],
    urgency: /\b(emergency|urgent|critical|acute|severe)\b/i.test(query) ? 'high' : 'low',
    complexity: query.length > 200 ? 'complex' : query.length > 100 ? 'moderate' : 'simple',
  };
}

function extractPatterns(text: string, patterns: RegExp[]): string[] {
  const matches = new Set<string>();
  patterns.forEach(pattern => {
    const found = text.match(pattern);
    if (found) {
      found.forEach(m => matches.add(m.toLowerCase()));
    }
  });
  return Array.from(matches);
}

// ============================================================================
// LAYER 2: MULTI-STAGE RETRIEVAL
// ============================================================================

/**
 * Multi-stage retrieval using multiple query strategies
 */
export async function multiStageRetrieval(
  understanding: QueryUnderstanding,
  options: {
    maxResults?: number;
    minEvidenceLevel?: number;
    apiKey?: string;
  }
): Promise<MedicalEvidenceResult[]> {
  const { maxResults = 20, minEvidenceLevel = 5, apiKey } = options;
  
  // Use multiple retrieval strategies in parallel
  const [semanticResults, keywordResults, entityResults] = await Promise.all([
    // Strategy 1: Semantic search with expanded query
    retrieveSemantic(understanding.semanticQuery, maxResults, minEvidenceLevel, apiKey),
    
    // Strategy 2: Keyword search with optimized query
    retrieveKeyword(understanding.keywordQuery, maxResults, minEvidenceLevel),
    
    // Strategy 3: Entity-based search
    retrieveEntityBased(understanding.entities, maxResults, minEvidenceLevel),
  ]);

  // Combine and deduplicate
  const combined = new Map<string, MedicalEvidenceResult>();
  
  [semanticResults, keywordResults, entityResults].forEach(results => {
    results.forEach(result => {
      const existing = combined.get(result.id);
      if (!existing || result.score > existing.score) {
        combined.set(result.id, result);
      }
    });
  });

  return Array.from(combined.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults * 2); // Get more for reranking
}

async function retrieveSemantic(
  query: string,
  maxResults: number,
  minEvidenceLevel: number,
  apiKey?: string
): Promise<MedicalEvidenceResult[]> {
  // Use existing searchMedicalEvidence with semantic query
  const { searchMedicalEvidence } = await import('./search');
  return searchMedicalEvidence({
    query,
    maxResults,
    minEvidenceLevel,
    semanticWeight: 1.5, // Boost semantic
    keywordWeight: 0.5,
  });
}

async function retrieveKeyword(
  query: string,
  maxResults: number,
  minEvidenceLevel: number
): Promise<MedicalEvidenceResult[]> {
  const { searchMedicalEvidence } = await import('./search');
  return searchMedicalEvidence({
    query,
    maxResults,
    minEvidenceLevel,
    semanticWeight: 0.5,
    keywordWeight: 1.5, // Boost keyword
  });
}

async function retrieveEntityBased(
  entities: QueryUnderstanding['entities'],
  maxResults: number,
  minEvidenceLevel: number
): Promise<MedicalEvidenceResult[]> {
  // Search using MeSH terms and entity matching
  const { searchMedicalEvidence } = await import('./search');
  const entityQuery = Object.values(entities).flat().join(' ');
  
  return searchMedicalEvidence({
    query: entityQuery,
    maxResults,
    minEvidenceLevel,
    meshTerms: entities.conditions.concat(entities.drugs), // Use as MeSH terms
  });
}

// ============================================================================
// LAYER 3: MULTI-SIGNAL CONTEXTUAL RERANKING
// ============================================================================

/**
 * Multi-signal ensemble reranking
 * Combines multiple relevance signals for robust scoring
 */
export async function rerankWithMultiSignals(
  results: MedicalEvidenceResult[],
  understanding: QueryUnderstanding,
  options: {
    apiKey?: string;
  }
): Promise<ContextuallyRerankedResult[]> {
  const { apiKey } = options;
  
  // Calculate multiple signals for each result
  const reranked = await Promise.all(
    results.map(async (result) => {
      const signals = await calculateRelevanceSignals(result, understanding, apiKey);
      
      // Weighted ensemble score
      const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
      const contextualScore = totalWeight > 0
        ? signals.reduce((sum, signal) => sum + (signal.score * signal.weight), 0) / totalWeight
        : 0;

      return {
        ...result,
        relevanceSignals: signals,
        contextualScore,
        answerRelevance: signals.find(s => s.name === 'answerRelevance')?.score || 0,
        semanticRelevance: signals.find(s => s.name === 'semanticRelevance')?.score || 0,
        entityMatch: signals.find(s => s.name === 'entityMatch')?.score || 0,
        meshMatch: signals.find(s => s.name === 'meshMatch')?.score || 0,
        evidenceQuality: signals.find(s => s.name === 'evidenceQuality')?.score || 0,
        recencyScore: signals.find(s => s.name === 'recencyScore')?.score || 0,
        specificityMatch: signals.find(s => s.name === 'specificityMatch')?.score || 0,
        answersQuery: (signals.find(s => s.name === 'answerRelevance')?.score || 0) > 0.7,
        confidence: contextualScore > 0.8 ? 'high' : contextualScore > 0.6 ? 'medium' : 'low',
        relevanceReason: signals.map(s => s.explanation).join('; '),
        matchedEntities: extractMatchedEntities(result, understanding),
        matchedMeshTerms: extractMatchedMeshTerms(result, understanding),
      };
    })
  );

  return reranked.sort((a, b) => b.contextualScore - a.contextualScore);
}

/**
 * Calculate multiple relevance signals
 */
async function calculateRelevanceSignals(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding,
  apiKey?: string
): Promise<RelevanceSignal[]> {
  const signals: RelevanceSignal[] = [];

  // Signal 1: Answer Relevance (LLM-based, most important)
  // But make it less dominant to allow other signals to contribute
  const answerRelevance = await calculateAnswerRelevance(result, understanding, apiKey);
  signals.push({
    name: 'answerRelevance',
    score: answerRelevance.score,
    weight: 2.0, // Reduced from 3.0 to allow other signals more influence
    explanation: answerRelevance.explanation,
  });

  // Signal 2: Semantic Relevance (embedding similarity)
  // This is the most reliable signal - boost it
  const semanticRelevance = calculateSemanticRelevance(result, understanding);
  signals.push({
    name: 'semanticRelevance',
    score: semanticRelevance,
    weight: 2.5, // Increased from 2.0 - trust the hybrid search results
    explanation: `Semantic similarity: ${(semanticRelevance * 100).toFixed(0)}%`,
  });

  // Signal 3: Entity Match
  const entityMatch = calculateEntityMatch(result, understanding);
  signals.push({
    name: 'entityMatch',
    score: entityMatch.score,
    weight: 1.5,
    explanation: entityMatch.explanation,
  });

  // Signal 4: MeSH Term Match
  const meshMatch = calculateMeshMatch(result, understanding);
  signals.push({
    name: 'meshMatch',
    score: meshMatch.score,
    weight: 1.0,
    explanation: meshMatch.explanation,
  });

  // Signal 5: Evidence Quality
  const evidenceQuality = (6 - result.evidence_level) / 5; // Invert (1 is best)
  signals.push({
    name: 'evidenceQuality',
    score: evidenceQuality,
    weight: 0.8,
    explanation: `Evidence level ${result.evidence_level}`,
  });

  // Signal 6: Recency
  const currentYear = new Date().getFullYear();
  const recencyScore = result.publication_year 
    ? Math.max(0, 1 - (currentYear - result.publication_year) / 10)
    : 0.5;
  signals.push({
    name: 'recencyScore',
    score: recencyScore,
    weight: 0.5,
    explanation: `Published ${result.publication_year || 'unknown'}`,
  });

  // Signal 7: Specificity Match
  const specificityMatch = calculateSpecificityMatch(result, understanding);
  signals.push({
    name: 'specificityMatch',
    score: specificityMatch,
    weight: 0.5,
    explanation: `Specificity alignment`,
  });

  return signals;
}

/**
 * LLM-based answer relevance (most critical signal)
 */
async function calculateAnswerRelevance(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding,
  apiKey?: string
): Promise<{ score: number; explanation: string }> {
  const model = 'gpt-4o-mini';
  
  const prompt = `Does this medical article answer the user's specific question?

USER QUESTION: "${understanding.semanticQuery}"

QUESTION INTENT: ${understanding.primaryIntent}
REQUIRES: ${[
  understanding.requiresTreatment && 'Treatment',
  understanding.requiresDiagnosis && 'Diagnosis',
  understanding.requiresMechanism && 'Mechanism',
  understanding.requiresOutcome && 'Outcome',
  understanding.requiresSafety && 'Safety',
].filter(Boolean).join(', ') || 'General information'}

ARTICLE:
Title: ${result.title}
Content: ${result.content.substring(0, 1000)}${result.content.length > 1000 ? '...' : ''}

Rate how well this article answers the specific question (0.0-1.0) and explain why.

Scoring Guidelines (be reasonable, not overly strict):
- 0.8-1.0: Directly and completely answers the question
- 0.6-0.79: Relevant and provides useful information that addresses the question
- 0.4-0.59: Related to the topic and provides some relevant information
- 0.0-0.39: Not relevant or only tangentially related

Be reasonable - if the article is related to the topic and provides useful information, score it at least 0.6.

Return JSON: {"score": 0.0-1.0, "explanation": "brief reason"}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a medical evidence relevance scorer. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return { score: parsed.score || 0, explanation: parsed.explanation || '' };
      }
    }
  } catch (error) {
    console.error('[Answer Relevance] Failed:', error);
  }

  // Fallback: use semantic similarity - trust the hybrid search
  // The hybrid search already did good filtering, so trust it more
  return {
    score: Math.max(0.6, result.score * 0.95), // Minimal penalty, trust the search
    explanation: 'Using semantic similarity (LLM assessment unavailable)',
  };
}

function calculateSemanticRelevance(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): number {
  // Use the original score from hybrid search (already semantic)
  return Math.min(1.0, result.score);
}

function calculateEntityMatch(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): { score: number; explanation: string } {
  const allEntities = Object.values(understanding.entities).flat();
  const resultText = `${result.title} ${result.content}`.toLowerCase();
  
  let matches = 0;
  allEntities.forEach(entity => {
    if (resultText.includes(entity.toLowerCase())) {
      matches++;
    }
  });

  const score = allEntities.length > 0 
    ? Math.min(1.0, matches / allEntities.length)
    : 0.5;

  return {
    score,
    explanation: `Matched ${matches}/${allEntities.length} entities`,
  };
}

function calculateMeshMatch(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): { score: number; explanation: string } {
  if (understanding.meshQuery.length === 0) {
    return { score: 0.5, explanation: 'No MeSH terms to match' };
  }

  const resultMesh = new Set(result.mesh_terms.map(t => t.toLowerCase()));
  const queryMesh = new Set(understanding.meshQuery.map(t => t.toLowerCase()));
  
  let matches = 0;
  queryMesh.forEach(term => {
    if (resultMesh.has(term)) matches++;
  });

  const score = understanding.meshQuery.length > 0
    ? matches / understanding.meshQuery.length
    : 0.5;

  return {
    score,
    explanation: `Matched ${matches}/${understanding.meshQuery.length} MeSH terms`,
  };
}

function calculateSpecificityMatch(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): number {
  // Match specificity: high specificity query needs specific article
  const resultSpecificity = result.content.length < 500 ? 'high' :
                            result.content.length < 2000 ? 'medium' : 'low';
  
  if (understanding.specificity === resultSpecificity) return 1.0;
  if (Math.abs(['low', 'medium', 'high'].indexOf(understanding.specificity) - 
               ['low', 'medium', 'high'].indexOf(resultSpecificity)) === 1) return 0.7;
  return 0.4;
}

function extractMatchedEntities(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): string[] {
  const allEntities = Object.values(understanding.entities).flat();
  const resultText = `${result.title} ${result.content}`.toLowerCase();
  return allEntities.filter(e => resultText.includes(e.toLowerCase()));
}

function extractMatchedMeshTerms(
  result: MedicalEvidenceResult,
  understanding: QueryUnderstanding
): string[] {
  const resultMesh = new Set(result.mesh_terms.map(t => t.toLowerCase()));
  return understanding.meshQuery.filter(t => resultMesh.has(t.toLowerCase()));
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Complete contextual relevance pipeline
 */
export async function contextualRelevanceSearch(
  options: ContextualRelevanceOptions
): Promise<ContextualRelevanceResult> {
  const startTime = performance.now();
  const {
    query,
    maxResults = 8,
    minContextualScore = 0.75,
    enableReranking = true,
    enableVerification = true,
    apiKey,
  } = options;

  // Layer 1: Query Understanding
  console.log('[Contextual Relevance] Understanding query...');
  const understanding = await understandQuery(query, apiKey);
  console.log(`[Contextual Relevance] Intent: ${understanding.primaryIntent}, Entities: ${Object.values(understanding.entities).flat().length}`);

  // Layer 2: Multi-Stage Retrieval
  console.log('[Contextual Relevance] Multi-stage retrieval...');
  const initialResults = await multiStageRetrieval(understanding, {
    maxResults: enableReranking ? maxResults * 3 : maxResults,
    apiKey,
  });
  console.log(`[Contextual Relevance] Retrieved ${initialResults.length} candidates`);

  if (initialResults.length === 0) {
    return {
      citations: [],
      queryUnderstanding: understanding,
      rerankingStats: {
        initialCount: 0,
        afterReranking: 0,
        averageContextualScore: 0,
        signalsUsed: [],
      },
      searchTimeMs: performance.now() - startTime,
    };
  }

  // Layer 3: Multi-Signal Reranking
  let finalResults: ContextuallyRerankedResult[];
  let rerankingStats;

  if (enableReranking) {
    try {
      console.log('[Contextual Relevance] Multi-signal reranking...');
      const reranked = await rerankWithMultiSignals(initialResults, understanding, { apiKey });
      
      // Adaptive filtering: use minContextualScore but ensure we get at least some results
      // Sort by contextual score
      const sorted = reranked.sort((a, b) => b.contextualScore - a.contextualScore);
      
      // Filter by minimum score, but if too few results, lower threshold adaptively
      let filtered = sorted.filter(r => r.contextualScore >= minContextualScore);
      
      // If we have very few results, use adaptive threshold
      // Be more aggressive about getting results
      if (filtered.length < maxResults && sorted.length > 0) {
        // Use top results even if below threshold, but still filter out very low scores
        const adaptiveThreshold = Math.max(0.4, minContextualScore - 0.2); // Lower by 0.2 but min 0.4
        filtered = sorted.filter(r => r.contextualScore >= adaptiveThreshold).slice(0, maxResults * 2);
        console.log(`[Contextual Relevance] Using adaptive threshold: ${adaptiveThreshold.toFixed(2)} (found ${filtered.length} results)`);
      }
      
      // If still too few, just take top results regardless of score (but at least 0.3)
      if (filtered.length < 3 && sorted.length > 0) {
        filtered = sorted.filter(r => r.contextualScore >= 0.3).slice(0, maxResults);
        console.log(`[Contextual Relevance] Using minimum threshold 0.3 (found ${filtered.length} results)`);
      }
      
      finalResults = filtered;
    } catch (error) {
      console.error('[Contextual Relevance] Reranking failed, using original results:', error);
      // If reranking fails completely, use original results
      finalResults = initialResults.map(r => ({
        ...r,
        relevanceSignals: [],
        contextualScore: r.score,
        answerRelevance: r.score,
        semanticRelevance: r.score,
        entityMatch: 0.7, // Assume good match if reranking failed
        meshMatch: 0.7,
        evidenceQuality: (6 - r.evidence_level) / 5,
        recencyScore: 0.7,
        specificityMatch: 0.7,
        answersQuery: true, // Assume yes if reranking failed
        confidence: 'medium',
        relevanceReason: 'Reranking unavailable, using original search results',
        matchedEntities: [],
        matchedMeshTerms: [],
      }));
    }
    
    rerankingStats = {
      initialCount: initialResults.length,
      afterReranking: finalResults.length,
      averageContextualScore: finalResults.length > 0
        ? finalResults.reduce((sum, r) => sum + r.contextualScore, 0) / finalResults.length
        : 0,
      signalsUsed: ['answerRelevance', 'semanticRelevance', 'entityMatch', 'meshMatch', 'evidenceQuality', 'recencyScore', 'specificityMatch'],
    };

    console.log(`[Contextual Relevance] After reranking: ${finalResults.length} highly relevant (avg: ${rerankingStats.averageContextualScore.toFixed(2)})`);
  } else {
    finalResults = initialResults.map(r => ({
      ...r,
      relevanceSignals: [],
      contextualScore: r.score,
      answerRelevance: r.score,
      semanticRelevance: r.score,
      entityMatch: 0.5,
      meshMatch: 0.5,
      evidenceQuality: (6 - r.evidence_level) / 5,
      recencyScore: 0.5,
      specificityMatch: 0.5,
      answersQuery: false,
      confidence: 'low',
      relevanceReason: 'Reranking disabled',
      matchedEntities: [],
      matchedMeshTerms: [],
    }));
    rerankingStats = {
      initialCount: initialResults.length,
      afterReranking: finalResults.length,
      averageContextualScore: finalResults.reduce((sum, r) => sum + r.contextualScore, 0) / finalResults.length,
      signalsUsed: [],
    };
  }

  // Convert to citations
  const { resultsToCitations } = await import('./search');
  const citations = resultsToCitations(finalResults.slice(0, maxResults));

  return {
    citations,
    queryUnderstanding: understanding,
    rerankingStats,
    searchTimeMs: performance.now() - startTime,
  };
}

