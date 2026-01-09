/**
 * Embedding Generation Utility
 * Generates embeddings for text using OpenAI's embedding models
 */

const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSION = 1536

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
  const model = options?.model || EMBEDDING_MODEL
  const dimension = options?.dimension || EMBEDDING_DIMENSION
  const key = apiKey || process.env.OPENAI_API_KEY

  if (!key) {
    throw new Error('OpenAI API key is required for embedding generation')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
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
  return data.data[0].embedding
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
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batch, // Send array of texts - OpenAI supports up to 2048 inputs per request
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
  const batchSize = options?.batchSize || 200
  let parallelBatches = options?.parallelBatches || rateLimitState.currentParallelism
  const results: number[][] = []
  const model = options?.model || EMBEDDING_MODEL
  const dimension = options?.dimension || EMBEDDING_DIMENSION
  const key = apiKey || process.env.OPENAI_API_KEY

  if (!key) {
    throw new Error('OpenAI API key is required for embedding generation')
  }

  // Process in batches with adaptive parallelism
  for (let i = 0; i < texts.length; i += batchSize * parallelBatches) {
    const batchGroup: string[][] = []
    
    // Create batch group (up to parallelBatches batches)
    // Reduce parallelism if we've been rate limited recently
    const currentParallel = Math.max(1, parallelBatches)
    for (let j = 0; j < currentParallel && i + j * batchSize < texts.length; j++) {
      const batch = texts.slice(i + j * batchSize, i + (j + 1) * batchSize)
      if (batch.length > 0) {
        batchGroup.push(batch)
      }
    }

    // Process batches with staggered delays to avoid thundering herd
    // Each batch waits a bit longer before starting
    const batchPromises = batchGroup.map((batch, index) => {
      // Stagger requests by 200ms per batch to avoid simultaneous rate limits
      const staggerDelay = index * 200
      return new Promise<number[][]>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const result = await generateEmbeddingsBatch(batch, model, dimension, key)
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
      } else if (i + batchSize * parallelBatches < texts.length) {
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

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}


