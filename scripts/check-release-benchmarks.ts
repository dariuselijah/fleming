import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'util';

type RetrievalSummary = {
  totalCases: number;
  avgResults: number;
  avgTopEvidenceLevel: number | null;
  avgLatestYear: number | null;
};

type ChatSummary = {
  totalCases: number;
  avgCitationCoverage: number;
  avgEvidenceReferences: number;
  escalationCompliance: number;
  avgJudgeOverall?: number | null;
  avgJudgeSafety?: number | null;
};

type Thresholds = {
  retrieval: {
    minimumCases: number;
    minAvgResults: number;
    maxAvgTopEvidenceLevel: number;
    minAvgLatestYear: number;
  };
  chat: {
    minimumCases: number;
    minAvgCitationCoverage: number;
    minAvgEvidenceReferences: number;
    minEscalationCompliance: number;
    minAvgJudgeOverall: number;
    minAvgJudgeSafety: number;
  };
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function failIf(condition: boolean, message: string, failures: string[]) {
  if (condition) failures.push(message);
}

async function main() {
  const { values } = parseArgs({
    options: {
      retrieval: { type: 'string', default: 'data/eval/retrieval_release_results.json' },
      chat: { type: 'string', default: 'data/eval/chat_release_results.json' },
      thresholds: { type: 'string', default: 'data/eval/release_benchmark_thresholds.json' },
    },
  });

  const retrievalPath = resolveProjectPath(values.retrieval || 'data/eval/retrieval_release_results.json');
  const chatPath = resolveProjectPath(values.chat || 'data/eval/chat_release_results.json');
  const thresholdsPath = resolveProjectPath(values.thresholds || 'data/eval/release_benchmark_thresholds.json');

  const retrieval = readJson<{ summary: RetrievalSummary }>(retrievalPath).summary;
  const chat = readJson<{ summary: ChatSummary }>(chatPath).summary;
  const thresholds = readJson<Thresholds>(thresholdsPath);

  const failures: string[] = [];

  failIf(
    retrieval.totalCases < thresholds.retrieval.minimumCases,
    `retrieval.minimumCases failed: ${retrieval.totalCases} < ${thresholds.retrieval.minimumCases}`,
    failures
  );
  failIf(
    retrieval.avgResults < thresholds.retrieval.minAvgResults,
    `retrieval.avgResults failed: ${retrieval.avgResults.toFixed(3)} < ${thresholds.retrieval.minAvgResults.toFixed(3)}`,
    failures
  );
  failIf(
    (retrieval.avgTopEvidenceLevel ?? Number.POSITIVE_INFINITY) > thresholds.retrieval.maxAvgTopEvidenceLevel,
    `retrieval.avgTopEvidenceLevel failed: ${(retrieval.avgTopEvidenceLevel ?? Number.POSITIVE_INFINITY).toFixed(3)} > ${thresholds.retrieval.maxAvgTopEvidenceLevel.toFixed(3)}`,
    failures
  );
  failIf(
    (retrieval.avgLatestYear ?? 0) < thresholds.retrieval.minAvgLatestYear,
    `retrieval.avgLatestYear failed: ${(retrieval.avgLatestYear ?? 0).toFixed(3)} < ${thresholds.retrieval.minAvgLatestYear.toFixed(3)}`,
    failures
  );

  failIf(
    chat.totalCases < thresholds.chat.minimumCases,
    `chat.minimumCases failed: ${chat.totalCases} < ${thresholds.chat.minimumCases}`,
    failures
  );
  failIf(
    chat.avgCitationCoverage < thresholds.chat.minAvgCitationCoverage,
    `chat.avgCitationCoverage failed: ${chat.avgCitationCoverage.toFixed(3)} < ${thresholds.chat.minAvgCitationCoverage.toFixed(3)}`,
    failures
  );
  failIf(
    chat.avgEvidenceReferences < thresholds.chat.minAvgEvidenceReferences,
    `chat.avgEvidenceReferences failed: ${chat.avgEvidenceReferences.toFixed(3)} < ${thresholds.chat.minAvgEvidenceReferences.toFixed(3)}`,
    failures
  );
  failIf(
    chat.escalationCompliance < thresholds.chat.minEscalationCompliance,
    `chat.escalationCompliance failed: ${chat.escalationCompliance.toFixed(3)} < ${thresholds.chat.minEscalationCompliance.toFixed(3)}`,
    failures
  );
  failIf(
    (chat.avgJudgeOverall ?? 0) < thresholds.chat.minAvgJudgeOverall,
    `chat.avgJudgeOverall failed: ${(chat.avgJudgeOverall ?? 0).toFixed(3)} < ${thresholds.chat.minAvgJudgeOverall.toFixed(3)}`,
    failures
  );
  failIf(
    (chat.avgJudgeSafety ?? 0) < thresholds.chat.minAvgJudgeSafety,
    `chat.avgJudgeSafety failed: ${(chat.avgJudgeSafety ?? 0).toFixed(3)} < ${thresholds.chat.minAvgJudgeSafety.toFixed(3)}`,
    failures
  );

  if (failures.length > 0) {
    console.error('❌ Release benchmark checks failed:');
    failures.forEach(failure => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log('✅ Release benchmark checks passed');
}

main().catch(error => {
  console.error('Release benchmark check failed:', error);
  process.exit(1);
});
