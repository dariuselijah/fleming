/**
 * Medical-Aware Chunking Strategy
 * 
 * This module implements chunking strategies specifically designed for
 * medical/clinical text that PRESERVES context essential for accurate retrieval.
 * 
 * Key principles:
 * 1. Never separate drug names from their effects
 * 2. Keep statistical findings with their context
 * 3. Preserve dosage information with the intervention
 * 4. Include study metadata in every chunk for context
 * 5. Respect structured abstract boundaries (IMRAD)
 */

import type {
  EnhancedPubMedArticle,
  MedicalEvidenceChunk,
  ChunkSectionType,
  ChunkingStrategy,
  AbstractSection,
} from './types';

/**
 * Configuration for chunking
 */
export interface ChunkingConfig {
  strategy: ChunkingStrategy;
  maxChunkTokens: number;      // Maximum tokens per chunk (default: 512)
  minChunkTokens: number;      // Minimum tokens per chunk (default: 100)
  overlapTokens: number;       // Overlap for sliding window (default: 50)
  includeTitle: boolean;       // Include article title in each chunk (default: true)
  includeMesh: boolean;        // Include MeSH terms in each chunk (default: true)
  includeStudyInfo: boolean;   // Include study type/sample size (default: true)
}

const DEFAULT_CONFIG: ChunkingConfig = {
  strategy: 'hybrid',
  maxChunkTokens: 512,
  minChunkTokens: 100,
  overlapTokens: 50,
  includeTitle: true,
  includeMesh: true,
  includeStudyInfo: true,
};

/**
 * Approximate token count (1 token ≈ 4 characters for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Main chunking function - routes to appropriate strategy
 */
export function chunkArticle(
  article: EnhancedPubMedArticle,
  config: Partial<ChunkingConfig> = {}
): MedicalEvidenceChunk[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Build context prefix that will be added to each chunk
  const contextPrefix = buildContextPrefix(article, fullConfig);
  
  // Choose chunking strategy
  switch (fullConfig.strategy) {
    case 'by_section':
      return chunkBySection(article, contextPrefix, fullConfig);
    case 'by_sentence':
      return chunkBySentence(article, contextPrefix, fullConfig);
    case 'sliding_window':
      return chunkSlidingWindow(article, contextPrefix, fullConfig);
    case 'hybrid':
    default:
      return chunkHybrid(article, contextPrefix, fullConfig);
  }
}

/**
 * Build the context prefix that goes at the start of each chunk
 * This ensures every chunk contains essential medical context
 */
function buildContextPrefix(
  article: EnhancedPubMedArticle,
  config: ChunkingConfig
): string {
  const parts: string[] = [];
  
  // Title (always most important)
  if (config.includeTitle) {
    parts.push(`[Title: ${article.title}]`);
  }
  
  // Study type and sample size
  if (config.includeStudyInfo) {
    const studyInfo: string[] = [];
    if (article.studyDesign) studyInfo.push(article.studyDesign);
    if (article.sampleSize) studyInfo.push(`n=${article.sampleSize.toLocaleString()}`);
    if (studyInfo.length > 0) {
      parts.push(`[Study: ${studyInfo.join(' | ')}]`);
    }
  }
  
  // Journal and year
  parts.push(`[${article.journal.title}, ${article.publicationDate.year}]`);
  
  // Major MeSH terms (limited to top 5 for conciseness)
  if (config.includeMesh && article.meshHeadings.length > 0) {
    const majorTerms = article.meshHeadings
      .filter(m => m.majorTopic)
      .map(m => m.descriptorName)
      .slice(0, 5);
    
    if (majorTerms.length > 0) {
      parts.push(`[MeSH: ${majorTerms.join(', ')}]`);
    }
  }
  
  return parts.join('\n') + '\n\n';
}

/**
 * HYBRID STRATEGY (Recommended)
 * 
 * Uses section-based chunking for structured abstracts,
 * falls back to sentence-based for unstructured abstracts.
 * This is the best balance of context preservation and chunk size.
 */
function chunkHybrid(
  article: EnhancedPubMedArticle,
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  const chunks: MedicalEvidenceChunk[] = [];
  
  // If structured abstract, use section-based chunking
  if (article.abstractSections && article.abstractSections.length > 1) {
    const sectionChunks = chunkStructuredAbstract(
      article,
      article.abstractSections,
      contextPrefix,
      config
    );
    chunks.push(...sectionChunks);
  } else if (article.abstract) {
    // Unstructured abstract - use smart sentence chunking
    const sentenceChunks = chunkUnstructuredAbstract(
      article,
      article.abstract,
      contextPrefix,
      config
    );
    chunks.push(...sentenceChunks);
  }
  
  return chunks;
}

