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

export type ProvenanceQualityGateResult = {
  passed: boolean;
  score: number;
  reasons: string[];
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

function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3)
    .filter(term => !["with", "from", "that", "this", "what", "when", "where", "guideline"].includes(term));
}

function computeQueryOverlapScore(provenance: SourceProvenance, queryText: string): number {
  const terms = extractQueryTerms(queryText);
  if (terms.length === 0) return 1;
  const haystack = `${provenance.title} ${provenance.journal || ""} ${provenance.snippet || ""}`.toLowerCase();
  const matches = terms.filter(term => haystack.includes(term)).length;
  return matches / terms.length;
}

export function evaluateProvenanceQuality(
  provenance: SourceProvenance,
  queryText: string
): ProvenanceQualityGateResult {
  const reasons: string[] = [];
  let score = 0;

  const overlap = computeQueryOverlapScore(provenance, queryText);
  const overlapThreshold = provenance.sourceType === "guideline" ? 0.15 : 0.2;
  if (overlap >= overlapThreshold) {
    score += 0.35;
  } else {
    reasons.push("low_query_overlap");
  }

  const hasIdentifier = Boolean(provenance.pmid || provenance.doi || provenance.url);
  if (hasIdentifier) {
    score += 0.2;
  } else {
    reasons.push("missing_identifier");
  }

  if (provenance.title && provenance.title.length >= 12) {
    score += 0.15;
  } else {
    reasons.push("missing_title");
  }

  if (provenance.publishedAt) score += 0.1;
  if (provenance.journal || provenance.sourceName) score += 0.1;
  if (provenance.confidence >= 0.55) score += 0.1;

  const studyType = provenance.studyType?.toLowerCase() || "";
  const evidenceLevel = provenance.evidenceLevel ?? 5;
  if (
    /(guideline|meta-analysis|systematic|randomized|rct)/i.test(studyType) &&
    evidenceLevel > 3
  ) {
    reasons.push("unsupported_evidence_strength");
  }

  const minScoreThreshold =
    provenance.sourceType === "guideline" || provenance.sourceType === "pubmed"
      ? 0.48
      : 0.55;
  const hasBlockingReason = reasons.includes("unsupported_evidence_strength");
  const passed = score >= minScoreThreshold && !hasBlockingReason;
  return { passed, score: Number(score.toFixed(2)), reasons };
}

export function filterProvenanceByQuality(
  entries: SourceProvenance[],
  queryText: string
): SourceProvenance[] {
  return entries.filter((entry) => evaluateProvenanceQuality(entry, queryText).passed);
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
