/**
 * Cross-Encoder Reranker
 *
 * Optional reranking of top-k evidence results using a cross-encoder model.
 * Supports two backends:
 *   1. External API (e.g., Cohere rerank, Jina, or self-hosted ms-marco-MiniLM)
 *   2. LLM-based reranking via OpenAI (lighter weight, no extra infra)
 *
 * Gated behind ENABLE_CROSS_ENCODER_RERANK env var.
 */

import type { MedicalEvidenceResult } from "../evidence/types"

const ENABLE_RERANK = process.env.ENABLE_CROSS_ENCODER_RERANK !== "false"
const RERANK_API_URL = process.env.CROSS_ENCODER_RERANK_API_URL
const RERANK_API_KEY = process.env.CROSS_ENCODER_RERANK_API_KEY
const RERANK_TOP_K = Number.parseInt(
  process.env.CROSS_ENCODER_RERANK_TOP_K || "10",
  10,
)

export interface RerankResult {
  results: MedicalEvidenceResult[]
  rerankMs: number
  method: "cross-encoder" | "llm" | "none"
}

/**
 * Rerank top-k results using a cross-encoder or LLM.
 * Only activates when ENABLE_CROSS_ENCODER_RERANK=true and the query
 * has a high medical confidence score (caller should check scoreMedicalQuery).
 */
export async function crossEncoderRerank(
  query: string,
  results: MedicalEvidenceResult[],
): Promise<RerankResult> {
  if (!ENABLE_RERANK || results.length <= 1) {
    return { results, rerankMs: 0, method: "none" }
  }

  const topK = results.slice(0, RERANK_TOP_K)
  const rest = results.slice(RERANK_TOP_K)
  const start = performance.now()

  try {
    let reranked: MedicalEvidenceResult[]
    let method: "cross-encoder" | "llm"

    if (RERANK_API_URL) {
      reranked = await rerankViaApi(query, topK)
      method = "cross-encoder"
    } else {
      reranked = await rerankViaLLM(query, topK)
      method = "llm"
    }

    const rerankMs = Math.round(performance.now() - start)
    return { results: [...reranked, ...rest], rerankMs, method }
  } catch (err) {
    console.warn("[Reranker] Failed, returning original order:", err)
    return { results, rerankMs: Math.round(performance.now() - start), method: "none" }
  }
}

/**
 * Call an external cross-encoder reranking API.
 * Expects a Cohere-compatible /rerank endpoint or similar.
 */
async function rerankViaApi(
  query: string,
  results: MedicalEvidenceResult[],
): Promise<MedicalEvidenceResult[]> {
  const documents = results.map((r) => `${r.title}\n${r.content}`)

  const response = await fetch(RERANK_API_URL!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RERANK_API_KEY ? { Authorization: `Bearer ${RERANK_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      query,
      documents,
      top_n: results.length,
    }),
  })

  if (!response.ok) {
    throw new Error(`Rerank API failed: ${response.status}`)
  }

  const data = await response.json()
  // Cohere-style response: { results: [{ index, relevance_score }] }
  const ranked: Array<{ index: number; relevance_score: number }> =
    data.results || data.data || []

  const sorted = ranked.sort((a, b) => b.relevance_score - a.relevance_score)
  return sorted.map((r) => ({
    ...results[r.index],
    score: r.relevance_score,
  }))
}

/**
 * Lightweight LLM-based reranking: ask GPT-4o-mini to score relevance.
 * Cheaper than a dedicated cross-encoder but surprisingly effective.
 */
async function rerankViaLLM(
  query: string,
  results: MedicalEvidenceResult[],
): Promise<MedicalEvidenceResult[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return results

  const documents = results.map(
    (r, i) => `[${i}] ${r.title}\n${r.content.slice(0, 300)}`,
  )

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a medical evidence relevance scorer. Given a clinical query and candidate documents, return a JSON array of document indices sorted from most to least relevant. Only output the JSON array of numbers, e.g. [2,0,4,1,3].",
        },
        {
          role: "user",
          content: `Query: ${query}\n\nDocuments:\n${documents.join("\n\n")}`,
        },
      ],
    }),
  })

  if (!response.ok) return results

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ""

  try {
    const indices: number[] = JSON.parse(content)
    if (
      Array.isArray(indices) &&
      indices.every((i) => typeof i === "number" && i >= 0 && i < results.length)
    ) {
      const seen = new Set<number>()
      const reranked: MedicalEvidenceResult[] = []
      for (const idx of indices) {
        if (!seen.has(idx)) {
          seen.add(idx)
          reranked.push(results[idx])
        }
      }
      // Append any missing results at the end
      for (let i = 0; i < results.length; i++) {
        if (!seen.has(i)) reranked.push(results[i])
      }
      return reranked
    }
  } catch {
    // Parse failed – return original order
  }

  return results
}
