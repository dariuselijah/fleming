#!/usr/bin/env npx ts-node

/**
 * High-Performance PubMed Ingestion for 1M+ Articles
 * 
 * Features:
 * - Parallel processing with worker pools
 * - Checkpoint/resume system
 * - Optimized batch sizes
 * - Progress tracking and persistence
 * - Comprehensive topic coverage
 * 
 * Usage:
 *   npm run ingest:scale -- --workers 10 --max-per-topic 10000
 *   npm run ingest:scale -- --resume --checkpoint checkpoint.json
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'util';

// Load environment variables
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envLocalPath)) config({ path: envLocalPath });
if (existsSync(envPath)) config({ path: envPath });

import {
  ingestPubMedTopic,
  type IngestionConfig,
  type IngestionResult,
} from '../lib/pubmed';

interface Checkpoint {
  version: string;
  startTime: string;
  lastUpdate: string;
  topics: {
    topic: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    articlesProcessed: number;
    chunksCreated: number;
    errors: number;
    startedAt?: string;
    completedAt?: string;
  }[];
  stats: {
    totalTopics: number;
    completedTopics: number;
    totalArticles: number;
    totalChunks: number;
    totalErrors: number;
  };
}

/**
 * Comprehensive topic list for 1M+ articles
 * Organized by medical specialty
 */
