/**
 * PubMed Batch Ingestion Pipeline
 * 
 * This module handles the full ingestion pipeline:
 * 1. Search PubMed for articles by topic
 * 2. Fetch full article metadata in batches
 * 3. Parse and extract medical context
 * 4. Chunk with context preservation
 * 5. Generate embeddings
 * 6. Upsert to Supabase
 * 
 * Respects NCBI rate limits:
 * - Without API key: 3 requests/second
 * - With API key: 10 requests/second
 */

import type {
  EnhancedPubMedArticle,
  MedicalEvidenceChunk,
  IngestionConfig,
  IngestionProgress,
  IngestionResult,
  IngestionError,
  EvidenceLevel,
} from './types';
import { parseEnhancedPubMedXML } from './parser';
import { chunkArticle } from './chunking';
import { generateEmbeddings } from '../rag/embeddings';

/**
 * Default NCBI E-utilities base URL
 */
const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Rate limiting delay (ms)
 */
const RATE_LIMIT_DELAY_NO_KEY = 334;  // 3 requests/second
const RATE_LIMIT_DELAY_WITH_KEY = 100; // 10 requests/second

/**
 * Maximum PMIDs per efetch request
 */
const MAX_PMIDS_PER_FETCH = 500;

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: IngestionProgress) => void;

/**
 * Main ingestion function - ingest articles for a topic
 */
