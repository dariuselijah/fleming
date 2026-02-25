import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'util';

type BenchmarkResult = {
  id: string;
  tags: string[];
  citationCoverage: { coverage: number };
  evidenceCitationsCount: number;
  requiresEscalation: boolean;
  hasEmergencyAdvice: boolean;
  mustMentionMissing: string[];
  judge?: { overall: number; safety: number };
};

type BenchmarkPayload = {
  summary: {
    totalCases: number;
    avgCitationCoverage: number;
    avgEvidenceReferences: number;
    escalationCompliance: number;
    judgedCases?: number;
    avgJudgeOverall?: number | null;
    avgJudgeSafety?: number | null;
  };
  results: BenchmarkResult[];
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'data/eval/chat_benchmark_results.json' },
      out: { type: 'string', default: 'data/eval/chat_benchmark_report.md' },
    },
  });

  const inputPath = resolveProjectPath(values.input || 'data/eval/chat_benchmark_results.json');
  const outPath = resolveProjectPath(values.out || 'data/eval/chat_benchmark_report.md');
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as BenchmarkPayload;

  const failingCases = payload.results.filter(result => {
    if (result.requiresEscalation && !result.hasEmergencyAdvice) return true;
    if (result.mustMentionMissing.length > 0) return true;
    return false;
  });

  const byTag = new Map<string, BenchmarkResult[]>();
  payload.results.forEach(result => {
    result.tags.forEach(tag => {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(result);
    });
  });

  const tagRows = Array.from(byTag.entries())
    .map(([tag, rows]) => {
      const avgCoverage = rows.reduce((sum, row) => sum + row.citationCoverage.coverage, 0) / rows.length;
      const escalationRows = rows.filter(row => row.requiresEscalation);
      const escalationCompliance =
        escalationRows.length === 0
          ? 1
          : escalationRows.filter(row => row.hasEmergencyAdvice).length / escalationRows.length;
      return `| ${tag} | ${rows.length} | ${pct(avgCoverage)} | ${pct(escalationCompliance)} |`;
    })
    .join('\n');

  const failingRows = failingCases
    .map(result => `| ${result.id} | ${result.mustMentionMissing.join(', ') || '-'} | ${result.requiresEscalation && !result.hasEmergencyAdvice ? 'missing emergency escalation' : '-'} |`)
    .join('\n');

  const markdown = [
    '# Chat Benchmark Report',
    '',
    '## Summary',
    `- Total cases: ${payload.summary.totalCases}`,
    `- Avg citation coverage: ${pct(payload.summary.avgCitationCoverage)}`,
    `- Avg evidence refs: ${payload.summary.avgEvidenceReferences.toFixed(2)}`,
    `- Escalation compliance: ${pct(payload.summary.escalationCompliance)}`,
    `- Avg judge overall: ${payload.summary.avgJudgeOverall != null ? payload.summary.avgJudgeOverall.toFixed(2) : 'n/a'}`,
    `- Avg judge safety: ${payload.summary.avgJudgeSafety != null ? payload.summary.avgJudgeSafety.toFixed(2) : 'n/a'}`,
    '',
    '## Tag Breakdown',
    '| Tag | Cases | Avg Citation Coverage | Escalation Compliance |',
    '| --- | ---: | ---: | ---: |',
    tagRows || '| n/a | 0 | 0% | 0% |',
    '',
    '## Failing / Needs Review',
    '| Case ID | Missing Must-Mention Terms | Safety Issue |',
    '| --- | --- | --- |',
    failingRows || '| none | - | - |',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, markdown);
  console.log(`✅ Wrote benchmark report to ${outPath}`);
}

main().catch(error => {
  console.error('Report generation failed:', error);
  process.exit(1);
});
