/**
 * Parallel Retrieval Orchestrator
 *
 * Runs local evidence search, live PubMed, and topic-adaptive connector
 * searches concurrently via Promise.allSettled, then merges results using
 * score-based deduplication.
 */

import { searchMedicalEvidence } from "./search"
import { searchPubMed, type PubMedArticle } from "../pubmed/api"
import { runConnectorSearch } from "./connectors/registry"
import type { ConnectorSearchPayload, ClinicalConnectorId } from "./connectors/types"
import type {
  EvidenceSearchOptions,
  MedicalEvidenceResult,
} from "./types"
import { isLocalEvidenceSufficient } from "../clinical-agent/graph/router"
import { startTimer, recordRetrievalMetrics, nextQueryId } from "../metrics/retrieval-metrics"

function inferEvidenceLevelFromTitle(title: string): number {
  const t = title.toLowerCase()
  if (/meta-analysis|systematic review/.test(t)) return 1
  if (/randomized|rct|controlled trial/.test(t)) return 2
  if (/cohort|case-control|observational/.test(t)) return 3
  if (/case report|case series/.test(t)) return 4
  return 5
}

type TopicHint =
  | "drug_interaction"
  | "drug_info"
  | "guideline"
  | "clinical_trial"
  | "general"

function classifyQueryTopic(query: string): TopicHint {
  const q = query.toLowerCase()
  // Note: no trailing \b so stems like "interactions", "combining", "dosing" all match
  if (/\b(interact|cyp|pgp|p-gp|contraindic|combin|concurrent|coprescri|serotonin syndrome|qt prolong|safe to |drug.?drug|polypharmac|coadminist|concomitant)/.test(q))
    return "drug_interaction"
  if (/\b(dose|dosing|dosage|side effect|adverse|label|fda|indication|pharmacol|half.?life|mechanism of action|dose adjust|renal dos|hepatic dos)/.test(q))
    return "drug_info"
  if (/\b(guideline|recommend|consensus|society|acc\/aha|aha|esc|nice|idsa|nccn|acog|uspstf|screening|management of|first.?line|standard of care|treatment algorithm)/.test(q))
    return "guideline"
  if (/\b(trial|phase [123]|enrol|recruit|nct\d|clinical study|endpoint|hazard ratio|primary outcome|randomiz)/.test(q))
    return "clinical_trial"

  // Drug-name heuristic: if query mentions 2+ known drug patterns, assume drug interaction
  const drugPatterns = q.match(/\b(metformin|sglt2|empagliflozin|dapagliflozin|canagliflozin|warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|amiodarone|fluconazole|itraconazole|voriconazole|clarithromycin|erythromycin|atorvastatin|simvastatin|rosuvastatin|pravastatin|insulin|sulfonylurea|glimepiride|glipizide|doxycycline|azithromycin|levofloxacin|moxifloxacin|pembrolizumab|nivolumab|ipilimumab|tebentafusp|ibuprofen|aspirin|clopidogrel|heparin|enoxaparin|methotrexate|tacrolimus|cyclosporin)/g)
  if (drugPatterns && new Set(drugPatterns).size >= 2) return "drug_interaction"

  return "general"
}

function selectConnectors(topic: TopicHint): ClinicalConnectorId[] {
  switch (topic) {
    case "drug_interaction":
      return ["rxnorm", "openfda", "guideline"]
    case "drug_info":
      return ["openfda", "guideline"]
    case "guideline":
      return ["guideline"]
    case "clinical_trial":
      return ["clinical_trials", "guideline"]
    case "general":
      return ["guideline", "pubmed"]
  }
}

const OVERLAP_STOPWORDS = new Set([
  // Function words
  "the", "and", "for", "with", "from", "that", "this", "what", "how",
  "are", "has", "was", "were", "been", "not", "but", "can", "may",
  "also", "most", "other", "its", "our", "all", "any", "who", "will",
  "than", "into", "some", "each", "these", "those", "such", "very",
  "more", "should", "would", "could", "about", "between", "during",
  // Medical / academic boilerplate
  "include", "key", "current", "first", "line", "use", "using", "used",
  "treatment", "management", "patient", "patients", "clinical", "practice",
  "guidelines", "guideline", "version", "drug", "drugs", "effect", "effects",
  "study", "studies", "risk", "based", "high", "low", "new", "report",
  "result", "results", "data", "associated", "group", "groups",
  "significant", "compared", "respectively", "however", "conclusion",
  "conclusions", "background", "objective", "objectives", "methods",
  "analysis", "assessed", "evaluated", "review", "showed", "found",
  "disease", "therapy", "recommended", "evidence", "level", "abstract",
])

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !OVERLAP_STOPWORDS.has(t))
}

