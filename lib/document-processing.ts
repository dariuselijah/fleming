import pdfParse from 'pdf-parse'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export interface DocumentContent {
  text: string
  metadata: {
    pageCount?: number
    wordCount?: number
    tables?: number
    images?: number
    extractedAt: string
  }
}

export class DocumentProcessingService {
  /**
   * Extract text content from various document types
   */
  async extractText(file: File): Promise<DocumentContent> {
    const contentType = file.type.toLowerCase()
    
    try {
      if (contentType.startsWith('text/')) {
        return await this.extractFromText(file)
      } else if (contentType === 'application/pdf') {
        return await this.extractFromPdf(file)
      } else if (contentType.includes('word') || contentType.includes('document') || 
                 file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        return await this.extractFromWord(file)
      } else if (contentType.includes('excel') || contentType.includes('spreadsheet') ||
                 file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        return await this.extractFromExcel(file)
      } else if (contentType === 'text/csv') {
        return await this.extractFromCsv(file)
      } else if (contentType.includes('json')) {
        return await this.extractFromJson(file)
      } else {
        throw new Error(`Unsupported file type: ${contentType}`)
      }
    } catch (error) {
      console.error('Document processing error:', error)
      throw new Error(`Failed to extract text from ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async extractFromText(file: File): Promise<DocumentContent> {
    const text = await file.text()
    const words = text.split(/\s+/).filter(word => word.length > 0)
    
    return {
      text,
      metadata: {
        wordCount: words.length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private async extractFromPdf(file: File): Promise<DocumentContent> {
    const arrayBuffer = await file.arrayBuffer()
    const pdfData = await pdfParse(Buffer.from(arrayBuffer))
    
    return {
      text: pdfData.text,
      metadata: {
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).filter((word: string) => word.length > 0).length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private async extractFromWord(file: File): Promise<DocumentContent> {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    
    return {
      text: result.value,
      metadata: {
        wordCount: result.value.split(/\s+/).filter(word => word.length > 0).length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private async extractFromExcel(file: File): Promise<DocumentContent> {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    let allText = ''
    let tableCount = 0
    
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
      
      if (jsonData.length > 0) {
        tableCount++
        // Convert sheet data to readable text
        jsonData.forEach((row: any) => {
          if (Array.isArray(row)) {
            allText += row.join('\t') + '\n'
          }
        })
        allText += '\n'
      }
    })
    
    return {
      text: allText.trim(),
      metadata: {
        tables: tableCount,
        wordCount: allText.split(/\s+/).filter(word => word.length > 0).length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private async extractFromCsv(file: File): Promise<DocumentContent> {
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    
    return {
      text,
      metadata: {
        tables: 1,
        wordCount: text.split(/\s+/).filter(word => word.length > 0).length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private async extractFromJson(file: File): Promise<DocumentContent> {
    const text = await file.text()
    let parsedData: any
    
    try {
      parsedData = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON format')
    }
    
    // Convert JSON to readable text
    const jsonText = this.jsonToReadableText(parsedData)
    
    return {
      text: jsonText,
      metadata: {
        wordCount: jsonText.split(/\s+/).filter(word => word.length > 0).length,
        extractedAt: new Date().toISOString()
      }
    }
  }

  private jsonToReadableText(obj: any, depth: number = 0): string {
    if (depth > 10) return '[Deep object structure]' // Prevent infinite recursion
    
    if (obj === null) return 'null'
    if (obj === undefined) return 'undefined'
    if (typeof obj === 'string') return obj
    if (typeof obj === 'number') return obj.toString()
    if (typeof obj === 'boolean') return obj.toString()
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.jsonToReadableText(item, depth + 1)).join(', ')
    }
    
    if (typeof obj === 'object') {
      const entries = Object.entries(obj)
      if (entries.length === 0) return '{}'
      
      return entries
        .map(([key, value]) => `${key}: ${this.jsonToReadableText(value, depth + 1)}`)
        .join('\n')
    }
    
    return String(obj)
  }

  /**
   * Get a preview of the document content (first 500 characters)
   */
  async getPreview(file: File): Promise<string> {
    try {
      const content = await this.extractText(file)
      return content.text.length > 500 
        ? content.text.substring(0, 500) + '...'
        : content.text
    } catch (error) {
      return `Unable to extract preview from ${file.name}`
    }
  }

  /**
   * Check if a file type is supported for text extraction
   */
  isSupported(file: File): boolean {
    const contentType = file.type.toLowerCase()
    const fileName = file.name.toLowerCase()
    
    return (
      contentType.startsWith('text/') ||
      contentType === 'application/pdf' ||
      contentType.includes('word') ||
      contentType.includes('document') ||
      contentType.includes('excel') ||
      contentType.includes('spreadsheet') ||
      contentType === 'text/csv' ||
      contentType.includes('json') ||
      fileName.endsWith('.docx') ||
      fileName.endsWith('.doc') ||
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls')
    )
  }
}

export const documentProcessingService = new DocumentProcessingService()
