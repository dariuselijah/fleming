/**
 * Citation Verification System
 * Verifies that citations are valid and detects hallucinations
 */

import { cosineSimilarity } from './embeddings'
import type { CitationChunk, ResponseCitation } from './types'

export interface VerificationResult {
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

export interface CitationMarker {
  index: number
  isQuote: boolean
  quoteText?: string
  claimedContent: string
}

export class CitationVerifier {
  /**
   * Extract citation markers from response text
   * Format: [CITATION:1], [CITATION:1,2,3], [CITATION:1:QUOTE:"text"]
   */
  extractCitationMarkers(response: string): CitationMarker[] {
    const citationRegex = /\[CITATION:(\d+(?:,\d+)*)(?::QUOTE:"([^"]+)")?\]/g
    const markers: CitationMarker[] = []
    let match

    while ((match = citationRegex.exec(response)) !== null) {
      const indices = match[1].split(',').map((n) => parseInt(n, 10))
      const isQuote = !!match[2]
      const quoteText = match[2]

      // Extract surrounding text as claimed content (up to 200 chars)
      const start = Math.max(0, match.index - 100)
      const end = Math.min(response.length, match.index + match[0].length + 100)
      const context = response.substring(start, end)

      indices.forEach((index) => {
        markers.push({
          index,
          isQuote,
          quoteText,
          claimedContent: context,
        })
      })
    }

    return markers
  }

  /**
   * Verify that all citations in response are valid and traceable
   */
  async verifyCitations(
    response: string,
    retrievedCitations: CitationChunk[]
  ): Promise<VerificationResult> {
    const extracted = this.extractCitationMarkers(response)
    const verifications = await Promise.all(
      extracted.map(async (citation) => {
        // 1. Citation number exists in retrieved citations
        const chunk = retrievedCitations[citation.index - 1]
        if (!chunk) {
          return {
            valid: false,
            chunkId: '',
            reason: 'Citation index out of range',
          }
        }

        // 2. For direct quotes, verify exact match or close paraphrase
        if (citation.isQuote && citation.quoteText) {
          const quoteMatch = this.verifyQuote(citation.quoteText, chunk.chunk_text)
          if (!quoteMatch) {
            return {
              valid: false,
              chunkId: chunk.id,
              reason: 'Quote does not match source',
            }
          }
        }

        // 3. Check semantic similarity of claimed content to chunk
        // This would require generating embeddings, so for now we do simple text matching
        const similarity = this.textSimilarity(citation.claimedContent, chunk.chunk_text)

        if (similarity < 0.3) {
          return {
            valid: false,
            chunkId: chunk.id,
            similarity,
            reason: 'Low semantic similarity to source',
          }
        }

        return {
          valid: true,
          chunkId: chunk.id,
          similarity,
        }
      })
    )

    const allValid = verifications.every((v) => v.valid)
    const warnings = verifications.filter((v) => !v.valid)

    return {
      allValid,
      verifications,
      warnings: warnings.map((w, idx) => ({
        claim: extracted[verifications.indexOf(w)]?.claimedContent || '',
        isHallucination: !w.valid,
        maxSimilarity: w.similarity || 0,
      })),
    }
  }

  /**
   * Verify that a quote matches the source text (exact or close paraphrase)
   */
  verifyQuote(quote: string, sourceText: string): boolean {
    // Normalize both texts
    const normalizedQuote = this.normalizeText(quote)
    const normalizedSource = this.normalizeText(sourceText)

    // Check for exact match
    if (normalizedSource.includes(normalizedQuote)) {
      return true
    }

    // Check for significant overlap (at least 70% of quote words appear in source)
    const quoteWords = normalizedQuote.split(/\s+/).filter((w) => w.length > 3)
    const sourceWords = new Set(normalizedSource.split(/\s+/))
    const matchingWords = quoteWords.filter((w) => sourceWords.has(w))

    return matchingWords.length / quoteWords.length >= 0.7
  }

  /**
   * Simple text similarity using word overlap
   * For better results, use embedding-based similarity
   */
  textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.normalizeText(text1).split(/\s+/).filter((w) => w.length > 2))
    const words2 = new Set(this.normalizeText(text2).split(/\s+/).filter((w) => w.length > 2))

    const intersection = new Set([...words1].filter((w) => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return union.size === 0 ? 0 : intersection.size / union.size
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Detect hallucinations - check if response contains unsupported claims
   */
  async detectHallucinations(
    response: string,
    retrievedCitations: CitationChunk[]
  ): Promise<{
    hasHallucinations: boolean
    hallucinations: Array<{
      claim: string
      isHallucination: boolean
      maxSimilarity: number
    }>
  }> {
    // Extract sentences without citations
    const sentences = this.extractUnsupportedSentences(response)

    const hallucinations = await Promise.all(
      sentences.map(async (sentence) => {
        // Calculate max similarity to any retrieved citation
        const similarities = retrievedCitations.map((chunk) =>
          this.textSimilarity(sentence, chunk.chunk_text)
        )
        const maxSimilarity = Math.max(...similarities, 0)

        return {
          claim: sentence,
          isHallucination: maxSimilarity < 0.3, // Threshold for hallucination detection
          maxSimilarity,
        }
      })
    )

    return {
      hasHallucinations: hallucinations.some((h) => h.isHallucination),
      hallucinations: hallucinations.filter((h) => h.isHallucination),
    }
  }

  /**
   * Extract sentences that don't have citations
   */
  private extractUnsupportedSentences(response: string): string[] {
    // Remove citation markers
    const withoutCitations = response.replace(/\[CITATION:\d+(?:,\d+)*(?::QUOTE:"[^"]+")?\]/g, '')

    // Split into sentences
    const sentences = withoutCitations
      .split(/[.!?]+\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20) // Filter out very short fragments

    return sentences
  }
}

