/**
 * Query Optimizer – HyDE (Hypothetical Document Embedding) + Query Rephrasing
 *
 * HyDE generates a hypothetical ideal answer to the query using a fast LLM,
 * then embeds that answer instead of the raw query. This produces embeddings
 * closer to actual evidence documents, improving retrieval recall – especially
 * for short or ambiguous clinical questions.
 *
 * The query rephraser normalises clinical shorthand and generates 2-3 variants
 * to broaden recall across different phrasing conventions.
 */

import { generateEmbedding } from "./embeddings"
import { cacheGet, cacheSet } from "../cache/redis"

const HYDE_CACHE_PREFIX = "hyde:"
const HYDE_CACHE_TTL_S = 6 * 60 * 60 // 6 h

const ENABLE_HYDE = process.env.ENABLE_HYDE_QUERY_OPTIMIZER !== "false"

// ── Clinical shorthand expansions (extends expandMedicalQuery in search.ts) ──

const CLINICAL_SHORTHAND: Record<string, string> = {
  htn: "hypertension",
  dm: "diabetes mellitus",
  dm2: "type 2 diabetes mellitus",
  dm1: "type 1 diabetes mellitus",
  chf: "congestive heart failure",
  cad: "coronary artery disease",
  mi: "myocardial infarction",
  pe: "pulmonary embolism",
  dvt: "deep vein thrombosis",
  afib: "atrial fibrillation",
  acs: "acute coronary syndrome",
  copd: "chronic obstructive pulmonary disease",
  ckd: "chronic kidney disease",
  uti: "urinary tract infection",
  sle: "systemic lupus erythematosus",
  ra: "rheumatoid arthritis",
  tbi: "traumatic brain injury",
  osa: "obstructive sleep apnea",
  gerd: "gastroesophageal reflux disease",
  ibs: "irritable bowel syndrome",
  ssri: "selective serotonin reuptake inhibitor",
  nsaid: "nonsteroidal anti-inflammatory drug",
  acei: "ACE inhibitor",
  arb: "angiotensin receptor blocker",
  ppi: "proton pump inhibitor",
  ct: "computed tomography",
  mri: "magnetic resonance imaging",
  cbc: "complete blood count",
  bmp: "basic metabolic panel",
  cmp: "comprehensive metabolic panel",
  abg: "arterial blood gas",
}

/**
 * Expand common clinical abbreviations in a query.
 */
export function expandClinicalShorthand(query: string): string {
  let expanded = query
  for (const [abbr, full] of Object.entries(CLINICAL_SHORTHAND)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi")
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, full)
    }
  }
  return expanded
}

/**
 * Generate 2-3 query variants for broader retrieval.
 */
export function generateQueryVariants(query: string): string[] {
  const variants = [query]
  const expanded = expandClinicalShorthand(query)
  if (expanded !== query) variants.push(expanded)

  // Add a "guideline" variant for clinical questions
  if (
    /\b(treatment|manage|therapy|dose|prescri)/i.test(query) &&
    !/\bguideline\b/i.test(query)
  ) {
    variants.push(`${query} clinical guideline recommendation`)
  }

  // Add a "recent evidence" variant
  if (/\b(latest|recent|current|new|update)/i.test(query)) {
    variants.push(`${query} randomized controlled trial meta-analysis`)
  }

  return [...new Set(variants)].slice(0, 3)
}

/**
 * Generate a HyDE hypothetical document for a clinical query.
 * Uses a lightweight LLM call to produce a ~150-word ideal evidence snippet.
 * The result is cached in Redis to avoid repeated LLM calls.
 */
export async function generateHyDE(
  query: string,
  options?: { apiKey?: string },
): Promise<string | null> {
  if (!ENABLE_HYDE) return null

  const cacheKey = `${HYDE_CACHE_PREFIX}${Buffer.from(query.toLowerCase().trim()).toString("base64url").slice(0, 40)}`
  const cached = await cacheGet<string>(cacheKey)
  if (cached) return cached

  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 250,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a medical evidence writer. Given a clinical question, write a concise ~150-word evidence-based answer as if it were from a systematic review or clinical guideline. Include specific study types, sample sizes, and key findings where relevant. Do not hedge or ask for clarification.",
          },
          { role: "user", content: query },
        ],
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    const hydeText: string = data.choices?.[0]?.message?.content?.trim()
    if (!hydeText) return null

    // Cache the HyDE text
    await cacheSet(cacheKey, hydeText, HYDE_CACHE_TTL_S).catch(() => {})
    return hydeText
  } catch {
    return null
  }
}

/**
 * Generate a HyDE embedding: embed the hypothetical answer instead of the raw query.
 * Falls back to the original query embedding if HyDE generation fails.
 */
export async function generateHyDEEmbedding(
  query: string,
  options?: { apiKey?: string },
): Promise<number[]> {
  const hydeText = await generateHyDE(query, options)
  if (hydeText) {
    return generateEmbedding(hydeText, options?.apiKey)
  }
  return generateEmbedding(query, options?.apiKey)
}

/**
 * Full query optimisation pipeline:
 * 1. Expand clinical shorthand
 * 2. Generate query variants
 * 3. Optionally generate HyDE embedding
 *
 * Returns the best embedding to use for retrieval plus the expanded variants.
 */
export async function optimiseQuery(
  query: string,
  options?: { apiKey?: string; useHyDE?: boolean },
): Promise<{
  embedding: number[]
  variants: string[]
  expandedQuery: string
  usedHyDE: boolean
}> {
  const expandedQuery = expandClinicalShorthand(query)
  const variants = generateQueryVariants(query)
  const useHyDE = options?.useHyDE ?? ENABLE_HYDE

  let embedding: number[]
  let usedHyDE = false

  if (useHyDE) {
    const hydeText = await generateHyDE(expandedQuery, options)
    if (hydeText) {
      embedding = await generateEmbedding(hydeText, options?.apiKey)
      usedHyDE = true
    } else {
      embedding = await generateEmbedding(expandedQuery, options?.apiKey)
    }
  } else {
    embedding = await generateEmbedding(expandedQuery, options?.apiKey)
  }

  return { embedding, variants, expandedQuery, usedHyDE }
}
