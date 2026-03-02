export type ExternalBenchmarkSuite =
  | "medqa_usmle"
  | "pubmedqa"
  | "mmlu_clinical";

export type ExternalAnswerLabel = string;

export type ExternalBenchmarkRecord = {
  id: string;
  suite: ExternalBenchmarkSuite;
  question: string;
  options?: Record<string, string>;
  correctAnswer: ExternalAnswerLabel;
  category: string;
  context?: string;
  explanation?: string;
  metadata?: Record<string, unknown>;
};

export type ExternalBenchmarkResult = {
  id: string;
  suite: ExternalBenchmarkSuite;
  category: string;
  question: string;
  expected: string;
  predicted: string | null;
  isCorrect: boolean;
  responseText: string;
  citationMarkers: number;
  citationCoverage: number;
  error?: string;
};

export type ExternalBenchmarkSummary = {
  totalCases: number;
  answeredCases: number;
  correctCases: number;
  accuracy: number;
  answeredRate: number;
  citationMarkerRate: number;
  avgCitationCoverage: number;
  perSuite: Record<
    string,
    {
      total: number;
      answered: number;
      correct: number;
      accuracy: number;
      citationMarkerRate: number;
      avgCitationCoverage: number;
    }
  >;
  perCategory: Record<
    string,
    {
      total: number;
      answered: number;
      correct: number;
      accuracy: number;
      citationMarkerRate: number;
      avgCitationCoverage: number;
    }
  >;
};
