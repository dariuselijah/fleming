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
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey?: string,
  options?: EmbeddingOptions
): Promise<number[][]> {
  const batchSize = options?.batchSize || 100
  const results: number[][] = []

  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchEmbeddings = await Promise.all(
      batch.map((text) => generateEmbedding(text, apiKey, options))
    )
    results.push(...batchEmbeddings)
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


