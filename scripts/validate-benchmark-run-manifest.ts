import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

type BenchmarkRunManifest = {
  runId: string;
  timestampUtc: string;
  gitCommitSha: string;
  gitBranchOrTag: string;
  trigger: string;
  operator: string;
  datasetLockVersion: string;
  thresholdConfigVersion: string;
  mode: string;
  benchmarkCommands: string[];
  runtimeConfig: Record<string, unknown>;
  artifacts: Record<string, string>;
  notes?: string;
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", default: "data/eval/benchmark-run-manifest.template.json" },
      "allow-template-placeholders": { type: "string", default: "true" },
    },
  });

  const inputPath = resolveProjectPath(values.input || "data/eval/benchmark-run-manifest.template.json");
  const allowTemplatePlaceholders = (values["allow-template-placeholders"] || "true").toLowerCase() !== "false";
  const manifest = readJson<BenchmarkRunManifest>(inputPath);

  const failures: string[] = [];
  const requiredStringFields: Array<keyof BenchmarkRunManifest> = [
    "runId",
    "timestampUtc",
    "gitCommitSha",
    "gitBranchOrTag",
    "trigger",
    "operator",
    "datasetLockVersion",
    "thresholdConfigVersion",
    "mode",
  ];

  requiredStringFields.forEach((field) => {
    if (!isNonEmptyString(manifest[field])) {
      failures.push(`Missing required string field: ${field}`);
    }
  });

  if (!Array.isArray(manifest.benchmarkCommands) || manifest.benchmarkCommands.length === 0) {
    failures.push("benchmarkCommands must be a non-empty array");
  }

  if (!manifest.runtimeConfig || typeof manifest.runtimeConfig !== "object") {
    failures.push("runtimeConfig must be an object");
  }

  if (!manifest.artifacts || typeof manifest.artifacts !== "object") {
    failures.push("artifacts must be an object");
  } else {
    const artifactValues = Object.values(manifest.artifacts);
    if (artifactValues.length === 0 || artifactValues.some((value) => !isNonEmptyString(value))) {
      failures.push("artifacts must contain at least one non-empty path value");
    }
  }

  const placeholderPattern = /^replace-with-/i;
  if (!allowTemplatePlaceholders) {
    requiredStringFields.forEach((field) => {
      const value = String(manifest[field] ?? "");
      if (placeholderPattern.test(value)) {
        failures.push(`Placeholder value not allowed for field: ${field}`);
      }
    });
  }

  if (failures.length > 0) {
    console.error("❌ Benchmark run manifest validation failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("✅ Benchmark run manifest is valid");
}

main().catch((error) => {
  console.error("Benchmark run manifest validation failed:", error);
  process.exit(1);
});

