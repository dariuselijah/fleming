import type { EvidenceCitation } from "@/lib/evidence/types"
import {
  normalizeClinicianWorkflowMode,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"

export type TrustLevel = "high" | "medium" | "watch"

export type RecommendationStrength = "strong" | "moderate" | "conditional" | "insufficient"

export type GradeRating = "high" | "moderate" | "low" | "very_low"

export type GradedCitation = {
  index: number
  grade: GradeRating
  gradeReason: string
}

export type TrustSummary = {
  workflow: ClinicianWorkflowMode | null
  isBenchmarkBacked: boolean
  evidenceCount: number
  highestEvidenceLevel: number | null
  latestYear: number | null
  medianYear: number | null
  recencyLabel: string | null
  guidelinePresent: boolean
  hasConflictingSignal: boolean
  needsMoreContext: boolean
  recommendationStrength: RecommendationStrength
  confidence: TrustLevel
  confidenceReason: string
  evidenceLevelBreakdown: Record<number, number>
  overallGrade: GradeRating
  overallGradeReason: string
  gradedCitations: GradedCitation[]
  conflictDetails: string | null
}

const BENCHMARK_BACKED_WORKFLOWS = new Set<ClinicianWorkflowMode>([
  "clinical_summary",
  "drug_interactions",
  "stewardship",
  "med_review",
])

const GUIDELINE_PATTERN =
  /\b(guideline|recommendation|consensus|position statement|practice guideline|society|idsa|aha|acc|nccn|acog|uspstf|ada|aafp)\b/i

const CONFLICT_PATTERN =
  /\b(conflict|conflicting|sources disagree|mixed evidence|heterogeneous|uncertain|equipoise)\b/i

const MISSING_CONTEXT_PATTERN =
  /\b(if available|if you can share|missing|limited by|would help to know|need more context|without (?:labs|context|history)|pending culture|confirm renal function)\b/i

export function inferWorkflowFromPrompt(
  prompt: string | undefined | null
): ClinicianWorkflowMode | null {
  if (!prompt) return null
  const normalized = prompt.toLowerCase()

  if (normalized.includes("drug interaction analysis")) return "drug_interactions"
  if (normalized.includes("medication review request")) return "med_review"
  if (normalized.includes("stewardship review")) return "stewardship"
  if (normalized.includes("clinical summary request")) return "clinical_summary"
  if (normalized.includes("icd10 assistance")) return "icd10_codes"
  if (normalized.includes("open search")) return "open_search"

  if (normalized.includes("handoff") || normalized.includes("problem list")) {
    return "clinical_summary"
  }
  if (normalized.includes("de-escalation") || normalized.includes("antibiotic")) {
    return "stewardship"
  }
  if (normalized.includes("interaction") || normalized.includes("qt")) {
    return "drug_interactions"
  }
  if (normalized.includes("deprescrib") || normalized.includes("polypharmacy")) {
    return "med_review"
  }

  return null
}

function computeMedianYear(years: number[]): number | null {
  if (years.length === 0) return null
  const sorted = [...years].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function computeRecencyLabel(latestYear: number | null, medianYear: number | null): string | null {
  if (!latestYear) return null
  const currentYear = new Date().getFullYear()
  const age = currentYear - latestYear
  if (age <= 1) return "Current"
  if (age <= 3) return "Recent"
  if (age <= 6) return "Aging"
  return "Dated"
}

function computeRecommendationStrength(
  evidenceCount: number,
  highestLevel: number | null,
  guidelinePresent: boolean,
  hasConflict: boolean,
): RecommendationStrength {
  if (hasConflict) return "conditional"
  if (evidenceCount < 2) return "insufficient"
  if (guidelinePresent && highestLevel !== null && highestLevel <= 2) return "strong"
  if (highestLevel !== null && highestLevel <= 2 && evidenceCount >= 4) return "strong"
  if (highestLevel !== null && highestLevel <= 3 && evidenceCount >= 3) return "moderate"
  return "conditional"
}

function gradeFromEvidenceLevel(level: number, studyType: string, year: number | undefined): { grade: GradeRating; reason: string } {
  const currentYear = new Date().getFullYear()
  const age = year ? currentYear - year : 10
  const st = (studyType || "").toLowerCase()

  if (level <= 1 && (st.includes("meta-analysis") || st.includes("systematic"))) {
    if (age <= 5) return { grade: "high", reason: "Systematic review/meta-analysis, recent" }
    return { grade: "moderate", reason: "Systematic review/meta-analysis, aging" }
  }
  if (level <= 1 && st.includes("guideline")) {
    return { grade: "high", reason: "Practice guideline" }
  }
  if (level <= 2 && (st.includes("randomized") || st.includes("rct"))) {
    if (age <= 5) return { grade: "high", reason: "RCT, recent" }
    return { grade: "moderate", reason: "RCT, aging" }
  }
  if (level <= 3) {
    return { grade: "moderate", reason: `Level ${level} evidence (observational/cohort)` }
  }
  if (level <= 4) {
    return { grade: "low", reason: "Case series/report" }
  }
  return { grade: "very_low", reason: "Expert opinion or unclassified" }
}

function computeOverallGrade(citations: EvidenceCitation[]): { grade: GradeRating; reason: string; gradedCitations: GradedCitation[] } {
  if (citations.length === 0) return { grade: "very_low", reason: "No evidence citations", gradedCitations: [] }

  const graded: GradedCitation[] = citations.map((c, i) => {
    const { grade, reason } = gradeFromEvidenceLevel(
      c.evidenceLevel || 5,
      c.studyType || "",
      c.year ?? undefined
    )
    return { index: i + 1, grade, gradeReason: reason }
  })

  const gradeOrder: Record<GradeRating, number> = { high: 3, moderate: 2, low: 1, very_low: 0 }
  const highCount = graded.filter(g => g.grade === "high").length
  const modCount = graded.filter(g => g.grade === "moderate").length

  let overall: GradeRating = "very_low"
  let reason = "Limited evidence quality"

  if (highCount >= 2) {
    overall = "high"
    reason = `${highCount} high-quality sources (systematic reviews, RCTs, or guidelines)`
  } else if (highCount >= 1 && modCount >= 1) {
    overall = "moderate"
    reason = `Mix of high and moderate quality evidence`
  } else if (modCount >= 2) {
    overall = "moderate"
    reason = `${modCount} moderate-quality sources`
  } else if (highCount === 1 || modCount >= 1) {
    overall = "low"
    reason = "Limited high-quality evidence"
  }

  return { grade: overall, reason, gradedCitations: graded }
}

function detectConflictDetails(content: string, citations: EvidenceCitation[]): string | null {
  const conflictSignals: string[] = []

  if (/\b(however|in contrast|conflicting|disagree|mixed results|heterogeneous)\b/i.test(content)) {
    conflictSignals.push("Response language suggests conflicting findings")
  }

  const conclusions = citations.map((c, i) => ({
    index: i + 1,
    snippet: (c.snippet || "").toLowerCase(),
    title: (c.title || "").toLowerCase(),
  }))

  const positiveSignal = /\b(effective|beneficial|improved|reduced risk|superior|recommended)\b/
  const negativeSignal = /\b(no benefit|no difference|inferior|not recommended|ineffective|harmful|increased risk)\b/

  const positive = conclusions.filter(c => positiveSignal.test(c.snippet))
  const negative = conclusions.filter(c => negativeSignal.test(c.snippet))

  if (positive.length > 0 && negative.length > 0) {
    conflictSignals.push(
      `Sources [${positive.map(p => p.index).join(",")}] suggest benefit while [${negative.map(n => n.index).join(",")}] suggest no benefit or harm`
    )
  }

  return conflictSignals.length > 0 ? conflictSignals.join(". ") : null
}

function computeEvidenceLevelBreakdown(citations: EvidenceCitation[]): Record<number, number> {
  const breakdown: Record<number, number> = {}
  for (const c of citations) {
    const level = c.evidenceLevel || 5
    breakdown[level] = (breakdown[level] || 0) + 1
  }
  return breakdown
}

export function buildTrustSummary(
  content: string,
  citations: EvidenceCitation[],
  prompt?: string | null
): TrustSummary {
  const workflow = inferWorkflowFromPrompt(prompt)
  const evidenceCount = citations.length
  const highestEvidenceLevel =
    citations.length > 0
      ? Math.min(...citations.map((citation) => citation.evidenceLevel || 5))
      : null
  const yearCandidates = citations
    .map((citation) => citation.year)
    .filter((year): year is number => typeof year === "number")
  const latestYear = yearCandidates.length > 0 ? Math.max(...yearCandidates) : null
  const medianYear = computeMedianYear(yearCandidates)
  const recencyLabel = computeRecencyLabel(latestYear, medianYear)
  const guidelinePresent = citations.some((citation) =>
    GUIDELINE_PATTERN.test(
      [citation.title, citation.studyType, citation.journal, citation.snippet]
        .filter(Boolean)
        .join(" ")
    )
  )
  const hasConflictingSignal =
    CONFLICT_PATTERN.test(content) ||
    citations.some((citation) => CONFLICT_PATTERN.test(citation.snippet || ""))
  const needsMoreContext = MISSING_CONTEXT_PATTERN.test(content)
  const recommendationStrength = computeRecommendationStrength(
    evidenceCount,
    highestEvidenceLevel,
    guidelinePresent,
    hasConflictingSignal,
  )
  const evidenceLevelBreakdown = computeEvidenceLevelBreakdown(citations)

  let confidence: TrustLevel = "watch"
  let confidenceReason =
    "Evidence support is thin or stale, so recommendations should be checked closely."

  if (
    evidenceCount >= 6 &&
    highestEvidenceLevel !== null &&
    highestEvidenceLevel <= 2 &&
    latestYear !== null &&
    latestYear >= 2024 &&
    !hasConflictingSignal
  ) {
    confidence = "high"
    confidenceReason =
      "Multiple recent high-quality sources support the answer and no conflict signal was detected."
  } else if (
    evidenceCount >= 3 &&
    highestEvidenceLevel !== null &&
    highestEvidenceLevel <= 3 &&
    latestYear !== null &&
    latestYear >= 2021
  ) {
    confidence = "medium"
    confidenceReason =
      "Evidence support is solid, but recency, source quality, or uncertainty signals still warrant review."
  }

  if (hasConflictingSignal || needsMoreContext) {
    confidence = "watch"
    confidenceReason = hasConflictingSignal
      ? "The answer or source snippets signal conflicting evidence that should be reviewed directly."
      : "Critical patient context appears to be missing, so the answer should be refined before use."
  }

  const { grade: overallGrade, reason: overallGradeReason, gradedCitations } = computeOverallGrade(citations)
  const conflictDetails = detectConflictDetails(content, citations)

  return {
    workflow,
    isBenchmarkBacked: workflow ? BENCHMARK_BACKED_WORKFLOWS.has(normalizeClinicianWorkflowMode(workflow)) : false,
    evidenceCount,
    highestEvidenceLevel,
    latestYear,
    medianYear,
    recencyLabel,
    guidelinePresent,
    hasConflictingSignal,
    needsMoreContext,
    recommendationStrength,
    confidence,
    confidenceReason,
    evidenceLevelBreakdown,
    overallGrade,
    overallGradeReason,
    gradedCitations,
    conflictDetails,
  }
}
