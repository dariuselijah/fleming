/**
 * Semantic Cache
 *
 * Goes beyond exact query-hash matching by comparing embedding vectors.
 * If a new query's embedding is cosine-similar (>= threshold) to a cached
 * query, the cached results are reused.
 *
 * Implementation:
 * - Stores recent query embeddings + their result cache keys in Redis.
 * - On lookup, computes cosine similarity in-process against the recent
 *   embedding list (kept small: ~200 entries, rotated LRU-style).
 * - This avoids requiring Redis Stack / RediSearch vector features –
 *   works with any Redis.
 */

import { cacheGet, cacheSet, getRedis } from "./redis"
import { cosineSimilarity } from "../rag/embeddings"

const SEMANTIC_CACHE_PREFIX = "semcache:"
const SEMANTIC_INDEX_KEY = "semcache:index"
const SIMILARITY_THRESHOLD = 0.95
const MAX_INDEX_SIZE = 200
const SEMANTIC_CACHE_TTL_S = 8 * 60 * 60 // 8 h

interface SemanticCacheEntry {
  queryHash: string
  embedding: number[]
  resultCacheKey: string
  createdAt: number
}

/**
 * Try to find a semantically similar cached result.
 * Returns the cache key of the matching entry, or null.
 */
export async function findSemanticMatch(
  queryEmbedding: number[],
): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const index = await cacheGet<SemanticCacheEntry[]>(SEMANTIC_INDEX_KEY)
    if (!index || index.length === 0) return null

    let bestSim = 0
    let bestKey: string | null = null

    for (const entry of index) {
      if (!entry.embedding || entry.embedding.length !== queryEmbedding.length) continue
      const sim = cosineSimilarity(queryEmbedding, entry.embedding)
      if (sim >= SIMILARITY_THRESHOLD && sim > bestSim) {
        bestSim = sim
        bestKey = entry.resultCacheKey
      }
    }

    return bestKey
  } catch (err) {
    console.warn("[SemanticCache] Lookup failed:", err)
    return null
  }
}

/**
 * Retrieve cached results via semantic similarity.
 */
export async function getSemanticCache<T>(
  queryEmbedding: number[],
): Promise<T | null> {
  const key = await findSemanticMatch(queryEmbedding)
  if (!key) return null
  return cacheGet<T>(key)
}

/**
 * Store results in the semantic cache.
 * Adds the query embedding to the index and stores results under a unique key.
 */
export async function setSemanticCache<T>(
  queryHash: string,
  queryEmbedding: number[],
  results: T,
  ttlSeconds: number = SEMANTIC_CACHE_TTL_S,
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  try {
    const resultCacheKey = `${SEMANTIC_CACHE_PREFIX}result:${queryHash}`
    await cacheSet(resultCacheKey, results, ttlSeconds)

    // Update the embedding index
    let index = (await cacheGet<SemanticCacheEntry[]>(SEMANTIC_INDEX_KEY)) || []

    // Remove any existing entry for this hash (dedup)
    index = index.filter((e) => e.queryHash !== queryHash)

    index.push({
      queryHash,
      embedding: queryEmbedding,
      resultCacheKey,
      createdAt: Date.now(),
    })

    // Trim to max size (LRU: drop oldest)
    if (index.length > MAX_INDEX_SIZE) {
      index = index.slice(-MAX_INDEX_SIZE)
    }

    // Store index with longer TTL (it's small)
    await cacheSet(SEMANTIC_INDEX_KEY, index, ttlSeconds * 2)
    return true
  } catch (err) {
    console.warn("[SemanticCache] Store failed:", err)
    return false
  }
}