function roughStem(word: string): string {
  if (word.length <= 4) return word
  return word
    .replace(/ies$/, "y")
    .replace(/(ss)$/, "$1")
    .replace(/ous$/, "ous")
    .replace(/ness$/, "")
    .replace(/ment$/, "")
    .replace(/tion$/, "")
    .replace(/sion$/, "")
    .replace(/ating$/, "")
    .replace(/ing$/, "")
    .replace(/ive$/, "")
    .replace(/ical$/, "")
    .replace(/ated$/, "")
    .replace(/able$/, "")
    .replace(/ity$/, "")
    .replace(/ed$/, "")
    .replace(/ly$/, "")
    .replace(/er$/, "")
    .replace(/es$/, "")
    .replace(/s$/, "")
}

function queryOverlapScore(query: string, text: string): number {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return 1

  const textTokens = tokenize(text)
  const textExactSet = new Set(textTokens)
  const textStemSet = new Set(textTokens.map(roughStem))

  let matches = 0
  for (const qt of queryTokens) {
    if (textExactSet.has(qt)) {
      matches += 1
    } else if (textStemSet.has(roughStem(qt))) {
      matches += 0.8
    }
  }
  return matches / queryTokens.length
}

const MERGE_RELEVANCE_FLOOR = 0.18

function connectorResultsToMedicalEvidence(
  payload: ConnectorSearchPayload,
  query: string
): MedicalEvidenceResult[] {
  return payload.provenance
    .filter(p => {
      const haystack = `${p.title} ${p.snippet || ""} ${p.journal || ""}`
      return queryOverlapScore(query, haystack) >= 0.25
    })
    .map((p, idx) => ({
      id: `connector:${payload.connectorId}:${idx}`,
      content: p.snippet || p.title,
      content_with_context: p.snippet || p.title,
      title: p.title,
      journal_name: p.journal || p.sourceName || payload.connectorId,
      publication_year: p.publishedAt ? parseInt(p.publishedAt.slice(0, 4), 10) || null : null,
      doi: p.doi,
      authors: [],
      evidence_level: p.evidenceLevel ?? 3,
      study_type: p.studyType || null,
      sample_size: null,
      mesh_terms: [],
      major_mesh_terms: [],
      chemicals: [],
      section_type: null,
      pmid: p.pmid,
      score: p.confidence * 0.15,
    }))
}

export interface ParallelRetrievalResult {
  localResults: MedicalEvidenceResult[]
  pubmedResults: PubMedArticle[]
  connectorResults: MedicalEvidenceResult[]
  merged: MedicalEvidenceResult[]
  sources: { local: number; pubmed: number; connectors: number }
  totalMs: number
  skippedPubMed: boolean
  connectorsUsed: ClinicalConnectorId[]
}

const CONNECTOR_PARALLEL_TIMEOUT_MS = 4_500

/**
 * Run local + PubMed + topic-adaptive connectors in parallel.
 * If local results are sufficient, PubMed results are discarded to save latency.
 */
