#!/usr/bin/env npx ts-node

/**
 * Check Environment Variables
 * 
 * Verifies that all required environment variables are set
 * without exposing their values.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Load environment variables
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

if (existsSync(envLocalPath)) {
  config({ path: envLocalPath });
}
if (existsSync(envPath)) {
  config({ path: envPath });
}

const requiredVars = {
  'NEXT_PUBLIC_SUPABASE_URL': {
    description: 'Supabase project URL',
    where: 'Supabase Dashboard → Settings → API → Project URL',
    example: 'https://xxxxx.supabase.co',
  },
  'SUPABASE_SERVICE_ROLE_KEY': {
    description: 'Supabase service role key (for ingestion)',
    where: 'Supabase Dashboard → Settings → API → Service Role Key',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  'OPENAI_API_KEY': {
    description: 'OpenAI API key for embeddings',
    where: 'https://platform.openai.com/api-keys',
    example: 'sk-...',
  },
};

const optionalVars = {
  'NCBI_API_KEY': {
    description: 'NCBI API key (optional, increases rate limits)',
    where: 'https://www.ncbi.nlm.nih.gov/account/settings/',
    example: 'your_ncbi_key',
  },
};

console.log('\n🔍 Environment Variables Check\n');
console.log('='.repeat(60));

let allPresent = true;

// Check required variables
console.log('\n✅ Required Variables:\n');
for (const [varName, info] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  const isPresent = !!value;
  const status = isPresent ? '✅' : '❌';
  
  console.log(`${status} ${varName}`);
  console.log(`   Description: ${info.description}`);
  console.log(`   Where to find: ${info.where}`);
  
  if (isPresent) {
    // Show first/last few chars for verification (not the full value)
    const preview = value.length > 20 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
      : '***';
    console.log(`   Value: ${preview} (${value.length} chars)`);
  } else {
    console.log(`   Value: MISSING`);
    allPresent = false;
  }
  console.log('');
}

// Check optional variables
console.log('\n📋 Optional Variables:\n');
for (const [varName, info] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  const isPresent = !!value;
  const status = isPresent ? '✅' : '⚪';
  
  console.log(`${status} ${varName}`);
  console.log(`   Description: ${info.description}`);
  console.log(`   Where to find: ${info.where}`);
  if (isPresent) {
    const preview = value.length > 20 
      ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
      : '***';
    console.log(`   Value: ${preview} (${value.length} chars)`);
  } else {
    console.log(`   Value: Not set (optional)`);
  }
  console.log('');
}

console.log('='.repeat(60));

if (allPresent) {
  console.log('\n✅ All required environment variables are set!');
  console.log('You can now run: npm run ingest -- --topic "hypertension treatment"\n');
  process.exit(0);
} else {
  console.log('\n❌ Some required environment variables are missing.');
  console.log('\nTo fix:');
  console.log('1. Open your .env or .env.local file');
  console.log('2. Add the missing variables shown above');
  console.log('3. Run this check again: npm run check-env\n');
  process.exit(1);
}





