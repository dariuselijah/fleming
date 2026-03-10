"use client"

import { MessageContent } from "@/components/prompt-kit/message"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import { useEffect, useMemo, useState } from "react"

type DocumentArtifactCardProps = {
  artifact: DocumentArtifact
  onExport: (artifact: DocumentArtifact, format: "pdf" | "docx") => void
  exportingArtifactId: string | null
}

function buildMarkdownFromDraft(title: string, sections: Array<{ heading: string; content: string }>) {
  const normalizedTitle = title.trim() || "Generated Document"
  const body = sections
    .map((section) => `## ${section.heading}\n${section.content}`)
    .join("\n\n")
  return `# ${normalizedTitle}\n\n${body}`.trim()
}

export function DocumentArtifactCard({
  artifact,
  onExport,
  exportingArtifactId,
}: DocumentArtifactCardProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [draftTitle, setDraftTitle] = useState(artifact.title)
  const [draftSections, setDraftSections] = useState(
    artifact.sections.map((section) => ({ ...section }))
  )

  useEffect(() => {
    setDraftTitle(artifact.title)
    setDraftSections(artifact.sections.map((section) => ({ ...section })))
  }, [artifact])

  const draftMarkdown = useMemo(
    () => buildMarkdownFromDraft(draftTitle, draftSections),
    [draftSections, draftTitle]
  )

  const resetDraft = () => {
    setDraftTitle(artifact.title)
    setDraftSections(artifact.sections.map((section) => ({ ...section })))
  }

  const isPdfExporting = exportingArtifactId === `${artifact.artifactId}:pdf`
  const isDocxExporting = exportingArtifactId === `${artifact.artifactId}:docx`
  const generatedAtLabel = useMemo(() => {
    const parsed = new Date(artifact.generatedAt)
    if (Number.isNaN(parsed.getTime())) return "Unknown"
    return parsed.toLocaleString()
  }, [artifact.generatedAt])

  return (
    <>
      <div className="rounded-xl border border-border bg-background px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium tracking-tight">{artifact.title}</p>
            <p className="text-xs text-muted-foreground">
              {artifact.includeReferences
                ? `Document • ${artifact.citationStyle.toUpperCase()} references`
                : "Document • source-grounded study output"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditorOpen(true)}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              Open editor
            </button>
            <button
              type="button"
              onClick={() => onExport(artifact, "pdf")}
              disabled={Boolean(exportingArtifactId)}
              className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-60"
            >
              {isPdfExporting ? "Exporting..." : "PDF"}
            </button>
            <button
              type="button"
              onClick={() => onExport(artifact, "docx")}
              disabled={Boolean(exportingArtifactId)}
              className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-60"
            >
              {isDocxExporting ? "Exporting..." : "DOCX"}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-h-[94vh] w-[96vw] sm:max-w-[96vw] lg:max-w-[1240px] xl:max-w-[1380px] overflow-hidden border-border/80 p-0">
          <DialogHeader className="border-b border-border/80 bg-muted/10 px-6 pt-5 pb-4">
            <DialogTitle className="text-xl tracking-tight">{artifact.title}</DialogTitle>
            <DialogDescription>
              In-page document editor and preview
            </DialogDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                {artifact.sections.length} sections
              </span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                Generated: {generatedAtLabel}
              </span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                {artifact.includeReferences
                  ? `Style: ${artifact.citationStyle.toUpperCase()}`
                  : "References optional"}
              </span>
            </div>
          </DialogHeader>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/80 bg-background/95 px-6 py-3 backdrop-blur">
            <div className="inline-flex rounded-full border border-border p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setIsPreviewMode(false)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  !isPreviewMode ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewMode(true)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  isPreviewMode ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Preview
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetDraft}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Reset draft
              </button>
              <button
                type="button"
                onClick={() => onExport(artifact, "pdf")}
                disabled={Boolean(exportingArtifactId)}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-60"
              >
                {isPdfExporting ? "Exporting PDF..." : "Export PDF"}
              </button>
            </div>
          </div>
          <div className="grid max-h-[72vh] gap-0 xl:grid-cols-12">
            <div className="overflow-y-auto p-6 xl:col-span-9 xl:pr-5">
              {!isPreviewMode ? (
                <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Title
                  </label>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                {draftSections.map((section, index) => (
                  <div key={`${section.heading}-${index}`} className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.heading || `Section ${index + 1}`}
                    </label>
                    <textarea
                      value={section.content}
                      onChange={(event) =>
                        setDraftSections((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, content: event.target.value }
                              : item
                          )
                        )
                      }
                      className="min-h-[150px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-primary/25"
                    />
                  </div>
                ))}
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 bg-background p-5 shadow-sm">
                  <div className="mx-auto max-w-3xl">
                    <MessageContent markdown>{draftMarkdown}</MessageContent>
                  </div>
                </div>
              )}
            </div>
            <aside className="hidden border-l border-border/80 bg-muted/20 p-5 xl:col-span-3 xl:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Document Outline
              </p>
              <div className="mt-3 space-y-2">
                {draftSections.map((section, index) => (
                  <div
                    key={`${section.heading || "section"}-pill-${index}`}
                    className="rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {index + 1}. {section.heading || `Section ${index + 1}`}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {(section.content || "").slice(0, 92) || "No content yet."}
                      {(section.content || "").length > 92 ? "..." : ""}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Use Edit mode for revisions and Preview mode for final reading.
                </p>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function InteractiveQuizArtifactCard({ artifact }: { artifact: QuizArtifact }) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const total = artifact.questions.length

  const score = artifact.questions.reduce((acc, question) => {
    if (answers[question.id] === question.correctOptionIndex) {
      return acc + 1
    }
    return acc
  }, 0)

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{artifact.title}</p>
          <p className="text-xs text-muted-foreground">
            Quiz • {total} questions • interactive
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAnswers({})
            setSubmitted(false)
          }}
          className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent"
        >
          Reset
        </button>
      </div>

      <div className="mt-3 space-y-3.5">
        {artifact.questions.map((question, questionIndex) => (
          <div key={question.id} className="rounded-lg border border-border p-3.5">
            <p className="text-sm leading-7 font-semibold text-foreground">
              {questionIndex + 1}. {question.prompt}
            </p>
            <div className="mt-2.5 space-y-2">
              {question.options.map((option, optionIndex) => {
                const selected = answers[question.id] === optionIndex
                const isCorrect = optionIndex === question.correctOptionIndex
                const revealCorrect = submitted && isCorrect
                const revealWrong = submitted && selected && !isCorrect
                const optionLabel = String.fromCharCode(65 + optionIndex)
                return (
                  <button
                    key={`${question.id}-${optionIndex}`}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: optionIndex,
                      }))
                    }
                    className={cn(
                      "w-full rounded-md border px-3 py-3 text-left text-sm transition",
                      selected
                        ? "border-primary bg-primary/15 ring-2 ring-primary/35 shadow-sm"
                        : "border-border hover:bg-accent/40",
                      revealCorrect && "border-green-500/50 bg-green-500/10",
                      revealWrong && "border-red-500/40 bg-red-500/10"
                    )}
                  >
                    <span className="flex items-start gap-2.5">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        )}
                      >
                        {optionLabel}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-sm leading-6 text-foreground">
                        {option}
                      </span>
                      {selected ? (
                        <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          Selected
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
            {submitted ? (
              <details className="mt-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  View explanation
                </summary>
                <p className="mt-2 text-xs font-medium">
                  Correct answer:{" "}
                  {String.fromCharCode(65 + question.correctOptionIndex)}.
                </p>
                <p className="mt-1 text-sm leading-6 text-foreground">{question.explanation}</p>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={Object.keys(answers).length < total}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
        >
          Submit Quiz
        </button>
        {submitted ? (
          <p className="text-xs font-medium">
            Score: {score}/{total}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Select one answer per question</p>
        )}
      </div>
    </div>
  )
}
