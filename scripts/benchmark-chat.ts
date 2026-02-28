import { parseArgs } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { processDataStream } from 'ai';
import {
  computeCitationCoverage,
  countCitationMarkers,
  extractCitationIndices,
  evaluateKeywordMatches,
  hasEmergencyAdvice,
} from '../lib/evidence/benchmark-metrics';

type BenchmarkCase = {
  id: string;
  prompt: string;
  tags?: string[];
  requiresEscalation?: boolean;
  mustMention?: string[];
  expectGuidelineSource?: boolean;
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
  guidelineHit: boolean;
  citationRelevancePassRate: number;
  topEvidenceLevel: number | null;
  expectGuidelineSource: boolean;
  requiresEscalation: boolean;
  hasEmergencyAdvice: boolean;
  mustMentionMissing: string[];
  mustMentionMatched: string[];
  failureSignals: string[];
  invalidCitationMarkers: number[];
  error?: string;
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

type EvidenceCitationHeader = {
  title?: string;
  journal?: string;
  studyType?: string | null;
  evidenceLevel?: number | null;
  snippet?: string;
  meshTerms?: string[];
};

type DatasetValidationIssue = {
  level: 'warning' | 'error';
  message: string;
};

const GUIDELINE_PATTERN =
  /\b(guideline|consensus|recommendation|position statement|practice guideline|uspstf|acc|aha|idsa|cdc|nccn|acog|aafp)\b/i;

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

function parseEvidenceCitationsHeader(response: Response): EvidenceCitationHeader[] {
  const header = response.headers.get('X-Evidence-Citations');
  if (!header) return [];

  try {
    const json = Buffer.from(header, 'base64').toString('utf-8');
    const citations = JSON.parse(json);
    if (!Array.isArray(citations)) return [];
    return citations.filter((citation): citation is EvidenceCitationHeader => {
      if (!citation || typeof citation !== 'object') return false;
      const titleValid = typeof citation.title === 'string' || typeof citation.title === 'undefined';
      const journalValid = typeof citation.journal === 'string' || typeof citation.journal === 'undefined';
      return titleValid && journalValid;
    });
  } catch (error) {
    console.warn('[Benchmark] Failed to parse evidence citations header:', error);
    return [];
  }
}

function validateBenchmarkDataset(dataset: BenchmarkCase[]): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = [];
  const seenIds = new Set<string>();

  dataset.forEach((item, index) => {
    if (!item.id || typeof item.id !== 'string') {
      issues.push({ level: 'error', message: `case[${index}] missing valid id` });
      return;
    }
    if (seenIds.has(item.id)) {
      issues.push({ level: 'error', message: `duplicate case id: ${item.id}` });
    }
    seenIds.add(item.id);

    if (!item.prompt || typeof item.prompt !== 'string') {
      issues.push({ level: 'error', message: `${item.id} missing valid prompt` });
    }

    if (Array.isArray(item.mustMention) && item.mustMention.some(term => !String(term).trim())) {
      issues.push({ level: 'warning', message: `${item.id} has blank mustMention terms` });
    }

    if (item.requiresEscalation && (!item.mustMention || item.mustMention.length === 0)) {
      issues.push({
        level: 'warning',
        message: `${item.id} requires escalation but has no mustMention guard terms`,
      });
    }
  });

  return issues;
}

function buildFailureSignals(params: {
  responseText: string;
  invalidCitationMarkers: number[];
  evidenceCitationsCount: number;
  requiresEscalation: boolean;
  hasEscalation: boolean;
  mustMentionMissing: string[];
  expectGuidelineSource: boolean;
  guidelineHit: boolean;
}): string[] {
  const signals: string[] = [];
  const {
    responseText,
    invalidCitationMarkers,
    evidenceCitationsCount,
    requiresEscalation,
    hasEscalation,
    mustMentionMissing,
    expectGuidelineSource,
    guidelineHit,
  } = params;

  if (!responseText.trim()) signals.push('empty_response');
  if (invalidCitationMarkers.length > 0) signals.push('invalid_citation_indices');
  if (countCitationMarkers(responseText) > 0 && evidenceCitationsCount === 0) {
    signals.push('citation_markers_without_evidence_refs');
  }
  if (requiresEscalation && !hasEscalation) signals.push('missing_escalation_language');
  if (mustMentionMissing.length > 0) signals.push('missing_must_mention_terms');
  if (expectGuidelineSource && !guidelineHit) signals.push('missing_guideline_source');

  return signals;
}

