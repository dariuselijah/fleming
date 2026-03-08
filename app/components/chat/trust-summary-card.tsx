"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
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
  CheckCircle,
  Clock,
  ShieldCheck,
  WarningCircle,
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

  const summary = useMemo(
    () => buildTrustSummary(content, citations, prompt),
    [content, citations, prompt]
  )

  const handleSaveQuestion = useCallback(() => {
    if (!prompt?.trim() || !summary.workflow) return

    const latestYear = citations
      .map((citation) => citation.year)
      .filter((year): year is number => typeof year === "number")
      .sort((a, b) => b - a)[0]

    const saved = upsertSavedClinicianQuestion({
      prompt,
      workflow: summary.workflow,
      evidenceCount: citations.length,
      latestYear: latestYear ?? null,
    })
    setSavedQuestion(saved)
    toast({
      title: "Question saved",
      description: "You can re-run it later or refresh it with newer evidence.",
      status: "success",
    })
  }, [citations, prompt, summary.workflow])

  if (citations.length === 0) return null

  const confidenceVariant =
    summary.confidence === "high"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : summary.confidence === "medium"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"

  return (
    <div
      className={[
        "rounded-2xl border border-border/60 bg-muted/25 p-4",
        className || "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {summary.isBenchmarkBacked ? (
              <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="mr-1.5 size-3.5" />
                Benchmark-backed workflow
              </Badge>
            ) : null}
            {summary.workflow ? (
              <Badge variant="outline" className="rounded-full">
                {CLINICIAN_MODE_LABELS[summary.workflow]}
              </Badge>
            ) : null}
            <Badge className={`rounded-full ${confidenceVariant}`}>
              {summary.confidence === "high"
                ? "High confidence"
                : summary.confidence === "medium"
                  ? "Moderate confidence"
                  : "Review carefully"}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Trust summary</p>
            <p className="text-xs text-muted-foreground">{summary.confidenceReason}</p>
          </div>
        </div>

        {prompt?.trim() ? (
          <Button
            type="button"
            size="sm"
            variant={savedQuestion ? "secondary" : "outline"}
            className="rounded-full"
            onClick={handleSaveQuestion}
          >
            <BookmarkSimple className="mr-1.5 size-3.5" />
            {savedQuestion ? "Saved question" : "Save question"}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricPill
          label="Evidence set"
          value={`${summary.evidenceCount} sources`}
          icon={<CheckCircle className="size-3.5" />}
        />
        <MetricPill
          label="Best source tier"
          value={
            summary.highestEvidenceLevel !== null
              ? `Level ${summary.highestEvidenceLevel}`
              : "Unavailable"
          }
          icon={<ShieldCheck className="size-3.5" />}
        />
        <MetricPill
          label="Recency"
          value={summary.latestYear ? `${summary.latestYear}` : "Unknown"}
          icon={<Clock className="size-3.5" />}
        />
        <MetricPill
          label="Guideline signal"
          value={summary.guidelinePresent ? "Present" : "Not obvious"}
          icon={<CheckCircle className="size-3.5" />}
        />
      </div>

      {(summary.hasConflictingSignal || summary.needsMoreContext) && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <WarningCircle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              {summary.hasConflictingSignal ? (
                <p>Possible conflicting evidence detected. Review the underlying studies before acting.</p>
              ) : null}
              {summary.needsMoreContext ? (
                <p>Critical inputs appear to be missing. Add more context to tighten the recommendation.</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricPill({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
