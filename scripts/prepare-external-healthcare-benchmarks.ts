import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  adaptRecordForSuite,
} from "../lib/eval/external/adapters";
import type { ExternalBenchmarkRecord, ExternalBenchmarkSuite } from "../lib/eval/external/types";

type InputFormat = "json" | "jsonl" | "csv";

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function parseSuite(value: string): ExternalBenchmarkSuite {
  const normalized = value.trim().toLowerCase();
  if (normalized === "medqa" || normalized === "medqa_usmle") return "medqa_usmle";
  if (normalized === "pubmedqa") return "pubmedqa";
  if (normalized === "mmlu" || normalized === "mmlu_clinical") return "mmlu_clinical";
  throw new Error(`Unsupported suite "${value}". Use medqa_usmle, pubmedqa, or mmlu_clinical.`);
}

function inferFormat(filePath: string, explicit?: string): InputFormat {
  if (explicit) {
    const normalized = explicit.trim().toLowerCase();
    if (normalized === "json" || normalized === "jsonl" || normalized === "csv") return normalized;
    throw new Error(`Unsupported format "${explicit}". Use json, jsonl, or csv.`);
  }

  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".jsonl")) return "jsonl";
  if (filePath.endsWith(".csv")) return "csv";
  throw new Error(`Could not infer input format from "${filePath}". Provide --format.`);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : "";

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseCsvRecords(rawCsv: string): Array<Record<string, string>> {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

function loadRawRecords(inputPath: string, format: InputFormat): unknown[] {
  const raw = fs.readFileSync(inputPath, "utf-8");
  if (format === "json") {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).data)) {
      return (parsed as any).data;
    }
    throw new Error(`JSON input must be an array or { data: [] } in ${inputPath}`);
  }

  if (format === "jsonl") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  }

  return parseCsvRecords(raw);
}

function normalizeRecords(
  suite: ExternalBenchmarkSuite,
  rows: unknown[],
  skipInvalid: boolean
): { normalized: ExternalBenchmarkRecord[]; invalidRows: number } {
  const normalized: ExternalBenchmarkRecord[] = [];
  let invalidRows = 0;

  rows.forEach((row, index) => {
    try {
      normalized.push(adaptRecordForSuite(suite, row, index));
    } catch (error) {
      invalidRows += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (!skipInvalid) {
        throw new Error(`Failed to normalize row ${index + 1}: ${message}`);
      }
      console.warn(`[prepare-external] Skipping invalid row ${index + 1}: ${message}`);
    }
  });

  return { normalized, invalidRows };
}

function writeOutput(outputPath: string, records: ExternalBenchmarkRecord[]) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
}

async function main() {
  const { values } = parseArgs({
    options: {
      suite: { type: "string" },
      input: { type: "string" },
      out: { type: "string" },
      format: { type: "string" },
      "skip-invalid": { type: "string", default: "true" },
    },
  });

  if (!values.suite) {
    throw new Error("Missing --suite argument.");
  }
  if (!values.input) {
    throw new Error("Missing --input argument.");
  }

  const suite = parseSuite(values.suite);
  const inputPath = resolveProjectPath(values.input);
  const outPath =
    values.out
      ? resolveProjectPath(values.out)
      : resolveProjectPath(`data/eval/external/normalized/${suite}.json`);
  const format = inferFormat(inputPath, values.format || undefined);
  const skipInvalid = (values["skip-invalid"] || "true").toLowerCase() !== "false";

  const rows = loadRawRecords(inputPath, format);
  const { normalized, invalidRows } = normalizeRecords(suite, rows, skipInvalid);
  writeOutput(outPath, normalized);

  console.log(`[prepare-external] Suite: ${suite}`);
  console.log(`[prepare-external] Input rows: ${rows.length}`);
  console.log(`[prepare-external] Normalized rows: ${normalized.length}`);
  console.log(`[prepare-external] Invalid rows skipped: ${invalidRows}`);
  console.log(`[prepare-external] Wrote normalized dataset to ${outPath}`);
}

main().catch((error) => {
  console.error("[prepare-external] Failed:", error);
  process.exit(1);
});
