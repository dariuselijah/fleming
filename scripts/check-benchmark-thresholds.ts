import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'util';

type BenchmarkSummary = {
  totalCases: number;
  avgCitationCoverage: number;
  avgEvidenceReferences: number;
  escalationCompliance: number;
  avgJudgeOverall?: number | null;
  avgJudgeSafety?: number | null;
};

type Thresholds = {
  minimumCases: number;
  minAvgCitationCoverage: number;
  minAvgEvidenceReferences: number;
  minEscalationCompliance: number;
  minAvgJudgeOverall?: number;
  minAvgJudgeSafety?: number;
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function assertThreshold(name: string, actual: number, minimum: number): string | null {
  if (actual < minimum) {
    return `${name} failed: ${actual.toFixed(3)} < ${minimum.toFixed(3)}`;
  }
  return null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'data/eval/chat_benchmark_results.json' },
      thresholds: { type: 'string', default: 'data/eval/benchmark_thresholds.json' },
    },
  });

  const inputPath = resolveProjectPath(values.input || 'data/eval/chat_benchmark_results.json');
  const thresholdsPath = resolveProjectPath(values.thresholds || 'data/eval/benchmark_thresholds.json');

  const benchmarkJson = readJson<{ summary: BenchmarkSummary }>(inputPath);
  const thresholds = readJson<Thresholds>(thresholdsPath);
  const summary = benchmarkJson.summary;

  const failures: string[] = [];

  if (summary.totalCases < thresholds.minimumCases) {
    failures.push(`minimumCases failed: ${summary.totalCases} < ${thresholds.minimumCases}`);
  }

  const checks: Array<[string, number, number]> = [
    ['avgCitationCoverage', summary.avgCitationCoverage, thresholds.minAvgCitationCoverage],
    ['avgEvidenceReferences', summary.avgEvidenceReferences, thresholds.minAvgEvidenceReferences],
    ['escalationCompliance', summary.escalationCompliance, thresholds.minEscalationCompliance],
  ];

  checks.forEach(([name, actual, minimum]) => {
    const error = assertThreshold(name, actual, minimum);
    if (error) failures.push(error);
  });

  if (typeof thresholds.minAvgJudgeOverall === 'number') {
    const actual = summary.avgJudgeOverall ?? 0;
    const error = assertThreshold('avgJudgeOverall', actual, thresholds.minAvgJudgeOverall);
    if (error) failures.push(error);
  }

  if (typeof thresholds.minAvgJudgeSafety === 'number') {
    const actual = summary.avgJudgeSafety ?? 0;
    const error = assertThreshold('avgJudgeSafety', actual, thresholds.minAvgJudgeSafety);
    if (error) failures.push(error);
  }

  if (failures.length > 0) {
    console.error('❌ Benchmark thresholds failed:');
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log('✅ Benchmark thresholds passed');
}

main().catch(error => {
  console.error('Threshold check failed:', error);
  process.exit(1);
});
