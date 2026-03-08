"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CLINICIAN_MODE_LABELS,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import {
  getSavedClinicianQuestions,
  isEvidenceRefreshDue,
  markSavedQuestionReviewed,
  removeSavedClinicianQuestion,
  type SavedClinicianQuestion,
} from "@/lib/saved-clinician-questions"
import {
  CaretDown,
  CaretUp,
  ClockCounterClockwise,
  Lightning,
  Trash,
} from "@phosphor-icons/react"

type SavedClinicianQuestionsProps = {
  onUseQuestion: (question: SavedClinicianQuestion, refreshMode?: boolean) => void
  onSwitchWorkflow?: (mode: ClinicianWorkflowMode) => void
  className?: string
}

export function SavedClinicianQuestions({
  onUseQuestion,
  onSwitchWorkflow,
  className,
}: SavedClinicianQuestionsProps) {
  const [questions, setQuestions] = useState<SavedClinicianQuestion[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

  const loadQuestions = useCallback(() => {
    setQuestions(getSavedClinicianQuestions())
  }, [])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  useEffect(() => {
    const handleStorage = () => loadQuestions()
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [loadQuestions])

  const handleRun = useCallback(
    (question: SavedClinicianQuestion, refreshMode = false) => {
      markSavedQuestionReviewed(question.id)
      loadQuestions()
      onSwitchWorkflow?.(question.workflow)
      onUseQuestion(question, refreshMode)
    },
    [loadQuestions, onSwitchWorkflow, onUseQuestion]
  )

  const handleRemove = useCallback(
    (id: string) => {
      removeSavedClinicianQuestion(id)
      loadQuestions()
    },
    [loadQuestions]
  )

  const visibleQuestions = useMemo(
    () => (isExpanded ? questions.slice(0, 8) : questions.slice(0, 4)),
    [isExpanded, questions]
  )

  if (questions.length === 0) return null

  return (
    <section
      className={className}
      aria-label="Saved clinician questions"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Saved questions</h3>
          <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[11px]">
            {questions.length}
          </Badge>
        </div>
        {questions.length > 4 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs text-muted-foreground"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? (
              <>
                <CaretUp className="mr-1.5 size-3.5" />
                Show less
              </>
            ) : (
              <>
                <CaretDown className="mr-1.5 size-3.5" />
                Show all
              </>
            )}
          </Button>
        ) : null}
      </div>

      <div
        className={
          isExpanded
            ? "grid gap-3 md:grid-cols-2"
            : "flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]"
        }
      >
        {visibleQuestions.map((question) => {
          const refreshDue = isEvidenceRefreshDue(question)

          return (
            <div
              key={question.id}
              className={
                isExpanded
                  ? "rounded-2xl border border-border/60 bg-background/70 p-4 shadow-xs"
                  : "min-w-[300px] max-w-[300px] rounded-2xl border border-border/60 bg-background/70 p-4 shadow-xs"
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  {CLINICIAN_MODE_LABELS[question.workflow]}
                </Badge>
                {refreshDue ? (
                  <Badge className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    Evidence refresh due
                  </Badge>
                ) : null}
                {typeof question.evidenceCount === "number" ? (
                  <Badge variant="secondary" className="rounded-full">
                    {question.evidenceCount} sources
                  </Badge>
                ) : null}
              </div>

              <p className="line-clamp-2 text-sm font-medium leading-6">{question.title}</p>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {question.prompt}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground">
                  Updated{" "}
                  {new Date(question.lastReviewedAt || question.savedAt).toLocaleDateString()}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => handleRun(question, false)}
                  >
                    <ClockCounterClockwise className="mr-1.5 size-3" />
                    Re-run
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => handleRun(question, true)}
                  >
                    <Lightning className="mr-1.5 size-3" />
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-full text-muted-foreground"
                    onClick={() => handleRemove(question.id)}
                    aria-label="Remove saved question"
                  >
                    <Trash className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
