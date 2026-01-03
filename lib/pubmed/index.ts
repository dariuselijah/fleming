/**
 * PubMed Medical Evidence Ingestion System
 * 
 * A complete pipeline for ingesting PubMed articles with:
 * - Full metadata extraction (MeSH, publication types, structured abstracts)
 * - Evidence level classification (1-5 based on CEBM hierarchy)
 * - Medical-context-aware chunking
 * - Batch processing with rate limiting
 * 
 * @example Basic usage
 * ```typescript
 * import { ingestPubMedTopic, getRecommendedTopics } from '@/lib/pubmed';
 * 
 * const result = await ingestPubMedTopic('hypertension treatment', {
 *   topics: ['hypertension treatment'],
 *   maxArticlesPerTopic: 100,
 *   chunkingStrategy: 'hybrid',
 *   dateRange: { from: 2020, to: 2024 },
 * });
 * ```
 * 
 * @example With progress tracking
 * ```typescript
 * await ingestPubMedTopic('diabetes management', config, (progress) => {
 *   console.log(`Processed ${progress.processedArticles}/${progress.totalArticles}`);
 * });
 * ```
 */

// Re-export from api.ts (existing functions)
export {
  searchPubMed,
  fetchPubMedArticle,
  searchPubMedByDOI,
  searchPubMedByTitle,
  type PubMedArticle,
  type PubMedSearchResult,
} from './api';

// Export types
export type {
  EvidenceLevel,
  AbstractSection,
  MeshHeading,
  PublicationType,
  Chemical,
  EnhancedPubMedArticle,
  Author,
  JournalInfo,
  PublicationDate,
  MedicalEvidenceChunk,
  ChunkSectionType,
  IngestionConfig,
  IngestionProgress,
  IngestionResult,
  IngestionError,
  ChunkingStrategy,
} from './types';

// Export parser
export { parseEnhancedPubMedXML } from './parser';

// Export evidence classifier
export {
  classifyEvidenceLevel,
  getEvidenceLevelLabel,
  getEvidenceLevelShortLabel,
  getEvidenceLevelColor,
  getEvidenceLevelDescription,
  calculateEvidenceScore,
  meetsEvidenceThreshold,
} from './evidence-classifier';

// Export chunking
export {
  chunkArticle,
  validateChunkIntegrity,
  type ChunkingConfig,
} from './chunking';

// Export ingestion pipeline
export {
  ingestPubMedTopic,
  ingestMultipleTopics,
  getRecommendedTopics,
  getHighEvidencePublicationTypes,
  estimateIngestion,
  type ProgressCallback,
} from './ingestion';

// Export storage
export {
  storeMedicalEvidence,
  hybridSearch,
  getMedicalEvidenceStats,
  articleExists,
  getExistingPmids,
  deleteArticleChunks,
  createIngestionClient,
  chunkToRecord,
  type MedicalEvidenceRecord,
} from './storage';

