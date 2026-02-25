import { parseArgs } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { searchMedicalEvidence, resultsToCitations } from '../lib/evidence';
import { average, computeRankingMetrics } from '../lib/evidence/metrics';
import type { EvidenceSearchOptions } from '../lib/evidence/types';
import { createClient } from '@supabase/supabase-js';

type EvalExpectations = {
  pmids?: string[];
  journals?: string[];
};

type EvalCase = {
  id: string;
  query: string;
  tags?: string[];
  expectations?: EvalExpectations;
};

type EvalCaseResult = {
  id: string;
  query: string;
  tags: string[];
  resultCount: number;
  uniquePmids: number;
  topEvidenceLevel: number | null;
  latestYear: number | null;
  metrics?: {
    pmid?: ReturnType<typeof computeRankingMetrics>;
    journal?: ReturnType<typeof computeRankingMetrics>;
  };
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function loadEnvFiles() {
  const envPaths = [
    resolveProjectPath('.env'),
    resolveProjectPath('.env.local'),
  ];

  envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      loadEnv({ path: envPath });
    }
  });
}

function ensureEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function evaluateCase(caseItem: EvalCase, options: EvidenceSearchOptions): Promise<EvalCaseResult> {
  const results = await searchMedicalEvidence({ ...options, query: caseItem.query });
  const citations = resultsToCitations(results);

  const pmids = citations
    .map(citation => citation.pmid)
    .filter((pmid): pmid is string => Boolean(pmid));

  const journals = citations.map(citation => citation.journal);
  const years = citations
    .map(citation => citation.year)
    .filter((year): year is number => typeof year === 'number');

  const topEvidenceLevel = citations.length
    ? Math.min(...citations.map(citation => citation.evidenceLevel))
    : null;
  const latestYear = years.length ? Math.max(...years) : null;

  let metrics: EvalCaseResult['metrics'];

  if (caseItem.expectations?.pmids && caseItem.expectations.pmids.length > 0) {
    const expected = new Set(caseItem.expectations.pmids);
    metrics = {
      ...metrics,
      pmid: computeRankingMetrics(pmids, expected, options.maxResults ?? 8),
    };
  }

  if (caseItem.expectations?.journals && caseItem.expectations.journals.length > 0) {
    const expected = new Set(caseItem.expectations.journals);
    metrics = {
      ...metrics,
      journal: computeRankingMetrics(journals, expected, options.maxResults ?? 8),
    };
  }

  return {
    id: caseItem.id,
    query: caseItem.query,
    tags: caseItem.tags ?? [],
    resultCount: citations.length,
    uniquePmids: new Set(pmids).size,
    topEvidenceLevel,
    latestYear,
    metrics,
  };
}

async function main() {
  loadEnvFiles();
  ensureEnvVars();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'data/eval/medical_queries.json' },
      limit: { type: 'string' },
      'max-results': { type: 'string', default: '8' },
      'min-evidence-level': { type: 'string', default: '5' },
      'candidate-multiplier': { type: 'string', default: '5' },
      'min-year': { type: 'string' },
      'no-rerank': { type: 'boolean' },
      out: { type: 'string' },
    },
  });

  const inputPath = resolveProjectPath(values.input || 'data/eval/medical_queries.json');
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const dataset = JSON.parse(raw) as EvalCase[];

  const limit = values.limit ? parseInt(values.limit, 10) : dataset.length;
  const maxResults = parseInt(values['max-results'] || '8', 10);
  const minEvidenceLevel = parseInt(values['min-evidence-level'] || '5', 10);
  const candidateMultiplier = parseInt(values['candidate-multiplier'] || '5', 10);
  const minYear = values['min-year'] ? parseInt(values['min-year'], 10) : undefined;
  const enableRerank = !values['no-rerank'];

  const options: EvidenceSearchOptions = {
    query: '',
    maxResults,
    minEvidenceLevel,
    candidateMultiplier,
    enableRerank,
    queryExpansion: true,
    minYear,
    minMedicalConfidence: 0.25,
    forceEvidence: true,
    supabaseClient,
  };

  const cases = dataset.slice(0, limit);
  const results: EvalCaseResult[] = [];

  for (const caseItem of cases) {
    console.log(`\n🔎 Evaluating: ${caseItem.id} — ${caseItem.query}`);
    const result = await evaluateCase(caseItem, options);
    results.push(result);
    console.log(`   Results: ${result.resultCount} | Top evidence: ${result.topEvidenceLevel ?? 'n/a'} | Latest year: ${result.latestYear ?? 'n/a'}`);
  }

  const resultCounts = results.map(result => result.resultCount);
  const evidenceLevels = results
    .map(result => result.topEvidenceLevel)
    .filter((level): level is number => typeof level === 'number');
  const latestYears = results
    .map(result => result.latestYear)
    .filter((year): year is number => typeof year === 'number');

  const summary = {
    totalCases: results.length,
    avgResults: average(resultCounts),
    avgTopEvidenceLevel: evidenceLevels.length ? average(evidenceLevels) : null,
    avgLatestYear: latestYears.length ? average(latestYears) : null,
  };

  console.log('\n=== Evidence Retrieval Summary ===');
  console.log(`Cases: ${summary.totalCases}`);
  console.log(`Avg results: ${summary.avgResults.toFixed(2)}`);
  console.log(`Avg top evidence level: ${summary.avgTopEvidenceLevel ?? 'n/a'}`);
  console.log(`Avg latest year: ${summary.avgLatestYear ?? 'n/a'}`);

  const output = {
    summary,
    results,
  };

  if (values.out) {
    const outputPath = resolveProjectPath(values.out);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Wrote output to ${outputPath}`);
  }
}

main().catch(error => {
  console.error('Evaluation failed:', error);
  process.exit(1);
});
