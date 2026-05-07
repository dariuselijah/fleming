/**
 * Embedding Generation Utility
 * Generates embeddings for text using OpenAI's embedding models
 */

// ── Embedding model configuration ─────────────────────────────────────────
// The retrieval stage can optionally use a domain-tuned model (PubMedBERT,
// BioLORD, E5, BGE) while the generation/chat stage continues using OpenAI.
// Set RETRIEVAL_EMBEDDING_MODEL / RETRIEVAL_EMBEDDING_DIMENSION env vars to
// switch the retrieval model. When unset, OpenAI text-embedding-3-small is used.

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENAI_EMBEDDING_DIMENSION = 1536

const EMBEDDING_MODEL = process.env.RETRIEVAL_EMBEDDING_MODEL || OPENAI_EMBEDDING_MODEL
const EMBEDDING_DIMENSION = Number.parseInt(
  process.env.RETRIEVAL_EMBEDDING_DIMENSION || String(OPENAI_EMBEDDING_DIMENSION),
  10,
)
const EMBEDDING_API_BASE = process.env.RETRIEVAL_EMBEDDING_API_BASE || 'https://api.openai.com'

const MAX_EMBEDDING_TOKENS_PER_REQUEST = 240000
const APPROX_CHARS_PER_TOKEN = 4

// ── In-memory embedding cache (LRU) for single-query hot path ──────────────
// Avoids re-embedding the same query text within a request window.
const EMBEDDING_CACHE_MAX = 256
const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>()

function getEmbeddingFromCache(text: string): number[] | null {
  const entry = embeddingCache.get(text)
  if (!entry) return null
  if (Date.now() - entry.ts > EMBEDDING_CACHE_TTL_MS) {
    embeddingCache.delete(text)
    return null
  }
  return entry.embedding
}

function setEmbeddingInCache(text: string, embedding: number[]): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const oldest = embeddingCache.keys().next().value
    if (oldest !== undefined) embeddingCache.delete(oldest)
  }
  embeddingCache.set(text, { embedding, ts: Date.now() })
}

function isLikelyOpenAIApiKey(value: string): boolean {
  const token = value.trim()
  if (!token) return false
  if (/^sk-ant-/i.test(token)) return false
  if (/^sk-or-/i.test(token)) return false
  if (/^xai-/i.test(token)) return false
  if (/^AIza/i.test(token)) return false
  return /^sk-(proj-)?/i.test(token)
}

function resolveEmbeddingApiKey(explicitKey?: string): string {
  const key = explicitKey || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error("OpenAI API key is required for embedding generation")
  }
  if (!isLikelyOpenAIApiKey(key)) {
    throw new Error("Embedding provider mismatch: non-OpenAI API key cannot be used for OpenAI embeddings")
  }
  return key
}

export interface EmbeddingOptions {
  model?: string
  dimension?: number
  batchSize?: number
  parallelBatches?: number
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(
  text: string,
  apiKey?: string,
  options?: EmbeddingOptions
): Promise<number[]> {
  // Fast path: return cached embedding if available
  const cached = getEmbeddingFromCache(text)
  if (cached) return cached

  const model = options?.model || EMBEDDING_MODEL
  const dimension = options?.dimension || EMBEDDING_DIMENSION
  const key = resolveEmbeddingApiKey(apiKey)
  const apiBase = EMBEDDING_API_BASE.replace(/\/+$/, '')

  const response = await fetch(`${apiBase}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      dimensions: dimension,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to generate embedding: ${error}`)
  }

  const data = await response.json()
  const embedding = data.data[0].embedding

  // Cache the embedding for fast re-use
  setEmbeddingInCache(text, embedding)

  return embedding
}

/**
 * Extract retry delay from OpenAI rate limit error message
 * OpenAI errors include "Please try again in X.XXXs" - extract the number
 */
function extractRetryDelay(errorMessage: string): number {
  // Try to extract "Please try again in X.XXXs" or "Please try again in X.XXX s"
  const match = errorMessage.match(/try again in ([\d.]+)\s*s/i)
  if (match) {
    const seconds = parseFloat(match[1])
    // Add small buffer (10%) and convert to milliseconds
    return Math.ceil(seconds * 1100)
  }
  // Default fallback delay
  return 2000
}

