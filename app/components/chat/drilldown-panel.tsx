"use client"

import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import { MessageContent } from "@/components/prompt-kit/message"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { WEB_ROLE_MARKDOWN_CLASSNAME } from "@/app/components/chat/markdown-styles"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { cn } from "@/lib/utils"
import {
  Check,
  CheckCircle,
  Circle,
  Flask,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import type { CitationData } from "./citation-popup"
import { CitationMarkdown } from "./citation-markdown"
import { EvidenceReferencesSection } from "./evidence-references-section"
import type {
  DrilldownRuntimeStatus,
  DrilldownTask,
} from "./use-drilldown-state"

type DrilldownPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: ChartDrilldownPayload | null
  query: string | null
  status: DrilldownRuntimeStatus
  response: string
  citations: EvidenceCitation[]
  error: string | null
  tasks: DrilldownTask[]
  onRetry?: () => void
  onPromoteToChat?: () => void
  isAddingInsight?: boolean
  didAddInsight?: boolean
  isSyncedToDiscussion?: boolean
}

function toCitationData(citation: EvidenceCitation): CitationData {
  return {
    index: citation.index,
    title: citation.title,
    authors: citation.authors || [],
    journal: citation.journal || citation.sourceLabel || "Source",
    year: citation.year ? String(citation.year) : "",
    url: citation.url || undefined,
    doi: citation.doi || undefined,
    pmid: citation.pmid || undefined,
  }
}

function contextLabel(payload: ChartDrilldownPayload | null): string {
  if (!payload) return "Selected chart datapoint"
  const series = payload.seriesLabel || payload.seriesKey || "Series"
  const axisValue =
    typeof payload.xValue === "string" || typeof payload.xValue === "number"
      ? `${payload.xKey}: ${payload.xValue}`
      : payload.xKey
  const value =
    typeof payload.value === "string" || typeof payload.value === "number"
      ? `Value: ${payload.value}`
      : null
  return [series, axisValue, value].filter(Boolean).join(" • ")
}

function statusIcon(status: DrilldownTask["status"]) {
  if (status === "completed") {
    return <CheckCircle className="size-4 text-emerald-500" weight="fill" />
  }
  if (status === "running") {
    return <SpinnerGap className="size-4 animate-spin text-primary" />
  }
  if (status === "failed") {
    return <WarningCircle className="size-4 text-red-500" weight="fill" />
  }
  return <Circle className="size-4 text-muted-foreground" />
}

