import type { EvidenceCitation } from "./types";

export type ProvenanceSourceType =
  | "pubmed"
  | "guideline"
  | "clinical_trial"
  | "drug_safety"
  | "conflict_analysis";

export interface SourceProvenance {
  id: string;
  sourceType: ProvenanceSourceType;
  sourceName: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  region: string | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  evidenceLevel: number | null;
  studyType: string | null;
  snippet: string;
  confidence: number;
  confidenceReason: string;
}

type ConfidenceInputs = {
  sourceType: ProvenanceSourceType;
  sourceName?: string;
  publishedAt?: string | null;
  evidenceLevel?: number | null;
  completenessSignals?: number;
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getYear(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  return Number.isFinite(year) ? year : null;
}

export function computeProvenanceConfidence({
  sourceType,
  sourceName,
  publishedAt,
  evidenceLevel,
  completenessSignals = 0,
}: ConfidenceInputs): { score: number; reason: string } {
  let score = 0.45;
  const reasons: string[] = [];

  const authorityBoostBySource: Record<ProvenanceSourceType, number> = {
    pubmed: 0.17,
    guideline: 0.22,
    clinical_trial: 0.14,
    drug_safety: 0.18,
    conflict_analysis: 0.05,
  };
  score += authorityBoostBySource[sourceType];
  reasons.push(`source:${sourceType}`);

  if (sourceName && /(who|nice|cochrane|nejm|lancet|jama|clinicaltrials\.gov|fda|pubmed|europe pmc)/i.test(sourceName)) {
    score += 0.06;
    reasons.push("trusted_publisher");
  }

  const year = getYear(publishedAt);
  if (year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age <= 1) {
      score += 0.10;
      reasons.push("very_recent");
    } else if (age <= 3) {
      score += 0.06;
      reasons.push("recent");
    } else if (age <= 6) {
      score += 0.03;
      reasons.push("moderately_recent");
    }
  }

  if (typeof evidenceLevel === "number" && Number.isFinite(evidenceLevel)) {
    // Lower evidence level is stronger in this codebase (1 best, 5 weakest)
    const levelBoost = Math.max(0, 6 - evidenceLevel) * 0.025;
    score += levelBoost;
    reasons.push(`evidence_level:${evidenceLevel}`);
  }

  if (completenessSignals > 0) {
    score += Math.min(0.08, completenessSignals * 0.015);
    reasons.push("metadata_complete");
  }

  return {
    score: Number(clamp01(score).toFixed(2)),
    reason: reasons.join(", "),
  };
}

export function buildProvenance(input: Omit<SourceProvenance, "confidence" | "confidenceReason">): SourceProvenance {
  let completenessSignals = 0;
  if (input.url) completenessSignals += 1;
  if (input.pmid) completenessSignals += 1;
  if (input.doi) completenessSignals += 1;
  if (input.publishedAt) completenessSignals += 1;
  if (input.journal) completenessSignals += 1;

  const { score, reason } = computeProvenanceConfidence({
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    publishedAt: input.publishedAt,
    evidenceLevel: input.evidenceLevel,
    completenessSignals,
  });

  return {
    ...input,
    confidence: score,
    confidenceReason: reason,
  };
}

function toYear(value: string | null): number | null {
  const year = getYear(value);
  return year ?? null;
}

export function provenanceToEvidenceCitation(provenance: SourceProvenance, index: number): EvidenceCitation {
  const journal = provenance.journal || provenance.sourceName || "Medical Source";
  const studyType = provenance.studyType || provenance.sourceType.replace("_", " ");
  const evidenceLevel = provenance.evidenceLevel ?? 5;

  return {
    index,
    pmid: provenance.pmid,
    title: provenance.title,
    journal,
    year: toYear(provenance.publishedAt),
    doi: provenance.doi,
    authors: [],
    evidenceLevel,
    studyType,
    sampleSize: null,
    meshTerms: provenance.region ? [provenance.region] : [],
    url: provenance.url,
    snippet: provenance.snippet || `Confidence ${(provenance.confidence * 100).toFixed(0)}%`,
    score: provenance.confidence,
  };
}
