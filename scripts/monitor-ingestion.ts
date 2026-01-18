#!/usr/bin/env npx ts-node

/**
 * Real-Time Ingestion Monitor
 * 
 * Monitors ingestion progress in real-time by watching:
 * - Checkpoint files
 * - Database statistics
 * - System resources (optional)
 * 
 * Usage:
 *   npm run monitor -- --checkpoint ingestion-checkpoint.json
 *   npm run monitor -- --checkpoint checkpoint.json --interval 5
 *   npm run monitor -- --checkpoint checkpoint.json --watch-db
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync, readFileSync, watchFile } from 'node:fs';
import { parseArgs } from 'util';

// Load environment variables
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envLocalPath)) config({ path: envLocalPath });
if (existsSync(envPath)) config({ path: envPath });

interface Checkpoint {
  version?: string;
  startTime?: string;
  lastUpdate?: string;
  topics?: Array<{
    topic: string;
    status: string;
    articlesProcessed: number;
    chunksCreated: number;
    errors: number;
    startedAt?: string;
    completedAt?: string;
  }>;
  files?: Array<{
    path: string;
    status: string;
    articlesProcessed: number;
    chunksCreated: number;
    errors: number;
    startedAt?: string;
    completedAt?: string;
  }>;
  stats: {
    totalTopics?: number;
    totalFiles?: number;
    completedTopics?: number;
    completedFiles?: number;
    totalArticles: number;
    totalChunks: number;
    totalErrors: number;
  };
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Calculate rate (items per minute)
 */
function calculateRate(count: number, durationMs: number): number {
  if (durationMs === 0) return 0;
  return Math.round((count / durationMs) * 60000);
}

/**
 * Get checkpoint data
 */
