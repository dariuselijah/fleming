import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

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
};

type Thresholds = {
  overall: {
    minimumCases: number;
    minAccuracy: number;
    minAnsweredRate: number;
    minCitationMarkerRate: number;
  };
  suites: Record<
    string,
    {
      minimumCases?: number;
      minAccuracy?: number;
      minCitationMarkerRate?: number;
    }
  >;
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function failIf(condition: boolean, message: string, failures: string[]) {
  if (condition) failures.push(message);
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", default: "data/eval/external_results.json" },
      thresholds: { type: "string", default: "data/eval/external_benchmark_thresholds.json" },
    },
  });

  const inputPath = resolveProjectPath(values.input || "data/eval/external_results.json");
  const thresholdsPath = resolveProjectPath(
    values.thresholds || "data/eval/external_benchmark_thresholds.json"
  );

  const summary = readJson<{ summary: ExternalSummary }>(inputPath).summary;
  const thresholds = readJson<Thresholds>(thresholdsPath);

  const failures: string[] = [];
  failIf(
    summary.totalCases < thresholds.overall.minimumCases,
    `overall.minimumCases failed: ${summary.totalCases} < ${thresholds.overall.minimumCases}`,
    failures
  );
  failIf(
    summary.accuracy < thresholds.overall.minAccuracy,
    `overall.minAccuracy failed: ${summary.accuracy.toFixed(3)} < ${thresholds.overall.minAccuracy.toFixed(3)}`,
    failures
  );
  failIf(
    summary.answeredRate < thresholds.overall.minAnsweredRate,
    `overall.minAnsweredRate failed: ${summary.answeredRate.toFixed(3)} < ${thresholds.overall.minAnsweredRate.toFixed(3)}`,
    failures
  );
  failIf(
    summary.citationMarkerRate < thresholds.overall.minCitationMarkerRate,
    `overall.minCitationMarkerRate failed: ${summary.citationMarkerRate.toFixed(3)} < ${thresholds.overall.minCitationMarkerRate.toFixed(3)}`,
    failures
  );

  Object.entries(thresholds.suites).forEach(([suiteName, suiteThresholds]) => {
    const suiteSummary = summary.perSuite[suiteName];
    if (!suiteSummary) {
      failures.push(`missing suite summary: ${suiteName}`);
      return;
    }
    if (typeof suiteThresholds.minimumCases === "number") {
      failIf(
        suiteSummary.total < suiteThresholds.minimumCases,
        `${suiteName}.minimumCases failed: ${suiteSummary.total} < ${suiteThresholds.minimumCases}`,
        failures
      );
    }
    if (typeof suiteThresholds.minAccuracy === "number") {
      failIf(
        suiteSummary.accuracy < suiteThresholds.minAccuracy,
        `${suiteName}.minAccuracy failed: ${suiteSummary.accuracy.toFixed(3)} < ${suiteThresholds.minAccuracy.toFixed(3)}`,
        failures
      );
    }
    if (typeof suiteThresholds.minCitationMarkerRate === "number") {
      failIf(
        suiteSummary.citationMarkerRate < suiteThresholds.minCitationMarkerRate,
        `${suiteName}.minCitationMarkerRate failed: ${suiteSummary.citationMarkerRate.toFixed(3)} < ${suiteThresholds.minCitationMarkerRate.toFixed(3)}`,
        failures
      );
    }
  });

  if (failures.length > 0) {
    console.error("❌ External benchmark checks failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("✅ External benchmark checks passed");
}

main().catch((error) => {
  console.error("External benchmark check failed:", error);
  process.exit(1);
});
