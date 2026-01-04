/**
 * Types for the Citation RAG System
 * Provides type-safe definitions for clinical evidence retrieval with page-level citations
 */

export type DocumentType = 'textbook' | 'journal_article' | 'guideline' | 'research_paper' | 'reference_book'

export type CitationType = 'direct_quote' | 'paraphrase' | 'reference' | 'background'

export type VerificationMethod = 'embedding_similarity' | 'manual' | 'llm_check' | 'quote_match'

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Citation Document - Source document metadata
 */
export interface CitationDocument {
  id: string
  title: string
  document_type: DocumentType
  author?: string
  publisher?: string
  publication_date?: string
  isbn?: string
  doi?: string
  journal_name?: string
  volume?: string
  issue?: string
  url?: string
  metadata: Record<string, any>
  file_path?: string
  file_url?: string
  processing_status: ProcessingStatus
  chunk_count: number
  created_at: string
  updated_at: string
}

/**
 * Citation Chunk - Text chunk with exact page tracking
 */
export interface CitationChunk {
  id: string
  document_id: string
  chunk_text: string
  page_number: number
  page_range?: string // e.g., "245-247" if spans multiple pages
  chapter?: string
  section?: string
  paragraph_index?: number
  chunk_index: number
  embedding?: number[]
  metadata: Record<string, any>
  created_at: string
  // Joined document data
  document?: CitationDocument
}

/**
 * Response Citation - Links a message to a specific chunk
 */
export interface ResponseCitation {
  id: string
  message_id: number
  chunk_id: string
  citation_type: CitationType
  quote_text?: string
  relevance_score?: number
  created_at: string
  // Joined chunk data
  chunk?: CitationChunk
}

/**
 * Citation Verification Result
 */
export interface CitationVerification {
  id: string
  message_id: number
  chunk_id: string
  verified: boolean
  verification_method?: VerificationMethod
  confidence_score?: number
  notes?: string
  verified_at?: string
  created_at: string
}

/**
 * RAG Query Parameters
 */
export interface RAGQuery {
  query: string
  maxResults?: number
  minRelevanceScore?: number
  documentTypes?: DocumentType[]
  specialties?: string[]
  evidenceLevelFilter?: ('A' | 'B' | 'C' | 'D')[]
  limit?: number
}

/**
 * Cited Response - Response with citations attached
 */
export interface CitedResponse {
  text: string
  citations: ResponseCitation[]
  allRetrievedCitations: CitationChunk[]
  verification?: {
    allValid: boolean
    verifications: Array<{
      valid: boolean
      chunkId: string
      similarity?: number
      reason?: string
    }>
    warnings: Array<{
      claim: string
      isHallucination: boolean
      maxSimilarity: number
    }>
  }
}

/**
 * Document Ingestion Metadata
 */
export interface DocumentMetadata {
  title: string
  document_type: DocumentType
  author?: string
  publisher?: string
  publication_date?: string
  isbn?: string
  doi?: string
  journal_name?: string
  volume?: string
  issue?: string
  url?: string
  metadata?: Record<string, any>
}

/**
 * PDF Page Data
 */
export interface PDFPageData {
  pageNumber: number
  text: string
  chapter?: string
  section?: string
}

/**
 * PDF Document Data
 */
export interface PDFData {
  pages: PDFPageData[]
  metadata: DocumentMetadata
}

/**
 * Chunking Options
 */
export interface ChunkingOptions {
  chunkSize: number // tokens
  chunkOverlap: number // tokens
  preservePageBoundaries: boolean
  minChunkSize?: number
}

/**
 * Embedding Generation Options
 */
export interface EmbeddingOptions {
  model?: string
  dimension?: number
  batchSize?: number
}


