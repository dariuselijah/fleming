"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  CLINICIAN_MODE_LABELS,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import {
  dispatchRunSavedQuestionEvent,
  getSavedClinicianQuestions,
  isEvidenceRefreshDue,
  markSavedQuestionReviewed,
  removeSavedClinicianQuestion,
  type SavedClinicianQuestion,
} from "@/lib/saved-clinician-questions"
import {
  BookmarkSimple,
  ClockCounterClockwise,
  Lightning,
  Trash,
} from "@phosphor-icons/react"

type SavedClinicianQuestionsDialogProps = {
  onRunQuestion?: (
    question: SavedClinicianQuestion,
    options?: { refreshMode?: boolean }
  ) => void
  onSwitchWorkflow?: (mode: ClinicianWorkflowMode) => void
  className?: string
  showLabel?: boolean
}

export function SavedClinicianQuestionsDialog({
  onRunQuestion,
  onSwitchWorkflow,
  className,
  showLabel = true,
}: SavedClinicianQuestionsDialogProps) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<SavedClinicianQuestion[]>([])

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

  const sortedQuestions = useMemo(
    () =>
      [...questions].sort(
        (a, b) =>
          new Date(b.lastReviewedAt || b.savedAt).getTime() -
          new Date(a.lastReviewedAt || a.savedAt).getTime()
      ),
    [questions]
  )

  const handleRun = useCallback(
    (question: SavedClinicianQuestion, refreshMode = false) => {
      markSavedQuestionReviewed(question.id)
      onSwitchWorkflow?.(question.workflow)
      if (onRunQuestion) {
        onRunQuestion(question, { refreshMode })
      } else {
        dispatchRunSavedQuestionEvent({
          question,
          refreshMode,
        })
      }
      loadQuestions()
      setOpen(false)
    },
    [loadQuestions, onRunQuestion, onSwitchWorkflow]
  )

  const handleRemove = useCallback(
    (id: string) => {
      removeSavedClinicianQuestion(id)
      loadQuestions()
    },
    [loadQuestions]
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {showLabel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={className ?? "h-8 rounded-full px-3 text-xs"}
            aria-label="Saved questions"
          >
            <BookmarkSimple className="mr-1.5 size-3.5" />
            Saved
            {questions.length > 0 ? (
              <Badge
                variant="secondary"
                className="ml-2 rounded-full px-1.5 py-0 text-[10px]"
              >
                {questions.length}
              </Badge>
            ) : null}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${className ?? "size-8 rounded-full"} relative`}
            aria-label="Saved questions"
          >
            <BookmarkSimple className="size-4" />
            {questions.length > 0 ? (
              <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium">
                {questions.length > 99 ? "99+" : questions.length}
              </span>
            ) : null}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80dvh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 pt-5 pb-4">
          <DialogTitle>Saved clinician questions</DialogTitle>
          <DialogDescription>
            Re-run high-value prompts instantly or refresh with newer evidence.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[64dvh] space-y-3 overflow-y-auto px-5 py-4">
          {sortedQuestions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center">
              <p className="text-sm font-medium">No saved questions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save a question from a trusted response card and it will appear here.
              </p>
            </div>
          ) : null}
          {sortedQuestions.map((question) => {
            const refreshDue = isEvidenceRefreshDue(question)

            return (
              <div
                key={question.id}
                className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-xs"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded-full">
                    {CLINICIAN_MODE_LABELS[question.workflow]}
                  </Badge>
                  {refreshDue ? (
                    <Badge className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Refresh due
                    </Badge>
                  ) : null}
                  {typeof question.evidenceCount === "number" ? (
                    <Badge variant="secondary" className="rounded-full">
                      {question.evidenceCount} sources
                    </Badge>
                  ) : null}
                </div>

                <p className="text-sm font-medium leading-6">{question.title}</p>
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                  {question.prompt}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Updated{" "}
                    {new Date(question.lastReviewedAt || question.savedAt).toLocaleDateString()}
                  </span>
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
      </DialogContent>
    </Dialog>
  )
}
