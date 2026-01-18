/**
 * Supabase Storage for Medical Evidence
 * 
 * Handles persisting medical evidence chunks to Supabase
 * with upsert support to prevent duplicates.
 */

import type { MedicalEvidenceChunk } from './types';

// Use dynamic import to handle both Next.js and Node.js environments
let supabaseClient: any = null;

/**
 * Simple concurrency limiter for database operations
 * Limits concurrent database writes to prevent overload
 */
class DatabaseConcurrencyLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

// Global limiter for database operations (max 3 concurrent operations)
const dbLimiter = new DatabaseConcurrencyLimiter(3);

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  
  // Try to use @supabase/supabase-js if available (for CLI scripts)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
      );
    }
    
    console.log(`[Storage] Creating Supabase client for: ${supabaseUrl}`);
    
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Test connection by checking if the table exists
    const { error: tableCheckError } = await supabaseClient
      .from('medical_evidence')
      .select('id')
      .limit(1);
    
    if (tableCheckError) {
      console.error('[Storage] Table check failed:', tableCheckError);
      throw new Error(`Table check failed: ${tableCheckError.message}. Did you run the migration?`);
    }
    
    console.log('[Storage] Supabase client ready and table exists');
    return supabaseClient;
  } catch (error: any) {
    console.error('[Storage] Failed to create Supabase client:', error);
    throw new Error(
      `Failed to create Supabase client: ${error?.message || error}`
    );
  }
}

/**
 * Medical evidence record as stored in database
 */
export interface MedicalEvidenceRecord {
  id?: string;
  content: string;
  content_with_context?: string;
  pmid?: string;
  title: string;
  journal_name: string;
  journal_abbrev?: string;
  publication_year?: number;
  doi?: string;
  authors?: string[];
  evidence_level: number;
  study_type?: string;
  sample_size?: number;
  mesh_terms?: string[];
  major_mesh_terms?: string[];
  chemicals?: string[];
  keywords?: string[];
  section_type?: string;
  chunk_index?: number;
  token_estimate?: number;
  embedding?: number[];
}

/**
 * Create a Supabase client for ingestion (uses service role for writes)
 */
export async function createIngestionClient() {
  return await getSupabaseClient();
}

/**
 * Convert a MedicalEvidenceChunk to database record format
 */
export function chunkToRecord(
  chunk: MedicalEvidenceChunk,
  embedding?: number[]
): MedicalEvidenceRecord {
  // Supabase's pgvector expects embedding as array - it will convert to vector type
  // No need to format as string, pass array directly
  return {
    content: chunk.content,
    content_with_context: chunk.contentWithContext,
    pmid: chunk.pmid,
    title: chunk.title,
    journal_name: chunk.journalName,
    publication_year: chunk.publicationYear,
    doi: chunk.doi,
    authors: chunk.authors,
    evidence_level: chunk.evidenceLevel,
    study_type: chunk.studyType,
    sample_size: chunk.sampleSize,
    mesh_terms: chunk.meshTerms,
    major_mesh_terms: chunk.majorMeshTerms,
    chemicals: chunk.chemicals,
    keywords: chunk.keywords,
    section_type: chunk.sectionType,
    chunk_index: chunk.chunkIndex,
    token_estimate: chunk.tokenEstimate,
    embedding: embedding, // Pass array directly - Supabase handles conversion
  };
}

/**
 * Store medical evidence chunks in Supabase
 * Uses upsert to handle duplicates (based on pmid + chunk_index)
 */
/**
 * Recursively insert a batch, splitting it if it times out
 * Handles network errors, timeouts, and server overload (Cloudflare 520)
 */
