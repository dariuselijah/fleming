"use client"

import { cn } from "@/lib/utils"
import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import {
  CaretDown,
  CheckCircle,
  Code,
  Link,
  Nut,
  Spinner,
  Wrench,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

interface ToolInvocationProps {
  toolInvocations: ToolInvocationUIPart[]
  className?: string
  defaultOpen?: boolean
  inline?: boolean
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
}

type YouTubeToolResultItem = {
  videoId: string
  url: string
  title: string
  description?: string
  channelTitle: string
  thumbnailUrl?: string | null
}

type DocumentArtifactSection = {
  heading: string
  content: string
}

type DocumentArtifactResult = {
  artifactType: "document"
  artifactId: string
  title: string
  query: string
  citationStyle: "harvard" | "apa" | "vancouver"
  includeReferences?: boolean
  markdown: string
  sections: DocumentArtifactSection[]
  bibliography: Array<{ index: number; entry: string }>
  citations: Array<{ index: number; title?: string; url?: string | null }>
  warnings: string[]
  uploadTitle?: string | null
  generatedAt: string
}

type QuizArtifactQuestion = {
  id: string
  prompt: string
  options: string[]
  correctOptionIndex: number
  explanation: string
  citationIndices: number[]
}

type QuizArtifactResult = {
  artifactType: "quiz"
  artifactId: string
  title: string
  query: string
  questions: QuizArtifactQuestion[]
  citations: Array<{ index: number; title?: string; url?: string | null }>
  warnings: string[]
  uploadTitle?: string | null
  generatedAt: string
}

type ArtifactRefinementChoice = {
  id: string
  label: string
  submitText: string
  requiresCustomInput?: boolean
}

type ArtifactRefinementResult = {
  kind: "artifact-refinement"
  intent: "document" | "quiz"
  title: string
  question: string
  helperText?: string
  requiredFields?: string[]
  customInputPlaceholder?: string
  choices: ArtifactRefinementChoice[]
}

function isDocumentArtifactResult(value: unknown): value is DocumentArtifactResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as DocumentArtifactResult).artifactType === "document" &&
      typeof (value as DocumentArtifactResult).title === "string" &&
      Array.isArray((value as DocumentArtifactResult).sections)
  )
}

function isQuizArtifactResult(value: unknown): value is QuizArtifactResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as QuizArtifactResult).artifactType === "quiz" &&
      typeof (value as QuizArtifactResult).title === "string" &&
      Array.isArray((value as QuizArtifactResult).questions)
  )
}

function isArtifactRefinementResult(
  value: unknown
): value is ArtifactRefinementResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ArtifactRefinementResult).kind === "artifact-refinement" &&
      ((value as ArtifactRefinementResult).intent === "document" ||
        (value as ArtifactRefinementResult).intent === "quiz") &&
      Array.isArray((value as ArtifactRefinementResult).choices)
  )
}

function extractArtifactRefinementResult(
  value: unknown,
  depth = 0
): ArtifactRefinementResult | null {
  if (depth > 6) return null
  if (isArtifactRefinementResult(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return extractArtifactRefinementResult(parsed, depth + 1)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  const directWrapperKeys = [
    "refinement",
    "result",
    "data",
    "payload",
    "value",
    "output",
    "response",
    "json",
  ] as const
  for (const key of directWrapperKeys) {
    const nested = candidate[key]
    const resolved = extractArtifactRefinementResult(nested, depth + 1)
    if (resolved) return resolved
  }
  const invocationResult = (candidate.toolInvocation as Record<string, unknown> | undefined)?.result
  const resolvedFromInvocation = extractArtifactRefinementResult(
    invocationResult,
    depth + 1
  )
  if (resolvedFromInvocation) return resolvedFromInvocation
  const contentEntries = Array.isArray(candidate.content) ? candidate.content : []
  for (const entry of contentEntries) {
    const resolved = extractArtifactRefinementResult(entry, depth + 1)
    if (resolved) return resolved
    if (entry && typeof entry === "object") {
      const entryObj = entry as Record<string, unknown>
      const fromJson = extractArtifactRefinementResult(entryObj.json, depth + 1)
      if (fromJson) return fromJson
      const fromPayload = extractArtifactRefinementResult(entryObj.payload, depth + 1)
      if (fromPayload) return fromPayload
      const fromData = extractArtifactRefinementResult(entryObj.data, depth + 1)
      if (fromData) return fromData
      if (typeof entryObj.text === "string") {
        const fromText = extractArtifactRefinementResult(entryObj.text, depth + 1)
        if (fromText) return fromText
      }
    }
  }
  if (typeof candidate.text === "string") {
    const fromText = extractArtifactRefinementResult(candidate.text, depth + 1)
    if (fromText) return fromText
  }
  if (Array.isArray(candidate.parts)) {
    for (const part of candidate.parts) {
      const resolved = extractArtifactRefinementResult(part, depth + 1)
      if (resolved) return resolved
    }
  }
  return null
}

function parseFilenameFromDisposition(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/filename="?([^"]+)"?/i)
  return match?.[1] || null
}