export async function parallelRetrieve(
  options: EvidenceSearchOptions & {
    skipPubMedIfLocalSufficient?: boolean
  },
): Promise<ParallelRetrievalResult> {
  const totalTimer = startTimer()
  const qid = nextQueryId()

  const topic = classifyQueryTopic(options.query)
  const connectorIds = selectConnectors(topic)

  // Fire all searches concurrently
  const localPromise = searchMedicalEvidence(options)
  const pubmedPromise = searchPubMed(options.query, options.maxResults ?? 15)

  const connectorPromises = connectorIds.map((connectorId) =>
    Promise.race([
      runConnectorSearch({
        connectorId,
        query: options.query,
        maxResults: 5,
      }),
      new Promise<ConnectorSearchPayload>((_, reject) =>
        setTimeout(() => reject(new Error("connector timeout")), CONNECTOR_PARALLEL_TIMEOUT_MS)
      ),
    ])
  )

  const [localSettled, pubmedSettled, ...connectorSettled] = await Promise.allSettled([
    localPromise,
    pubmedPromise,
    ...connectorPromises,
  ])

  const localResults =
    localSettled.status === "fulfilled" ? localSettled.value : []
  const pubmedRaw =
    pubmedSettled.status === "fulfilled" ? pubmedSettled.value : { articles: [], totalResults: 0 }

  const skipPubMed =
    (options.skipPubMedIfLocalSufficient ?? true) &&
    isLocalEvidenceSufficient(localResults.length, localResults[0]?.score)

  const pubmedResults = skipPubMed ? [] : pubmedRaw.articles

  // Collect connector results
  const connectorMedicalEvidence: MedicalEvidenceResult[] = []
  const connectorsUsed: ClinicalConnectorId[] = []
  for (let i = 0; i < connectorSettled.length; i++) {
    const settled = connectorSettled[i]
    if (settled.status === "fulfilled") {
      const payload = settled.value
      if (payload.results.length > 0) {
        connectorMedicalEvidence.push(...connectorResultsToMedicalEvidence(payload, options.query))
        connectorsUsed.push(connectorIds[i])
      }
    }
  }

  // Merge: local results are authoritative, PubMed + connectors fill gaps
  const seenKeys = new Set<string>()
  for (const r of localResults) {
    if (r.pmid) seenKeys.add(`pmid:${r.pmid}`)
    if (r.doi) seenKeys.add(`doi:${r.doi.toLowerCase()}`)
    if (r.title) seenKeys.add(`title:${r.title.toLowerCase().slice(0, 60)}`)
  }

  const pubmedAsMedicalEvidence: MedicalEvidenceResult[] = pubmedResults
    .filter((a) => {
      if (seenKeys.has(`pmid:${a.pmid}`)) return false
      seenKeys.add(`pmid:${a.pmid}`)
      return true
    })
    .map((a) => ({
      id: `pubmed:${a.pmid}`,
      content: a.abstract || a.title,
      content_with_context: a.abstract || a.title,
      title: a.title,
      journal_name: a.journal,
      publication_year: a.year ? parseInt(a.year, 10) : null,
      doi: a.doi || null,
      authors: a.authors,
      evidence_level: inferEvidenceLevelFromTitle(a.title),
      study_type: null,
      sample_size: null,
      mesh_terms: [],
      major_mesh_terms: [],
      chemicals: [],
      section_type: null,
      pmid: a.pmid,
      score: 0.05,
    }))

  const dedupedConnectors = connectorMedicalEvidence.filter((r) => {
    const pmidKey = r.pmid ? `pmid:${r.pmid}` : null
    const doiKey = r.doi ? `doi:${r.doi.toLowerCase()}` : null
    const titleKey = r.title ? `title:${r.title.toLowerCase().slice(0, 60)}` : null
    if (pmidKey && seenKeys.has(pmidKey)) return false
    if (doiKey && seenKeys.has(doiKey)) return false
    if (titleKey && seenKeys.has(titleKey)) return false
    if (pmidKey) seenKeys.add(pmidKey)
    if (doiKey) seenKeys.add(doiKey)
    if (titleKey) seenKeys.add(titleKey)
    return true
  })

  const currentYear = new Date().getFullYear()
  const recencyAdjustedScore = (r: MedicalEvidenceResult): number => {
    let s = r.score
    const year = r.publication_year
    if (year) {
      const age = currentYear - year
      if (age <= 3) s += 0.02
      else if (age <= 6) s += 0.01
      else if (age >= 15) s -= 0.03
      else if (age >= 10) s -= 0.015
    }
    return s
  }

  const queryText = options.query
  const merged = [
    ...localResults,
    ...pubmedAsMedicalEvidence,
    ...dedupedConnectors,
  ]
    .filter((r) => {
      const haystack = `${r.title} ${r.content?.slice(0, 300) || ""} ${r.journal_name || ""}`
      return queryOverlapScore(queryText, haystack) >= MERGE_RELEVANCE_FLOOR
    })
    .sort((a, b) => recencyAdjustedScore(b) - recencyAdjustedScore(a))
    .slice(0, options.maxResults ?? 20)

  const totalMs = totalTimer()

  recordRetrievalMetrics({
    queryId: qid,
    query: options.query,
    timestamp: Date.now(),
    timings: {
      embeddingMs: 0,
      searchMs: totalMs,
      rerankMs: 0,
      fetchMs: 0,
      totalMs,
    },
    resultCount: merged.length,
    cacheHit: false,
    cacheLevel: "miss",
    source: "evidence",
    filters: {
      parallelRetrieval: true,
      skippedPubMed: skipPubMed,
      connectorsUsed,
    },
  })

  return {
    localResults,
    pubmedResults,
    connectorResults: dedupedConnectors,
    merged,
    sources: {
      local: localResults.length,
      pubmed: pubmedAsMedicalEvidence.length,
      connectors: dedupedConnectors.length,
    },
    totalMs,
    skippedPubMed: skipPubMed,
    connectorsUsed,
  }
}
