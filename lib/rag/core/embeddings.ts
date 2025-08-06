import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { EmbeddingResult } from './types'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface EmbeddingOptions {
  model?: string
  batchSize?: number
  retryAttempts?: number
}

export class EmbeddingService {
  private static instance: EmbeddingService
  private cache = new Map<string, number[]>()
  private readonly defaultModel = 'text-embedding-ada-002'
  private readonly defaultBatchSize = 10
  private readonly defaultRetryAttempts = 3

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService()
    }
    return EmbeddingService.instance
  }

  async generateEmbedding(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const cacheKey = this.getCacheKey(text, options.model)
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const model = options.model || this.defaultModel
    const retryAttempts = options.retryAttempts || this.defaultRetryAttempts

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await openai.embeddings.create({
          model,
          input: text
        })

        const embedding = response.data[0].embedding
        
        // Cache the result
        this.cache.set(cacheKey, embedding)
        
        return embedding
      } catch (error) {
        console.error(`Embedding generation attempt ${attempt} failed:`, error)
        
        if (attempt === retryAttempts) {
          throw new Error(`Failed to generate embedding after ${retryAttempts} attempts: ${error}`)
        }
        
        // Wait before retry
        await this.delay(1000 * attempt)
      }
    }

    throw new Error('Failed to generate embedding')
  }

  async generateEmbeddings(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult[]> {
    const batchSize = options.batchSize || this.defaultBatchSize
    const model = options.model || this.defaultModel
    const results: EmbeddingResult[] = []

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      
      try {
        const response = await openai.embeddings.create({
          model,
          input: batch
        })

        const batchResults = response.data.map((item, index) => ({
          id: `batch_${i}_${index}`,
          embedding: item.embedding,
          model
        }))

        results.push(...batchResults)
      } catch (error) {
        console.error('Batch embedding generation failed:', error)
        throw error
      }
    }

    return results
  }

  async generateEmbeddingsForMaterials(materials: Array<{ id: string; title: string; content: string }>): Promise<EmbeddingResult[]> {
    const texts = materials.map(material => `${material.title}\n\n${material.content}`)
    const results = await this.generateEmbeddings(texts)
    
    // Map results back to material IDs
    return results.map((result, index) => ({
      ...result,
      id: materials[index].id
    }))
  }

  private getCacheKey(text: string, model?: string): string {
    const modelName = model || this.defaultModel
    return `${modelName}:${this.hashString(text)}`
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString()
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Clear cache (useful for testing or memory management)
  clearCache(): void {
    this.cache.clear()
  }

  // Get cache size (for monitoring)
  getCacheSize(): number {
    return this.cache.size
  }
}

// Export singleton instance
export const embeddingService = EmbeddingService.getInstance() 