export interface RagContext {
  sources: RagSource[]
  confidence: number
  query: string
  retrieved_chunks: number
  total_tokens: number
}

export interface RagSource {
  id: string
  title: string
  material_type: string
  page?: number
  chapter?: string
  similarity: number
  content_preview: string
  file_url?: string
}

export interface SearchResult {
  id: string
  title: string
  content: string
  material_type: string
  discipline: string
  similarity: number
  content_length: number
  created_at: string
  file_url?: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  embedding?: number[]
  metadata: Record<string, any>
}

export interface EmbeddingResult {
  id: string
  embedding: number[]
  model: string
}

export interface SearchOptions {
  threshold?: number
  limit?: number
  materialTypes?: string[]
  disciplines?: string[]
  maxTokens?: number
  useHybrid?: boolean
}

export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

export interface LibraryMaterial {
  id: string
  title: string
  author?: string
  discipline: string
  material_type: string
  description?: string
  file_url: string
  file_size?: number
  thumbnail_url?: string
  tags: string[]
  popularity: number
  download_count: number
  is_featured: boolean
  is_processed: boolean
  created_at: string
}

export interface RagSearchLog {
  id: string
  user_id: string
  query_text: string
  search_type: 'vector' | 'hybrid' | 'keyword'
  results_count: number
  response_time_ms: number
  cache_hit: boolean
  created_at: string
}

export interface UserRagPreferences {
  rag_enabled: boolean
  rag_threshold: number
  rag_max_results: number
  rag_file_types: string[]
  rag_auto_enable: boolean
}

export interface EnhancedMessage {
  id: number
  chat_id: string
  role: "system" | "user" | "assistant" | "data"
  content: string
  rag_context?: RagContext
  rag_sources?: string[]
  rag_enabled?: boolean
  rag_confidence?: number
  created_at: string
} 