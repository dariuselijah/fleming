/**
 * Enhanced PubMed Types for Medical Evidence Ingestion
 * 
 * These types capture the full richness of PubMed metadata needed
 * for proper evidence grading and medical-context-aware chunking.
 */

/**
 * Evidence levels following the Oxford CEBM hierarchy
 * Lower number = stronger evidence
 */
export type EvidenceLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Structured abstract section from PubMed
 * Many clinical articles use IMRAD structure (Introduction, Methods, Results, and Discussion)
 */
export interface AbstractSection {
  label: string;           // e.g., "BACKGROUND", "METHODS", "RESULTS", "CONCLUSIONS"
  nlmCategory?: string;    // NLM's standardized category
  text: string;
}

/**
 * MeSH (Medical Subject Headings) descriptor
 * Critical for medical context preservation
 */
export interface MeshHeading {
  descriptorName: string;      // e.g., "Metformin"
  descriptorUI?: string;       // Unique identifier
  qualifierNames?: string[];   // e.g., ["therapeutic use", "adverse effects"]
  majorTopic: boolean;         // Is this a major topic of the article?
}

/**
 * Publication type from PubMed
 * Used for evidence level classification
 */
export interface PublicationType {
  name: string;           // e.g., "Randomized Controlled Trial"
  ui?: string;            // Unique identifier
}

/**
 * Chemical/Drug mentioned in the article
 */
export interface Chemical {
  name: string;
  registryNumber?: string;
}

/**
 * Enhanced PubMed article with full metadata
 */
export interface EnhancedPubMedArticle {
  // Core identifiers
  pmid: string;
  doi?: string;
  pmc?: string;                // PubMed Central ID
  
  // Article metadata
  title: string;
  authors: Author[];
  journal: JournalInfo;
  publicationDate: PublicationDate;
  
  // Abstract (can be structured or unstructured)
  abstract?: string;                    // Full abstract text
  abstractSections?: AbstractSection[]; // Structured sections if available
  
  // Medical context (CRITICAL for chunking)
  meshHeadings: MeshHeading[];
  publicationTypes: PublicationType[];
  chemicals: Chemical[];
  keywords: string[];
  
  // Study characteristics
  sampleSize?: number;              // Extracted from abstract if available
  studyDesign?: string;             // Derived from publication types
  
  // Evidence classification
  evidenceLevel: EvidenceLevel;
  
  // URLs
  url: string;
  fullTextUrl?: string;
}

export interface Author {
  lastName: string;
  firstName?: string;
  initials?: string;
  affiliation?: string;
  orcid?: string;
}

export interface JournalInfo {
  title: string;
  isoAbbreviation?: string;
  issn?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  nlmUniqueID?: string;
  impactFactor?: number;        // Can be populated from external source
}

export interface PublicationDate {
  year: number;
  month?: number;
  day?: number;
  medlineDate?: string;         // Sometimes PubMed uses non-standard dates
}

/**
 * A chunk of medical evidence with preserved context
 */
export interface MedicalEvidenceChunk {
  // Content
  content: string;              // The actual text chunk
  contentWithContext: string;   // Content prefixed with medical context
  
  // Source tracking
  pmid: string;
  sectionType: ChunkSectionType;
  chunkIndex: number;           // Order within the article
  
  // Medical context (embedded in chunk for RAG)
  title: string;
  journalName: string;
  publicationYear: number;
  doi?: string;
  authors: string[];            // Formatted as "LastName Initials"
  
  // Evidence metadata
  evidenceLevel: EvidenceLevel;
  studyType?: string;
  sampleSize?: number;
  
  // Medical taxonomy
  meshTerms: string[];          // Just the descriptor names
  majorMeshTerms: string[];     // Terms marked as major topics
  chemicals: string[];
  keywords: string[];
  
  // For embedding generation
  tokenEstimate: number;        // Rough token count
}

export type ChunkSectionType = 
  | 'title'
  | 'abstract'
  | 'background'
  | 'objective'
  | 'methods'
  | 'results'
  | 'conclusions'
  | 'discussion'
  | 'full_abstract';

/**
 * Configuration for PubMed ingestion
 */
export interface IngestionConfig {
  // Search parameters
  topics: string[];
  maxArticlesPerTopic: number;
  
  // Filters
  dateRange?: {
    from: number;    // Year
    to: number;      // Year
  };
  publicationTypes?: string[];    // Filter to specific types
  languages?: string[];           // Default: ["english"]
  requireAbstract?: boolean;      // Default: true
  humanOnly?: boolean;            // Filter to human studies, Default: true
  
  // Evidence filtering
  minEvidenceLevel?: EvidenceLevel;  // Only ingest articles at or above this level
  
  // Processing
  chunkingStrategy: ChunkingStrategy;
  batchSize?: number;             // Articles to process at once
  delayBetweenBatches?: number;   // Rate limiting (ms)
  
  // API keys (optional, will use env vars if not provided)
  openaiApiKey?: string;
  ncbiApiKey?: string;            // NCBI E-utilities API key for higher rate limits
}

export type ChunkingStrategy = 
  | 'by_section'      // Keep structured abstract sections intact
  | 'by_sentence'     // Chunk at sentence boundaries
  | 'sliding_window'  // Overlapping chunks
  | 'hybrid';         // Section-based for structured, sentence for unstructured

/**
 * Ingestion progress tracking
 */
export interface IngestionProgress {
  topic: string;
  totalArticles: number;
  processedArticles: number;
  chunksGenerated: number;
  embeddingsGenerated: number;
  errors: IngestionError[];
  startTime: Date;
  estimatedTimeRemaining?: number;
}

export interface IngestionError {
  pmid?: string;
  stage: 'fetch' | 'parse' | 'chunk' | 'embed' | 'store';
  message: string;
  timestamp: Date;
}

/**
 * Result of batch ingestion
 */
export interface IngestionResult {
  success: boolean;
  topic: string;
  articlesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated: number;
  errors: IngestionError[];
  duration: number;  // milliseconds
}

