/**
 * Citation RAG System
 * Provides clinical evidence retrieval with exact page-level citations
 */

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from './embeddings'
import type {
  CitationChunk,
  CitationDocument,
  CitedResponse,
  RAGQuery,
  ResponseCitation,
} from './types'

export class CitationRAGSystem {
  private supabase: Awaited<ReturnType<typeof createClient>> | null = null

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
  }

  /**
   * Retrieve citations for a query using multi-stage retrieval
   * 1. Generate query embedding
   * 2. Vector similarity search using pgvector
   * 3. Filtering and relevance scoring
   */
  async retrieveCitations(query: RAGQuery, apiKey?: string): Promise<CitationChunk[]> {
    const supabase = await this.getSupabase()

    const {
      query: queryText,
      maxResults = 10,
      minRelevanceScore = 0.7,
      documentTypes,
      limit = maxResults * 3, // Get more for filtering
    } = query

    // Stage 1: Generate query embedding
    const queryEmbedding = await generateEmbedding(queryText, apiKey)

    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    // Stage 2: Vector similarity search using pgvector
    // We need to use a database function for vector similarity search
    // Create a SQL query that finds similar chunks
    let sqlQuery = `
      SELECT 
        c.*,
        d.*,
        1 - (c.embedding <=> $1::vector) as similarity
      FROM citation_document_chunks c
      JOIN citation_documents d ON c.document_id = d.id
      WHERE c.embedding IS NOT NULL
    `

    const params: any[] = [`[${queryEmbedding.join(',')}]`]
    let paramIndex = 2

    // Add document type filter if specified
    if (documentTypes && documentTypes.length > 0) {
      sqlQuery += ` AND d.document_type = ANY($${paramIndex}::text[])`
      params.push(documentTypes)
      paramIndex++
    }

    sqlQuery += `
      ORDER BY c.embedding <=> $1::vector
      LIMIT $${paramIndex}
    `
    params.push(limit)

    // Use fallback approach: fetch chunks and calculate similarity
    // In production, you'd create a database function for vector search
    const { data: allChunks, error: fetchError } = await (supabase as any)
      .from('citation_document_chunks')
      .select(`
        *,
        document:citation_documents(*)
      `)
      .not('embedding', 'is', null)
      .limit(1000) // Limit for performance

    if (fetchError) {
      console.error('Error retrieving citations:', fetchError)
      throw new Error(`Failed to retrieve citations: ${fetchError.message}`)
    }

    // Filter by document type if specified
    let filteredChunks = allChunks || []
    if (documentTypes && documentTypes.length > 0) {
      filteredChunks = filteredChunks.filter((chunk: any) =>
        documentTypes.includes(chunk.document?.document_type)
      )
    }

    // Calculate similarity scores in-memory
    const chunksWithSimilarity = filteredChunks
      .map((row: any) => {
        if (!row.embedding || !Array.isArray(row.embedding)) return null

        const similarity = this.cosineSimilarity(queryEmbedding, row.embedding)
        return {
          ...row,
          similarity,
        }
      })
      .filter((row: any) => row && row.similarity >= minRelevanceScore)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, maxResults)

    return this.mapChunksToCitationChunks(chunksWithSimilarity)
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    return denominator === 0 ? 0 : dotProduct / denominator
  }

  /**
   * Map database rows to CitationChunk format
   */
  private mapChunksToCitationChunks(rows: any[]): CitationChunk[] {
    return rows.map((row: any) => ({
      id: row.id,
      document_id: row.document_id,
      chunk_text: row.chunk_text,
      page_number: row.page_number,
      page_range: row.page_range,
      chapter: row.chapter,
      section: row.section,
      paragraph_index: row.paragraph_index,
      chunk_index: row.chunk_index,
      embedding: Array.isArray(row.embedding) ? row.embedding : undefined,
      metadata: row.metadata || {},
      created_at: row.created_at,
      document: row.document
        ? {
            id: row.document.id,
            title: row.document.title,
            document_type: row.document.document_type,
            author: row.document.author,
            publisher: row.document.publisher,
            publication_date: row.document.publication_date,
            isbn: row.document.isbn,
            doi: row.document.doi,
            journal_name: row.document.journal_name,
            volume: row.document.volume,
            issue: row.document.issue,
            url: row.document.url,
            metadata: row.document.metadata || {},
            file_path: row.document.file_path,
            file_url: row.document.file_url,
            processing_status: row.document.processing_status,
            chunk_count: row.document.chunk_count,
            created_at: row.document.created_at,
            updated_at: row.document.updated_at,
          }
        : undefined,
    }))
  }

  /**
   * Store citations linked to a message
   */
  async storeCitations(
    messageId: number,
    citations: Array<{
      chunkId: string
      citationType: string
      quoteText?: string
      relevanceScore?: number
    }>
  ): Promise<ResponseCitation[]> {
    const supabase = await this.getSupabase()

    const citationInserts = citations.map((citation) => ({
      message_id: messageId,
      chunk_id: citation.chunkId,
      citation_type: citation.citationType,
      quote_text: citation.quoteText || null,
      relevance_score: citation.relevanceScore || null,
    }))

    const { data, error } = await (supabase as any)
      .from('response_citations')
      .insert(citationInserts)
      .select()

    if (error) {
      console.error('Error storing citations:', error)
      throw new Error(`Failed to store citations: ${error.message}`)
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      message_id: row.message_id,
      chunk_id: row.chunk_id,
      citation_type: row.citation_type,
      quote_text: row.quote_text,
      relevance_score: row.relevance_score,
      created_at: row.created_at,
    }))
  }

  /**
   * Get citations for a message
   */
  async getCitationsForMessage(messageId: number): Promise<ResponseCitation[]> {
    const supabase = await this.getSupabase()

    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    const { data, error } = await (supabase as any)
      .from('response_citations')
      .select(`
        *,
        chunk:citation_document_chunks(
          *,
          document:citation_documents(*)
        )
      `)
      .eq('message_id', messageId)

    if (error) {
      console.error('Error fetching citations:', error)
      throw new Error(`Failed to fetch citations: ${error.message}`)
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      message_id: row.message_id,
      chunk_id: row.chunk_id,
      citation_type: row.citation_type,
      quote_text: row.quote_text,
      relevance_score: row.relevance_score,
      created_at: row.created_at,
      chunk: row.chunk
        ? {
            id: row.chunk.id,
            document_id: row.chunk.document_id,
            chunk_text: row.chunk.chunk_text,
            page_number: row.chunk.page_number,
            page_range: row.chunk.page_range,
            chapter: row.chunk.chapter,
            section: row.chunk.section,
            paragraph_index: row.chunk.paragraph_index,
            chunk_index: row.chunk.chunk_index,
            embedding: row.chunk.embedding,
            metadata: row.chunk.metadata || {},
            created_at: row.chunk.created_at,
            document: row.chunk.document,
          }
        : undefined,
    }))
  }

  /**
   * Build citation context for system prompt
   */
  buildCitationContext(citations: CitationChunk[]): string {
    return citations
      .map((citation, index) => {
        const doc = citation.document
        const pageInfo = citation.page_range || citation.page_number.toString()
        const docInfo = doc
          ? `${doc.title}${doc.author ? ` by ${doc.author}` : ''}${doc.publication_date ? ` (${doc.publication_date})` : ''}`
          : 'Unknown source'

        return `[CITATION:${index + 1}]
Source: ${docInfo}
Page: ${pageInfo}
${doc?.doi ? `DOI: ${doc.doi}` : ''}
${doc?.isbn ? `ISBN: ${doc.isbn}` : ''}

Content:
${citation.chunk_text.substring(0, 500)}${citation.chunk_text.length > 500 ? '...' : ''}`
      })
      .join('\n\n')
  }

  /**
   * Build system prompt that forces citation usage
   */
  buildCitationSystemPrompt(citations: CitationChunk[]): string {
    const citationContext = this.buildCitationContext(citations)

    return `You are a clinical evidence assistant that provides evidence-based medical information with precise citations.

**CRITICAL RULES:**
1. You MUST only use information from the provided citations below
2. Every factual claim MUST be followed by [CITATION:X] where X is the citation number
3. You CANNOT make claims not supported by the citations
4. If information is not in the citations, say "This information is not available in the provided sources"
5. Direct quotes should be marked as [CITATION:X:QUOTE:"exact text"]

**Available Citations:**
${citationContext}

**Response Format:**
- Start with a brief answer to the question
- Support every claim with [CITATION:X]
- If multiple citations support a claim, use [CITATION:X,Y,Z]
- End with a "Sources" section listing all citations used

**Example:**
Hypertension treatment typically involves lifestyle modifications and pharmacotherapy [CITATION:1,2]. ACE inhibitors are first-line for many patients [CITATION:1:QUOTE:"ACE inhibitors are recommended as first-line therapy for hypertension in most patients"].

Sources:
1. Harrison's Principles of Internal Medicine, Page 245
2. AHA/ACC Hypertension Guidelines, Page 12`
  }
}