/**
 * SECTION-BASED STRATEGY
 * 
 * Keeps each structured abstract section as a separate chunk.
 * Merges small sections (like Background + Objective).
 */
function chunkBySection(
  article: EnhancedPubMedArticle,
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  if (!article.abstractSections || article.abstractSections.length === 0) {
    // Fall back to sentence chunking if no sections
    return chunkBySentence(article, contextPrefix, config);
  }
  
  return chunkStructuredAbstract(
    article,
    article.abstractSections,
    contextPrefix,
    config
  );
}

/**
 * Chunk a structured abstract (IMRAD format)
 */
function chunkStructuredAbstract(
  article: EnhancedPubMedArticle,
  sections: AbstractSection[],
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  const chunks: MedicalEvidenceChunk[] = [];
  let chunkIndex = 0;
  
  // Group small sections together
  let currentGroup: AbstractSection[] = [];
  let currentGroupTokens = 0;
  
  for (const section of sections) {
    const sectionTokens = estimateTokens(section.text);
    
    // If this section alone is too large, split it
    if (sectionTokens > config.maxChunkTokens) {
      // First, flush current group if any
      if (currentGroup.length > 0) {
        const chunk = createChunkFromSections(
          article,
          currentGroup,
          contextPrefix,
          chunkIndex++,
          config
        );
        chunks.push(chunk);
        currentGroup = [];
        currentGroupTokens = 0;
      }
      
      // Split large section into smaller chunks
      const splitChunks = splitLargeSection(
        article,
        section,
        contextPrefix,
        chunkIndex,
        config
      );
      chunks.push(...splitChunks);
      chunkIndex += splitChunks.length;
      continue;
    }
    
    // If adding this section would exceed max, flush current group
    if (currentGroupTokens + sectionTokens > config.maxChunkTokens && currentGroup.length > 0) {
      const chunk = createChunkFromSections(
        article,
        currentGroup,
        contextPrefix,
        chunkIndex++,
        config
      );
      chunks.push(chunk);
      currentGroup = [];
      currentGroupTokens = 0;
    }
    
    // Add section to current group
    currentGroup.push(section);
    currentGroupTokens += sectionTokens;
    
    // If group is large enough, flush it
    if (currentGroupTokens >= config.minChunkTokens) {
      const chunk = createChunkFromSections(
        article,
        currentGroup,
        contextPrefix,
        chunkIndex++,
        config
      );
      chunks.push(chunk);
      currentGroup = [];
      currentGroupTokens = 0;
    }
  }
  
  // Flush remaining sections
  if (currentGroup.length > 0) {
    const chunk = createChunkFromSections(
      article,
      currentGroup,
      contextPrefix,
      chunkIndex++,
      config
    );
    chunks.push(chunk);
  }
  
  return chunks;
}

/**
 * Create a chunk from one or more abstract sections
 */
function createChunkFromSections(
  article: EnhancedPubMedArticle,
  sections: AbstractSection[],
  contextPrefix: string,
  chunkIndex: number,
  config: ChunkingConfig
): MedicalEvidenceChunk {
  // Determine section type from the primary section
  const primarySection = sections[0];
  const sectionType = mapLabelToSectionType(primarySection.label);
  
  // Build content with section labels
  const content = sections
    .map(s => `${s.label.toUpperCase()}: ${s.text}`)
    .join('\n\n');
  
  return createChunk(article, content, contextPrefix, sectionType, chunkIndex);
}

/**
 * Split a large section into smaller chunks while preserving sentence boundaries
 */
function splitLargeSection(
  article: EnhancedPubMedArticle,
  section: AbstractSection,
  contextPrefix: string,
  startIndex: number,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  const chunks: MedicalEvidenceChunk[] = [];
  const sectionType = mapLabelToSectionType(section.label);
  const sectionPrefix = `${section.label.toUpperCase()}: `;
  
  // Split into sentences
  const sentences = splitIntoSentences(section.text);
  
  let currentContent = sectionPrefix;
  let currentTokens = estimateTokens(sectionPrefix);
  let chunkIndex = startIndex;
  
  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    // If adding this sentence would exceed max, create chunk
    if (currentTokens + sentenceTokens > config.maxChunkTokens && currentContent.length > sectionPrefix.length) {
      chunks.push(createChunk(article, currentContent.trim(), contextPrefix, sectionType, chunkIndex++));
      
      // Start new chunk with overlap (include last sentence if possible)
      currentContent = sectionPrefix + sentence + ' ';
      currentTokens = estimateTokens(currentContent);
    } else {
      currentContent += sentence + ' ';
      currentTokens += sentenceTokens;
    }
  }
  
  // Don't forget the last chunk
  if (currentContent.length > sectionPrefix.length) {
    chunks.push(createChunk(article, currentContent.trim(), contextPrefix, sectionType, chunkIndex));
  }
  
  return chunks;
}

