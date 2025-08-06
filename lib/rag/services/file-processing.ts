import { createClient } from '@/lib/supabase/server'
import { embeddingService } from '../core/embeddings'
import { DocumentChunk, ProcessingStatus } from '../core/types'

export interface FileProcessingOptions {
  chunkSize?: number
  overlapSize?: number
  maxFileSize?: number
  supportedTypes?: string[]
}

export class FileProcessingService {
  private static instance: FileProcessingService
  private readonly defaultChunkSize = 1000
  private readonly defaultOverlapSize = 200
  private readonly defaultMaxFileSize = 50 * 1024 * 1024 // 50MB
  private readonly defaultSupportedTypes = ['pdf', 'docx', 'pptx', 'txt']

  static getInstance(): FileProcessingService {
    if (!FileProcessingService.instance) {
      FileProcessingService.instance = new FileProcessingService()
    }
    return FileProcessingService.instance
  }

  async processFile(
    file: File,
    userId: string,
    options: FileProcessingOptions = {}
  ): Promise<{ success: boolean; materialId?: string; error?: string }> {
    try {
      // Validate file
      const validation = this.validateFile(file, options)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      const supabase = await createClient()
      if (!supabase) {
        return { success: false, error: 'Supabase client not available' }
      }

      // Upload file to storage
      const filePath = await this.uploadFile(file, userId)
      
      // Extract text from file
      const extractedText = await this.extractTextFromFile(file)
      
      // Create study material record
      const { data: material, error: materialError } = await supabase
        .from('study_materials')
        .insert({
          title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
          material_type: this.getMaterialType(file.name),
          content: extractedText,
          file_url: filePath,
          file_name: file.name,
          file_type: file.type,
          user_id: userId,
          processing_status: 'pending'
        })
        .select()
        .single()

      if (materialError || !material) {
        return { success: false, error: 'Failed to create material record' }
      }

      // Process in background
      this.processMaterialInBackground(material.id, extractedText, userId)

      return { success: true, materialId: material.id }
    } catch (error) {
      console.error('File processing failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private validateFile(file: File, options: FileProcessingOptions): { valid: boolean; error?: string } {
    const maxFileSize = options.maxFileSize || this.defaultMaxFileSize
    const supportedTypes = options.supportedTypes || this.defaultSupportedTypes

    if (file.size > maxFileSize) {
      return { valid: false, error: `File size exceeds ${maxFileSize / (1024 * 1024)}MB limit` }
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!fileExtension || !supportedTypes.includes(fileExtension)) {
      return { valid: false, error: `Unsupported file type. Supported: ${supportedTypes.join(', ')}` }
    }

    return { valid: true }
  }

  private async uploadFile(file: File, userId: string): Promise<string> {
    const supabase = await createClient()
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `study-materials/${userId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    return filePath
  }

  private async extractTextFromFile(file: File): Promise<string> {
    // For now, we'll handle basic text files
    // In a full implementation, you'd use libraries like pdf-parse, mammoth, etc.
    
    if (file.type === 'text/plain') {
      return await file.text()
    }

    // For other file types, we'll need to implement proper extraction
    // This is a placeholder - you'll need to add actual PDF/DOCX parsing
    throw new Error(`Text extraction not yet implemented for ${file.type}`)
  }

  private getMaterialType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase()
    
    switch (extension) {
      case 'pdf':
        return 'textbook'
      case 'docx':
        return 'notes'
      case 'pptx':
        return 'lecture'
      case 'txt':
        return 'notes'
      default:
        return 'document'
    }
  }

  private async processMaterialInBackground(
    materialId: string,
    content: string,
    userId: string
  ): Promise<void> {
    try {
      // Update status to processing
      await this.updateProcessingStatus(materialId, 'processing')

      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(`${materialId}\n\n${content}`)

      // Update material with embedding
      const supabase = await createClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      await supabase
        .from('study_materials')
        .update({
          combined_embedding: embedding,
          last_embedded_at: new Date().toISOString(),
          processing_status: 'completed'
        })
        .eq('id', materialId)

      // Create chunks for large files
      if (content.length > 5000) {
        await this.createDocumentChunks(materialId, content, userId)
      }

    } catch (error) {
      console.error('Background processing failed:', error)
      await this.updateProcessingStatus(materialId, 'failed', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private async createDocumentChunks(
    materialId: string,
    content: string,
    userId: string
  ): Promise<void> {
    const chunks = this.splitTextIntoChunks(content)
    
    const supabase = await createClient()
    if (!supabase) {
      throw new Error('Supabase client not available')
    }

    // Generate embeddings for chunks
    const chunkEmbeddings = await embeddingService.generateEmbeddings(
      chunks.map(chunk => chunk.content)
    )

    // Insert chunks with embeddings
    const chunkRecords = chunks.map((chunk, index) => ({
      document_id: materialId,
      user_id: userId,
      chunk_index: index,
      content: chunk.content,
      embedding: chunkEmbeddings[index]?.embedding || null,
      metadata: chunk.metadata
    }))

    await supabase
      .from('document_chunks')
      .insert(chunkRecords)
  }

  private splitTextIntoChunks(
    text: string,
    options: { chunkSize?: number; overlapSize?: number } = {}
  ): Array<{ content: string; metadata: Record<string, any> }> {
    const chunkSize = options.chunkSize || this.defaultChunkSize
    const overlapSize = options.overlapSize || this.defaultOverlapSize

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const chunks: Array<{ content: string; metadata: Record<string, any> }> = []
    let currentChunk = ''
    let startIndex = 0

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]
      
      if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            start_index: startIndex,
            end_index: startIndex + currentChunk.length,
            sentence_count: currentChunk.split(/[.!?]+/).length
          }
        })

        // Start new chunk with overlap
        const overlapStart = Math.max(0, currentChunk.length - overlapSize)
        currentChunk = currentChunk.substring(overlapStart) + '\n\n' + sentence
        startIndex = startIndex + overlapStart
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + sentence
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          start_index: startIndex,
          end_index: startIndex + currentChunk.length,
          sentence_count: currentChunk.split(/[.!?]+/).length
        }
      })
    }

    return chunks
  }

  private async updateProcessingStatus(
    materialId: string,
    status: ProcessingStatus['status'],
    error?: string
  ): Promise<void> {
    const supabase = await createClient()
    if (!supabase) return

    await supabase
      .from('study_materials')
      .update({
        processing_status: status,
        ...(error && { search_metadata: { error } })
      })
      .eq('id', materialId)
  }

  async getProcessingStatus(materialId: string): Promise<ProcessingStatus> {
    const supabase = await createClient()
    if (!supabase) {
      return { status: 'failed', error: 'Supabase client not available' }
    }

    const { data, error } = await supabase
      .from('study_materials')
      .select('processing_status, search_metadata')
      .eq('id', materialId)
      .single()

    if (error || !data) {
      return { status: 'failed', error: 'Material not found' }
    }

    return {
      status: data.processing_status as ProcessingStatus['status'],
      error: data.search_metadata?.error
    }
  }
}

// Export singleton instance
export const fileProcessingService = FileProcessingService.getInstance() 