function getComprehensiveTopics(): string[] {
  return [
    // === CARDIOVASCULAR (100K+ articles) ===
    'hypertension treatment',
    'hypertension management',
    'atrial fibrillation',
    'atrial fibrillation management',
    'heart failure',
    'heart failure therapy',
    'coronary artery disease',
    'coronary artery disease treatment',
    'myocardial infarction',
    'acute coronary syndrome',
    'hyperlipidemia',
    'hyperlipidemia treatment',
    'statin therapy',
    'anticoagulation',
    'antiplatelet therapy',
    'arrhythmia treatment',
    'valvular heart disease',
    'peripheral artery disease',
    'stroke prevention',
    'stroke treatment',
    
    // === METABOLIC/ENDOCRINE (80K+ articles) ===
    'type 2 diabetes',
    'type 2 diabetes management',
    'diabetes mellitus treatment',
    'diabetes complications',
    'insulin therapy',
    'diabetic nephropathy',
    'diabetic retinopathy',
    'obesity',
    'obesity treatment',
    'obesity pharmacotherapy',
    'metabolic syndrome',
    'thyroid disorders',
    'hypothyroidism',
    'hyperthyroidism',
    'thyroid cancer',
    'adrenal disorders',
    'osteoporosis',
    'osteoporosis treatment',
    'osteoporosis prevention',
    
    // === RESPIRATORY (60K+ articles) ===
    'asthma',
    'asthma treatment',
    'asthma management',
    'COPD',
    'COPD treatment',
    'COPD exacerbation',
    'pneumonia',
    'pneumonia treatment',
    'pneumonia antibiotic',
    'pulmonary embolism',
    'interstitial lung disease',
    'sleep apnea',
    'sleep apnea treatment',
    'bronchiectasis',
    'cystic fibrosis',
    
    // === INFECTIOUS DISEASE (100K+ articles) ===
    'COVID-19',
    'COVID-19 treatment',
    'COVID-19 vaccine',
    'sepsis',
    'sepsis treatment',
    'urinary tract infection',
    'urinary tract infection antibiotic',
    'skin infection',
    'soft tissue infection',
    'cellulitis',
    'pneumonia antibiotic',
    'meningitis',
    'endocarditis',
    'osteomyelitis',
    'tuberculosis',
    'tuberculosis treatment',
    'HIV',
    'HIV treatment',
    'hepatitis C',
    'hepatitis C treatment',
    'hepatitis B',
    'influenza',
    'influenza vaccine',
    
    // === MENTAL HEALTH (80K+ articles) ===
    'major depressive disorder',
    'depression treatment',
    'antidepressant',
    'generalized anxiety disorder',
    'anxiety treatment',
    'bipolar disorder',
    'bipolar disorder treatment',
    'schizophrenia',
    'schizophrenia treatment',
    'insomnia',
    'insomnia treatment',
    'PTSD',
    'PTSD treatment',
    'ADHD',
    'ADHD treatment',
    'autism spectrum disorder',
    'eating disorders',
    'substance use disorder',
    
    // === PAIN MANAGEMENT (50K+ articles) ===
    'chronic pain',
    'chronic pain management',
    'migraine',
    'migraine treatment',
    'neuropathic pain',
    'neuropathic pain treatment',
    'fibromyalgia',
    'fibromyalgia treatment',
    'osteoarthritis pain',
    'rheumatoid arthritis pain',
    
    // === GASTROENTEROLOGY (60K+ articles) ===
    'GERD',
    'GERD treatment',
    'peptic ulcer disease',
    'inflammatory bowel disease',
    'Crohn disease',
    'ulcerative colitis',
    'irritable bowel syndrome',
    'IBS treatment',
    'hepatitis',
    'liver cirrhosis',
    'nonalcoholic fatty liver disease',
    'pancreatitis',
    'gastrointestinal bleeding',
    
    // === MUSCULOSKELETAL (50K+ articles) ===
    'osteoarthritis',
    'osteoarthritis treatment',
    'rheumatoid arthritis',
    'rheumatoid arthritis treatment',
    'gout',
    'gout treatment',
    'systemic lupus erythematosus',
    'ankylosing spondylitis',
    'psoriatic arthritis',
    'osteoporosis',
    'fracture prevention',
    'back pain',
    'low back pain',
    
    // === ONCOLOGY (150K+ articles) ===
    'breast cancer',
    'breast cancer treatment',
    'breast cancer screening',
    'colorectal cancer',
    'colorectal cancer treatment',
    'colorectal cancer screening',
    'lung cancer',
    'lung cancer treatment',
    'lung cancer screening',
    'prostate cancer',
    'prostate cancer treatment',
    'prostate cancer screening',
    'pancreatic cancer',
    'liver cancer',
    'gastric cancer',
    'ovarian cancer',
    'cervical cancer',
    'endometrial cancer',
    'leukemia',
    'lymphoma',
    'melanoma',
    'cancer immunotherapy',
    'chemotherapy',
    'targeted therapy',
    
    // === NEPHROLOGY (40K+ articles) ===
    'chronic kidney disease',
    'CKD treatment',
    'end stage renal disease',
    'dialysis',
    'kidney transplantation',
    'acute kidney injury',
    'nephrotic syndrome',
    'glomerulonephritis',
    'hypertension kidney',
    
    // === NEUROLOGY (80K+ articles) ===
    'Alzheimer disease',
    'Alzheimer treatment',
    'dementia',
    'dementia treatment',
    'Parkinson disease',
    'Parkinson treatment',
    'epilepsy',
    'epilepsy treatment',
    'multiple sclerosis',
    'MS treatment',
    'stroke',
    'stroke treatment',
    'transient ischemic attack',
    'migraine',
    'headache',
    'peripheral neuropathy',
    
    // === DERMATOLOGY (30K+ articles) ===
    'psoriasis',
    'psoriasis treatment',
    'atopic dermatitis',
    'eczema',
    'acne',
    'acne treatment',
    'melanoma',
    'basal cell carcinoma',
    'squamous cell carcinoma',
    
    // === UROLOGY (30K+ articles) ===
    'benign prostatic hyperplasia',
    'BPH treatment',
    'prostate cancer',
    'kidney stones',
    'urinary incontinence',
    'erectile dysfunction',
    'overactive bladder',
    
    // === PREVENTIVE MEDICINE (50K+ articles) ===
    'vaccination',
    'immunization',
    'screening',
    'preventive care',
    'health promotion',
    'cardiovascular prevention',
    'cancer prevention',
    'aspirin prevention',
    
    // === EMERGENCY MEDICINE (40K+ articles) ===
    'sepsis',
    'shock',
    'trauma',
    'cardiac arrest',
    'acute coronary syndrome',
    'stroke acute',
    'pulmonary embolism',
    
    // === PEDIATRICS (60K+ articles) ===
    'pediatric asthma',
    'pediatric diabetes',
    'pediatric obesity',
    'ADHD',
    'autism',
    'vaccination',
    'febrile seizure',
    'bronchiolitis',
    
    // === WOMEN HEALTH (40K+ articles) ===
    'menopause',
    'hormone replacement therapy',
    'osteoporosis',
    'breast cancer',
    'cervical cancer',
    'endometriosis',
    'polycystic ovary syndrome',
    'PCOS',
    'preeclampsia',
    
    // === GERIATRICS (30K+ articles) ===
    'frailty',
    'falls prevention',
    'polypharmacy',
    'delirium',
    'dementia',
    'geriatric care',
    
    // === PRIMARY CARE (50K+ articles) ===
    'hypertension',
    'diabetes',
    'hyperlipidemia',
    'depression',
    'anxiety',
    'chronic pain',
    'preventive care',
    'screening',
    
    // === SURGERY (40K+ articles) ===
    'surgical outcomes',
    'perioperative care',
    'surgical complications',
    'minimally invasive surgery',
    'robotic surgery',
    
    // === CRITICAL CARE (30K+ articles) ===
    'sepsis',
    'acute respiratory distress syndrome',
    'ARDS',
    'mechanical ventilation',
    'shock',
    'multiple organ failure',
    
    // === PHARMACOLOGY (50K+ articles) ===
    'drug interactions',
    'adverse drug reactions',
    'pharmacogenomics',
    'medication safety',
    'polypharmacy',
    'drug efficacy',
    
    // === EVIDENCE-BASED MEDICINE (30K+ articles) ===
    'systematic review',
    'meta-analysis',
    'randomized controlled trial',
    'clinical guidelines',
    'evidence-based practice',
    'clinical decision making',
  ];
}