export function DrilldownPanel({
  open,
  onOpenChange,
  context,
  query,
  status,
  response,
  citations,
  error,
  tasks,
  onRetry,
  onPromoteToChat,
  isAddingInsight = false,
  didAddInsight = false,
  isSyncedToDiscussion = false,
}: DrilldownPanelProps) {
  const citationMap = useMemo(() => {
    const next = new Map<number, CitationData>()
    citations.forEach((citation) => {
      next.set(citation.index, toCitationData(citation))
    })
    return next
  }, [citations])

  const canPromote = status === "ready" && response.trim().length > 0
  const completedTaskCount = useMemo(
    () => tasks.filter((task) => task.status === "completed").length,
    [tasks]
  )
  const allTasksCompleted = useMemo(
    () => tasks.length > 0 && completedTaskCount === tasks.length,
    [completedTaskCount, tasks.length]
  )
  const [taskBoardCollapsed, setTaskBoardCollapsed] = useState(false)

  useEffect(() => {
    if (!open) {
      setTaskBoardCollapsed(false)
      return
    }
    if (!allTasksCompleted || status !== "ready") {
      setTaskBoardCollapsed(false)
      return
    }
    const timeoutId = window.setTimeout(() => {
      setTaskBoardCollapsed(true)
    }, 500)
    return () => window.clearTimeout(timeoutId)
  }, [allTasksCompleted, open, status])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 will-change-transform sm:max-w-2xl">
        <motion.div
          initial={false}
          animate={{ x: open ? 0 : 24, opacity: open ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 36, mass: 0.7 }}
          className="flex h-full min-h-0 flex-col"
        >
          <SheetHeader className="gap-2 border-b border-border/70 pb-4 pr-10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Flask className="size-4 text-primary" />
              Data Point Drill-Down
            </SheetTitle>
            <SheetDescription className="text-xs">
              Isolated micro-agent run for chart evidence analysis.
            </SheetDescription>
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs">
              <p className="font-medium text-foreground/90">{contextLabel(context)}</p>
              {context?.source ? (
                <p className="text-muted-foreground mt-1">Source: {context.source}</p>
              ) : null}
            </div>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-border/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Drill-down Progress
              </p>
              <AnimatePresence initial={false} mode="wait">
                {taskBoardCollapsed ? (
                  <motion.button
                    key="taskboard-collapsed"
                    type="button"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setTaskBoardCollapsed(false)}
                    className="mt-2 flex w-full items-center gap-2 rounded-md border border-emerald-500/35 bg-emerald-500/5 px-2.5 py-2 text-left text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    <CheckCircle className="size-4 text-emerald-500" weight="fill" />
                    <span className="font-medium">
                      {completedTaskCount} tasks verified
                    </span>
                  </motion.button>
                ) : (
                  <motion.div
                    key="taskboard-expanded"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 space-y-1.5 overflow-hidden"
                  >
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs",
                          task.status === "completed" && "border-emerald-500/30 bg-emerald-500/5",
                          task.status === "running" && "border-primary/30 bg-primary/5",
                          task.status === "failed" && "border-red-500/30 bg-red-500/5",
                          task.status === "pending" && "border-border/70 bg-background/70"
                        )}
                      >
                        {statusIcon(task.status)}
                        <div className="min-w-0">
                          <p className="font-medium">{task.label}</p>
                          {task.detail ? (
                            <p className="text-muted-foreground mt-0.5 line-clamp-2">{task.detail}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <AnimatePresence mode="wait">
                {status === "running" ? (
                  <motion.div
                    key="drilldown-running"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm"
                  >
                    <p className="font-medium">Analyzing selected datapoint...</p>
                    {query ? (
                      <p className="text-muted-foreground mt-1 text-xs">{query}</p>
                    ) : null}
                  </motion.div>
                ) : null}

                {status === "error" ? (
                  <motion.div
                    key="drilldown-error"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm"
                  >
                    <p className="font-medium text-red-700 dark:text-red-300">
                      Drill-down run failed
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {error || "Unable to complete drill-down analysis."}
                    </p>
                  </motion.div>
                ) : null}

                {status === "ready" && response.trim().length > 0 ? (
                  <motion.div
                    key="drilldown-ready"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    <CitationMarkdown
                      className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)}
                      citations={citationMap}
                      evidenceCitations={citations}
                    >
                      {response}
                    </CitationMarkdown>
                    {citations.length > 0 ? (
                      <EvidenceReferencesSection citations={citations} />
                    ) : null}
                  </motion.div>
                ) : null}

                {status === "ready" && response.trim().length === 0 ? (
                  <motion.div
                    key="drilldown-empty"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <MessageContent className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)} markdown>
                      No detailed analysis was generated for this datapoint.
                    </MessageContent>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <SheetFooter className="border-t border-border/70 pt-3">
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={status === "running" || !onRetry}
              >
                Retry Drill-Down
              </Button>
              {isSyncedToDiscussion ? (
                <Button type="button" size="sm" variant="secondary" disabled>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5" weight="bold" />
                    Synced to Discussion
                  </span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={onPromoteToChat}
                  disabled={!canPromote || !onPromoteToChat || isAddingInsight || didAddInsight}
                >
                  {isAddingInsight ? (
                    <span className="inline-flex items-center gap-1.5">
                      <SpinnerGap className="size-3.5 animate-spin" />
                      Adding...
                    </span>
                  ) : didAddInsight ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="size-3.5" weight="bold" />
                      Added
                    </span>
                  ) : (
                    "Add to Main Discussion"
                  )}
                </Button>
              )}
            </div>
          </SheetFooter>
        </motion.div>
      </SheetContent>
    </Sheet>
  )
}