/**
 * SENTENCE-BASED STRATEGY
 * 
 * Chunks at sentence boundaries, respecting medical context.
 * Good for unstructured abstracts.
 */
function chunkBySentence(
  article: EnhancedPubMedArticle,
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  if (!article.abstract) return [];
  
  return chunkUnstructuredAbstract(article, article.abstract, contextPrefix, config);
}

/**
 * Chunk an unstructured abstract using smart sentence grouping
 */
function chunkUnstructuredAbstract(
  article: EnhancedPubMedArticle,
  abstract: string,
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  const chunks: MedicalEvidenceChunk[] = [];
  const sentences = splitIntoSentences(abstract);
  
  if (sentences.length === 0) return [];
  
  // If the entire abstract fits in one chunk, use it as-is
  const totalTokens = estimateTokens(abstract);
  if (totalTokens <= config.maxChunkTokens) {
    chunks.push(createChunk(article, abstract, contextPrefix, 'full_abstract', 0));
    return chunks;
  }
  
  // Group sentences into chunks
  let currentContent = '';
  let currentTokens = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);
    
    // Check if we should start a new chunk
    if (currentTokens + sentenceTokens > config.maxChunkTokens && currentContent.length > 0) {
      // Create chunk with current content
      chunks.push(createChunk(article, currentContent.trim(), contextPrefix, 'abstract', chunkIndex++));
      
      // Start new chunk - include overlap from previous sentences
      const overlapSentences = getOverlapSentences(sentences, i, config.overlapTokens);
      currentContent = overlapSentences + sentence + ' ';
      currentTokens = estimateTokens(currentContent);
    } else {
      currentContent += sentence + ' ';
      currentTokens += sentenceTokens;
    }
  }
  
  // Don't forget the last chunk
  if (currentContent.trim().length > 0) {
    chunks.push(createChunk(article, currentContent.trim(), contextPrefix, 'abstract', chunkIndex));
  }
  
  return chunks;
}

/**
 * SLIDING WINDOW STRATEGY
 * 
 * Creates overlapping chunks for maximum context preservation.
 * Uses more storage but ensures no context is lost at chunk boundaries.
 */
function chunkSlidingWindow(
  article: EnhancedPubMedArticle,
  contextPrefix: string,
  config: ChunkingConfig
): MedicalEvidenceChunk[] {
  if (!article.abstract) return [];
  
  const chunks: MedicalEvidenceChunk[] = [];
  const sentences = splitIntoSentences(article.abstract);
  
  if (sentences.length === 0) return [];
  
  // Sliding window over sentences
  let windowStart = 0;
  let chunkIndex = 0;
  
  while (windowStart < sentences.length) {
    let windowEnd = windowStart;
    let windowTokens = 0;
    
    // Expand window until we hit max tokens
    while (windowEnd < sentences.length) {
      const sentenceTokens = estimateTokens(sentences[windowEnd]);
      if (windowTokens + sentenceTokens > config.maxChunkTokens && windowEnd > windowStart) {
        break;
      }
      windowTokens += sentenceTokens;
      windowEnd++;
    }
    
    // Create chunk from window
    const content = sentences.slice(windowStart, windowEnd).join(' ');
    chunks.push(createChunk(article, content, contextPrefix, 'abstract', chunkIndex++));
    
    // Slide window forward (with overlap)
    const slideAmount = Math.max(1, Math.floor((windowEnd - windowStart) / 2));
    windowStart += slideAmount;
  }
  
  return chunks;
}

/**
 * Create a MedicalEvidenceChunk with all metadata
 */
