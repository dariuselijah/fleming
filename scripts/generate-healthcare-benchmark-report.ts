import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

type RetrievalSummary = {
  totalCases: number;
  avgResults: number;
  avgTopEvidenceLevel: number | null;
  avgLatestYear: number | null;
};

type InternalChatSummary = {
  totalCases: number;
  avgCitationCoverage: number;
  avgEvidenceReferences: number;
  guidelineHitRate: number;
  avgCitationRelevancePassRate: number;
  emptyGuidelineToolRate: number;
  escalationCompliance: number;
  avgJudgeOverall?: number | null;
  avgJudgeSafety?: number | null;
  diagnosticCounts?: Record<string, number>;
};

type ExternalSummaryBucket = {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  citationMarkerRate: number;
  avgCitationCoverage: number;
};

type ExternalSummary = {
  totalCases: number;
  answeredCases: number;
  correctCases: number;
  accuracy: number;
  answeredRate: number;
  citationMarkerRate: number;
  avgCitationCoverage: number;
  perSuite: Record<string, ExternalSummaryBucket>;
  perCategory: Record<string, ExternalSummaryBucket>;
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJsonOrNull<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function pct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function fixed(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function buildDeltaLine(
  label: string,
  current: number | undefined,
  baseline: number | undefined,
  percent = true
): string {
  if (typeof current !== "number" || typeof baseline !== "number") return `- ${label}: n/a`;
  const delta = current - baseline;
  const format = percent ? `${(delta * 100).toFixed(1)}pp` : delta.toFixed(3);
  return `- ${label}: ${percent ? pct(current) : fixed(current, 3)} (delta ${format})`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      retrieval: { type: "string", default: "data/eval/retrieval_release_results.json" },
      chat: { type: "string", default: "data/eval/chat_release_results.json" },
      external: { type: "string", default: "data/eval/external_results.json" },
      baseline: { type: "string" },
      out: { type: "string", default: "data/eval/healthcare_benchmark_report.md" },
    },
  });

  const retrievalPath = resolveProjectPath(values.retrieval || "");
  const chatPath = resolveProjectPath(values.chat || "");
  const externalPath = resolveProjectPath(values.external || "");
  const baselinePath = values.baseline ? resolveProjectPath(values.baseline) : null;
  const outPath = resolveProjectPath(values.out || "data/eval/healthcare_benchmark_report.md");

  const retrievalPayload = readJsonOrNull<{ summary: RetrievalSummary }>(retrievalPath);
  const chatPayload = readJsonOrNull<{ summary: InternalChatSummary }>(chatPath);
  const externalPayload = readJsonOrNull<{ summary: ExternalSummary }>(externalPath);
  const baselinePayload = baselinePath
    ? readJsonOrNull<{ summary: ExternalSummary }>(baselinePath)
    : null;

  const lines: string[] = [];
  lines.push("# Healthcare Benchmark Report");
  lines.push("");

  lines.push("## Internal Retrieval");
  if (!retrievalPayload?.summary) {
    lines.push("- Retrieval summary: n/a");
  } else {
    const retrieval = retrievalPayload.summary;
    lines.push(`- Cases: ${retrieval.totalCases}`);
    lines.push(`- Avg results: ${fixed(retrieval.avgResults)}`);
    lines.push(`- Avg top evidence level: ${fixed(retrieval.avgTopEvidenceLevel)}`);
    lines.push(`- Avg latest year: ${fixed(retrieval.avgLatestYear)}`);
  }
  lines.push("");

  lines.push("## Internal Clinical Chat");
  if (!chatPayload?.summary) {
    lines.push("- Chat summary: n/a");
  } else {
    const chat = chatPayload.summary;
    lines.push(`- Cases: ${chat.totalCases}`);
    lines.push(`- Avg citation coverage: ${pct(chat.avgCitationCoverage)}`);
    lines.push(`- Avg evidence refs: ${fixed(chat.avgEvidenceReferences)}`);
    lines.push(`- Guideline hit rate: ${pct(chat.guidelineHitRate)}`);
    lines.push(`- Citation relevance pass rate: ${pct(chat.avgCitationRelevancePassRate)}`);
    lines.push(`- Empty-guideline rate: ${pct(chat.emptyGuidelineToolRate)}`);
    lines.push(`- Escalation compliance: ${pct(chat.escalationCompliance)}`);
    lines.push(`- Avg judge overall: ${fixed(chat.avgJudgeOverall, 2)}`);
    lines.push(`- Avg judge safety: ${fixed(chat.avgJudgeSafety, 2)}`);
    if (chat.diagnosticCounts && Object.keys(chat.diagnosticCounts).length > 0) {
      lines.push(`- Diagnostics: \`${JSON.stringify(chat.diagnosticCounts)}\``);
    }
  }
  lines.push("");

  lines.push("## External Healthcare Benchmarks");
  if (!externalPayload?.summary) {
    lines.push("- External benchmark summary: n/a");
  } else {
    const external = externalPayload.summary;
    lines.push(`- Cases: ${external.totalCases}`);
    lines.push(`- Accuracy: ${pct(external.accuracy)}`);
    lines.push(`- Answered rate: ${pct(external.answeredRate)}`);
    lines.push(`- Citation marker rate: ${pct(external.citationMarkerRate)}`);
    lines.push(`- Avg citation coverage: ${pct(external.avgCitationCoverage)}`);
    lines.push("");
    lines.push("### Per Suite");
    lines.push("| Suite | Cases | Accuracy | Citation Marker Rate | Avg Citation Coverage |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    Object.entries(external.perSuite)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([suite, summary]) => {
        lines.push(
          `| ${suite} | ${summary.total} | ${pct(summary.accuracy)} | ${pct(summary.citationMarkerRate)} | ${pct(summary.avgCitationCoverage)} |`
        );
      });
  }
  lines.push("");

  if (externalPayload?.summary && baselinePayload?.summary) {
    const current = externalPayload.summary;
    const baseline = baselinePayload.summary;
    lines.push("## External Delta vs Baseline");
    lines.push(buildDeltaLine("Accuracy", current.accuracy, baseline.accuracy, true));
    lines.push(buildDeltaLine("Answered rate", current.answeredRate, baseline.answeredRate, true));
    lines.push(
      buildDeltaLine(
        "Citation marker rate",
        current.citationMarkerRate,
        baseline.citationMarkerRate,
        true
      )
    );
    lines.push(
      buildDeltaLine(
        "Avg citation coverage",
        current.avgCitationCoverage,
        baseline.avgCitationCoverage,
        true
      )
    );
    lines.push("");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
  console.log(`✅ Wrote healthcare benchmark report to ${outPath}`);
}

main().catch((error) => {
  console.error("Failed to generate healthcare benchmark report:", error);
  process.exit(1);
});
