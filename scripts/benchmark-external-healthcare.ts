import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { processDataStream } from "ai";
import {
  computeCitationCoverage,
  countCitationMarkers,
} from "../lib/evidence/benchmark-metrics";
import {
  extractMultipleChoicePrediction,
  extractPubMedQaPrediction,
  normalizeAnswerLabel,
  summarizeExternalBenchmarkResults,
} from "../lib/eval/external/scoring";
import type {
  ExternalBenchmarkRecord,
  ExternalBenchmarkResult,
  ExternalBenchmarkSuite,
} from "../lib/eval/external/types";

type RuntimeOptions = {
  retries: number;
  timeoutMs: number;
  baseUrl: string;
  model: string;
  userRole: "doctor" | "general" | "medical_student";
  benchStrict: boolean;
  dryRun: boolean;
};

type EvidenceCitationHeader = {
  title?: string;
  journal?: string;
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function loadEnvFiles() {
  const envPaths = [resolveProjectPath(".env"), resolveProjectPath(".env.local")];
  envPaths.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
      loadEnv({ path: envPath });
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDataset(inputPath: string): ExternalBenchmarkRecord[] {
  const raw = fs.readFileSync(inputPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`External benchmark input must be a JSON array: ${inputPath}`);
  }
  return parsed as ExternalBenchmarkRecord[];
}

function parseEvidenceCitationsHeader(response: Response): EvidenceCitationHeader[] {
  const header = response.headers.get("X-Evidence-Citations");
  if (!header) return [];
  try {
    const json = Buffer.from(header, "base64").toString("utf-8");
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && typeof item === "object");
  } catch {
    return [];
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { retries: number; timeoutMs: number }
): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= options.retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutHandle);
      if (response.ok) return response;

      if (attempt > options.retries || response.status < 500) {
        const text = await response.text();
        throw new Error(`Chat request failed (${response.status}): ${text}`);
      }

      const backoffMs = Math.min(5000, 500 * 2 ** (attempt - 1));
      await sleep(backoffMs);
    } catch (error) {
      clearTimeout(timeoutHandle);
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      if (attempt > options.retries) break;
      const backoffMs = Math.min(5000, 500 * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("Unknown external benchmark request failure");
}

async function readStreamingResponse(response: Response, timeoutMs: number): Promise<string> {
  if (!response.body) return "";
  let text = "";
  let timeoutHandle: NodeJS.Timeout | null = null;

  const streamPromise = processDataStream({
    stream: response.body,
    onTextPart: (chunk) => {
      text += chunk;
    },
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Stream read timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  try {
    await Promise.race([streamPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
  return text.trim();
}

function buildPrompt(record: ExternalBenchmarkRecord): string {
  if (record.suite === "pubmedqa") {
    return [
      "Answer this biomedical question using concise, evidence-grounded reasoning.",
      "Return your final decision on the last line exactly as: Answer: yes|no|maybe",
      "",
      record.context ? `Context:\n${record.context}` : "",
      `Question: ${record.question}`,
      "Allowed labels: yes, no, maybe",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const options = record.options || {};
  const optionLines = Object.entries(options).map(([key, value]) => `${key}. ${value}`);
  return [
    "Select the single best answer based on current clinical evidence.",
    "Return your final choice on the last line exactly as: Answer: <OPTION_KEY>",
    "",
    `Question: ${record.question}`,
    "Options:",
    ...optionLines,
  ].join("\n");
}

function parsePrediction(record: ExternalBenchmarkRecord, responseText: string): string | null {
  if (record.suite === "pubmedqa") {
    return extractPubMedQaPrediction(responseText);
  }
  const optionKeys = Object.keys(record.options || {});
  return extractMultipleChoicePrediction(responseText, optionKeys);
}

function normalizeExpected(record: ExternalBenchmarkRecord): string {
  if (record.suite === "pubmedqa") return normalizeAnswerLabel(record.correctAnswer);
  return record.correctAnswer.trim().toUpperCase();
}

async function runSingleCase(
  record: ExternalBenchmarkRecord,
  runtime: RuntimeOptions
): Promise<ExternalBenchmarkResult> {
  if (runtime.dryRun) {
    return {
      id: record.id,
      suite: record.suite,
      category: record.category,
      question: record.question,
      expected: normalizeExpected(record),
      predicted: null,
      isCorrect: false,
      responseText: "",
      citationMarkers: 0,
      citationCoverage: 0,
    };
  }

  const payload = {
    messages: [{ id: `external-${record.id}`, role: "user", content: buildPrompt(record) }],
    chatId: `external-benchmark-${Date.now()}`,
    userId: "temp",
    model: runtime.model,
    isAuthenticated: false,
    systemPrompt: "",
    enableSearch: false,
    enableEvidence: true,
    userRole: runtime.userRole,
    benchmarkStrictMode: runtime.benchStrict,
  };

  const response = await fetchWithRetry(
    `${runtime.baseUrl}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bench-Strict-Mode": runtime.benchStrict ? "true" : "false",
      },
      body: JSON.stringify(payload),
    },
    { retries: runtime.retries, timeoutMs: runtime.timeoutMs }
  );

  const responseText = await readStreamingResponse(response, runtime.timeoutMs);
  const evidenceCitations = parseEvidenceCitationsHeader(response);
  const citationMarkers = countCitationMarkers(responseText);
  const citationCoverage = computeCitationCoverage(responseText, {
    maxCitationIndex: evidenceCitations.length > 0 ? evidenceCitations.length : undefined,
  }).coverage;

  const predicted = parsePrediction(record, responseText);
  const expected = normalizeExpected(record);
  const normalizedPredicted =
    record.suite === "pubmedqa"
      ? (predicted ? normalizeAnswerLabel(predicted) : null)
      : (predicted ? predicted.toUpperCase() : null);
  const isCorrect = normalizedPredicted === expected;

  return {
    id: record.id,
    suite: record.suite,
    category: record.category,
    question: record.question,
    expected,
    predicted: normalizedPredicted,
    isCorrect,
    responseText,
    citationMarkers,
    citationCoverage,
  };
}

function parseUserRole(value: string): "doctor" | "general" | "medical_student" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "doctor" || normalized === "general" || normalized === "medical_student") {
    return normalized;
  }
  return "doctor";
}

function parseSuites(value?: string): Set<ExternalBenchmarkSuite> | null {
  if (!value) return null;
  const selected = new Set<ExternalBenchmarkSuite>();
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .forEach((suiteRaw) => {
      if (suiteRaw === "medqa" || suiteRaw === "medqa_usmle") selected.add("medqa_usmle");
      if (suiteRaw === "pubmedqa") selected.add("pubmedqa");
      if (suiteRaw === "mmlu" || suiteRaw === "mmlu_clinical") selected.add("mmlu_clinical");
    });
  return selected.size > 0 ? selected : null;
}

async function main() {
  loadEnvFiles();

  const { values } = parseArgs({
    options: {
      input: {
        type: "string",
        default: "data/eval/external/normalized/sample_external_healthcare.json",
      },
      out: { type: "string", default: "data/eval/external_results.json" },
      limit: { type: "string" },
      suites: { type: "string" },
      "base-url": { type: "string", default: "http://127.0.0.1:3000" },
      model: { type: "string", default: "fleming-4" },
      retries: { type: "string", default: "1" },
      "timeout-ms": { type: "string", default: "90000" },
      "user-role": { type: "string", default: "doctor" },
      "bench-strict": { type: "string", default: "true" },
      "dry-run": { type: "string", default: "false" },
    },
  });

  const inputPath = resolveProjectPath(values.input || "");
  const outPath = resolveProjectPath(values.out || "data/eval/external_results.json");
  const retries = Math.max(0, Number.parseInt(values.retries || "1", 10) || 0);
  const timeoutMs = Math.max(5000, Number.parseInt(values["timeout-ms"] || "90000", 10) || 90000);
  const limit = values.limit ? Math.max(1, Number.parseInt(values.limit, 10) || 1) : undefined;
  const dryRun = (values["dry-run"] || "false").toLowerCase() === "true";
  const selectedSuites = parseSuites(values.suites || undefined);

  const runtime: RuntimeOptions = {
    retries,
    timeoutMs,
    baseUrl: values["base-url"] || "http://127.0.0.1:3000",
    model: values.model || "fleming-4",
    userRole: parseUserRole(values["user-role"] || "doctor"),
    benchStrict: (values["bench-strict"] || "true").toLowerCase() !== "false",
    dryRun,
  };

  const dataset = parseDataset(inputPath)
    .filter((record) => (selectedSuites ? selectedSuites.has(record.suite) : true))
    .slice(0, limit ?? Number.MAX_SAFE_INTEGER);

  if (dataset.length === 0) {
    throw new Error("No external benchmark cases selected after suite/limit filters.");
  }

  console.log(
    `[external-benchmark] Cases=${dataset.length}, dryRun=${runtime.dryRun}, retries=${runtime.retries}, timeoutMs=${runtime.timeoutMs}`
  );

  const results: ExternalBenchmarkResult[] = [];
  for (const record of dataset) {
    console.log(`\n🧪 External benchmark: ${record.id} (${record.suite}/${record.category})`);
    try {
      const result = await runSingleCase(record, runtime);
      results.push(result);
      console.log(
        `   Predicted: ${result.predicted ?? "n/a"} | Expected: ${result.expected} | Correct: ${result.isCorrect ? "yes" : "no"} | Citation markers: ${result.citationMarkers}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Case failed: ${message}`);
      results.push({
        id: record.id,
        suite: record.suite,
        category: record.category,
        question: record.question,
        expected: normalizeExpected(record),
        predicted: null,
        isCorrect: false,
        responseText: "",
        citationMarkers: 0,
        citationCoverage: 0,
        error: message,
      });
    }
  }

  const summary = summarizeExternalBenchmarkResults(results);
  console.log("\n=== External Benchmark Summary ===");
  console.log(`Cases: ${summary.totalCases}`);
  console.log(`Accuracy: ${(summary.accuracy * 100).toFixed(1)}%`);
  console.log(`Answered rate: ${(summary.answeredRate * 100).toFixed(1)}%`);
  console.log(`Citation marker rate: ${(summary.citationMarkerRate * 100).toFixed(1)}%`);
  console.log(`Avg citation coverage: ${(summary.avgCitationCoverage * 100).toFixed(1)}%`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\n✅ Wrote external benchmark output to ${outPath}`);
}

main().catch((error) => {
  console.error("[external-benchmark] Failed:", error);
  process.exit(1);
});