async function insertBatchWithRetry(
  client: any,
  batch: any[],
  batchLabel: string,
  minBatchSize: number = 5, // Smaller minimum for better retry handling
  maxRetries: number = 5
): Promise<{ stored: number; errors: string[] }> {
  const result: { stored: number; errors: string[] } = { stored: 0, errors: [] };
  
  if (batch.length === 0) return result;
  
  // If batch is already small enough, try direct insert with retries
  if (batch.length <= minBatchSize) {
    let retries = maxRetries;
    while (retries > 0) {
      try {
        // Use concurrency limiter to prevent too many simultaneous database operations
        const response: any = await dbLimiter.execute(() => {
          return client
            .from('medical_evidence')
            .upsert(batch, { 
              onConflict: 'pmid,chunk_index',
              ignoreDuplicates: false
            })
            .select('id');
        });
        
        if (response.error) {
          const errorCode = response.error.code;
          const errorMsg = response.error.message || '';
          const isTimeout = errorCode === '57014' || errorMsg.includes('timeout');
          const isServerError = errorCode === '520' || errorMsg.includes('520') || errorMsg.includes('Cloudflare') || errorMsg.includes('fetch failed');
          
          // Retry on timeout or server errors
          if ((isTimeout || isServerError) && retries > 1 && batch.length > 1) {
            retries--;
            // Exponential backoff: 2s, 4s, 8s, 16s, 32s
            const delay = Math.pow(2, maxRetries - retries) * 1000;
            console.log(`[Storage] ${batchLabel} ${isTimeout ? 'timeout' : 'server error'}, retrying in ${delay/1000}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // If single item still fails, try one at a time
          if (batch.length > 1 && (isTimeout || isServerError)) {
            for (const item of batch) {
              const singleResult = await insertBatchWithRetry(client, [item], batchLabel, 1, 3);
              result.stored += singleResult.stored;
              result.errors.push(...singleResult.errors);
              // Small delay between single inserts
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            return result;
          } else {
            result.errors.push(`${batchLabel}: ${errorMsg || 'Unknown error'}`);
            return result;
          }
        }
        
        if (response.data) {
          result.stored = response.data.length;
        }
        
        return result;
      } catch (error: any) {
        const errorMsg = error?.message || '';
        const isNetworkError = errorMsg.includes('fetch failed') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT');
        
        if (isNetworkError && retries > 1) {
          retries--;
          const delay = Math.pow(2, maxRetries - retries) * 1000;
          console.log(`[Storage] ${batchLabel} network error, retrying in ${delay/1000}s... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        result.errors.push(`${batchLabel}: ${errorMsg || 'Unknown error'}`);
        return result;
      }
    }
    
    return result;
  }
  
  // Try inserting the full batch with retries (with concurrency limiting)
  let retries = maxRetries;
  while (retries > 0) {
    try {
      // Use concurrency limiter to prevent too many simultaneous database operations
      const response: any = await dbLimiter.execute(() => {
        return client
          .from('medical_evidence')
          .upsert(batch, { 
            onConflict: 'pmid,chunk_index',
            ignoreDuplicates: false
          })
          .select('id');
      });
      
      if (response.error) {
        const errorCode = response.error.code;
        const errorMsg = response.error.message || '';
        const isTimeout = errorCode === '57014' || errorMsg.includes('timeout');
        const isServerError = errorCode === '520' || errorMsg.includes('520') || errorMsg.includes('Cloudflare') || errorMsg.includes('fetch failed');
        
        // If timeout or server error, recursively split the batch
        if (isTimeout || isServerError) {
          const midPoint = Math.floor(batch.length / 2);
          const firstHalf = batch.slice(0, midPoint);
          const secondHalf = batch.slice(midPoint);
          
          // Delay before retry (longer for 5 workers)
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Recursively try both halves
          const firstResult = await insertBatchWithRetry(client, firstHalf, `${batchLabel} (first half)`, minBatchSize, maxRetries);
          result.stored += firstResult.stored;
          result.errors.push(...firstResult.errors);
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          const secondResult = await insertBatchWithRetry(client, secondHalf, `${batchLabel} (second half)`, minBatchSize, maxRetries);
          result.stored += secondResult.stored;
          result.errors.push(...secondResult.errors);
          
          return result;
        } else {
          // Non-retryable error
          result.errors.push(`${batchLabel}: ${errorMsg || 'Unknown error'}`);
          return result;
        }
      }
      
      if (response.data) {
        result.stored = response.data.length;
      } else {
        result.errors.push(`${batchLabel}: No data returned`);
      }
      
      return result;
    } catch (error: any) {
      const errorMsg = error?.message || '';
      const isNetworkError = errorMsg.includes('fetch failed') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT');
      
      // On network error, try splitting
      if (isNetworkError && batch.length > minBatchSize) {
        const midPoint = Math.floor(batch.length / 2);
        const firstHalf = batch.slice(0, midPoint);
        const secondHalf = batch.slice(midPoint);
        
        // Delay before retry (longer for 5 workers)
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        const firstResult = await insertBatchWithRetry(client, firstHalf, `${batchLabel} (first half)`, minBatchSize, maxRetries);
        result.stored += firstResult.stored;
        result.errors.push(...firstResult.errors);
        
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        const secondResult = await insertBatchWithRetry(client, secondHalf, `${batchLabel} (second half)`, minBatchSize, maxRetries);
        result.stored += secondResult.stored;
        result.errors.push(...secondResult.errors);
        
        return result;
      } else if (isNetworkError && retries > 1) {
        retries--;
        const delay = Math.pow(2, maxRetries - retries) * 1000;
        console.log(`[Storage] ${batchLabel} network error, retrying in ${delay/1000}s... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      } else {
        result.errors.push(`${batchLabel}: ${errorMsg || 'Unknown error'}`);
        return result;
      }
    }
  }
  
  return result;
}

export async function storeMedicalEvidence(
  chunks: Array<MedicalEvidenceChunk & { embedding?: number[] }>,
  options?: {
    batchSize?: number;
    onProgress?: (stored: number, total: number) => void;
  }
): Promise<{ success: boolean; stored: number; errors: string[] }> {
  const client = await getSupabaseClient();
  // Use smaller default batch size to avoid timeouts (15 is safer for 5 workers)
  const batchSize = options?.batchSize || 15;
  const errors: string[] = [];
  let stored = 0;
  
  // Convert chunks to records
  const records = chunks.map(chunk => chunkToRecord(chunk, chunk.embedding));
  
  // Process in batches with recursive retry logic
  // Track consecutive errors to add longer delays if server is overwhelmed
  let consecutiveErrors = 0;
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    const result = await insertBatchWithRetry(client, batch, `Batch ${batchNumber}`);
    stored += result.stored;
    errors.push(...result.errors);
    
    // Track consecutive errors
    if (result.errors.length > 0) {
      consecutiveErrors++;
    } else {
      consecutiveErrors = 0;
    }
    
    // Log progress every 10 batches
    if (batchNumber % 10 === 0 || i + batchSize >= records.length) {
      console.log(`[Storage] Progress: ${stored}/${records.length} chunks stored`);
    }
    
    options?.onProgress?.(stored, records.length);
    
    // Adaptive delay between batches - longer if server is overwhelmed
    // Dynamically adjust based on batch size and error rate
    if (i + batchSize < records.length) {
      // Base delay scales inversely with batch size (smaller batches = shorter delay)
      const baseDelay = Math.max(1000, 3000 - (batchSize * 10));
      // Error delay increases with consecutive errors
      const errorDelay = Math.min(consecutiveErrors * 2000, 20000); // Max 20s delay
      // Add small jitter to prevent thundering herd
      const jitter = Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, baseDelay + errorDelay + jitter));
    }
  }
  
  return {
    success: errors.length === 0,
    stored,
    errors,
  };
}

/**
 * Check if an article (by PMID) already exists in the database
 */
export async function articleExists(pmid: string): Promise<boolean> {
  const client = await getSupabaseClient();
  
  const { count, error } = await client
    .from('medical_evidence')
    .select('id', { count: 'exact', head: true })
    .eq('pmid', pmid);
  
  if (error) {
    console.error(`Error checking article existence: ${error.message}`);
    return false;
  }
  
  return (count || 0) > 0;
}

/**
 * Get existing PMIDs from a list (for incremental ingestion)
 * Optimized for large batches - processes in chunks to avoid query size limits
 */
export async function getExistingPmids(pmids: string[]): Promise<Set<string>> {
  const client = await getSupabaseClient();
  const existingSet = new Set<string>();
  
  // Process in batches of 1000 to avoid query size limits
  const batchSize = 1000;
  
  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    
    try {
      const { data, error } = await client
        .from('medical_evidence')
        .select('pmid')
        .in('pmid', batch);
      
      if (error) {
        console.error(`Error fetching existing PMIDs (batch ${i / batchSize + 1}): ${error.message}`);
        continue; // Skip this batch but continue with others
      }
      
      (data || []).forEach((row: { pmid?: string }) => {
        if (row.pmid) {
          existingSet.add(row.pmid);
        }
      });
    } catch (error) {
      console.error(`Exception fetching existing PMIDs (batch ${i / batchSize + 1}):`, error);
    }
  }
  
  return existingSet;
}

/**
 * Delete all chunks for an article
 */
export async function deleteArticleChunks(pmid: string): Promise<boolean> {
  const client = await getSupabaseClient();
  
  const { error } = await client
    .from('medical_evidence')
    .delete()
    .eq('pmid', pmid);
  
  if (error) {
    console.error(`Error deleting article: ${error.message}`);
    return false;
  }
  
  return true;
}

/**
 * Get database statistics
 */
export async function getMedicalEvidenceStats(): Promise<{
  totalChunks: number;
  totalArticles: number;
  byEvidenceLevel: Record<number, number>;
  byStudyType: Record<string, number>;
  yearRange: { min: number; max: number };
}> {
  const client = await getSupabaseClient();
  
  // Get total counts
  const { count: totalChunks } = await client
    .from('medical_evidence')
    .select('id', { count: 'exact', head: true });
  
  // Get unique articles
  const { data: articleData } = await client
    .from('medical_evidence')
    .select('pmid')
    .order('pmid');
  
  const uniquePmids = new Set((articleData || []).map((r: { pmid?: string }) => r.pmid));
  
  // Get counts by evidence level
  const { data: levelData } = await client
    .from('medical_evidence')
    .select('evidence_level, pmid');
  
  const byEvidenceLevel: Record<number, number> = {};
  const seenByLevel: Record<number, Set<string>> = {};
  
  for (const row of (levelData || []) as Array<{ evidence_level: number; pmid?: string }>) {
    const level = row.evidence_level;
    if (!seenByLevel[level]) {
      seenByLevel[level] = new Set();
    }
    if (row.pmid && !seenByLevel[level].has(row.pmid)) {
      seenByLevel[level].add(row.pmid);
      byEvidenceLevel[level] = (byEvidenceLevel[level] || 0) + 1;
    }
  }
  
  // Get counts by study type
  const { data: typeData } = await client
    .from('medical_evidence')
    .select('study_type, pmid');
  
  const byStudyType: Record<string, number> = {};
  const seenByType: Record<string, Set<string>> = {};
  
  for (const row of (typeData || []) as Array<{ study_type?: string; pmid?: string }>) {
    const type = row.study_type || 'Unknown';
    if (!seenByType[type]) {
      seenByType[type] = new Set();
    }
    if (row.pmid && !seenByType[type].has(row.pmid)) {
      seenByType[type].add(row.pmid);
      byStudyType[type] = (byStudyType[type] || 0) + 1;
    }
  }
  
  // Get year range
  const { data: yearData } = await client
    .from('medical_evidence')
    .select('publication_year')
    .order('publication_year', { ascending: true })
    .limit(1);
  
  const { data: maxYearData } = await client
    .from('medical_evidence')
    .select('publication_year')
    .order('publication_year', { ascending: false })
    .limit(1);
  
  return {
    totalChunks: totalChunks || 0,
    totalArticles: uniquePmids.size,
    byEvidenceLevel,
    byStudyType,
    yearRange: {
      min: yearData?.[0]?.publication_year || 0,
      max: maxYearData?.[0]?.publication_year || 0,
    },
  };
}

/**
 * Perform hybrid search
 */
export async function hybridSearch(
  queryText: string,
  queryEmbedding: number[],
  options?: {
    matchCount?: number;
    fullTextWeight?: number;
    semanticWeight?: number;
    recencyWeight?: number;
    evidenceBoost?: number;
    minEvidenceLevel?: number;
    filterStudyTypes?: string[];
    filterMeshTerms?: string[];
    minYear?: number;
  }
): Promise<MedicalEvidenceRecord[]> {
  const client = await getSupabaseClient();
  
  const { data, error } = await client.rpc('hybrid_medical_search', {
    query_text: queryText,
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: options?.matchCount || 10,
    full_text_weight: options?.fullTextWeight || 1.0,
    semantic_weight: options?.semanticWeight || 1.0,
    recency_weight: options?.recencyWeight || 0.1,
    evidence_boost: options?.evidenceBoost || 0.2,
    min_evidence_level: options?.minEvidenceLevel || 5,
    filter_study_types: options?.filterStudyTypes || null,
    filter_mesh_terms: options?.filterMeshTerms || null,
    min_year: options?.minYear || null,
  });
  
  if (error) {
    console.error(`Hybrid search error: ${error.message}`);
    throw new Error(`Search failed: ${error.message}`);
  }
  
  return data || [];
}

