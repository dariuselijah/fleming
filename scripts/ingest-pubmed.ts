#!/usr/bin/env npx ts-node

/**
 * PubMed Medical Evidence Ingestion CLI
 * 
 * Ingests PubMed articles for specified topics, chunks them with
 * medical context preservation, generates embeddings, and stores
 * them in Supabase for hybrid RAG search.
 * 
 * Usage:
 *   npx ts-node scripts/ingest-pubmed.ts --topic "hypertension treatment"
 *   npx ts-node scripts/ingest-pubmed.ts --topics-file topics.txt
 *   npx ts-node scripts/ingest-pubmed.ts --recommended --max 100
 * 
 * Environment Variables Required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   NCBI_API_KEY (optional, for higher rate limits)
 */

// Load environment variables from .env files
// This MUST happen before any other imports that use process.env
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

// Load .env.local first (highest priority), then .env
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath });
}
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Also check for .env.local and .env in parent directories (for monorepos)
const parentEnvLocal = resolve(process.cwd(), '..', '.env.local');
const parentEnv = resolve(process.cwd(), '..', '.env');
if (existsSync(parentEnvLocal)) {
  config({ path: parentEnvLocal });
}
if (existsSync(parentEnv)) {
  config({ path: parentEnv });
}

import { parseArgs } from 'util';
import {
  ingestPubMedTopic,
  ingestMultipleTopics,
  getRecommendedTopics,
  getHighEvidencePublicationTypes,
  estimateIngestion,
  type IngestionConfig,
  type IngestionProgress,
} from '../lib/pubmed';
import { storeMedicalEvidence } from '../lib/pubmed/storage';
import { generateEmbeddings } from '../lib/rag/embeddings';
import { parseEnhancedPubMedXML } from '../lib/pubmed/parser';
import { chunkArticle } from '../lib/pubmed/chunking';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logProgress(progress: IngestionProgress) {
  const pct = progress.totalArticles > 0 
    ? Math.round((progress.processedArticles / progress.totalArticles) * 100)
    : 0;
  
  process.stdout.write(
    `\r${colors.cyan}[${progress.topic}]${colors.reset} ` +
    `${progress.processedArticles}/${progress.totalArticles} articles (${pct}%) | ` +
    `${progress.chunksGenerated} chunks | ` +
    `${progress.embeddingsGenerated} embeddings`
  );
}

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    options: {
      topic: { type: 'string', short: 't' },
      'topics-file': { type: 'string', short: 'f' },
      recommended: { type: 'boolean', short: 'r' },
      max: { type: 'string', short: 'm', default: '100' },
      'from-year': { type: 'string', default: '2015' },
      'to-year': { type: 'string', default: String(new Date().getFullYear()) },
      'high-evidence': { type: 'boolean', short: 'h' },
      'dry-run': { type: 'boolean', short: 'd' },
      'ncbi-key': { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Validate environment (skip for dry-run)
  if (!values['dry-run']) {
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
    ];

    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      log(`\nMissing required environment variables: ${missingVars.join(', ')}`, 'red');
      log('\nTo fix this:', 'yellow');
      log('1. Open your .env file in the project root', 'yellow');
      log('2. Add or update these variables:', 'yellow');
      log('', 'reset');
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        log('   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co', 'cyan');
      }
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        log('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key', 'cyan');
        log('   (Find this in Supabase Dashboard → Settings → API → Service Role Key)', 'yellow');
      }
      if (!process.env.OPENAI_API_KEY) {
        log('   OPENAI_API_KEY=sk-your_openai_key', 'cyan');
        log('   (Get this from https://platform.openai.com/api-keys)', 'yellow');
      }
      log('\nOr run with --dry-run to preview without these keys:', 'yellow');
      log('   npm run ingest -- --recommended --dry-run\n', 'cyan');
      process.exit(1);
    }
  }

  // Determine topics to ingest
  let topics: string[] = [];

  if (values.topic) {
    topics = [values.topic];
  } else if (values['topics-file']) {
    const fs = await import('fs');
    const content = fs.readFileSync(values['topics-file'], 'utf-8');
    topics = content.split('\n').map(t => t.trim()).filter(t => t.length > 0);
  } else if (values.recommended) {
    topics = getRecommendedTopics();
  } else {
    log('\nNo topics specified. Use --topic, --topics-file, or --recommended\n', 'yellow');
    printHelp();
    process.exit(1);
  }

  log(`\n${'='.repeat(60)}`, 'bright');
  log('  PubMed Medical Evidence Ingestion', 'cyan');
  log(`${'='.repeat(60)}\n`, 'bright');

  // Build configuration
  const config: IngestionConfig = {
    topics,
    maxArticlesPerTopic: parseInt(values.max || '100', 10),
    chunkingStrategy: 'hybrid',
    dateRange: {
      from: parseInt(values['from-year'] || '2015', 10),
      to: parseInt(values['to-year'] || String(new Date().getFullYear()), 10),
    },
    languages: ['english'],
    requireAbstract: true,
    humanOnly: true,
    publicationTypes: values['high-evidence'] ? getHighEvidencePublicationTypes() : undefined,
    ncbiApiKey: values['ncbi-key'] || process.env.NCBI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    batchSize: 50,
    delayBetweenBatches: 1000,
  };

  // Show configuration
  log('Configuration:', 'bright');
  log(`  Topics: ${topics.length} topic(s)`);
  log(`  Max articles per topic: ${config.maxArticlesPerTopic}`);
  log(`  Date range: ${config.dateRange?.from}-${config.dateRange?.to}`);
  log(`  High-evidence filter: ${values['high-evidence'] ? 'Yes' : 'No'}`);
  log(`  Chunking strategy: ${config.chunkingStrategy}`);
  log(`  NCBI API key: ${config.ncbiApiKey ? 'Provided' : 'Not provided (slower rate limit)'}`);
  log('');

  // Estimate requirements
  const estimate = estimateIngestion(topics, config.maxArticlesPerTopic);
  log('Estimated Requirements:', 'bright');
  log(`  Articles: ~${estimate.estimatedArticles.toLocaleString()}`);
  log(`  Chunks: ~${estimate.estimatedChunks.toLocaleString()}`);
  log(`  Embedding cost: ~$${estimate.estimatedEmbeddingCost.toFixed(2)}`);
  log(`  Time: ~${Math.round(estimate.estimatedTimeMinutes)} minutes`);
  log('');

  if (values['dry-run']) {
    log('Dry run mode - no data will be ingested.\n', 'yellow');
    
    // Show first topic as example
    log(`Topics to ingest:`, 'bright');
    topics.forEach((t, i) => log(`  ${i + 1}. ${t}`));
    log('');
    
    process.exit(0);
  }

  // Confirm before proceeding
  log('Starting ingestion...\n', 'green');

  // Track overall stats
  let totalArticles = 0;
  let totalChunks = 0;
  let totalErrors = 0;
  const startTime = Date.now();

  // Process each topic
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    
    log(`\n[${i + 1}/${topics.length}] ${topic}`, 'bright');
    log('-'.repeat(40));

    try {
      // Ingest topic
      const result = await ingestPubMedTopic(topic, config, logProgress);
      
      console.log(''); // New line after progress
      
      if (result.success) {
        log(`✓ Completed: ${result.articlesProcessed} articles, ${result.chunksCreated} chunks`, 'green');
      } else {
        log(`⚠ Completed with errors: ${result.errors.length} errors`, 'yellow');
        result.errors.forEach(e => log(`  - ${e.stage}: ${e.message}`, 'red'));
      }

      totalArticles += result.articlesProcessed;
      totalChunks += result.chunksCreated;
      totalErrors += result.errors.length;

    } catch (error) {
      log(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`, 'red');
      totalErrors++;
    }
  }

  // Summary
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  log(`\n${'='.repeat(60)}`, 'bright');
  log('  Ingestion Complete', 'cyan');
  log(`${'='.repeat(60)}`, 'bright');
  log(`  Total topics: ${topics.length}`);
  log(`  Total articles: ${totalArticles}`);
  log(`  Total chunks: ${totalChunks}`);
  log(`  Total errors: ${totalErrors}`);
  log(`  Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  log('');

  if (totalErrors > 0) {
    log('Some errors occurred during ingestion. Check the logs above.', 'yellow');
    process.exit(1);
  }

  log('Ingestion completed successfully!', 'green');
}

function printHelp() {
  console.log(`
PubMed Medical Evidence Ingestion CLI

Usage:
  npx ts-node scripts/ingest-pubmed.ts [options]

Options:
  -t, --topic <topic>      Single topic to ingest (e.g., "hypertension treatment")
  -f, --topics-file <file> File with topics (one per line)
  -r, --recommended        Use recommended topics list
  -m, --max <number>       Max articles per topic (default: 100)
  --from-year <year>       Start year for date range (default: 2015)
  --to-year <year>         End year for date range (default: current year)
  -h, --high-evidence      Filter to high-evidence publication types only
  -d, --dry-run            Show what would be ingested without doing it
  --ncbi-key <key>         NCBI API key for higher rate limits
  --help                   Show this help message

Examples:
  # Ingest a single topic
  npx ts-node scripts/ingest-pubmed.ts --topic "diabetes management"

  # Ingest multiple topics from file
  npx ts-node scripts/ingest-pubmed.ts --topics-file my-topics.txt --max 200

  # Ingest recommended topics with high-evidence filter
  npx ts-node scripts/ingest-pubmed.ts --recommended --high-evidence --max 50

  # Dry run to see what would be ingested
  npx ts-node scripts/ingest-pubmed.ts --recommended --dry-run

Environment Variables:
  NEXT_PUBLIC_SUPABASE_URL    Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY   Supabase service role key
  OPENAI_API_KEY              OpenAI API key for embeddings
  NCBI_API_KEY                NCBI API key (optional, for higher rate limits)
`);
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

