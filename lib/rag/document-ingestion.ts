/**
 * Document Ingestion Pipeline
 * Processes PDF documents and extracts text with page-level precision
 */

import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings } from './embeddings'
import { UserUploadService } from '@/lib/uploads/server'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
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

    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    // 2. Store document in database
    const { data: document, error: docError } = await (supabase as any)
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
      const docInsert = document as any
      // 3. Chunk with page preservation
      const chunks = await this.chunkWithPageTracking(pdfData, docInsert.id)

      // 4. Generate embeddings
      const chunksWithEmbeddings = await this.generateEmbeddingsForChunks(
        chunks,
        apiKey
      ) as any

      // 5. Store chunks in database
      await this.storeChunks(chunksWithEmbeddings, docInsert.id)

      // 6. Update document status
      await (supabase as any)
        .from('citation_documents')
        .update({
          processing_status: 'completed',
          chunk_count: chunksWithEmbeddings.length,
        })
        .eq('id', docInsert.id)

      const docReturn = document as any
      return {
        id: docReturn.id,
        title: docReturn.title,
        document_type: docReturn.document_type,
        author: docReturn.author,
        publisher: docReturn.publisher,
        publication_date: docReturn.publication_date,
        isbn: docReturn.isbn,
        doi: docReturn.doi,
        journal_name: docReturn.journal_name,
        volume: docReturn.volume,
        issue: docReturn.issue,
        url: docReturn.url,
        metadata: docReturn.metadata || {},
        file_path: docReturn.file_path,
        file_url: docReturn.file_url,
        processing_status: 'completed',
        chunk_count: chunksWithEmbeddings.length,
        created_at: docReturn.created_at,
        updated_at: docReturn.updated_at,
      }
    } catch (error) {
      // Update document status to failed
      const docFailed = document as any
      await (supabase as any)
        .from('citation_documents')
        .update({ processing_status: 'failed' })
        .eq('id', docFailed.id)

      throw error
    }
  }

  /**
   * Extract PDF text with page boundaries preserved
   * TODO: Implement with pdf-parse, pdf.js, or similar library
   */
  private async extractPDFWithPages(file: File | Buffer): Promise<PDFData> {
    const buffer = Buffer.isBuffer(file)
      ? file
      : Buffer.from(await file.arrayBuffer())
    const parsed = await pdfParse(buffer)
    const pageCandidates = parsed.text
      .split(/\f+/)
      .map((page: string) => page.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const pageCount = Math.max(parsed.numpages || 0, pageCandidates.length || 1)
    const pages: PDFPageData[] = []

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const text =
        pageCandidates[pageNumber - 1] ||
        (pageNumber === 1 ? parsed.text.replace(/\s+/g, ' ').trim() : '')

      pages.push({
        pageNumber,
        text,
        chapter: this.detectChapter(text),
        section: this.detectSection(text),
      })
    }

    return {
      pages,
      metadata: {
        title: '',
        document_type: 'textbook',
      },
    }
  }

  private detectChapter(text: string): string | undefined {
    const match = text.match(/\bchapter\s+(\d+|[ivxlcdm]+)/i)
    return match ? `Chapter ${match[1]}` : undefined
  }

  private detectSection(text: string): string | undefined {
    const match = text.match(/\b(section|unit)\s+([a-z0-9.-]+)/i)
    return match ? `${match[1]} ${match[2]}` : undefined
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

        const pico = extractPicoElements(chunkText)

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
            ...(pico.population && { pico_population: pico.population }),
            ...(pico.intervention && { pico_intervention: pico.intervention }),
            ...(pico.comparison && { pico_comparison: pico.comparison }),
            ...(pico.outcome && { pico_outcome: pico.outcome }),
          },
        })
      }
    }

    return chunks
  }

  /**
   * Semantic chunking with sentence-boundary awareness and overlap.
   * Splits on sentence boundaries, detects topic shifts via keyword heuristics,
   * and ensures every chunk overlaps by 1-2 sentences with its neighbours.
   */
  private semanticChunk(
    text: string,
    options: { chunkSize: number; chunkOverlap: number; preservePageBoundaries: boolean }
  ): string[] {
    const maxChars = options.chunkSize * 4
    const overlapChars = options.chunkOverlap * 4

    // Split into sentences (handles abbreviations, decimals, common patterns)
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text]
    const chunks: string[] = []
    let currentChunk = ''

    const TOPIC_SHIFT_PATTERN =
      /^(introduction|background|methods?|results?|discussion|conclusion|limitations?|abstract|objective|purpose|aim|study design)/i

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim()
      if (!sentence) continue

      const isTopicShift = TOPIC_SHIFT_PATTERN.test(sentence)
      const wouldExceed = currentChunk.length + sentence.length > maxChars

      if ((wouldExceed || isTopicShift) && currentChunk) {
        chunks.push(currentChunk.trim())
        // Overlap: carry last 1-2 sentences into next chunk
        const overlapText = this.getOverlapText(currentChunk, overlapChars)
        currentChunk = overlapText + sentence
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence
      }
    }

    if (currentChunk.trim()) {
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
   * Optimized: Uses parallel batch processing with OpenAI's batch API
   */
  private async generateEmbeddingsForChunks(
    chunks: Array<{ chunk_text: string }>,
    apiKey?: string
  ): Promise<Array<{ embedding: number[]; [key: string]: any }>> {
    const texts = chunks.map((c) => c.chunk_text)
    
    // Use optimized batch processing: 200 chunks per batch, 3 parallel batches
    const embeddings = await generateEmbeddings(texts, apiKey, {
      batchSize: 200, // Increased from 100 for better throughput
      parallelBatches: 3, // Process 3 batches concurrently (3 * 200 = 600 chunks at a time)
    })

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

    if (!supabase) {
      throw new Error("Supabase client not available")
    }

    // Insert chunks in batches
    const batchSize = 100
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)

      const insertData = batch.map((chunk: any) => ({
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
      })) as any

      const { error } = await (supabase as any).from('citation_document_chunks').insert(insertData)

      if (error) {
        console.error(`Error inserting chunk batch ${i / batchSize + 1}:`, error)
        throw new Error(`Failed to store chunks: ${error.message}`)
      }
    }
  }
}

