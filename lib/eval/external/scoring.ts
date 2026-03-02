import type {
  ExternalBenchmarkResult,
  ExternalBenchmarkSummary,
} from "./types";

export function normalizeAnswerLabel(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z]$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.toUpperCase();
}

export function extractMultipleChoicePrediction(
  responseText: string,
  optionKeys: string[]
): string | null {
  if (!responseText.trim() || optionKeys.length === 0) return null;
  const validKeys = new Set(optionKeys.map((key) => normalizeOptionKey(key)));
  const normalized = responseText.trim();

  const answerLineMatch = normalized.match(
    /(?:^|\n)\s*(?:final\s+answer|answer|choice)\s*[:\-]\s*([A-Za-z0-9]+)/i
  );
  if (answerLineMatch) {
    const key = normalizeOptionKey(answerLineMatch[1]);
    if (validKeys.has(key)) return key;
  }

  const standaloneMatch = normalized.match(/\b([A-Za-z])\b/);
  if (standaloneMatch) {
    const key = normalizeOptionKey(standaloneMatch[1]);
    if (validKeys.has(key)) return key;
  }

  return null;
}

export function extractPubMedQaPrediction(responseText: string): string | null {
  if (!responseText.trim()) return null;
  const normalized = responseText.trim().toLowerCase();

  const answerLineMatch = normalized.match(
    /(?:^|\n)\s*(?:final\s+answer|answer|decision|label)\s*[:\-]\s*(yes|no|maybe)\b/
  );
  if (answerLineMatch) return answerLineMatch[1];

  const terminalWordMatch = normalized.match(/\b(yes|no|maybe)\b(?![\s\S]*\b(yes|no|maybe)\b)/);
  if (terminalWordMatch) return terminalWordMatch[1];

  return null;
}

function createBucket() {
  return {
    total: 0,
    answered: 0,
    correct: 0,
    citationMarked: 0,
    citationCoverageSum: 0,
  };
}

export function summarizeExternalBenchmarkResults(
  results: ExternalBenchmarkResult[]
): ExternalBenchmarkSummary {
  const perSuiteAcc: Record<string, ReturnType<typeof createBucket>> = {};
  const perCategoryAcc: Record<string, ReturnType<typeof createBucket>> = {};

  let answeredCases = 0;
  let correctCases = 0;
  let citationMarkedCases = 0;
  let citationCoverageSum = 0;

  results.forEach((result) => {
    if (!perSuiteAcc[result.suite]) perSuiteAcc[result.suite] = createBucket();
    if (!perCategoryAcc[result.category]) perCategoryAcc[result.category] = createBucket();
    const suiteBucket = perSuiteAcc[result.suite];
    const categoryBucket = perCategoryAcc[result.category];

    suiteBucket.total += 1;
    categoryBucket.total += 1;

    if (result.predicted) {
      answeredCases += 1;
      suiteBucket.answered += 1;
      categoryBucket.answered += 1;
    }
    if (result.isCorrect) {
      correctCases += 1;
      suiteBucket.correct += 1;
      categoryBucket.correct += 1;
    }
    if (result.citationMarkers > 0) {
      citationMarkedCases += 1;
      suiteBucket.citationMarked += 1;
      categoryBucket.citationMarked += 1;
    }

    citationCoverageSum += result.citationCoverage;
    suiteBucket.citationCoverageSum += result.citationCoverage;
    categoryBucket.citationCoverageSum += result.citationCoverage;
  });

  const toSummaryRecord = (source: Record<string, ReturnType<typeof createBucket>>) =>
    Object.fromEntries(
      Object.entries(source).map(([key, bucket]) => {
        const total = bucket.total || 1;
        return [
          key,
          {
            total: bucket.total,
            answered: bucket.answered,
            correct: bucket.correct,
            accuracy: bucket.correct / total,
            citationMarkerRate: bucket.citationMarked / total,
            avgCitationCoverage: bucket.citationCoverageSum / total,
          },
        ];
      })
    );

  const totalCases = results.length;
  const denominator = Math.max(totalCases, 1);
  return {
    totalCases,
    answeredCases,
    correctCases,
    accuracy: correctCases / denominator,
    answeredRate: answeredCases / denominator,
    citationMarkerRate: citationMarkedCases / denominator,
    avgCitationCoverage: citationCoverageSum / denominator,
    perSuite: toSummaryRecord(perSuiteAcc),
    perCategory: toSummaryRecord(perCategoryAcc),
  };
}