function DocumentArtifactCard({ artifact }: { artifact: DocumentArtifactResult }) {
  const [isExporting, setIsExporting] = useState<"pdf" | "docx" | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async (format: "pdf" | "docx") => {
    setIsExporting(format)
    setExportError(null)
    try {
      const response = await fetch("/api/documents/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          format,
          artifact,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || "Failed to export artifact")
      }

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const fallbackName = `${artifact.title || "document-artifact"}.${format}`
      const filename =
        parseFilenameFromDisposition(response.headers.get("Content-Disposition")) ||
        fallbackName
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Failed to export artifact"
      )
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{artifact.title}</p>
            <p className="text-muted-foreground text-xs">
              {artifact.uploadTitle ? `${artifact.uploadTitle} • ` : ""}
              {artifact.includeReferences
                ? `Style: ${artifact.citationStyle.toUpperCase()}`
                : "Reference style: not forced"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={Boolean(isExporting)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              {isExporting === "pdf" ? "Exporting..." : "Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("docx")}
              disabled={Boolean(isExporting)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              {isExporting === "docx" ? "Exporting..." : "Export DOCX"}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {artifact.sections.slice(0, 3).map((section) => (
            <div key={section.heading}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.heading}
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm">
                {section.content}
              </p>
            </div>
          ))}
        </div>
        {Array.isArray(artifact.warnings) && artifact.warnings.length > 0 ? (
          <div className="mt-3 rounded-md border border-amber-300/70 bg-amber-50/70 p-2 text-xs">
            <p className="font-semibold uppercase tracking-wide text-amber-900/80">
              Retrieval Warnings
            </p>
            <p className="mt-1 text-amber-950/90">
              {artifact.warnings.slice(0, 2).join(" | ")}
            </p>
          </div>
        ) : null}
        {exportError ? (
          <p className="mt-2 text-xs text-red-500">{exportError}</p>
        ) : null}
      </div>
    </div>
  )
}

function QuizArtifactCard({ artifact }: { artifact: QuizArtifactResult }) {
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
    <div className="space-y-3 rounded-md border border-border/80 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{artifact.title}</p>
          <p className="text-muted-foreground text-xs">
            {total} questions • interactive MCQ
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

      <div className="space-y-3">
        {artifact.questions.map((question, idx) => (
          <div key={question.id} className="rounded-md border border-border bg-background p-2.5">
            <p className="text-sm font-medium">
              {idx + 1}. {question.prompt}
            </p>
            <div className="mt-2 space-y-1.5">
              {question.options.map((option, optionIndex) => {
                const selected = answers[question.id] === optionIndex
                const isCorrect = question.correctOptionIndex === optionIndex
                const revealCorrect = submitted && isCorrect
                const revealWrong = submitted && selected && !isCorrect
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
                      "w-full rounded-md border px-2 py-1.5 text-left text-sm transition",
                      selected ? "border-primary/60 bg-primary/10" : "border-border hover:bg-accent/40",
                      revealCorrect && "border-green-500/50 bg-green-500/10",
                      revealWrong && "border-red-500/40 bg-red-500/10"
                    )}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
            {submitted ? (
              <p className="mt-2 text-xs text-muted-foreground">{question.explanation}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
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
          <p className="text-xs text-muted-foreground">
            Answer all questions to score
          </p>
        )}
      </div>
    </div>
  )
}

function ArtifactRefinementCard({
  refinement,
  onSuggestion,
}: {
  refinement: ArtifactRefinementResult
  onSuggestion?: (suggestion: string) => void
}) {
  const [customInput, setCustomInput] = useState("")
  const customChoice =
    refinement.choices.find((choice) => choice.requiresCustomInput) || null

  return (
    <div className="rounded-2xl bg-gradient-to-r from-violet-200/50 via-fuchsia-200/45 to-purple-200/55 p-[1px]">
      <div className="space-y-3 rounded-[15px] border border-violet-200/60 bg-background/98 p-3.5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/80">
          Refine Generation
        </p>
        <p className="mt-1 text-sm font-semibold">{refinement.title}</p>
        <p className="mt-1 text-sm">{refinement.question}</p>
        {refinement.helperText ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {refinement.helperText}
          </p>
        ) : null}
      </div>

      {Array.isArray(refinement.requiredFields) &&
      refinement.requiredFields.length > 0 ? (
        <div className="rounded-md border border-border/70 bg-background p-2">
          <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
            Required Details
          </p>
          <p className="mt-1 text-xs">
            {refinement.requiredFields.join(" • ")}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {refinement.choices
          .filter((choice) => !choice.requiresCustomInput)
          .map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onSuggestion?.(choice.submitText)}
              disabled={!onSuggestion}
              className="hover:bg-violet-50/70 disabled:text-muted-foreground flex w-full items-start gap-2 rounded-lg border border-violet-200/70 bg-background px-2.5 py-2 text-left text-sm transition disabled:cursor-not-allowed"
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-200/80 text-[11px] font-semibold text-violet-700/90">
                {choice.id}
              </span>
              <span>{choice.label}</span>
            </button>
          ))}
      </div>

      {customChoice ? (
        <div className="rounded-md border border-border bg-background p-2.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {customChoice.id}. {customChoice.label}
          </p>
          <textarea
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder={
              refinement.customInputPlaceholder ||
              "Type your custom requirements here"
            }
            className="mt-2 min-h-[78px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const value = customInput.trim()
                if (!value) return
                onSuggestion?.(value)
                setCustomInput("")
              }}
              disabled={!onSuggestion || customInput.trim().length === 0}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              Submit custom requirements
            </button>
          </div>
        </div>
      ) : null}
    </div>
    </div>
  )
}

function ArtifactRefinementFallbackCard({
  intent,
  onSuggestion,
}: {
  intent: "document" | "quiz"
  onSuggestion?: (suggestion: string) => void
}) {
  const [customInput, setCustomInput] = useState("")
  const suggestions = [
    {
      id: "A",
      label: "Focus on one core topic from the upload",
      submitText: `Generate a focused ${intent} on one core topic from this upload.`,
    },
    {
      id: "B",
      label: "Use a specific page range (for example pages 10-25)",
      submitText: `Generate this ${intent} using a specific page range from the upload.`,
    },
    {
      id: "C",
      label: "Cover all major topics with balanced depth",
      submitText: `Generate a balanced mixed-topic ${intent} across major sections.`,
    },
    {
      id: "D",
      label: "Match my level and exam style",
      submitText: `Generate this ${intent} at my level with exam-style structure.`,
    },
  ]

  return (
    <div className="rounded-2xl bg-gradient-to-r from-violet-200/50 via-fuchsia-200/45 to-purple-200/55 p-[1px]">
      <div className="space-y-3 rounded-[15px] border border-violet-200/60 bg-background/98 p-3.5 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/80">
            Refine Generation
          </p>
          <p className="mt-1 text-sm font-semibold">
            Pick a scope to continue
          </p>
          <p className="mt-1 text-sm">
            I am ready to generate your {intent}. Choose A-D or type custom requirements in E.
          </p>
        </div>
        <div className="space-y-2">
          {suggestions.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onSuggestion?.(choice.submitText)}
              disabled={!onSuggestion}
              className="hover:bg-violet-50/70 disabled:text-muted-foreground flex w-full items-start gap-2 rounded-lg border border-violet-200/70 bg-background px-2.5 py-2 text-left text-sm transition disabled:cursor-not-allowed"
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-200/80 text-[11px] font-semibold text-violet-700/90">
                {choice.id}
              </span>
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
        <div className="rounded-md border border-border bg-background p-2.5">
          <p className="text-xs font-semibold text-muted-foreground">
            E. Custom requirements (blank)
          </p>
          <textarea
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            placeholder={`Type custom ${intent} requirements here`}
            className="mt-2 min-h-[78px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const value = customInput.trim()
                if (!value) return
                onSuggestion?.(value)
                setCustomInput("")
              }}
              disabled={!onSuggestion || customInput.trim().length === 0}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              Submit custom requirements
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TRANSITION = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
}

