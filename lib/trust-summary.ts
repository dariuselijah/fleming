import type { EvidenceCitation } from "@/lib/evidence/types"
import {
  normalizeClinicianWorkflowMode,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"

export type TrustLevel = "high" | "medium" | "watch"

export type TrustSummary = {
  workflow: ClinicianWorkflowMode | null
  isBenchmarkBacked: boolean
  evidenceCount: number
  highestEvidenceLevel: number | null
  latestYear: number | null
  guidelinePresent: boolean
  hasConflictingSignal: boolean
  needsMoreContext: boolean
  confidence: TrustLevel
  confidenceReason: string
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

  return {
    workflow,
    isBenchmarkBacked: workflow ? BENCHMARK_BACKED_WORKFLOWS.has(normalizeClinicianWorkflowMode(workflow)) : false,
    evidenceCount,
    highestEvidenceLevel,
    latestYear,
    guidelinePresent,
    hasConflictingSignal,
    needsMoreContext,
    confidence,
    confidenceReason,
  }
}