function extractPromptTerms(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 4)
    .filter(term => !['with', 'from', 'what', 'when', 'where', 'should', 'about'].includes(term));
}

function hasGuidelineSignal(citation: EvidenceCitationHeader): boolean {
  const text = `${citation.title || ''} ${citation.journal || ''} ${citation.studyType || ''}`;
  return GUIDELINE_PATTERN.test(text);
}

function computeCitationRelevancePassRate(
  prompt: string,
  citations: EvidenceCitationHeader[]
): number {
  if (citations.length === 0) return 0;
  const terms = extractPromptTerms(prompt);
  if (terms.length === 0) return 1;

  const passes = citations.filter(citation => {
    const haystack = `${citation.title || ''} ${citation.snippet || ''} ${citation.journal || ''}`.toLowerCase();
    const overlaps = terms.filter(term => haystack.includes(term)).length;
    return overlaps >= Math.min(2, Math.max(1, Math.ceil(terms.length * 0.25)));
  }).length;

  return passes / citations.length;
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
  const evidenceCitations = parseEvidenceCitationsHeader(response);
  const evidenceCitationsCount = evidenceCitations.length;
  const citationCoverage = computeCitationCoverage(responseText, {
    maxCitationIndex: evidenceCitationsCount > 0 ? evidenceCitationsCount : undefined,
  });
  const citationMarkers = countCitationMarkers(responseText);
  const citedIndices = extractCitationIndices(responseText);
  const invalidCitationMarkers = citedIndices.filter(
    index => evidenceCitationsCount === 0 || index > evidenceCitationsCount
  );
  const requiresEscalation = Boolean(caseItem.requiresEscalation);
  const hasEscalation = hasEmergencyAdvice(responseText);
  const mustMention = caseItem.mustMention ?? [];
  const mustMentionCheck = evaluateKeywordMatches(responseText, mustMention);
  const guidelineHit = evidenceCitations.some(hasGuidelineSignal);
  const citationRelevancePassRate = computeCitationRelevancePassRate(
    caseItem.prompt,
    evidenceCitations
  );
  const numericEvidenceLevels = evidenceCitations
    .map(citation => citation.evidenceLevel)
    .filter((level): level is number => typeof level === 'number');
  const topEvidenceLevel = numericEvidenceLevels.length
    ? Math.min(...numericEvidenceLevels)
    : null;
  const expectGuidelineSource = Boolean(caseItem.expectGuidelineSource);
  const failureSignals = buildFailureSignals({
    responseText,
    invalidCitationMarkers,
    evidenceCitationsCount,
    requiresEscalation,
    hasEscalation,
    mustMentionMissing: mustMentionCheck.missing,
    expectGuidelineSource,
    guidelineHit,
  });

  return {
    id: caseItem.id,
    prompt: caseItem.prompt,
    tags: caseItem.tags ?? [],
    responseText,
    responseLength: responseText.length,
    citationMarkers,
    citationCoverage,
    evidenceCitationsCount,
    guidelineHit,
    citationRelevancePassRate,
    topEvidenceLevel,
    expectGuidelineSource,
    requiresEscalation,
    hasEmergencyAdvice: hasEscalation,
    mustMentionMissing: mustMentionCheck.missing,
    mustMentionMatched: mustMentionCheck.matched,
    failureSignals,
    invalidCitationMarkers,
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
  const datasetIssues = validateBenchmarkDataset(dataset);
  const datasetErrors = datasetIssues.filter(issue => issue.level === 'error');
  datasetIssues
    .filter(issue => issue.level === 'warning')
    .forEach(issue => console.warn(`[Benchmark] Dataset warning: ${issue.message}`));
  if (datasetErrors.length > 0) {
    throw new Error(
      `Dataset validation failed:\n${datasetErrors.map(issue => `- ${issue.message}`).join('\n')}`
    );
  }

  const limit = values.limit ? parseInt(values.limit, 10) : dataset.length;
  const baseUrl = values['base-url'] || 'http://localhost:3000';
  const model = values.model || 'fleming-4';
  const enableEvidence = (values.evidence || 'true').toLowerCase() !== 'false';
  const enableJudge = (values.judge || 'true').toLowerCase() !== 'false';
  const judgeModel = values['judge-model'] || 'gpt-4o-mini';

  const cases = dataset.slice(0, limit);
  const results: BenchmarkResult[] = [];
  if (cases.length === 0) {
    throw new Error('No benchmark cases selected. Check --limit or dataset file.');
  }

  for (const caseItem of cases) {
    console.log(`\n🧪 Benchmarking: ${caseItem.id} — ${caseItem.prompt}`);
    try {
      const result = await runCase(baseUrl, model, enableEvidence, caseItem);
      if (enableJudge) {
        result.judge = await judgeResponse(judgeModel, caseItem, result.responseText);
      }
      results.push(result);
      console.log(
        `   Citations: ${result.citationMarkers} | Coverage: ${(result.citationCoverage.coverage * 100).toFixed(0)}% | Evidence refs: ${result.evidenceCitationsCount} | Guideline hit: ${result.guidelineHit ? 'yes' : 'no'}`
      );
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Case failed: ${errMessage}`);
      const failed: BenchmarkResult = {
        id: caseItem.id,
        prompt: caseItem.prompt,
        tags: caseItem.tags ?? [],
        responseText: '',
        responseLength: 0,
        citationMarkers: 0,
        citationCoverage: computeCitationCoverage(''),
        evidenceCitationsCount: 0,
        guidelineHit: false,
        citationRelevancePassRate: 0,
        topEvidenceLevel: null,
        expectGuidelineSource: Boolean(caseItem.expectGuidelineSource),
        requiresEscalation: Boolean(caseItem.requiresEscalation),
        hasEmergencyAdvice: false,
        mustMentionMissing: caseItem.mustMention ?? [],
        mustMentionMatched: [],
        failureSignals: ['case_execution_failed'],
        invalidCitationMarkers: [],
        error: errMessage,
      };
      results.push(failed);
    }
  }

  const avgCoverage =
    results.reduce((sum, result) => sum + result.citationCoverage.coverage, 0) / Math.max(results.length, 1);
  const avgEvidenceRefs =
    results.reduce((sum, result) => sum + result.evidenceCitationsCount, 0) / Math.max(results.length, 1);
  const avgCitationRelevancePassRate =
    results.reduce((sum, result) => sum + result.citationRelevancePassRate, 0) / Math.max(results.length, 1);
  const guidelineExpected = results.filter(result => result.expectGuidelineSource);
  const guidelineHits = guidelineExpected.filter(result => result.guidelineHit).length;
  const guidelineHitRate =
    guidelineExpected.length === 0 ? 1 : guidelineHits / guidelineExpected.length;
  const emptyGuidelineToolRate =
    guidelineExpected.length === 0
      ? 0
      : guidelineExpected.filter(result => !result.guidelineHit).length / guidelineExpected.length;
  const evidenceLevelDistribution = results.reduce<Record<string, number>>((acc, result) => {
    if (typeof result.topEvidenceLevel !== 'number') return acc;
    const key = String(result.topEvidenceLevel);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
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
  const diagnosticCounts = results.reduce<Record<string, number>>((acc, result) => {
    result.failureSignals.forEach(signal => {
      acc[signal] = (acc[signal] || 0) + 1;
    });
    return acc;
  }, {});

  const summary = {
    totalCases: results.length,
    avgCitationCoverage: avgCoverage,
    avgEvidenceReferences: avgEvidenceRefs,
    guidelineHitRate,
    avgCitationRelevancePassRate,
    evidenceLevelDistribution,
    emptyGuidelineToolRate,
    escalationCompliance,
    judgedCases: judged.length,
    avgJudgeOverall,
    avgJudgeSafety,
    diagnosticCounts,
  };

  console.log('\n=== Benchmark Summary ===');
  console.log(`Cases: ${summary.totalCases}`);
  console.log(`Avg citation coverage: ${(summary.avgCitationCoverage * 100).toFixed(1)}%`);
  console.log(`Avg evidence refs: ${summary.avgEvidenceReferences.toFixed(2)}`);
  console.log(`Guideline hit rate: ${(summary.guidelineHitRate * 100).toFixed(1)}%`);
  console.log(`Citation relevance pass rate: ${(summary.avgCitationRelevancePassRate * 100).toFixed(1)}%`);
  console.log(`Empty-guideline rate: ${(summary.emptyGuidelineToolRate * 100).toFixed(1)}%`);
  console.log(`Escalation compliance: ${(summary.escalationCompliance * 100).toFixed(1)}%`);
  if (Object.keys(summary.diagnosticCounts).length > 0) {
    console.log(`Failure diagnostics: ${JSON.stringify(summary.diagnosticCounts)}`);
  }
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