function createChunk(
  article: EnhancedPubMedArticle,
  content: string,
  contextPrefix: string,
  sectionType: ChunkSectionType,
  chunkIndex: number
): MedicalEvidenceChunk {
  const contentWithContext = contextPrefix + content;
  
  return {
    content,
    contentWithContext,
    pmid: article.pmid,
    sectionType,
    chunkIndex,
    title: article.title,
    journalName: article.journal.title,
    publicationYear: article.publicationDate.year,
    doi: article.doi,
    authors: article.authors.map(a => 
      a.initials ? `${a.lastName} ${a.initials}` : a.lastName
    ),
    evidenceLevel: article.evidenceLevel,
    studyType: article.studyDesign,
    sampleSize: article.sampleSize,
    meshTerms: article.meshHeadings.map(m => m.descriptorName),
    majorMeshTerms: article.meshHeadings
      .filter(m => m.majorTopic)
      .map(m => m.descriptorName),
    chemicals: article.chemicals.map(c => c.name),
    keywords: article.keywords,
    tokenEstimate: estimateTokens(contentWithContext),
  };
}

/**
 * Split text into sentences, handling medical abbreviations
 */
function splitIntoSentences(text: string): string[] {
  // Protect common medical abbreviations from splitting
  const protectedText = text
    .replace(/\b(Dr|Mr|Mrs|Ms|Jr|Sr)\./gi, '$1<PERIOD>')
    .replace(/\b(et al)\./gi, '$1<PERIOD>')
    .replace(/\b(vs)\./gi, '$1<PERIOD>')
    .replace(/\b(i\.e)\./gi, '$1<PERIOD>')
    .replace(/\b(e\.g)\./gi, '$1<PERIOD>')
    .replace(/\b(Fig)\./gi, '$1<PERIOD>')
    .replace(/\b(Tab)\./gi, '$1<PERIOD>')
    .replace(/\b(Ref)\./gi, '$1<PERIOD>')
    .replace(/\b(No)\./gi, '$1<PERIOD>')
    .replace(/\b(Vol)\./gi, '$1<PERIOD>')
    .replace(/\b(p)\./gi, '$1<PERIOD>')      // p-value notation
    .replace(/\b(n)\./gi, '$1<PERIOD>')      // sample size notation
    .replace(/(\d+)\./gi, '$1<PERIOD>');     // Decimal numbers
  
  // Split on sentence-ending punctuation
  const sentences = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.replace(/<PERIOD>/g, '.').trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

/**
 * Get overlap sentences for context continuity
 */
function getOverlapSentences(
  sentences: string[],
  currentIndex: number,
  targetTokens: number
): string {
  let overlap = '';
  let tokens = 0;
  
  for (let i = currentIndex - 1; i >= 0 && tokens < targetTokens; i--) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);
    
    if (tokens + sentenceTokens <= targetTokens) {
      overlap = sentence + ' ' + overlap;
      tokens += sentenceTokens;
    } else {
      break;
    }
  }
  
  return overlap;
}

/**
 * Map abstract section label to ChunkSectionType
 */
function mapLabelToSectionType(label: string): ChunkSectionType {
  const normalized = label.toLowerCase();
  
  if (normalized.includes('background') || normalized.includes('introduction')) {
    return 'background';
  }
  if (normalized.includes('objective') || normalized.includes('aim') || normalized.includes('purpose')) {
    return 'objective';
  }
  if (normalized.includes('method')) {
    return 'methods';
  }
  if (normalized.includes('result') || normalized.includes('finding')) {
    return 'results';
  }
  if (normalized.includes('conclusion') || normalized.includes('summary')) {
    return 'conclusions';
  }
  if (normalized.includes('discussion')) {
    return 'discussion';
  }
  
  return 'abstract';
}

/**
 * Validate that a chunk maintains medical context integrity
 * This is a sanity check to ensure chunks don't break mid-finding
 */
export function validateChunkIntegrity(chunk: MedicalEvidenceChunk): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const content = chunk.content.toLowerCase();
  
  // Check for incomplete statistical statements
  if (content.includes('p =') || content.includes('p<') || content.includes('ci')) {
    const hasCompleteStat = /p\s*[=<>]\s*[\d.]+|ci\s*[\d.]+\s*-\s*[\d.]+|\d+%/i.test(chunk.content);
    if (!hasCompleteStat) {
      warnings.push('Chunk may have incomplete statistical statement');
    }
  }
  
  // Check for "respectively" without clear antecedents
  if (content.includes('respectively') && !content.includes(' and ')) {
    warnings.push('Chunk has "respectively" without clear paired items');
  }
  
  // Check for dangling references
  if (/\bthe (study|trial|analysis)\b/i.test(content) && chunk.chunkIndex > 0) {
    // This is often fine if title is included, but worth noting
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}





