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
import { useMemo, useState } from "react"

interface ToolInvocationProps {
  toolInvocations: ToolInvocationUIPart[]
  className?: string
  defaultOpen?: boolean
  inline?: boolean
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
}

function SingleToolView({
  toolInvocations,
  defaultOpen = false,
  className,
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
}: {
  toolData: ToolInvocationUIPart
  defaultOpen?: boolean
  className?: string
  compact?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen)
  const { toolInvocation } = toolData
  const { state, toolName, toolCallId, args } = toolInvocation
  const isLoading = state === "call"
  const isCompleted = state === "result"
  const result = isCompleted ? toolInvocation.result : undefined

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
        if (!textContent?.text) return { parsedResult: null, parseError: null }

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
    if (!parsedResult) return "No result data available"

    if (isDocumentArtifactResult(parsedResult)) {
      return <DocumentArtifactCard artifact={parsedResult} />
    }
    if (isQuizArtifactResult(parsedResult)) {
      return <QuizArtifactCard artifact={parsedResult} />
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
                  <div className="bg-background max-h-60 overflow-auto rounded border p-2 text-sm">
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
}