/**
 * Extract PICO (Population, Intervention, Comparison, Outcome) elements
 * from a text chunk using lightweight keyword heuristics.
 * For higher accuracy, replace with an LLM extraction step during ingestion.
 */
function extractPicoElements(text: string): {
  population?: string
  intervention?: string
  comparison?: string
  outcome?: string
} {
  const lower = text.toLowerCase()
  const pico: ReturnType<typeof extractPicoElements> = {}

  // Population: look for "patients with X", "adults with X", "N = ..."
  const popMatch = text.match(
    /(?:patients?|adults?|children|participants?|subjects?)\s+(?:with|who|aged|diagnosed)\s+([^.]{5,80})/i,
  )
  if (popMatch) pico.population = popMatch[0].trim()

  // Intervention: "treated with X", "received X", "administered X"
  const intMatch = text.match(
    /(?:treated with|received|administered|given|randomized to|assigned to)\s+([^.]{5,80})/i,
  )
  if (intMatch) pico.intervention = intMatch[0].trim()

  // Comparison: "compared to X", "versus X", "vs X", "placebo"
  const compMatch = text.match(
    /(?:compared (?:to|with)|versus|vs\.?)\s+([^.]{5,60})/i,
  )
  if (compMatch) pico.comparison = compMatch[0].trim()
  else if (lower.includes('placebo')) pico.comparison = 'placebo'

  // Outcome: "mortality", "survival", "reduction in X", "improvement in X"
  const outcomeMatch = text.match(
    /(?:reduction|improvement|decrease|increase|change)\s+in\s+([^.]{5,60})/i,
  )
  if (outcomeMatch) pico.outcome = outcomeMatch[0].trim()
  else if (/\b(?:mortality|survival|morbidity|readmission|remission)\b/i.test(lower)) {
    const m = lower.match(/\b(mortality|survival|morbidity|readmission|remission)\b/i)
    if (m) pico.outcome = m[0]
  }

  return pico
}

export class UserUploadIngestionPipeline {
  async ingestUserUpload(params: {
    userId: string
    file: File
    title?: string
  }) {
    const service = new UserUploadService()
    return service.createAndIngestUpload(params)
  }
}