function getCheckpoint(file: string): Checkpoint | null {
  if (!existsSync(file)) return null;
  try {
    const content = readFileSync(file, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Get database stats (if available)
 */
async function getDatabaseStats(): Promise<{
  totalChunks: number;
  totalArticles: number;
} | null> {
  try {
    const { getMedicalEvidenceStats } = await import('../lib/pubmed/storage');
    const stats = await getMedicalEvidenceStats();
    return {
      totalChunks: stats.totalChunks,
      totalArticles: stats.totalArticles,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Display checkpoint stats
 */
function displayStats(checkpoint: Checkpoint, dbStats: { totalChunks: number; totalArticles: number } | null) {
  // Clear screen (ANSI escape code)
  process.stdout.write('\x1B[2J\x1B[0f');
  
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Ingestion Progress Monitor                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  
  // Overall progress
  const total = checkpoint.stats.totalTopics || checkpoint.stats.totalFiles || 0;
  const completed = checkpoint.stats.completedTopics || checkpoint.stats.completedFiles || 0;
  const pending = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Duration
  let duration = 0;
  if (checkpoint.startTime) {
    duration = Date.now() - new Date(checkpoint.startTime).getTime();
  }
  
  // ETA calculation
  let eta = 0;
  if (completed > 0 && pending > 0) {
    const rate = completed / (duration / 60000); // per minute
    if (rate > 0) {
      eta = (pending / rate) * 60000; // milliseconds
    }
  }
  
  console.log('📊 Overall Progress');
  console.log(`   Completed: ${completed}/${total} (${pct}%)`);
  console.log(`   Pending: ${pending}`);
  console.log(`   Duration: ${formatDuration(duration)}`);
  if (eta > 0) {
    console.log(`   ETA: ${formatDuration(eta)}`);
  }
  console.log();
  
  // Statistics
  console.log('📈 Statistics');
  console.log(`   Articles processed: ${formatNumber(checkpoint.stats.totalArticles)}`);
  console.log(`   Chunks created: ${formatNumber(checkpoint.stats.totalChunks)}`);
  console.log(`   Errors: ${checkpoint.stats.totalErrors}`);
  
  if (duration > 0) {
    const articlesPerMin = calculateRate(checkpoint.stats.totalArticles, duration);
    const chunksPerMin = calculateRate(checkpoint.stats.totalChunks, duration);
    console.log(`   Rate: ${formatNumber(articlesPerMin)} articles/min, ${formatNumber(chunksPerMin)} chunks/min`);
  }
  console.log();
  
  // Database stats (if available)
  if (dbStats) {
    console.log('💾 Database');
    console.log(`   Total articles in DB: ${formatNumber(dbStats.totalArticles)}`);
    console.log(`   Total chunks in DB: ${formatNumber(dbStats.totalChunks)}`);
    console.log();
  }
  
  // Current status
  const items = checkpoint.topics || checkpoint.files || [];
  const processing = items.filter(i => i.status === 'processing');
  const completedItems = items.filter(i => i.status === 'completed');
  const failed = items.filter(i => i.status === 'failed');
  
  if (processing.length > 0) {
    console.log('🔄 Currently Processing');
    processing.slice(0, 5).forEach(item => {
      const name = 'topic' in item ? item.topic : item.path.split('/').pop() || item.path;
      console.log(`   • ${name.substring(0, 60)}`);
      console.log(`     Articles: ${formatNumber(item.articlesProcessed)}, Chunks: ${formatNumber(item.chunksCreated)}`);
    });
    if (processing.length > 5) {
      console.log(`   ... and ${processing.length - 5} more`);
    }
    console.log();
  }
  
  // Recent completions
  if (completedItems.length > 0) {
    const recent = completedItems
      .filter(i => 'completedAt' in i && i.completedAt)
      .sort((a, b) => {
        const aCompleted = 'completedAt' in a ? a.completedAt : undefined;
        const bCompleted = 'completedAt' in b ? b.completedAt : undefined;
        const aTime = aCompleted ? new Date(aCompleted).getTime() : 0;
        const bTime = bCompleted ? new Date(bCompleted).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3);
    
    if (recent.length > 0) {
      console.log('✅ Recently Completed');
      recent.forEach(item => {
        const name = 'topic' in item ? item.topic : item.path.split('/').pop() || item.path;
        console.log(`   • ${name.substring(0, 60)}`);
      });
      console.log();
    }
  }
  
  // Errors
  if (failed.length > 0) {
    console.log('❌ Failed Items');
    failed.slice(0, 5).forEach(item => {
      const name = 'topic' in item ? item.topic : item.path.split('/').pop() || item.path;
      console.log(`   • ${name.substring(0, 60)} (${item.errors} errors)`);
    });
    if (failed.length > 5) {
      console.log(`   ... and ${failed.length - 5} more`);
    }
    console.log();
  }
  
  // Progress bar
  const barWidth = 50;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  console.log(`   [${bar}] ${pct}%`);
  console.log();
  
  console.log(`Last updated: ${new Date(checkpoint.lastUpdate || Date.now()).toLocaleString()}`);
  console.log('Press Ctrl+C to exit');
}

/**
 * Main monitoring loop
 */
async function monitor(checkpointFile: string, options: {
  interval?: number;
  watchDb?: boolean;
}) {
  console.log(`\n🔍 Starting monitor for: ${checkpointFile}`);
  console.log(`   Update interval: ${options.interval || 5} seconds`);
  if (options.watchDb) {
    console.log(`   Database monitoring: enabled`);
  }
  console.log();
  
  let lastDbStats: { totalChunks: number; totalArticles: number } | null = null;
  
  // Initial display
  const checkpoint = getCheckpoint(checkpointFile);
  if (checkpoint) {
    if (options.watchDb) {
      lastDbStats = await getDatabaseStats();
    }
    displayStats(checkpoint, lastDbStats);
  } else {
    console.log('❌ Checkpoint file not found or invalid');
    process.exit(1);
  }
  
  // Watch file for changes
  watchFile(checkpointFile, { interval: (options.interval || 5) * 1000 }, async () => {
    const checkpoint = getCheckpoint(checkpointFile);
    if (checkpoint) {
      if (options.watchDb) {
        lastDbStats = await getDatabaseStats();
      }
      displayStats(checkpoint, lastDbStats);
    }
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      checkpoint: { type: 'string', short: 'c', default: 'ingestion-checkpoint.json' },
      interval: { type: 'string', short: 'i', default: '5' },
      'watch-db': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  
  if (values.help) {
    console.log(`
Real-Time Ingestion Monitor

Usage:
  npm run monitor [options]

Options:
  -c, --checkpoint <file>    Checkpoint file to monitor (default: ingestion-checkpoint.json)
  -i, --interval <seconds>   Update interval in seconds (default: 5)
  --watch-db                  Also monitor database statistics
  --help                      Show this help

Examples:
  # Monitor default checkpoint file
  npm run monitor
  
  # Monitor specific checkpoint with 10s interval
  npm run monitor -- --checkpoint my-checkpoint.json --interval 10
  
  # Monitor with database stats
  npm run monitor -- --watch-db
`);
    process.exit(0);
  }
  
  const checkpointFile = values.checkpoint as string;
  
  if (!existsSync(checkpointFile)) {
    console.error(`\n❌ Checkpoint file not found: ${checkpointFile}\n`);
    process.exit(1);
  }
  
  await monitor(checkpointFile, {
    interval: parseInt(values.interval as string || '5', 10),
    watchDb: values['watch-db'] || false,
  });
}

main().catch(console.error);

