import { createClient } from '@/lib/supabase/server'
import { embeddingService } from './embeddings'
import { SearchResult, SearchOptions, RagContext, RagSource } from './types'

export class RagSearchService {
  private static instance: RagSearchService
  private cache = new Map<string, SearchResult[]>()
  private readonly cacheDuration = 5 * 60 * 1000 // 5 minutes

  static getInstance(): RagSearchService {
    if (!RagSearchService.instance) {
      RagSearchService.instance = new RagSearchService()
    }
    return RagSearchService.instance
  }

  async searchStudyMaterials(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const startTime = Date.now()
    
    // Check cache first
    const cacheKey = this.getCacheKey(query, userId, options)
    const cached = this.getCachedResults(cacheKey)
    if (cached) {
      await this.logSearchPerformance(query, userId, 'vector', cached.length, Date.now() - startTime, true)
      return cached
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(query)
      
      const supabase = await createClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      // Search using database function
      const { data, error } = await supabase.rpc('search_study_materials', {
        query_embedding: queryEmbedding,
        user_id_filter: userId,
        match_threshold: options.threshold || 0.7,
        match_count: options.limit || 5,
        material_types: options.materialTypes || null,
        disciplines: options.disciplines || null
      })

      if (error) {
        console.error('RAG search error:', error)
        throw error
      }

      const results = data || []
      
      // Cache results
      this.cacheResults(cacheKey, results)
      
      // Log performance
      await this.logSearchPerformance(query, userId, 'vector', results.length, Date.now() - startTime, false)
      
      return results
    } catch (error) {
      console.error('Search failed:', error)
      throw error
    }
  }

  async hybridSearch(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const startTime = Date.now()
    
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query)
      
      const supabase = await createClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      const { data, error } = await supabase.rpc('hybrid_search_study_materials', {
        query_embedding: queryEmbedding,
        query_text: query,
        user_id_filter: userId,
        match_threshold: options.threshold || 0.6,
        match_count: options.limit || 5
      })

      if (error) {
        console.error('Hybrid search error:', error)
        throw error
      }

      const results = data || []
      
      await this.logSearchPerformance(query, userId, 'hybrid', results.length, Date.now() - startTime, false)
      
      return results
    } catch (error) {
      console.error('Hybrid search failed:', error)
      throw error
    }
  }

  async searchDocumentChunks(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const startTime = Date.now()
    
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query)
      
      const supabase = await createClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      const { data, error } = await supabase.rpc('search_document_chunks', {
        query_embedding: queryEmbedding,
        user_id_filter: userId,
        match_threshold: options.threshold || 0.6,
        match_count: options.limit || 8
      })

      if (error) {
        console.error('Document chunk search error:', error)
        throw error
      }

      const results = data || []
      
      await this.logSearchPerformance(query, userId, 'chunks', results.length, Date.now() - startTime, false)
      
      return results
    } catch (error) {
      console.error('Document chunk search failed:', error)
      throw error
    }
  }

  async getRelevantContext(
    query: string,
    userId: string,
    options: SearchOptions = {}
  ): Promise<RagContext> {
    const startTime = Date.now()
    
    try {
      // Use hybrid search for better results
      const searchResults = await this.hybridSearch(query, userId, options)
      
      // Convert to RagSource format
      const sources: RagSource[] = searchResults.map(result => ({
        id: result.id,
        title: result.title,
        material_type: result.material_type,
        similarity: result.similarity,
        content_preview: result.content.substring(0, 200) + '...',
        file_url: result.file_url
      }))

      // Calculate confidence based on similarity scores
      const avgSimilarity = sources.length > 0 
        ? sources.reduce((sum, source) => sum + source.similarity, 0) / sources.length 
        : 0

      // Estimate total tokens
      const totalTokens = searchResults.reduce((sum, result) => {
        return sum + Math.ceil(result.content.length / 4) // Rough estimate
      }, 0)

      const context: RagContext = {
        sources,
        confidence: avgSimilarity,
        query,
        retrieved_chunks: searchResults.length,
        total_tokens: totalTokens
      }

      await this.logSearchPerformance(query, userId, 'context', sources.length, Date.now() - startTime, false)
      
      return context
    } catch (error) {
      console.error('Context retrieval failed:', error)
      throw error
    }
  }

  private getCacheKey(query: string, userId: string, options: SearchOptions): string {
    const optionsStr = JSON.stringify({
      threshold: options.threshold,
      limit: options.limit,
      materialTypes: options.materialTypes,
      disciplines: options.disciplines
    })
    return `${userId}:${this.hashString(query)}:${this.hashString(optionsStr)}`
  }

  private getCachedResults(cacheKey: string): SearchResult[] | null {
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.results
    }
    return null
  }

  private cacheResults(cacheKey: string, results: SearchResult[]): void {
    this.cache.set(cacheKey, {
      results,
      timestamp: Date.now()
    })
  }

  private async logSearchPerformance(
    query: string,
    userId: string,
    searchType: 'vector' | 'hybrid' | 'keyword' | 'chunks' | 'context',
    resultsCount: number,
    responseTime: number,
    cacheHit: boolean
  ): Promise<void> {
    try {
      const supabase = await createClient()
      if (!supabase) return

      await supabase.from('rag_search_logs').insert({
        user_id: userId,
        query_text: query,
        search_type: searchType,
        results_count: resultsCount,
        response_time_ms: responseTime,
        cache_hit: cacheHit
      })
    } catch (error) {
      console.error('Failed to log search performance:', error)
    }
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString()
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear()
  }

  // Get cache size
  getCacheSize(): number {
    return this.cache.size
  }
}

// Export singleton instance
export const ragSearchService = RagSearchService.getInstance() 