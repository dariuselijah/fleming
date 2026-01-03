/**
 * Document Ingestion Pipeline
 * Processes PDF documents and extracts text with page-level precision
 */

import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings } from './embeddings'
import type {
  CitationDocument,
  DocumentMetadata,
  PDFData,
  PDFPageData,
  ChunkingOptions,
  EmbeddingOptions,
} from './types'

export class DocumentIngestionPipeline {
  private supabase: Awaited<ReturnType<typeof createClient>> | null = null

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    return this.supabase
  }

  /**
   * Process PDF document with page-level precision
   */
  async ingestDocument(
    file: File | Buffer,
    metadata: DocumentMetadata,
    filePath?: string,
    fileUrl?: string,
    apiKey?: string
  ): Promise<CitationDocument> {
    const supabase = await this.getSupabase()

    // 1. Extract text with page boundaries preserved
    const pdfData = await this.extractPDFWithPages(file)

    // 2. Store document in database
    const { data: document, error: docError } = await supabase
      .from('citation_documents')
      .insert({
        title: metadata.title,
        document_type: metadata.document_type,
        author: metadata.author,
        publisher: metadata.publisher,
        publication_date: metadata.publication_date,
        isbn: metadata.isbn,
        doi: metadata.doi,
        journal_name: metadata.journal_name,
        volume: metadata.volume,
        issue: metadata.issue,
        url: metadata.url,
        metadata: metadata.metadata || {},
        file_path: filePath,
        file_url: fileUrl,
        processing_status: 'processing',
      })
      .select()
      .single()

    if (docError || !document) {
      throw new Error(`Failed to create document: ${docError?.message || 'Unknown error'}`)
    }

    try {
      // 3. Chunk with page preservation
      const chunks = await this.chunkWithPageTracking(pdfData, document.id)

      // 4. Generate embeddings
      const chunksWithEmbeddings = await this.generateEmbeddingsForChunks(
        chunks,
        apiKey
      )

      // 5. Store chunks in database
      await this.storeChunks(chunksWithEmbeddings, document.id)

      // 6. Update document status
      await supabase
        .from('citation_documents')
        .update({
          processing_status: 'completed',
          chunk_count: chunksWithEmbeddings.length,
        })
        .eq('id', document.id)

      return {
        id: document.id,
        title: document.title,
        document_type: document.document_type,
        author: document.author,
        publisher: document.publisher,
        publication_date: document.publication_date,
        isbn: document.isbn,
        doi: document.doi,
        journal_name: document.journal_name,
        volume: document.volume,
        issue: document.issue,
        url: document.url,
        metadata: document.metadata || {},
        file_path: document.file_path,
        file_url: document.file_url,
        processing_status: 'completed',
        chunk_count: chunksWithEmbeddings.length,
        created_at: document.created_at,
        updated_at: document.updated_at,
      }
    } catch (error) {
      // Update document status to failed
      await supabase
        .from('citation_documents')
        .update({ processing_status: 'failed' })
        .eq('id', document.id)

      throw error
    }
  }

  /**
   * Extract PDF text with page boundaries preserved
   * TODO: Implement with pdf-parse, pdf.js, or similar library
   */
  private async extractPDFWithPages(file: File | Buffer): Promise<PDFData> {
    // For now, return a placeholder structure
    // In production, you would use a PDF parsing library like:
    // - pdf-parse (Node.js)
    // - pdf.js (Browser/Node.js)
    // - PyPDF2 (Python, via API)
    // - pdf2json

    // Example implementation structure:
    // const pdfData = await pdfParse(file)
    // const pages = pdfData.pages.map((page, index) => ({
    //   pageNumber: index + 1,
    //   text: page.text,
    //   chapter: this.detectChapter(page.text),
    //   section: this.detectSection(page.text),
    // }))

    // For MVP, return empty structure - this needs to be implemented
    throw new Error(
      'PDF extraction not yet implemented. Please use a PDF parsing library like pdf-parse or pdf.js'
    )

    // Placeholder return (will never execute due to throw above)
    return {
      pages: [],
      metadata: {
        title: '',
        document_type: 'textbook',
      },
    }
  }

  /**
   * Chunk text while preserving exact page numbers
   */
  private async chunkWithPageTracking(
    pdfData: PDFData,
    documentId: string,
    options?: ChunkingOptions
  ): Promise<Array<{
    document_id: string
    chunk_text: string
    page_number: number
    page_range?: string
    chapter?: string
    section?: string
    paragraph_index?: number
    chunk_index: number
    metadata: Record<string, any>
  }>> {
    const chunks: Array<{
      document_id: string
      chunk_text: string
      page_number: number
      page_range?: string
      chapter?: string
      section?: string
      paragraph_index?: number
      chunk_index: number
      metadata: Record<string, any>
    }> = []

    const chunkSize = options?.chunkSize || 1000 // tokens (approximate)
    const chunkOverlap = options?.chunkOverlap || 200 // tokens
    let chunkIndex = 0

    for (const page of pdfData.pages) {
      // Simple chunking by sentences/paragraphs
      // For better results, use a tokenizer or library like langchain's text splitter
      const pageChunks = this.semanticChunk(page.text, {
        chunkSize,
        chunkOverlap,
        preservePageBoundaries: options?.preservePageBoundaries ?? true,
      })

      for (let i = 0; i < pageChunks.length; i++) {
        const chunkText = pageChunks[i]

        // Determine if chunk spans multiple pages (simplified)
        const pageRange = this.calculatePageRange(
          chunkText,
          page.pageNumber,
          pdfData.pages,
          i,
          pageChunks.length
        )

        chunks.push({
          document_id: documentId,
          chunk_text: chunkText,
          page_number: page.pageNumber,
          page_range: pageRange,
          chapter: page.chapter,
          section: page.section,
          chunk_index: chunkIndex++,
          metadata: {
            paragraph_index: i,
          },
        })
      }
    }

    return chunks
  }

  /**
   * Semantic chunking with overlap
   * TODO: Use proper tokenizer for better chunking
   */
  private semanticChunk(
    text: string,
    options: { chunkSize: number; chunkOverlap: number; preservePageBoundaries: boolean }
  ): string[] {
    // Simple implementation: split by paragraphs, then by sentences
    // For production, use a proper tokenizer

    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    const chunks: string[] = []
    let currentChunk = ''

    for (const paragraph of paragraphs) {
      // Approximate token count (1 token ≈ 4 characters)
      const paragraphTokens = paragraph.length / 4

      if (currentChunk.length + paragraph.length > options.chunkSize * 4) {
        // Start new chunk
        if (currentChunk) {
          chunks.push(currentChunk.trim())
        }

        // Add overlap from previous chunk
        const overlapText = this.getOverlapText(currentChunk, options.chunkOverlap * 4)
        currentChunk = overlapText + paragraph
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return chunks.filter((c) => c.length > 0)
  }

  /**
   * Get overlap text from end of chunk
   */
  private getOverlapText(text: string, overlapChars: number): string {
    if (text.length <= overlapChars) return text
    // Get last N characters, but try to break at sentence boundary
    const overlap = text.slice(-overlapChars)
    const sentenceBreak = overlap.search(/[.!?]\s+/)
    if (sentenceBreak > overlapChars / 2) {
      return overlap.slice(sentenceBreak + 1)
    }
    return overlap
  }

  /**
   * Calculate page range if chunk spans multiple pages
   */
  private calculatePageRange(
    chunkText: string,
    currentPage: number,
    allPages: PDFPageData[],
    chunkIndex: number,
    totalChunksOnPage: number
  ): string | undefined {
    // Simplified: if it's the last chunk on a page and long, might span
    // In reality, you'd need to track actual text positions
    if (chunkIndex === totalChunksOnPage - 1 && chunkText.length > 500) {
      // Might span to next page (simplified heuristic)
      return `${currentPage}-${currentPage + 1}`
    }
    return undefined
  }

  /**
   * Generate embeddings for chunks
   */
  private async generateEmbeddingsForChunks(
    chunks: Array<{ chunk_text: string }>,
    apiKey?: string
  ): Promise<Array<{ embedding: number[]; [key: string]: any }>> {
    const texts = chunks.map((c) => c.chunk_text)
    const embeddings = await generateEmbeddings(texts, apiKey)

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
    }))
  }

  /**
   * Store chunks in database
   */
  private async storeChunks(
    chunks: Array<{
      document_id: string
      chunk_text: string
      page_number: number
      page_range?: string
      chapter?: string
      section?: string
      paragraph_index?: number
      chunk_index: number
      embedding: number[]
      metadata: Record<string, any>
    }>,
    documentId: string
  ): Promise<void> {
    const supabase = await this.getSupabase()

    // Insert chunks in batches
    const batchSize = 100
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)

      const insertData = batch.map((chunk) => ({
        document_id: chunk.document_id,
        chunk_text: chunk.chunk_text,
        page_number: chunk.page_number,
        page_range: chunk.page_range || null,
        chapter: chunk.chapter || null,
        section: chunk.section || null,
        paragraph_index: chunk.metadata.paragraph_index || null,
        chunk_index: chunk.chunk_index,
        embedding: `[${chunk.embedding.join(',')}]`, // Convert to PostgreSQL vector format
        metadata: chunk.metadata,
      }))

      const { error } = await supabase.from('citation_document_chunks').insert(insertData)

      if (error) {
        console.error(`Error inserting chunk batch ${i / batchSize + 1}:`, error)
        throw new Error(`Failed to store chunks: ${error.message}`)
      }
    }
  }
}