export function ToolInvocation({
  toolInvocations,
  className,
  defaultOpen = false,
  inline = false,
  onSuggestion,
  onWorkflowSuggestion,
}: ToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen)

  const toolInvocationsData = Array.isArray(toolInvocations)
    ? toolInvocations
    : [toolInvocations]

  if (inline) {
    return (
      <div className={cn("mb-2", className)}>
        <div className="space-y-2">
          {toolInvocationsData.map((invocation, index) => (
            <SingleToolCard
              key={`${invocation.toolInvocation.toolCallId}-${index}-${invocation.toolInvocation.state}`}
              toolData={invocation}
              defaultOpen={defaultOpen}
              compact
              onSuggestion={onSuggestion}
              onWorkflowSuggestion={onWorkflowSuggestion}
            />
          ))}
        </div>
      </div>
    )
  }

  // Group tool invocations by toolCallId
  const groupedTools = toolInvocationsData.reduce(
    (acc, item) => {
      const { toolCallId } = item.toolInvocation
      if (!acc[toolCallId]) {
        acc[toolCallId] = []
      }
      acc[toolCallId].push(item)
      return acc
    },
    {} as Record<string, ToolInvocationUIPart[]>
  )

  const uniqueToolIds = Object.keys(groupedTools)
  const isSingleTool = uniqueToolIds.length === 1

  if (isSingleTool) {
    return (
      <SingleToolView
        toolInvocations={toolInvocationsData}
        defaultOpen={defaultOpen}
        className="mb-10"
        onSuggestion={onSuggestion}
        onWorkflowSuggestion={onWorkflowSuggestion}
      />
    )
  }

  return (
    <div className="mb-10">
      <div className="border-border flex flex-col gap-0 overflow-hidden rounded-md border">
        <button
          onClick={(e) => {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }}
          type="button"
          className="hover:bg-accent flex w-full flex-row items-center rounded-t-md px-3 py-2 transition-colors"
        >
          <div className="flex flex-1 flex-row items-center gap-2 text-left text-base">
            <Nut className="text-muted-foreground size-4" />
            <span className="text-sm">Tools executed</span>
            <div className="bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5 font-mono text-xs">
              {uniqueToolIds.length}
            </div>
          </div>
          <CaretDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded ? "rotate-180 transform" : ""
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={TRANSITION}
              className="overflow-hidden"
            >
              <div className="px-3 pt-3 pb-3">
                <div className="space-y-2">
                  {uniqueToolIds.map((toolId) => {
                    const toolInvocationsForId = groupedTools[toolId]

                    if (!toolInvocationsForId?.length) return null

                    return (
                      <div
                        key={toolId}
                        className="pb-2 last:border-0 last:pb-0"
                      >
                        <SingleToolView
                          toolInvocations={toolInvocationsForId}
                          onSuggestion={onSuggestion}
                          onWorkflowSuggestion={onWorkflowSuggestion}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

type SingleToolViewProps = {
  toolInvocations: ToolInvocationUIPart[]
  defaultOpen?: boolean
  className?: string
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
}

function SingleToolView({
  toolInvocations,
  defaultOpen = false,
  className,
  onSuggestion,
  onWorkflowSuggestion,
}: SingleToolViewProps) {
  // Group by toolCallId and pick the most informative state
  const groupedTools = toolInvocations.reduce(
    (acc, item) => {
      const { toolCallId } = item.toolInvocation
      if (!acc[toolCallId]) {
        acc[toolCallId] = []
      }
      acc[toolCallId].push(item)
      return acc
    },
    {} as Record<string, ToolInvocationUIPart[]>
  )

  // For each toolCallId, get the most informative state (result > call > requested)
  const toolsToDisplay = Object.values(groupedTools)
    .map((group) => {
      const resultTool = group.find(
        (item) => item.toolInvocation.state === "result"
      )
      const callTool = group.find(
        (item) => item.toolInvocation.state === "call"
      )
      const partialCallTool = group.find(
        (item) => item.toolInvocation.state === "partial-call"
      )

      // Return the most informative one
      return resultTool || callTool || partialCallTool
    })
    .filter(Boolean) as ToolInvocationUIPart[]

  if (toolsToDisplay.length === 0) return null

  // If there's only one tool, display it directly
  if (toolsToDisplay.length === 1) {
    return (
      <SingleToolCard
        toolData={toolsToDisplay[0]}
        defaultOpen={defaultOpen}
        className={className}
        onSuggestion={onSuggestion}
        onWorkflowSuggestion={onWorkflowSuggestion}
      />
    )
  }

  // If there are multiple tools, show them in a list
  return (
    <div className={className}>
      <div className="space-y-4">
        {toolsToDisplay.map((tool) => (
          <SingleToolCard
            key={tool.toolInvocation.toolCallId}
            toolData={tool}
            defaultOpen={defaultOpen}
            onSuggestion={onSuggestion}
            onWorkflowSuggestion={onWorkflowSuggestion}
          />
        ))}
      </div>
    </div>
  )
}

// New component to handle individual tool cards
function SingleToolCard({
  toolData,
  defaultOpen = false,
  className,
  compact = false,
  onSuggestion,
  onWorkflowSuggestion,
}: {
  toolData: ToolInvocationUIPart
  defaultOpen?: boolean
  className?: string
  compact?: boolean
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
}) {
  const { toolInvocation } = toolData
  const { state, toolName, toolCallId, args } = toolInvocation
  const isRefinementToolName = /refine.*requirements/i.test(toolName || "")
  const [isExpanded, setIsExpanded] = useState(
    defaultOpen || isRefinementToolName
  )
  const isLoading = state === "call"
  const isCompleted = state === "result"
  const result = isCompleted ? toolInvocation.result : undefined

  useEffect(() => {
    if (isRefinementToolName) {
      setIsExpanded(true)
    }
  }, [isRefinementToolName])

  // Parse the result JSON if available
  const { parsedResult, parseError } = useMemo(() => {
    if (!isCompleted || !result) return { parsedResult: null, parseError: null }

    try {
      if (Array.isArray(result))
        return { parsedResult: result, parseError: null }

      if (
        typeof result === "object" &&
        result !== null &&
        "content" in result
      ) {
        const textContent = result.content?.find(
          (item: { type: string }) => item.type === "text"
        )
        if (!textContent?.text) {
          // Some providers return structured tool results with non-text content.
          // Fall back to the raw object so custom renderers can still detect it.
          return { parsedResult: result, parseError: null }
        }

        try {
          return {
            parsedResult: JSON.parse(textContent.text),
            parseError: null,
          }
        } catch {
          return { parsedResult: textContent.text, parseError: null }
        }
      }

      return { parsedResult: result, parseError: null }
    } catch {
      return { parsedResult: null, parseError: "Failed to parse result" }
    }
  }, [isCompleted, result])
  const refinementResult = extractArtifactRefinementResult(parsedResult)
  const isRefinementResult = Boolean(refinementResult)
  const refinementIntentFromToolName: "document" | "quiz" =
    String(toolName || "").toLowerCase().includes("quiz") ? "quiz" : "document"
  const showExpanded = isRefinementToolName || isExpanded

  // Format the arguments for display
  const formattedArgs = args
    ? Object.entries(args).map(([key, value]) => (
        <div key={key} className="mb-1">
          <span className="text-muted-foreground font-medium">{key}:</span>{" "}
          <span className="font-mono">
            {typeof value === "object"
              ? value === null
                ? "null"
                : Array.isArray(value)
                  ? value.length === 0
                    ? "[]"
                    : JSON.stringify(value)
                  : JSON.stringify(value)
              : String(value)}
          </span>
        </div>
      ))
    : null

  // Render generic results based on their structure
  const renderResults = () => {
    if (isRefinementToolName && !refinementResult) {
      return (
        <div className="space-y-2">
          {parseError ? (
            <p className="text-xs text-muted-foreground">
              Refinement payload was sparse, showing fallback options.
            </p>
          ) : null}
          <ArtifactRefinementFallbackCard
            intent={refinementIntentFromToolName}
            onSuggestion={onWorkflowSuggestion || onSuggestion}
          />
        </div>
      )
    }
    if (!parsedResult) return "No result data available"

    if (isDocumentArtifactResult(parsedResult)) {
      return <DocumentArtifactCard artifact={parsedResult} />
    }
    if (isQuizArtifactResult(parsedResult)) {
      return <QuizArtifactCard artifact={parsedResult} />
    }
    if (refinementResult) {
      return (
        <ArtifactRefinementCard
          refinement={refinementResult}
          onSuggestion={onWorkflowSuggestion || onSuggestion}
        />
      )
    }

    const renderYouTubeResultItems = (items: YouTubeToolResultItem[]) => (
      <div className="space-y-2">
        {items.map((item) => (
          <a
            key={item.videoId}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border hover:bg-accent/30 flex gap-2 rounded-md border p-2 transition-colors"
          >
            <div className="bg-muted relative h-20 w-32 shrink-0 overflow-hidden rounded">
              {item.thumbnailUrl ? (
                <Image
                  src={item.thumbnailUrl}
                  alt={item.title}
                  fill
                  sizes="128px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
                  No thumbnail
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="line-clamp-2 font-medium">{item.title}</div>
              <div className="text-muted-foreground mt-1 text-xs">
                {item.channelTitle}
              </div>
              {item.description ? (
                <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {item.description}
                </div>
              ) : null}
            </div>
          </a>
        ))}
      </div>
    )

    // Handle array of items with url, title, and snippet (like search results)
    if (Array.isArray(parsedResult) && parsedResult.length > 0) {
      if (
        parsedResult.every(
          (item) =>
            item &&
            typeof item === "object" &&
            "videoId" in item &&
            "url" in item &&
            "title" in item &&
            "channelTitle" in item
        )
      ) {
        return renderYouTubeResultItems(parsedResult as YouTubeToolResultItem[])
      }

      // Check if items look like search results
      if (
        parsedResult[0] &&
        typeof parsedResult[0] === "object" &&
        "url" in parsedResult[0] &&
        "title" in parsedResult[0]
      ) {
        return (
          <div className="space-y-3">
            {parsedResult.map(
              (
                item: { url: string; title: string; snippet?: string },
                index: number
              ) => (
                <div
                  key={index}
                  className="border-border border-b pb-3 last:border-0 last:pb-0"
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary group flex items-center gap-1 font-medium hover:underline"
                  >
                    {item.title}
                    <Link className="h-3 w-3 opacity-70 transition-opacity group-hover:opacity-100" />
                  </a>
                  <div className="text-muted-foreground mt-1 font-mono text-xs">
                    {item.url}
                  </div>
                  {item.snippet && (
                    <div className="mt-1 line-clamp-2 text-sm">
                      {item.snippet}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )
      }

      // Generic array display
      return (
        <div className="font-mono text-xs">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(parsedResult, null, 2)}
          </pre>
        </div>
      )
    }

    // Handle object results
    if (typeof parsedResult === "object" && parsedResult !== null) {
      const resultObj = parsedResult as Record<string, unknown>
      if (
        Array.isArray(resultObj.results) &&
        resultObj.results.length > 0 &&
        resultObj.results.every(
          (item) =>
            item &&
            typeof item === "object" &&
            "videoId" in item &&
            "url" in item &&
            "title" in item &&
            "channelTitle" in item
        )
      ) {
        return renderYouTubeResultItems(
          resultObj.results as YouTubeToolResultItem[]
        )
      }
      const title = typeof resultObj.title === "string" ? resultObj.title : null
      const htmlUrl =
        typeof resultObj.html_url === "string" ? resultObj.html_url : null

      return (
        <div>
          {title && <div className="mb-2 font-medium">{title}</div>}
          {htmlUrl && (
            <div className="mb-2">
              <a
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary flex items-center gap-1 hover:underline"
              >
                <span className="font-mono">{htmlUrl}</span>
                <Link className="h-3 w-3 opacity-70" />
              </a>
            </div>
          )}
          <div className="font-mono text-xs">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(parsedResult, null, 2)}
            </pre>
          </div>
        </div>
      )
    }

    // Handle string results
    if (typeof parsedResult === "string") {
      return <div className="whitespace-pre-wrap">{parsedResult}</div>
    }

    // Fallback
    return "No result data available"
  }

  return (
    compact && isRefinementToolName ? (
      refinementResult ? (
        <ArtifactRefinementCard
          refinement={refinementResult as ArtifactRefinementResult}
          onSuggestion={onWorkflowSuggestion || onSuggestion}
        />
      ) : (
        <ArtifactRefinementFallbackCard
          intent={refinementIntentFromToolName}
          onSuggestion={onWorkflowSuggestion || onSuggestion}
        />
      )
    ) : (
    <div
      className={cn(
        "border-border flex flex-col gap-0 overflow-hidden rounded-md border",
        compact && "rounded-sm",
        className
      )}
    >
      <button
        onClick={(e) => {
          e.preventDefault()
          if (isRefinementToolName) return
          setIsExpanded(!isExpanded)
        }}
        type="button"
        className="hover:bg-accent flex w-full flex-row items-center rounded-t-md px-3 py-2 transition-colors"
      >
        <div className="flex flex-1 flex-row items-center gap-2 text-left text-base">
          <Wrench className="text-muted-foreground size-4" />
          <span className="font-mono text-sm">{toolName}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {isLoading ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, filter: "blur(2px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(2px)" }}
                transition={{ duration: 0.15 }}
                key="loading"
              >
                <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
                  <Spinner className="mr-1 h-3 w-3 animate-spin" />
                  Running
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, filter: "blur(2px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(2px)" }}
                transition={{ duration: 0.15 }}
                key="completed"
              >
                <div className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Completed
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <CaretDown
          className={cn(
            "h-4 w-4 transition-transform",
            showExpanded ? "rotate-180 transform" : ""
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {showExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TRANSITION}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pt-3 pb-3">
              {/* Arguments section */}
              {args && Object.keys(args).length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1 text-xs font-medium">
                    Arguments
                  </div>
                  <div className="bg-background rounded border p-2 text-sm">
                    {formattedArgs}
                  </div>
                </div>
              )}

              {/* Result section */}
              {isCompleted && (
                <div>
                  <div className="text-muted-foreground mb-1 text-xs font-medium">
                    Result
                  </div>
                  <div
                    className={cn(
                      "bg-background rounded border p-2 text-sm",
                      !isRefinementResult && "max-h-60 overflow-auto"
                    )}
                  >
                    {parseError ? (
                      <div className="text-red-500">{parseError}</div>
                    ) : (
                      renderResults()
                    )}
                  </div>
                </div>
              )}

              {/* Tool call ID */}
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <div className="flex items-center">
                  <Code className="mr-1 inline size-3" />
                  Tool Call ID:{" "}
                  <span className="ml-1 font-mono">{toolCallId}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    )
  )
}
