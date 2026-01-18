#!/usr/bin/env npx ts-node

/**
 * Bulk Import from PubMed XML Dumps
 * 
 * Processes PubMed XML files directly (much faster than API calls)
 * Supports:
 * - Direct XML file processing
 * - Streaming for large files
 * - Parallel processing
 * - Checkpoint/resume
 * - Filtering by date, evidence level, etc.
 * 
 * Usage:
 *   npm run ingest:bulk -- --file pubmed_data.xml
 *   npm run ingest:bulk -- --dir ./pubmed-dumps --workers 10
 *   npm run ingest:bulk -- --file data.xml --from-year 2020 --high-evidence
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'util';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

// Load environment variables
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envLocalPath)) config({ path: envLocalPath });
if (existsSync(envPath)) config({ path: envPath });

import { parseEnhancedPubMedXML } from '../lib/pubmed/parser';
import { chunkArticle } from '../lib/pubmed/chunking';
import { generateEmbeddings } from '../lib/rag/embeddings';
import { storeMedicalEvidence, getExistingPmids } from '../lib/pubmed/storage';
import type { MedicalEvidenceChunk, EnhancedPubMedArticle } from '../lib/pubmed/types';

interface BulkImportCheckpoint {
  version: string;
  startTime: string;
  lastUpdate: string;
  files: {
    path: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    articlesProcessed: number;
    chunksCreated: number;
    errors: number;
    startedAt?: string;
    completedAt?: string;
  }[];
  stats: {
    totalFiles: number;
    completedFiles: number;
    totalArticles: number;
    totalChunks: number;
    totalErrors: number;
  };
}

/**
 * Stream-based XML parser for large files
 * Processes XML in chunks to avoid loading entire file into memory
 */
class StreamingXMLParser extends Transform {
  private buffer: string = '';
  private articleBuffer: string = '';
  private inArticle: boolean = false;
  private depth: number = 0;
  private articlesProcessed: number = 0;

  constructor(
    private onArticle: (xml: string) => void,
    private batchSize: number = 100
  ) {
    super({ objectMode: true });
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    this.buffer += chunk.toString('utf-8');
    
    let startIdx = 0;
    while (true) {
      if (!this.inArticle) {
        // Look for <PubmedArticle>
        const articleStart = this.buffer.indexOf('<PubmedArticle>', startIdx);
        if (articleStart === -1) break;
        
        this.inArticle = true;
        this.depth = 1;
        this.articleBuffer = '<PubmedArticle>';
        startIdx = articleStart + 15;
      }
      
      // Process until we find </PubmedArticle>
      let i = startIdx;
      while (i < this.buffer.length && this.inArticle) {
        const char = this.buffer[i];
        this.articleBuffer += char;
        
        if (char === '<') {
          // Check for opening or closing tag
          const nextChars = this.buffer.substring(i, Math.min(i + 16, this.buffer.length));
          if (nextChars.startsWith('<PubmedArticle>')) {
            this.depth++;
            i += 15;
            continue;
          } else if (nextChars.startsWith('</PubmedArticle>')) {
            this.depth--;
            if (this.depth === 0) {
              // Complete article found
              this.articleBuffer += '</PubmedArticle>';
              this.onArticle(this.articleBuffer);
              this.articlesProcessed++;
              this.articleBuffer = '';
              this.inArticle = false;
              i += 16;
              startIdx = i;
              break;
            } else {
              i += 16;
              continue;
            }
          }
        }
        i++;
      }
      
      if (!this.inArticle) continue;
      break;
    }
    
    // Keep unprocessed buffer
    if (this.inArticle) {
      this.buffer = this.articleBuffer + this.buffer.substring(startIdx);
      this.articleBuffer = '';
    } else {
      this.buffer = this.buffer.substring(startIdx);
    }
    
    callback();
  }

  _flush(callback: Function) {
    // Process any remaining buffer
    if (this.articleBuffer && this.inArticle) {
      this.onArticle(this.articleBuffer);
    }
    callback();
  }
}

/**
 * Process a single XML file
 */