/**
 * Generate embeddings for a single batch with retry logic
 */
async function generateEmbeddingsBatch(
  batch: string[],
  model: string,
  dimension: number,
  apiKey: string,
  maxRetries: number = 5
): Promise<number[][]> {
  let retries = maxRetries
  
  while (retries > 0) {
    try {
      const apiBase = EMBEDDING_API_BASE.replace(/\/+$/, '')
      const response = await fetch(`${apiBase}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batch,
          dimensions: dimension,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any
        try {
          errorData = JSON.parse(errorText)
        } catch {
          throw new Error(`Failed to generate embeddings: ${errorText}`)
        }

        // Check if it's a rate limit error
        const isRateLimit = response.status === 429 || 
          errorData?.error?.code === 'rate_limit_exceeded' ||
          errorData?.error?.type === 'rate_limit_error' ||
          errorText.toLowerCase().includes('rate limit')

        if (isRateLimit && retries > 1) {
          // Extract retry delay from error message
          const baseDelay = extractRetryDelay(errorData?.error?.message || errorText)
          // Add jitter to prevent thundering herd (random 0-500ms)
          const jitter = Math.random() * 500
          const delay = baseDelay + jitter
          retries--
          console.log(`[Embeddings] Rate limit hit, retrying in ${(delay / 1000).toFixed(1)}s... (${retries} retries left)`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        throw new Error(`Failed to generate embeddings: ${errorText}`)
      }

      const data = await response.json()
      // Return embeddings in the same order as input texts
      return data.data.map((item: any) => item.embedding)
    } catch (error) {
      // Check if it's a network error (not rate limit)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isNetworkError = errorMessage.includes('fetch failed') || 
                            errorMessage.includes('ECONNREFUSED') ||
                            errorMessage.includes('ETIMEDOUT')
      
      if (isNetworkError && retries > 1) {
        retries--
        // Exponential backoff for network errors
        const delay = Math.pow(2, maxRetries - retries) * 1000
        console.log(`[Embeddings] Network error, retrying in ${(delay / 1000).toFixed(1)}s... (${retries} retries left)`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // If not retryable or out of retries, throw
      throw error
    }
  }
  
  throw new Error('Failed to generate embeddings after retries')
}

function estimateTokenCount(text: string): number {
  if (!text) return 1
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_TOKEN))
}

function isMaxTokensError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase()
  return (
    normalized.includes('max_tokens_per_request') ||
    (normalized.includes('requested') && normalized.includes('tokens') && normalized.includes('max'))
  )
}

async function generateEmbeddingsBatchWithAutoSplit(
  batch: string[],
  model: string,
  dimension: number,
  apiKey: string
): Promise<number[][]> {
  if (batch.length === 0) return []

  try {
    return await generateEmbeddingsBatch(batch, model, dimension, apiKey)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!isMaxTokensError(errorMessage) || batch.length === 1) {
      throw error
    }

    const midpoint = Math.ceil(batch.length / 2)
    const left = await generateEmbeddingsBatchWithAutoSplit(batch.slice(0, midpoint), model, dimension, apiKey)
    const right = await generateEmbeddingsBatchWithAutoSplit(batch.slice(midpoint), model, dimension, apiKey)
    return [...left, ...right]
  }
}

// Global rate limit state to coordinate across batches
let rateLimitState = {
  lastRateLimitTime: 0,
  consecutiveRateLimits: 0,
  currentParallelism: 3, // Start with default, reduce if rate limited
}

/**
 * Generate embeddings for multiple texts in batch
 * Optimized: Uses OpenAI's batch API (sends multiple texts in one request)
 * Includes rate limit handling with retry logic and adaptive parallelism
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey?: string,
  options?: EmbeddingOptions
): Promise<number[][]> {
  const batchSize = options?.batchSize || 96
  let parallelBatches = options?.parallelBatches || rateLimitState.currentParallelism
  const results: number[][] = []
  const model = options?.model || EMBEDDING_MODEL
  const dimension = options?.dimension || EMBEDDING_DIMENSION
  const key = resolveEmbeddingApiKey(apiKey)

  const safeBatches: string[][] = []
  let cursor = 0
  while (cursor < texts.length) {
    const batch: string[] = []
    let tokenBudget = 0
    while (cursor < texts.length && batch.length < batchSize) {
      const nextText = texts[cursor]
      const nextTokens = estimateTokenCount(nextText)
      const nextTotal = tokenBudget + nextTokens
      if (batch.length > 0 && nextTotal > MAX_EMBEDDING_TOKENS_PER_REQUEST) {
        break
    }
      batch.push(nextText)
      tokenBudget = nextTotal
      cursor += 1
    }

    // Ensure forward progress for very large single chunks.
    if (batch.length === 0) {
      batch.push(texts[cursor])
      cursor += 1
    }
    safeBatches.push(batch)
  }

  // Process in batch groups with adaptive parallelism
  for (let i = 0; i < safeBatches.length; i += parallelBatches) {
    const batchGroup = safeBatches.slice(i, i + Math.max(1, parallelBatches))

    // Process batches with staggered delays to avoid thundering herd
    // Each batch waits a bit longer before starting
    const batchPromises = batchGroup.map((batch, index) => {
      // Stagger requests by 200ms per batch to avoid simultaneous rate limits
      const staggerDelay = index * 200
      return new Promise<number[][]>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const result = await generateEmbeddingsBatchWithAutoSplit(batch, model, dimension, key)
            resolve(result)
          } catch (error) {
            reject(error)
          }
        }, staggerDelay)
      })
    })

    try {
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Process results and track rate limits
      let hasRateLimit = false
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(...result.value)
          // Reset rate limit counter on success
          if (rateLimitState.consecutiveRateLimits > 0) {
            rateLimitState.consecutiveRateLimits = Math.max(0, rateLimitState.consecutiveRateLimits - 1)
          }
        } else {
          const error = result.reason
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          // Check if it's a rate limit error
          if (errorMessage.includes('rate limit') || errorMessage.includes('rate_limit')) {
            hasRateLimit = true
            rateLimitState.lastRateLimitTime = Date.now()
            rateLimitState.consecutiveRateLimits++
            
            // Reduce parallelism if we're hitting rate limits
            if (rateLimitState.consecutiveRateLimits >= 2) {
              parallelBatches = Math.max(1, Math.floor(parallelBatches * 0.5))
              rateLimitState.currentParallelism = parallelBatches
              console.log(`[Embeddings] Reducing parallelism to ${parallelBatches} due to rate limits`)
            }
          }
          
          console.error(`[Embeddings] Batch failed: ${errorMessage}`)
        }
      }
      
      // If we had rate limits, wait longer before next batch group
      if (hasRateLimit) {
        const waitTime = Math.min(5000, 1000 * rateLimitState.consecutiveRateLimits)
        console.log(`[Embeddings] Waiting ${waitTime}ms before next batch group due to rate limits`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      } else if (i + parallelBatches < safeBatches.length) {
        // Normal delay between batch groups
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Gradually increase parallelism if we haven't hit rate limits recently
      if (!hasRateLimit && Date.now() - rateLimitState.lastRateLimitTime > 60000) {
        if (parallelBatches < (options?.parallelBatches || 3)) {
          parallelBatches = Math.min(options?.parallelBatches || 3, parallelBatches + 1)
          rateLimitState.currentParallelism = parallelBatches
          console.log(`[Embeddings] Increasing parallelism to ${parallelBatches}`)
        }
        rateLimitState.consecutiveRateLimits = 0
      }
    } catch (error) {
      // Fallback error handling
      console.error(`[Embeddings] Batch group failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return results
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension')
  }

  // Unrolled loop for better V8 JIT performance on 1536-dim vectors
  const len = a.length
  let dot = 0, nA = 0, nB = 0

  let i = 0
  const unrolled = len - (len % 4)
  for (; i < unrolled; i += 4) {
    const a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3]
    const b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3]
    dot += a0*b0 + a1*b1 + a2*b2 + a3*b3
    nA  += a0*a0 + a1*a1 + a2*a2 + a3*a3
    nB  += b0*b0 + b1*b1 + b2*b2 + b3*b3
  }
  for (; i < len; i++) {
    dot += a[i] * b[i]
    nA  += a[i] * a[i]
    nB  += b[i] * b[i]
  }

  const denom = Math.sqrt(nA) * Math.sqrt(nB)
  return denom > 0 ? dot / denom : 0
}


