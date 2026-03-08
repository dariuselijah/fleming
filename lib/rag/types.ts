/**
 * Types for the Citation RAG System
 * Provides type-safe definitions for clinical evidence retrieval with page-level citations
 */

export type DocumentType = 'textbook' | 'journal_article' | 'guideline' | 'research_paper' | 'reference_book'

export type CitationType = 'direct_quote' | 'paraphrase' | 'reference' | 'background'

export type VerificationMethod = 'embedding_similarity' | 'manual' | 'llm_check' | 'quote_match'

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type UploadDocumentKind = 'pdf' | 'pptx' | 'docx' | 'image' | 'text' | 'other'
export type UploadSourceUnitType = 'page' | 'slide' | 'image' | 'section'
export type UploadAssetType = 'figure' | 'preview'
export type OCRStatus = 'not_required' | 'pending' | 'completed' | 'failed'

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

export interface UserUpload {
  id: string
  user_id: string
  title: string
  description?: string | null
  file_name: string
  mime_type: string
  file_size: number
  storage_bucket: string
  original_file_path: string
  upload_kind: UploadDocumentKind
  status: ProcessingStatus
  parser_version: string
  last_error?: string | null
  metadata: Record<string, any>
  last_ingested_at?: string | null
  created_at: string
  updated_at: string
}

export interface UserUploadSourceUnit {
  id: string
  upload_id: string
  user_id: string
  unit_type: UploadSourceUnitType
  unit_number: number
  title?: string | null
  extracted_text: string
  preview_bucket?: string | null
  preview_path?: string | null
  preview_mime_type?: string | null
  width?: number | null
  height?: number | null
  ocr_status: OCRStatus
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UserUploadAsset {
  id: string
  upload_id: string
  user_id: string
  source_unit_id?: string | null
  asset_type: UploadAssetType
  label?: string | null
  caption?: string | null
  storage_bucket: string
  file_path: string
  mime_type: string
  width?: number | null
  height?: number | null
  sort_order: number
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UserUploadChunk {
  id: string
  upload_id: string
  user_id: string
  source_unit_id: string
  preview_asset_id?: string | null
  chunk_index: number
  chunk_text: string
  source_offset_start?: number | null
  source_offset_end?: number | null
  embedding?: number[]
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UploadIngestionJob {
  id: string
  upload_id: string
  user_id: string
  status: ProcessingStatus
  parser_version: string
  attempt_count: number
  retryable: boolean
  error_message?: string | null
  started_at?: string | null
  finished_at?: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ParsedUploadAsset {
  id?: string
  assetType: UploadAssetType
  label: string
  caption?: string
  buffer: Buffer
  mimeType: string
  width?: number
  height?: number
  metadata?: Record<string, any>
}

export interface ParsedSourceUnit {
  unitType: UploadSourceUnitType
  unitNumber: number
  title?: string
  extractedText: string
  preview?: ParsedUploadAsset
  figures: ParsedUploadAsset[]
  width?: number
  height?: number
  ocrStatus?: OCRStatus
  metadata?: Record<string, any>
}

export interface ParsedUploadDocument {
  kind: UploadDocumentKind
  title: string
  metadata: Record<string, any>
  sourceUnits: ParsedSourceUnit[]
}