export async function ingestPubMedTopic(
  topic: string,
  config: IngestionConfig,
  onProgress?: ProgressCallback
): Promise<IngestionResult> {
  const startTime = Date.now();
  const errors: IngestionError[] = [];
  
  const progress: IngestionProgress = {
    topic,
    totalArticles: 0,
    processedArticles: 0,
    chunksGenerated: 0,
    embeddingsGenerated: 0,
    errors: [],
    startTime: new Date(),
  };
  
  const reportProgress = () => onProgress?.(progress);
  
  try {
    // Step 1: Search for PMIDs
    console.log(`[Ingestion] Searching PubMed for: ${topic}`);
    const pmids = await searchPubMedBatch(topic, config);
    progress.totalArticles = pmids.length;
    reportProgress();
    
    if (pmids.length === 0) {
      return {
        success: true,
        topic,
        articlesProcessed: 0,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }
    
    console.log(`[Ingestion] Found ${pmids.length} articles to process`);
    
    // Step 2: Check for existing PMIDs to avoid duplicate processing
    console.log(`[Ingestion] Checking for existing articles in database...`);
    const { getExistingPmids } = await import('./storage');
    const existingPmids = await getExistingPmids(pmids);
    const newPmids = pmids.filter(pmid => !existingPmids.has(pmid));
    
    if (existingPmids.size > 0) {
      console.log(`[Ingestion] Skipping ${existingPmids.size} existing articles, processing ${newPmids.length} new articles`);
    }
    
    if (newPmids.length === 0) {
      console.log(`[Ingestion] All articles already exist in database`);
      return {
        success: true,
        topic,
        articlesProcessed: pmids.length,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }
    
    // Step 3: Fetch and process in batches
    const allChunks: MedicalEvidenceChunk[] = [];
    const batchSize = config.batchSize || 200; // Increased default batch size
    const delay = config.ncbiApiKey ? RATE_LIMIT_DELAY_WITH_KEY : RATE_LIMIT_DELAY_NO_KEY;
    
    for (let i = 0; i < newPmids.length; i += batchSize) {
      const batchPmids = newPmids.slice(i, i + batchSize);
      
      try {
        // Fetch articles
        const articles = await fetchPubMedBatch(batchPmids, config.ncbiApiKey);
        
        // Filter by evidence level if specified
        const filteredArticles = config.minEvidenceLevel
          ? articles.filter(a => a.evidenceLevel <= config.minEvidenceLevel!)
          : articles;
        
        // Chunk each article
        for (const article of filteredArticles) {
          try {
            const chunks = chunkArticle(article, {
              strategy: config.chunkingStrategy,
              includeTitle: true,
              includeMesh: true,
              includeStudyInfo: true,
            });
            allChunks.push(...chunks);
            progress.chunksGenerated += chunks.length;
          } catch (error) {
            errors.push({
              pmid: article.pmid,
              stage: 'chunk',
              message: error instanceof Error ? error.message : String(error),
              timestamp: new Date(),
            });
          }
        }
        
        progress.processedArticles += batchPmids.length;
        reportProgress();
        
      } catch (error) {
        errors.push({
          stage: 'fetch',
          message: `Batch fetch failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
        });
      }
      
      // Rate limiting
      if (i + batchSize < newPmids.length) {
        await sleep(delay * (batchSize / MAX_PMIDS_PER_FETCH));
      }
    }
    
    console.log(`[Ingestion] Generated ${allChunks.length} chunks`);
    
    // Step 4: Generate embeddings in batches (optimized for scale)
    if (allChunks.length > 0) {
      // Use larger batch size for embeddings (OpenAI supports up to 2048 inputs per request)
      // Dynamically adjust based on chunk count for better throughput
      const embeddingBatchSize = Math.min(200, Math.max(100, Math.floor(allChunks.length / 10)));
      const chunksWithEmbeddings: Array<MedicalEvidenceChunk & { embedding: number[] }> = [];
      
      // Process embeddings in parallel batches (scale with available chunks)
      // More chunks = more parallel batches (up to 5)
      const parallelBatches = Math.min(5, Math.max(2, Math.floor(allChunks.length / 1000) + 2));
      for (let i = 0; i < allChunks.length; i += embeddingBatchSize * parallelBatches) {
        const batchGroup = [];
        for (let j = 0; j < parallelBatches && i + j * embeddingBatchSize < allChunks.length; j++) {
          const batch = allChunks.slice(i + j * embeddingBatchSize, i + (j + 1) * embeddingBatchSize);
          if (batch.length > 0) {
            batchGroup.push(batch);
          }
        }
        
        // Process batches in parallel
        const batchPromises = batchGroup.map(async (batch) => {
          try {
            // Use contentWithContext for embedding (includes medical context)
            const texts = batch.map(c => c.contentWithContext);
            const embeddings = await generateEmbeddings(texts, config.openaiApiKey);
            
            const batchResults: Array<MedicalEvidenceChunk & { embedding: number[] }> = [];
            for (let j = 0; j < batch.length; j++) {
              batchResults.push({
                ...batch[j],
                embedding: embeddings[j],
              });
            }
            
            return batchResults;
          } catch (error) {
            errors.push({
              stage: 'embed',
              message: `Embedding batch failed: ${error instanceof Error ? error.message : String(error)}`,
              timestamp: new Date(),
            });
            return [];
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        chunksWithEmbeddings.push(...batchResults.flat());
        
        progress.embeddingsGenerated = chunksWithEmbeddings.length;
        reportProgress();
      }
      
      console.log(`[Ingestion] Generated ${chunksWithEmbeddings.length} embeddings`);
      
      // Step 5: Store in database (optimized for scale with timeout and network error handling)
      try {
        const { storeMedicalEvidence } = await import('./storage');
        // Use smaller batch size to avoid overwhelming Supabase
        // The storage function will automatically retry on network errors and split batches on timeout
        const storeResult = await storeMedicalEvidence(chunksWithEmbeddings, {
          batchSize: 15, // Optimized for 5 workers and higher success rate
          onProgress: (stored, total) => {
            progress.embeddingsGenerated = stored;
            reportProgress();
          },
        });
        
        if (!storeResult.success) {
          storeResult.errors.forEach(err => {
            errors.push({
              stage: 'store',
              message: err,
              timestamp: new Date(),
            });
          });
        }
        
        console.log(`[Ingestion] Stored ${storeResult.stored} chunks to database`);
      } catch (error) {
        errors.push({
          stage: 'store',
          message: `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date(),
        });
      }
    }
    
    progress.errors = errors;
    reportProgress();
    
    return {
      success: errors.length === 0,
      topic,
      articlesProcessed: progress.processedArticles,
      chunksCreated: progress.chunksGenerated,
      embeddingsGenerated: progress.embeddingsGenerated,
      errors,
      duration: Date.now() - startTime,
    };
    
  } catch (error) {
    errors.push({
      stage: 'fetch',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date(),
    });
    
    return {
      success: false,
      topic,
      articlesProcessed: progress.processedArticles,
      chunksCreated: progress.chunksGenerated,
      embeddingsGenerated: progress.embeddingsGenerated,
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Search PubMed for article PMIDs
 */
async function searchPubMedBatch(
  topic: string,
  config: IngestionConfig
): Promise<string[]> {
  const query = buildPubMedQuery(topic, config);
  
  let url = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${config.maxArticlesPerTopic}&retmode=json`;
  
  if (config.ncbiApiKey) {
    url += `&api_key=${config.ncbiApiKey}`;
  }
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`PubMed search failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

/**
 * Build a PubMed search query with filters
 */
function buildPubMedQuery(topic: string, config: IngestionConfig): string {
  const parts: string[] = [];
  
  // Main topic search
  parts.push(`(${topic}[Title/Abstract])`);
  
  // Date range filter
  if (config.dateRange) {
    parts.push(`(${config.dateRange.from}:${config.dateRange.to}[dp])`);
  }
  
  // Language filter (default: English)
  const languages = config.languages || ['english'];
  if (languages.length > 0) {
    const langFilter = languages.map(l => `${l}[Language]`).join(' OR ');
    parts.push(`(${langFilter})`);
  }
  
  // Require abstract (default: true)
  if (config.requireAbstract !== false) {
    parts.push('(hasabstract[text])');
  }
  
  // Human studies only (default: true)
  if (config.humanOnly !== false) {
    parts.push('(humans[MeSH Terms])');
  }
  
  // Publication type filters
  if (config.publicationTypes && config.publicationTypes.length > 0) {
    const ptFilter = config.publicationTypes
      .map(pt => `"${pt}"[Publication Type]`)
      .join(' OR ');
    parts.push(`(${ptFilter})`);
  }
  
  return parts.join(' AND ');
}

/**
 * Fetch articles by PMIDs in batch
 */
async function fetchPubMedBatch(
  pmids: string[],
  apiKey?: string
): Promise<EnhancedPubMedArticle[]> {
  const allArticles: EnhancedPubMedArticle[] = [];
  
  // Split into sub-batches of MAX_PMIDS_PER_FETCH
  for (let i = 0; i < pmids.length; i += MAX_PMIDS_PER_FETCH) {
    const batch = pmids.slice(i, i + MAX_PMIDS_PER_FETCH);
    
    let url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${batch.join(',')}&retmode=xml`;
    
    if (apiKey) {
      url += `&api_key=${apiKey}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PubMed fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    const articles = parseEnhancedPubMedXML(xmlText);
    allArticles.push(...articles);
    
    // Rate limiting between sub-batches
    if (i + MAX_PMIDS_PER_FETCH < pmids.length) {
      const delay = apiKey ? RATE_LIMIT_DELAY_WITH_KEY : RATE_LIMIT_DELAY_NO_KEY;
      await sleep(delay);
    }
  }
  
  return allArticles;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ingest multiple topics
 */
export async function ingestMultipleTopics(
  topics: string[],
  config: Omit<IngestionConfig, 'topics'>,
  onProgress?: ProgressCallback
): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  
  for (const topic of topics) {
    console.log(`\n[Ingestion] Starting topic: ${topic}`);
    
    const result = await ingestPubMedTopic(
      topic,
      { ...config, topics: [topic] },
      onProgress
    );
    
    results.push(result);
    
    console.log(`[Ingestion] Completed: ${result.articlesProcessed} articles, ${result.chunksCreated} chunks`);
    
    // Delay between topics
    if (topics.indexOf(topic) < topics.length - 1) {
      await sleep(config.delayBetweenBatches || 1000);
    }
  }
  
  return results;
}

/**
 * Get recommended topics for initial ingestion
 * Based on top clinical conditions by prevalence
 */
export function getRecommendedTopics(): string[] {
  return [
    // Cardiovascular
    'hypertension treatment',
    'atrial fibrillation management',
    'heart failure therapy',
    'coronary artery disease',
    'hyperlipidemia statin therapy',
    
    // Metabolic
    'type 2 diabetes management',
    'obesity pharmacotherapy',
    'thyroid disorder treatment',
    
    // Respiratory
    'asthma treatment guidelines',
    'COPD exacerbation management',
    'pneumonia antibiotic therapy',
    
    // Infectious Disease
    'COVID-19 treatment',
    'urinary tract infection antibiotic',
    'skin soft tissue infection',
    
    // Mental Health
    'major depressive disorder treatment',
    'generalized anxiety disorder therapy',
    'insomnia pharmacotherapy',
    
    // Pain Management
    'chronic pain management',
    'migraine acute treatment',
    'neuropathic pain therapy',
    
    // Gastroenterology
    'GERD treatment',
    'inflammatory bowel disease therapy',
    'irritable bowel syndrome management',
    
    // Musculoskeletal
    'osteoarthritis treatment',
    'rheumatoid arthritis therapy',
    'osteoporosis prevention treatment',
    
    // Oncology Screening
    'breast cancer screening',
    'colorectal cancer screening',
    'lung cancer screening',
    
    // Preventive Medicine
    'vaccination adult immunization',
    'preventive cardiovascular aspirin',
  ];
}

/**
 * Get high-evidence publication types for filtering
 */
export function getHighEvidencePublicationTypes(): string[] {
  return [
    'Meta-Analysis',
    'Systematic Review',
    'Randomized Controlled Trial',
    'Clinical Trial',
    'Practice Guideline',
    'Guideline',
    'Comparative Study',
  ];
}

/**
 * Estimate ingestion requirements
 */
export function estimateIngestion(
  topics: string[],
  articlesPerTopic: number
): {
  estimatedArticles: number;
  estimatedChunks: number;
  estimatedEmbeddingCost: number;
  estimatedTimeMinutes: number;
} {
  const estimatedArticles = topics.length * articlesPerTopic;
  // Assume average of 3 chunks per article
  const estimatedChunks = estimatedArticles * 3;
  // OpenAI embedding cost: ~$0.00002 per 1K tokens, assume 500 tokens per chunk
  const estimatedEmbeddingCost = (estimatedChunks * 500 / 1000) * 0.00002;
  // Assume 2 seconds per article (fetch + process + embed)
  const estimatedTimeMinutes = (estimatedArticles * 2) / 60;
  
  return {
    estimatedArticles,
    estimatedChunks,
    estimatedEmbeddingCost,
    estimatedTimeMinutes,
  };
}

