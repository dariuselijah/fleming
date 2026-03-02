import type { ExternalBenchmarkRecord, ExternalBenchmarkSuite } from "./types";

type UnknownRecord = Record<string, unknown>;

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toUnknownRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object") return {};
  return value as UnknownRecord;
}

function normalizeOptionKey(key: string): string {
  const cleaned = key.trim().replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "";
  if (/^\d+$/.test(cleaned)) return cleaned;
  return cleaned.toUpperCase();
}

function keyFromIndex(index: number): string {
  if (index < 0) return "";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < letters.length) return letters[index];
  return String(index + 1);
}

function parseOptionMap(value: unknown): Record<string, string> {
  if (!value) return {};

  if (Array.isArray(value)) {
    const options: Record<string, string> = {};
    value.forEach((item, index) => {
      if (typeof item === "string") {
        options[keyFromIndex(index)] = item.trim();
        return;
      }
      const record = toUnknownRecord(item);
      const label = normalizeOptionKey(
        safeString(record.label) || safeString(record.key) || keyFromIndex(index)
      );
      const text = safeString(record.text) || safeString(record.value);
      if (label && text) options[label] = text;
    });
    return options;
  }

  if (typeof value === "object") {
    const source = value as UnknownRecord;
    const options: Record<string, string> = {};
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = normalizeOptionKey(rawKey);
      const text = safeString(rawValue);
      if (key && text) options[key] = text;
    });
    return options;
  }

  return {};
}

function normalizeMultipleChoiceAnswer(
  answerRaw: unknown,
  optionMap: Record<string, string>
): string {
  const optionKeys = Object.keys(optionMap);
  if (optionKeys.length === 0) return "";

  if (typeof answerRaw === "number" && Number.isFinite(answerRaw)) {
    const idx = Math.floor(answerRaw);
    if (idx >= 0 && idx < optionKeys.length) return optionKeys[idx];
    if (idx > 0 && idx <= optionKeys.length) return optionKeys[idx - 1];
  }

  const normalizedAnswer = normalizeOptionKey(safeString(answerRaw));
  if (!normalizedAnswer) return "";
  if (optionMap[normalizedAnswer]) return normalizedAnswer;

  const oneIndexed = Number.parseInt(normalizedAnswer, 10);
  if (Number.isFinite(oneIndexed)) {
    if (oneIndexed >= 1 && oneIndexed <= optionKeys.length) {
      return optionKeys[oneIndexed - 1];
    }
    if (oneIndexed >= 0 && oneIndexed < optionKeys.length) {
      return optionKeys[oneIndexed];
    }
  }

  // Fall back by matching answer text against option text.
  const answerText = safeString(answerRaw).toLowerCase();
  if (!answerText) return "";
  const match = optionKeys.find((key) => optionMap[key].toLowerCase() === answerText);
  return match || "";
}

function normalizePubMedQaAnswer(answerRaw: unknown): string {
  const normalized = safeString(answerRaw).toLowerCase();
  if (["yes", "no", "maybe"].includes(normalized)) return normalized;
  if (normalized === "unknown") return "maybe";
  return "";
}

function requireField(value: string, fieldName: string, contextId: string): string {
  if (!value) {
    throw new Error(`Missing required field "${fieldName}" for record ${contextId}`);
  }
  return value;
}

function makeRecordId(
  suite: ExternalBenchmarkSuite,
  index: number,
  providedId?: string
): string {
  if (providedId && providedId.trim().length > 0) return providedId.trim();
  return `${suite}-${index + 1}`;
}

export function adaptMedQaRecord(raw: unknown, index: number): ExternalBenchmarkRecord {
  const source = toUnknownRecord(raw);
  const question = requireField(
    safeString(source.question) ||
      safeString(source.stem) ||
      safeString(source.question_text),
    "question",
    `medqa-${index + 1}`
  );
  const options = parseOptionMap(source.options || source.choices || source.candidates);
  const correctAnswer = requireField(
    normalizeMultipleChoiceAnswer(
      source.answer ?? source.correct_answer ?? source.answer_idx ?? source.label,
      options
    ),
    "correctAnswer",
    `medqa-${index + 1}`
  );
  const category =
    safeString(source.category) ||
    safeString(source.subject) ||
    safeString(source.topic) ||
    "general_clinical";

  return {
    id: makeRecordId("medqa_usmle", index, safeString(source.id)),
    suite: "medqa_usmle",
    question,
    options,
    correctAnswer,
    category,
    explanation: safeString(source.explanation),
    metadata: {
      sourceDataset: safeString(source.source) || "medqa",
    },
  };
}

export function adaptMmluClinicalRecord(raw: unknown, index: number): ExternalBenchmarkRecord {
  const source = toUnknownRecord(raw);
  const question = requireField(
    safeString(source.question) || safeString(source.stem),
    "question",
    `mmlu-${index + 1}`
  );

  const options = parseOptionMap(
    source.options || {
      A: source.A,
      B: source.B,
      C: source.C,
      D: source.D,
    }
  );

  const correctAnswer = requireField(
    normalizeMultipleChoiceAnswer(source.answer ?? source.correct_answer ?? source.label, options),
    "correctAnswer",
    `mmlu-${index + 1}`
  );

  const category =
    safeString(source.subject) ||
    safeString(source.category) ||
    safeString(source.subset) ||
    "clinical_knowledge";

  return {
    id: makeRecordId("mmlu_clinical", index, safeString(source.id)),
    suite: "mmlu_clinical",
    question,
    options,
    correctAnswer,
    category,
    explanation: safeString(source.explanation),
    metadata: {
      sourceDataset: safeString(source.source) || "mmlu",
    },
  };
}

export function adaptPubMedQaRecord(raw: unknown, index: number): ExternalBenchmarkRecord {
  const source = toUnknownRecord(raw);
  const question = requireField(
    safeString(source.question) || safeString(source.QUESTION),
    "question",
    `pubmedqa-${index + 1}`
  );

  const contextSegments = Array.isArray(source.CONTEXTS)
    ? source.CONTEXTS.filter((value): value is string => typeof value === "string")
    : Array.isArray(source.contexts)
      ? source.contexts.filter((value): value is string => typeof value === "string")
      : [];
  const context =
    safeString(source.context) || safeString(source.LONG_ANSWER) || contextSegments.join("\n");

  const correctAnswer = requireField(
    normalizePubMedQaAnswer(
      source.final_decision ?? source.answer ?? source.label ?? source.decision
    ),
    "correctAnswer",
    `pubmedqa-${index + 1}`
  );

  const category =
    safeString(source.subject) ||
    safeString(source.category) ||
    safeString(source.topic) ||
    "biomedical_qa";

  return {
    id: makeRecordId("pubmedqa", index, safeString(source.id) || safeString(source.PMID)),
    suite: "pubmedqa",
    question,
    options: {
      yes: "Yes",
      no: "No",
      maybe: "Maybe",
    },
    correctAnswer,
    category,
    context: context || undefined,
    explanation: safeString(source.explanation),
    metadata: {
      sourceDataset: safeString(source.source) || "pubmedqa",
      pmid: safeString(source.PMID),
    },
  };
}

export function adaptRecordForSuite(
  suite: ExternalBenchmarkSuite,
  raw: unknown,
  index: number
): ExternalBenchmarkRecord {
  switch (suite) {
    case "medqa_usmle":
      return adaptMedQaRecord(raw, index);
    case "pubmedqa":
      return adaptPubMedQaRecord(raw, index);
    case "mmlu_clinical":
      return adaptMmluClinicalRecord(raw, index);
    default:
      throw new Error(`Unsupported suite: ${String(suite)}`);
  }
}