async function processXMLFile(
  filePath: string,
  config: {
    fromYear?: number;
    toYear?: number;
    highEvidence?: boolean;
    batchSize?: number;
    embeddingBatchSize?: number;
    openaiApiKey?: string;
  }
): Promise<{
  success: boolean;
  articlesProcessed: number;
  chunksCreated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let articlesProcessed = 0;
  let chunksCreated = 0;
  const allChunks: Array<MedicalEvidenceChunk & { embedding?: number[] }> = [];
  
  console.log(`\n📄 Processing file: ${filePath}`);
  
  try {
    // Check file size
    const stats = statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   File size: ${fileSizeMB} MB`);
    
    // For smaller files (< 100MB), load entirely for faster processing
    // For larger files, use streaming
    const useStreaming = stats.size > 100 * 1024 * 1024; // 100MB
    
    if (useStreaming) {
      console.log(`   Using streaming parser for large file...`);
      await processFileStreaming(filePath, config, {
        onArticle: async (articleXml: string) => {
          try {
            const articles = parseEnhancedPubMedXML(articleXml);
            for (const article of articles) {
              // Apply filters
              if (config.fromYear && article.publicationDate.year && article.publicationDate.year < config.fromYear) {
                continue;
              }
              if (config.toYear && article.publicationDate.year && article.publicationDate.year > config.toYear) {
                continue;
              }
              if (config.highEvidence && article.evidenceLevel > 2) {
                continue;
              }
              
              const chunks = chunkArticle(article, {
                strategy: 'hybrid',
                includeTitle: true,
                includeMesh: true,
                includeStudyInfo: true,
              });
              
              allChunks.push(...chunks.map(c => ({ ...c })));
              articlesProcessed++;
              chunksCreated += chunks.length;
              
              // Process in batches
              if (allChunks.length >= (config.batchSize || 1000)) {
                await processBatch(allChunks.splice(0, allChunks.length), config);
              }
            }
          } catch (error) {
            errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
      });
    } else {
      // Load entire file
      console.log(`   Loading file into memory...`);
      const xmlContent = readFileSync(filePath, 'utf-8');
      const articles = parseEnhancedPubMedXML(xmlContent);
      
      console.log(`   Found ${articles.length} articles, processing...`);
      
      // Filter articles
      const filteredArticles = articles.filter(article => {
        if (config.fromYear && article.publicationDate.year && article.publicationDate.year < config.fromYear) {
          return false;
        }
        if (config.toYear && article.publicationDate.year && article.publicationDate.year > config.toYear) {
          return false;
        }
        if (config.highEvidence && article.evidenceLevel > 2) {
          return false;
        }
        return true;
      });
      
      console.log(`   ${filteredArticles.length} articles after filtering`);
      
      // Check for existing PMIDs
      const pmids = filteredArticles.map(a => a.pmid);
      const existingPmids = await getExistingPmids(pmids);
      const newArticles = filteredArticles.filter(a => !existingPmids.has(a.pmid));
      
      console.log(`   ${existingPmids.size} already exist, processing ${newArticles.length} new articles`);
      
      // Process in batches
      const batchSize = config.batchSize || 500;
      for (let i = 0; i < newArticles.length; i += batchSize) {
        const batch = newArticles.slice(i, i + batchSize);
        
        for (const article of batch) {
          try {
            const chunks = chunkArticle(article, {
              strategy: 'hybrid',
              includeTitle: true,
              includeMesh: true,
              includeStudyInfo: true,
            });
            
            allChunks.push(...chunks.map(c => ({ ...c })));
            articlesProcessed++;
            chunksCreated += chunks.length;
          } catch (error) {
            errors.push(`Chunk error for PMID ${article.pmid}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        
        // Process batch when it reaches size
        if (allChunks.length >= batchSize) {
          await processBatch(allChunks.splice(0, allChunks.length), config);
        }
      }
    }
    
    // Process remaining chunks
    if (allChunks.length > 0) {
      await processBatch(allChunks, config);
    }
    
    console.log(`✅ Completed: ${articlesProcessed} articles, ${chunksCreated} chunks`);
    
    return {
      success: errors.length === 0,
      articlesProcessed,
      chunksCreated,
      errors,
    };
  } catch (error) {
    errors.push(`File processing error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      articlesProcessed,
      chunksCreated,
      errors,
    };
  }
}

/**
 * Process file using streaming (for large files)
 */
async function processFileStreaming(
  filePath: string,
  config: any,
  callbacks: { onArticle: (xml: string) => Promise<void> }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const parser = new StreamingXMLParser(async (xml) => {
      await callbacks.onArticle(xml);
    });
    
    fileStream.on('error', reject);
    parser.on('error', reject);
    parser.on('finish', resolve);
    
    fileStream.pipe(parser);
  });
}

/**
 * Process a batch of chunks (generate embeddings and store)
 */
async function processBatch(
  chunks: Array<MedicalEvidenceChunk & { embedding?: number[] }>,
  config: {
    embeddingBatchSize?: number;
    openaiApiKey?: string;
  }
): Promise<void> {
  if (chunks.length === 0) return;
  
  // Generate embeddings
  const embeddingBatchSize = config.embeddingBatchSize || 200;
  const chunksWithEmbeddings: Array<MedicalEvidenceChunk & { embedding: number[] }> = [];
  
  for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
    const batch = chunks.slice(i, i + embeddingBatchSize);
    try {
      const texts = batch.map(c => c.contentWithContext);
      const embeddings = await generateEmbeddings(texts, config.openaiApiKey);
      
      for (let j = 0; j < batch.length; j++) {
        chunksWithEmbeddings.push({
          ...batch[j],
          embedding: embeddings[j],
        });
      }
    } catch (error) {
      console.error(`Embedding batch error: ${error}`);
    }
  }
  
  // Store in database
  if (chunksWithEmbeddings.length > 0) {
    const result = await storeMedicalEvidence(chunksWithEmbeddings, {
      batchSize: 50, // Larger batch for bulk import
    });
    
    if (!result.success) {
      console.error(`Storage errors: ${result.errors.length}`);
    }
  }
}

/**
 * Load checkpoint
 */
function loadCheckpoint(file: string): BulkImportCheckpoint | null {
  if (!existsSync(file)) return null;
  try {
    const content = readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Save checkpoint
 */
function saveCheckpoint(file: string, checkpoint: BulkImportCheckpoint) {
  checkpoint.lastUpdate = new Date().toISOString();
  writeFileSync(file, JSON.stringify(checkpoint, null, 2));
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      dir: { type: 'string', short: 'd' },
      workers: { type: 'string', default: '5' },
      'from-year': { type: 'string' },
      'to-year': { type: 'string' },
      'high-evidence': { type: 'boolean' },
      'batch-size': { type: 'string', default: '500' },
      'embedding-batch-size': { type: 'string', default: '200' },
      checkpoint: { type: 'string', default: 'bulk-import-checkpoint.json' },
      resume: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  
  if (values.help) {
    console.log(`
Bulk Import from PubMed XML Dumps

Usage:
  npm run ingest:bulk [options]

Options:
  --file <path>              Single XML file to process
  --dir <path>               Directory containing XML files
  --workers <N>              Parallel workers (default: 5)
  --from-year <year>         Filter articles from this year
  --to-year <year>           Filter articles to this year
  --high-evidence            Only high-evidence articles (Level 1-2)
  --batch-size <N>           Processing batch size (default: 500)
  --embedding-batch-size <N> Embedding batch size (default: 200)
  --checkpoint <file>         Checkpoint file path
  --resume                    Resume from checkpoint
  --help                      Show this help

Examples:
  # Process single file
  npm run ingest:bulk -- --file pubmed_data.xml
  
  # Process directory with 10 workers
  npm run ingest:bulk -- --dir ./pubmed-dumps --workers 10
  
  # Filter by year and evidence level
  npm run ingest:bulk -- --file data.xml --from-year 2020 --high-evidence
`);
    process.exit(0);
  }
  
  // Validate environment
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ];
  
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`\n❌ Missing required environment variables: ${missingVars.join(', ')}\n`);
    process.exit(1);
  }
  
  // Get files to process
  let files: string[] = [];
  
  if (values.file) {
    if (!existsSync(values.file)) {
      console.error(`\n❌ File not found: ${values.file}\n`);
      process.exit(1);
    }
    files = [values.file];
  } else if (values.dir) {
    if (!existsSync(values.dir)) {
      console.error(`\n❌ Directory not found: ${values.dir}\n`);
      process.exit(1);
    }
    files = readdirSync(values.dir)
      .filter(f => f.endsWith('.xml') || f.endsWith('.xml.gz'))
      .map(f => resolve(values.dir as string, f));
  } else {
    console.error(`\n❌ Must specify either --file or --dir\n`);
    process.exit(1);
  }
  
  // Load checkpoint if resuming
  let checkpoint: BulkImportCheckpoint | null = null;
  if (values.resume && values.checkpoint) {
    checkpoint = loadCheckpoint(values.checkpoint as string);
    if (checkpoint) {
      console.log(`\n📋 Resuming from checkpoint: ${checkpoint.stats.completedFiles}/${checkpoint.stats.totalFiles} files completed`);
    }
  }
  
  // Initialize checkpoint
  if (!checkpoint) {
    checkpoint = {
      version: '1.0',
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      files: files.map(path => ({
        path,
        status: 'pending' as const,
        articlesProcessed: 0,
        chunksCreated: 0,
        errors: 0,
      })),
      stats: {
        totalFiles: files.length,
        completedFiles: 0,
        totalArticles: 0,
        totalChunks: 0,
        totalErrors: 0,
      },
    };
  }
  
  const workers = parseInt(values.workers || '5', 10);
  const config = {
    fromYear: values['from-year'] ? parseInt(values['from-year'] as string, 10) : undefined,
    toYear: values['to-year'] ? parseInt(values['to-year'] as string, 10) : undefined,
    highEvidence: values['high-evidence'] || false,
    batchSize: parseInt(values['batch-size'] || '500', 10),
    embeddingBatchSize: parseInt(values['embedding-batch-size'] || '200', 10),
    openaiApiKey: process.env.OPENAI_API_KEY,
  };
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('  Bulk Import from PubMed XML');
  console.log(`${'='.repeat(70)}\n`);
  console.log(`📊 Configuration:`);
  console.log(`   Files: ${files.length}`);
  console.log(`   Workers: ${workers}`);
  console.log(`   Batch size: ${config.batchSize}`);
  console.log(`   Date range: ${config.fromYear || 'all'}-${config.toYear || 'all'}`);
  console.log(`   High-evidence only: ${config.highEvidence ? 'Yes' : 'No'}\n`);
  
  // Process files
  const pendingFiles = checkpoint.files.filter(f => f.status === 'pending' || f.status === 'processing');
  
  for (let i = 0; i < pendingFiles.length; i += workers) {
    const batch = pendingFiles.slice(i, i + workers);
    
    // Update status
    batch.forEach(fileInfo => {
      const fileEntry = checkpoint!.files.find(f => f.path === fileInfo.path);
      if (fileEntry) {
        fileEntry.status = 'processing';
        fileEntry.startedAt = new Date().toISOString();
      }
    });
    saveCheckpoint(values.checkpoint as string, checkpoint!);
    
    // Process batch in parallel
    const batchPromises = batch.map(async (fileInfo) => {
      try {
        const result = await processXMLFile(fileInfo.path, config);
        
        const fileEntry = checkpoint!.files.find(f => f.path === fileInfo.path);
        if (fileEntry) {
          fileEntry.status = result.success ? 'completed' : 'failed';
          fileEntry.articlesProcessed = result.articlesProcessed;
          fileEntry.chunksCreated = result.chunksCreated;
          fileEntry.errors = result.errors.length;
          fileEntry.completedAt = new Date().toISOString();
          
          checkpoint!.stats.completedFiles++;
          checkpoint!.stats.totalArticles += result.articlesProcessed;
          checkpoint!.stats.totalChunks += result.chunksCreated;
          checkpoint!.stats.totalErrors += result.errors.length;
        }
        
        return result;
      } catch (error) {
        const fileEntry = checkpoint!.files.find(f => f.path === fileInfo.path);
        if (fileEntry) {
          fileEntry.status = 'failed';
          fileEntry.errors = 1;
          fileEntry.completedAt = new Date().toISOString();
        }
        return {
          success: false,
          articlesProcessed: 0,
          chunksCreated: 0,
          errors: [error instanceof Error ? error.message : String(error)],
        };
      }
    });
    
    await Promise.all(batchPromises);
    saveCheckpoint(values.checkpoint as string, checkpoint!);
    
    const completed = checkpoint!.stats.completedFiles;
    const total = checkpoint!.stats.totalFiles;
    const pct = Math.round((completed / total) * 100);
    console.log(`\n📈 Progress: ${completed}/${total} files (${pct}%) | Articles: ${checkpoint!.stats.totalArticles.toLocaleString()} | Chunks: ${checkpoint!.stats.totalChunks.toLocaleString()}`);
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('  Bulk Import Complete');
  console.log(`${'='.repeat(70)}`);
  console.log(`   Files processed: ${checkpoint.stats.completedFiles}`);
  console.log(`   Total articles: ${checkpoint.stats.totalArticles.toLocaleString()}`);
  console.log(`   Total chunks: ${checkpoint.stats.totalChunks.toLocaleString()}`);
  console.log(`   Total errors: ${checkpoint.stats.totalErrors}\n`);
}

main().catch(console.error);

