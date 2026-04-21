"use client"

import { useCallback, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { buildTrustSummary } from "@/lib/trust-summary"
import {
  upsertSavedClinicianQuestion,
  type SavedClinicianQuestion,
} from "@/lib/saved-clinician-questions"
import { CLINICIAN_MODE_LABELS } from "@/lib/clinician-mode"
import { toast } from "@/components/ui/toast"
import {
  BookmarkSimple,
  ShieldCheck,
  WarningCircle,
  Clock,
  Scales,
  Star,
  Lightning,
} from "@phosphor-icons/react"

type TrustSummaryCardProps = {
  content: string
  citations: EvidenceCitation[]
  prompt?: string | null
  className?: string
}

export function TrustSummaryCard({
  content,
  citations,
  prompt,
  className,
}: TrustSummaryCardProps) {
  const [savedQuestion, setSavedQuestion] = useState<SavedClinicianQuestion | null>(null)
  const meaningfulCitations = useMemo(
    () =>
      citations.filter((citation) =>
        Boolean(
          citation.sourceId?.trim() ||
            citation.pmid?.trim() ||
            citation.doi?.trim() ||
            citation.url?.trim() ||
            citation.uploadId?.trim() ||
            citation.sourceUnitId?.trim()
        )
      ),
    [citations]
  )

  const summary = useMemo(
    () => buildTrustSummary(content, meaningfulCitations, prompt),
    [content, meaningfulCitations, prompt]
  )

  const handleSaveQuestion = useCallback(() => {
    if (!prompt?.trim() || !summary.workflow) return

    const latestYear = meaningfulCitations
      .map((citation) => citation.year)
      .filter((year): year is number => typeof year === "number")
      .sort((a, b) => b - a)[0]

    const saved = upsertSavedClinicianQuestion({
      prompt,
      workflow: summary.workflow,
      evidenceCount: meaningfulCitations.length,
      latestYear: latestYear ?? null,
    })
    setSavedQuestion(saved)
    toast({
      title: "Question saved",
      description: "You can re-run it later or refresh it with newer evidence.",
      status: "success",
    })
  }, [meaningfulCitations, prompt, summary.workflow])

  if (meaningfulCitations.length === 0) return null

  const confidenceVariant =
    summary.confidence === "high"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : summary.confidence === "medium"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"

  const recencyVariant =
    summary.recencyLabel === "Current"
      ? "text-emerald-600 dark:text-emerald-400"
      : summary.recencyLabel === "Recent"
        ? "text-blue-600 dark:text-blue-400"
        : summary.recencyLabel === "Aging"
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400"

  const strengthLabel =
    summary.recommendationStrength === "strong"
      ? "Strong"
      : summary.recommendationStrength === "moderate"
        ? "Moderate"
        : summary.recommendationStrength === "conditional"
          ? "Conditional"
          : "Insufficient"

  const strengthColor =
    summary.recommendationStrength === "strong"
      ? "text-emerald-600 dark:text-emerald-400"
      : summary.recommendationStrength === "moderate"
        ? "text-blue-600 dark:text-blue-400"
        : "text-amber-600 dark:text-amber-400"

  const gradeLabel =
    summary.overallGrade === "high"
      ? "GRADE: High"
      : summary.overallGrade === "moderate"
        ? "GRADE: Moderate"
        : summary.overallGrade === "low"
          ? "GRADE: Low"
          : "GRADE: Very Low"

  const gradeColor =
    summary.overallGrade === "high"
      ? "text-emerald-600 dark:text-emerald-400"
      : summary.overallGrade === "moderate"
        ? "text-blue-600 dark:text-blue-400"
        : summary.overallGrade === "low"
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400"

  return (
    <div
      className={[
        "rounded-xl border border-border/40 bg-muted/15 px-4 py-3",
        className || "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Badge className={`rounded px-1.5 py-0 text-[10px] font-semibold ${confidenceVariant}`}>
              {summary.confidence === "high"
                ? "High"
                : summary.confidence === "medium"
                  ? "Moderate"
                  : "Low"}
            </Badge>
            {summary.isBenchmarkBacked && (
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {summary.evidenceCount} sources
            {summary.highestEvidenceLevel !== null && ` · L${summary.highestEvidenceLevel}`}
            {summary.latestYear && ` · ${summary.latestYear}`}
            {summary.guidelinePresent && " · Guideline"}
          </span>
        </div>

        {prompt?.trim() ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2 text-xs text-muted-foreground"
            onClick={handleSaveQuestion}
          >
            <BookmarkSimple className="mr-1 size-3" />
            {savedQuestion ? "Saved" : "Save"}
          </Button>
        ) : null}
      </div>

      {/* Recency + Recommendation Strength + GRADE row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {summary.recencyLabel && (
          <span className="flex items-center gap-1">
            <Clock className="size-3 shrink-0" />
            <span className={recencyVariant}>{summary.recencyLabel}</span>
            {summary.medianYear && (
              <span className="text-muted-foreground/60">(med. {summary.medianYear})</span>
            )}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Scales className="size-3 shrink-0" />
          <span className={strengthColor}>{strengthLabel}</span>
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-3 shrink-0" />
          <span className={gradeColor}>{gradeLabel}</span>
        </span>
      </div>

      {summary.overallGradeReason && (
        <div className="mt-1 text-[10px] text-muted-foreground/70">
          {summary.overallGradeReason}
        </div>
      )}

      {(summary.hasConflictingSignal || summary.needsMoreContext) && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            <WarningCircle className="size-3 shrink-0" />
            <span>
              {summary.hasConflictingSignal
                ? "Conflicting evidence detected"
                : "Critical inputs may be missing"}
            </span>
          </div>
          {summary.conflictDetails && (
            <div className="ml-4.5 text-[10px] text-amber-600/80 dark:text-amber-400/70">
              {summary.conflictDetails}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

