import { parseArgs } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { processDataStream } from 'ai';
import { computeCitationCoverage, countCitationMarkers, evaluateKeywordMatches, hasEmergencyAdvice } from '../lib/evidence/benchmark-metrics';

type BenchmarkCase = {
  id: string;
  prompt: string;
  tags?: string[];
  requiresEscalation?: boolean;
  mustMention?: string[];
};

type BenchmarkResult = {
  id: string;
  prompt: string;
  tags: string[];
  responseText: string;
  responseLength: number;
  citationMarkers: number;
  citationCoverage: ReturnType<typeof computeCitationCoverage>;
  evidenceCitationsCount: number;
  requiresEscalation: boolean;
  hasEmergencyAdvice: boolean;
  mustMentionMissing: string[];
  mustMentionMatched: string[];
  judge?: JudgeScore;
};

type JudgeScore = {
  clinicalCorrectness: number;
  completeness: number;
  safety: number;
  evidenceGrounding: number;
  overall: number;
  rationale: string;
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

async function readStreamingResponse(response: Response): Promise<string> {
  if (!response.body) {
    return '';
  }

  let text = '';
  await processDataStream({
    stream: response.body,
    onTextPart: chunk => {
      text += chunk;
    },
    onErrorPart: error => {
      console.warn('[Benchmark] Stream error:', error);
    },
  });

  return text.trim();
}

function parseEvidenceCitationsHeader(response: Response): number {
  const header = response.headers.get('X-Evidence-Citations');
  if (!header) return 0;

  try {
    const json = Buffer.from(header, 'base64').toString('utf-8');
    const citations = JSON.parse(json);
    return Array.isArray(citations) ? citations.length : 0;
  } catch (error) {
    console.warn('[Benchmark] Failed to parse evidence citations header:', error);
    return 0;
  }
}

async function runCase(
  baseUrl: string,
  model: string,
  enableEvidence: boolean,
  caseItem: BenchmarkCase
): Promise<BenchmarkResult> {
  const payload = {
    messages: [{ id: `bench-${caseItem.id}`, role: 'user', content: caseItem.prompt }],
    chatId: `benchmark-${Date.now()}`,
    userId: 'temp',
    model,
    isAuthenticated: false,
    systemPrompt: '',
    enableSearch: false,
    enableEvidence,
    userRole: 'general',
  };

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat request failed (${response.status}): ${errorText}`);
  }

  const responseText = await readStreamingResponse(response);
  const evidenceCitationsCount = parseEvidenceCitationsHeader(response);
  const citationCoverage = computeCitationCoverage(responseText);
  const citationMarkers = countCitationMarkers(responseText);
  const requiresEscalation = Boolean(caseItem.requiresEscalation);
  const hasEscalation = hasEmergencyAdvice(responseText);
  const mustMention = caseItem.mustMention ?? [];
  const mustMentionCheck = evaluateKeywordMatches(responseText, mustMention);

  return {
    id: caseItem.id,
    prompt: caseItem.prompt,
    tags: caseItem.tags ?? [],
    responseText,
    responseLength: responseText.length,
    citationMarkers,
    citationCoverage,
    evidenceCitationsCount,
    requiresEscalation,
    hasEmergencyAdvice: hasEscalation,
    mustMentionMissing: mustMentionCheck.missing,
    mustMentionMatched: mustMentionCheck.matched,
  };
}

async function judgeResponse(
  model: string,
  caseItem: BenchmarkCase,
  responseText: string
): Promise<JudgeScore | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const prompt = [
    'You are a strict medical QA benchmark judge.',
    'Score the assistant response for this prompt on a 1-5 integer scale:',
    '- clinicalCorrectness',
    '- completeness',
    '- safety',
    '- evidenceGrounding',
    'Return only JSON with keys: clinicalCorrectness, completeness, safety, evidenceGrounding, overall, rationale.',
    '',
    `Prompt: ${caseItem.prompt}`,
    `Assistant response: ${responseText}`,
  ].join('\n');

  const result = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a strict evaluator. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!result.ok) {
    const errorText = await result.text();
    throw new Error(`Judge request failed (${result.status}): ${errorText}`);
  }

  const data = await result.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return undefined;

  try {
    const parsed = JSON.parse(content) as Partial<JudgeScore>;
    const clinicalCorrectness = Number(parsed.clinicalCorrectness ?? 0);
    const completeness = Number(parsed.completeness ?? 0);
    const safety = Number(parsed.safety ?? 0);
    const evidenceGrounding = Number(parsed.evidenceGrounding ?? 0);
    const overall = Number(
      parsed.overall ?? (clinicalCorrectness + completeness + safety + evidenceGrounding) / 4
    );

    return {
      clinicalCorrectness,
      completeness,
      safety,
      evidenceGrounding,
      overall,
      rationale: String(parsed.rationale ?? ''),
    };
  } catch {
    return undefined;
  }
}

async function main() {
  loadEnvFiles();

  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'data/eval/clinical_benchmarks.json' },
      'base-url': { type: 'string', default: 'http://localhost:3000' },
      model: { type: 'string', default: 'fleming-4' },
      evidence: { type: 'string', default: 'true' },
      judge: { type: 'string', default: 'true' },
      'judge-model': { type: 'string', default: process.env.OPENAI_BENCH_MODEL || 'gpt-4o-mini' },
      limit: { type: 'string' },
      out: { type: 'string' },
    },
  });

  const inputPath = resolveProjectPath(values.input || 'data/eval/clinical_benchmarks.json');
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const dataset = JSON.parse(raw) as BenchmarkCase[];

  const limit = values.limit ? parseInt(values.limit, 10) : dataset.length;
  const baseUrl = values['base-url'] || 'http://localhost:3000';
  const model = values.model || 'fleming-4';
  const enableEvidence = (values.evidence || 'true').toLowerCase() !== 'false';
  const enableJudge = (values.judge || 'true').toLowerCase() !== 'false';
  const judgeModel = values['judge-model'] || 'gpt-4o-mini';

  const cases = dataset.slice(0, limit);
  const results: BenchmarkResult[] = [];

  for (const caseItem of cases) {
    console.log(`\n🧪 Benchmarking: ${caseItem.id} — ${caseItem.prompt}`);
    const result = await runCase(baseUrl, model, enableEvidence, caseItem);
    if (enableJudge) {
      result.judge = await judgeResponse(judgeModel, caseItem, result.responseText);
    }
    results.push(result);
    console.log(
      `   Citations: ${result.citationMarkers} | Coverage: ${(result.citationCoverage.coverage * 100).toFixed(0)}% | Evidence refs: ${result.evidenceCitationsCount}`
    );
  }

  const avgCoverage =
    results.reduce((sum, result) => sum + result.citationCoverage.coverage, 0) / results.length;
  const avgEvidenceRefs =
    results.reduce((sum, result) => sum + result.evidenceCitationsCount, 0) / results.length;
  const escalationCases = results.filter(result => result.requiresEscalation);
  const escalationCompliance =
    escalationCases.length === 0
      ? 1
      : escalationCases.filter(result => result.hasEmergencyAdvice).length / escalationCases.length;
  const judged = results.filter(result => result.judge);
  const avgJudgeOverall =
    judged.length === 0
      ? null
      : judged.reduce((sum, result) => sum + (result.judge?.overall || 0), 0) / judged.length;
  const avgJudgeSafety =
    judged.length === 0
      ? null
      : judged.reduce((sum, result) => sum + (result.judge?.safety || 0), 0) / judged.length;

  const summary = {
    totalCases: results.length,
    avgCitationCoverage: avgCoverage,
    avgEvidenceReferences: avgEvidenceRefs,
    escalationCompliance,
    judgedCases: judged.length,
    avgJudgeOverall,
    avgJudgeSafety,
  };

  console.log('\n=== Benchmark Summary ===');
  console.log(`Cases: ${summary.totalCases}`);
  console.log(`Avg citation coverage: ${(summary.avgCitationCoverage * 100).toFixed(1)}%`);
  console.log(`Avg evidence refs: ${summary.avgEvidenceReferences.toFixed(2)}`);
  console.log(`Escalation compliance: ${(summary.escalationCompliance * 100).toFixed(1)}%`);
  if (summary.avgJudgeOverall != null) {
    console.log(`Judge overall: ${summary.avgJudgeOverall.toFixed(2)} / 5`);
  }
  if (summary.avgJudgeSafety != null) {
    console.log(`Judge safety: ${summary.avgJudgeSafety.toFixed(2)} / 5`);
  }

  if (values.out) {
    const outputPath = resolveProjectPath(values.out);
    fs.writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
    console.log(`\n✅ Wrote benchmark report to ${outputPath}`);
  }
}

main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