/**
 * Load checkpoint from file
 */
function loadCheckpoint(file: string): Checkpoint | null {
  if (!existsSync(file)) return null;
  try {
    const content = readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to load checkpoint: ${e}`);
    return null;
  }
}

/**
 * Save checkpoint to file
 */
function saveCheckpoint(file: string, checkpoint: Checkpoint) {
  try {
    checkpoint.lastUpdate = new Date().toISOString();
    writeFileSync(file, JSON.stringify(checkpoint, null, 2));
  } catch (e) {
    console.error(`Failed to save checkpoint: ${e}`);
  }
}

/**
 * Process topics in parallel batches
 */
async function processTopicsInBatches(
  topics: string[],
  config: IngestionConfig,
  workers: number,
  checkpointFile?: string
): Promise<IngestionResult[]> {
  let checkpoint: Checkpoint | null = null;
  
  if (checkpointFile) {
    checkpoint = loadCheckpoint(checkpointFile);
    if (checkpoint) {
      console.log(`\n📋 Resuming from checkpoint: ${checkpoint.stats.completedTopics}/${checkpoint.stats.totalTopics} topics completed`);
    }
  }
  
  // Initialize checkpoint if needed
  if (!checkpoint) {
    checkpoint = {
      version: '1.0',
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      topics: topics.map(topic => ({
        topic,
        status: 'pending' as const,
        articlesProcessed: 0,
        chunksCreated: 0,
        errors: 0,
      })),
      stats: {
        totalTopics: topics.length,
        completedTopics: 0,
        totalArticles: 0,
        totalChunks: 0,
        totalErrors: 0,
      },
    };
  }
  
  const results: IngestionResult[] = [];
  const pendingTopics = checkpoint.topics.filter(t => t.status === 'pending' || t.status === 'processing');
  
  console.log(`\n🚀 Starting ingestion with ${workers} workers`);
  console.log(`📊 Total topics: ${topics.length}, Pending: ${pendingTopics.length}, Completed: ${checkpoint.stats.completedTopics}`);
  
  // Process in batches of workers
  for (let i = 0; i < pendingTopics.length; i += workers) {
    const batch = pendingTopics.slice(i, i + workers);
    
    // Update status to processing
    batch.forEach(topicInfo => {
      const topicEntry = checkpoint!.topics.find(t => t.topic === topicInfo.topic);
      if (topicEntry) {
        topicEntry.status = 'processing';
        topicEntry.startedAt = new Date().toISOString();
      }
    });
    if (checkpointFile) saveCheckpoint(checkpointFile, checkpoint!);
    
    // Process batch in parallel
    const batchPromises = batch.map(async (topicInfo) => {
      try {
        const result = await ingestPubMedTopic(topicInfo.topic, config);
        
        // Update checkpoint
        const topicEntry = checkpoint!.topics.find(t => t.topic === topicInfo.topic);
        if (topicEntry) {
          topicEntry.status = result.success ? 'completed' : 'failed';
          topicEntry.articlesProcessed = result.articlesProcessed;
          topicEntry.chunksCreated = result.chunksCreated;
          topicEntry.errors = result.errors.length;
          topicEntry.completedAt = new Date().toISOString();
          
          checkpoint!.stats.completedTopics++;
          checkpoint!.stats.totalArticles += result.articlesProcessed;
          checkpoint!.stats.totalChunks += result.chunksCreated;
          checkpoint!.stats.totalErrors += result.errors.length;
        }
        
        return result;
      } catch (error) {
        const topicEntry = checkpoint!.topics.find(t => t.topic === topicInfo.topic);
        if (topicEntry) {
          topicEntry.status = 'failed';
          topicEntry.errors = 1;
          topicEntry.completedAt = new Date().toISOString();
        }
        
        return {
          success: false,
          topic: topicInfo.topic,
          articlesProcessed: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          errors: [{
            stage: 'fetch' as const,
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          }],
          duration: 0,
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Save checkpoint after each batch
    if (checkpointFile) {
      saveCheckpoint(checkpointFile, checkpoint!);
      console.log(`\n💾 Checkpoint saved: ${checkpoint!.stats.completedTopics}/${checkpoint!.stats.totalTopics} topics`);
    }
    
    // Progress update
    const completed = checkpoint!.stats.completedTopics;
    const total = checkpoint!.stats.totalTopics;
    const pct = Math.round((completed / total) * 100);
    console.log(`\n📈 Progress: ${completed}/${total} (${pct}%) | Articles: ${checkpoint!.stats.totalArticles.toLocaleString()} | Chunks: ${checkpoint!.stats.totalChunks.toLocaleString()}`);
    
    // Delay between worker batches to prevent database overload (3s for 5 workers)
    if (i + workers < pendingTopics.length) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  return results;
}

async function main() {
  const { values } = parseArgs({
    options: {
      workers: { type: 'string', default: '5' },
      'max-per-topic': { type: 'string', default: '5000' },
      'from-year': { type: 'string', default: '2010' },
      'to-year': { type: 'string', default: String(new Date().getFullYear()) },
      'high-evidence': { type: 'boolean' },
      'checkpoint': { type: 'string', default: 'ingestion-checkpoint.json' },
      'resume': { type: 'boolean' },
      'topics-file': { type: 'string' },
      'ncbi-key': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  
  if (values.help) {
    console.log(`
High-Performance PubMed Ingestion for 1M+ Articles

Usage:
  npm run ingest:scale [options]

Options:
  --workers <N>              Number of parallel workers (default: 5)
  --max-per-topic <N>        Max articles per topic (default: 5000)
  --from-year <year>         Start year (default: 2010)
  --to-year <year>           End year (default: current)
  --high-evidence            Filter to high-evidence types only
  --checkpoint <file>        Checkpoint file path (default: ingestion-checkpoint.json)
  --resume                   Resume from checkpoint
  --topics-file <file>       Custom topics file (one per line)
  --ncbi-key <key>           NCBI API key for higher rate limits
  --help                     Show this help

Examples:
  # Start fresh ingestion with 10 workers
  npm run ingest:scale -- --workers 10 --max-per-topic 10000
  
  # Resume from checkpoint
  npm run ingest:scale -- --resume --workers 10
  
  # Custom topics file
  npm run ingest:scale -- --topics-file my-topics.txt --workers 8
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
  
  // Get topics
  let topics: string[];
  if (values['topics-file']) {
    const fs = await import('fs');
    topics = fs.readFileSync(values['topics-file'], 'utf-8')
      .split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  } else {
    topics = getComprehensiveTopics();
  }
  
  const workers = parseInt(values.workers || '5', 10);
  const maxPerTopic = parseInt(values['max-per-topic'] || '5000', 10);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('  High-Performance PubMed Ingestion');
  console.log(`${'='.repeat(70)}\n`);
  console.log(`📊 Configuration:`);
  console.log(`   Topics: ${topics.length}`);
  console.log(`   Workers: ${workers}`);
  console.log(`   Max per topic: ${maxPerTopic.toLocaleString()}`);
  console.log(`   Date range: ${values['from-year']}-${values['to-year']}`);
  console.log(`   High-evidence filter: ${values['high-evidence'] ? 'Yes' : 'No'}`);
  console.log(`   Estimated articles: ~${(topics.length * maxPerTopic).toLocaleString()}`);
  console.log(`   Checkpoint file: ${values.checkpoint}\n`);
  
  const config: IngestionConfig = {
    topics,
    maxArticlesPerTopic: maxPerTopic,
    chunkingStrategy: 'hybrid',
    dateRange: {
      from: parseInt(values['from-year'] || '2010', 10),
      to: parseInt(values['to-year'] || String(new Date().getFullYear()), 10),
    },
    languages: ['english'],
    requireAbstract: true,
    humanOnly: true,
    publicationTypes: values['high-evidence'] ? [
      'Meta-Analysis',
      'Systematic Review',
      'Randomized Controlled Trial',
      'Clinical Trial',
      'Practice Guideline',
    ] : undefined,
    ncbiApiKey: values['ncbi-key'] || process.env.NCBI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    batchSize: 100, // Reduced for better storage reliability
    delayBetweenBatches: 2500, // 2.5s delay for 5 workers to prevent overload
  };
  
  const startTime = Date.now();
  
  try {
    const results = await processTopicsInBatches(
      topics,
      config,
      workers,
      values.checkpoint as string
    );
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    const totalArticles = results.reduce((sum, r) => sum + r.articlesProcessed, 0);
    const totalChunks = results.reduce((sum, r) => sum + r.chunksCreated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('  Ingestion Complete');
    console.log(`${'='.repeat(70)}`);
    console.log(`   Topics processed: ${results.length}`);
    console.log(`   Total articles: ${totalArticles.toLocaleString()}`);
    console.log(`   Total chunks: ${totalChunks.toLocaleString()}`);
    console.log(`   Total errors: ${totalErrors}`);
    console.log(`   Duration: ${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m ${duration % 60}s`);
    console.log(`   Rate: ${Math.round(totalArticles / (duration / 60))} articles/minute\n`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

