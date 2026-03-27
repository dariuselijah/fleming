"use client"

import { MessageContent } from "@/components/prompt-kit/message"
import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import { ENABLE_CHART_DRILLDOWN_SUBLOOP } from "@/lib/config"
import { cn } from "@/lib/utils"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type { DocumentArtifact } from "@/lib/uploads/artifacts"
import { getUploadProgressStageLabel, getUploadStatusLabel } from "@/lib/uploads/status-label"
import {
  CaretDown,
  Circle,
  CheckCircle,
  Flask,
  SpinnerGap,
  WarningCircle,
  Wrench,
  XCircle,
} from "@phosphor-icons/react"
// Intentionally keeping activity transitions minimal/static for a calmer UI.
import { useCallback, useMemo, useState } from "react"
import type { CitationData } from "../citation-popup"
import { CitationMarkdown } from "../citation-markdown"
import {
  DocumentArtifactCard,
  InteractiveQuizArtifactCard,
} from "../generated-artifact-cards"
import { Reasoning } from "../reasoning"
import { WEB_ROLE_MARKDOWN_CLASSNAME } from "../markdown-styles"
import { ActivityCard } from "./activity-card"
import { ActivityStatusChip } from "./activity-status-chip"
import type { TimelineEvent } from "./types"

type ActivityTimelineProps = {
  events: TimelineEvent[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
  onChartDrilldown?: (payload: ChartDrilldownPayload) => void
  isDrilldownModeActive?: boolean
  shouldShowCitations: boolean
  citations: Map<number, CitationData>
  evidenceCitations?: EvidenceCitation[]
  onExportDocument: (artifact: DocumentArtifact, format: "pdf" | "docx") => void
  exportingArtifactId: string | null
}

function toolLifecycleTone(
  lifecycle: "queued" | "running" | "completed" | "failed"
) {
  if (lifecycle === "completed") return "success" as const
  if (lifecycle === "failed") return "error" as const
  if (lifecycle === "running") return "running" as const
  return "info" as const
}

function uploadStatusTone(status: "pending" | "processing" | "completed" | "failed") {
  if (status === "completed") return "success" as const
  if (status === "failed") return "error" as const
  if (status === "processing") return "running" as const
  return "info" as const
}

type ToolEvent = Extract<TimelineEvent, { kind: "tool-lifecycle" | "tool-result" }>
type ToolResultPart = Extract<TimelineEvent, { kind: "tool-result" }>["part"]
type TaskBoardEvent = Extract<TimelineEvent, { kind: "task-board" }>

type ToolFamily = {
  key: string
  label: string
}

type ToolCallState = "queued" | "running" | "completed" | "failed"

type ToolCallRow = {
  toolCallId: string
  toolName: string
  detail?: string | null
  firstSequence: number
  state: ToolCallState
  args?: unknown
  result?: unknown
  invocationPart?: ToolResultPart
}

type ToolGroupRow = {
  id: string
  family: ToolFamily
  firstSequence: number
  callRows: ToolCallRow[]
  aggregateState: ToolCallState
}

type RenderRow =
  | { type: "event"; event: TimelineEvent; sortSequence: number }
  | { type: "tool-group"; group: ToolGroupRow; sortSequence: number }

const TOOL_FAMILY_BY_NAME: Record<string, ToolFamily> = {
  pubmedsearch: { key: "pubmed", label: "PubMed" },
  pubmedlookup: { key: "pubmed", label: "PubMed" },
  guidelinesearch: { key: "guideline", label: "Guideline" },
  clinicaltrialssearch: { key: "clinical_trials", label: "Clinical Trials" },
  scholargatewaysearch: { key: "scholar_gateway", label: "Scholar Gateway" },
  biorxivsearch: { key: "biorxiv", label: "bioRxiv" },
  biorendersearch: { key: "biorender", label: "BioRender" },
  npiregistrysearch: { key: "npi_registry", label: "NPI Registry" },
  synapsesearch: { key: "synapse", label: "Synapse" },
  cmscoveragesearch: { key: "cms_coverage", label: "CMS Coverage" },
  chemblsearch: { key: "chembl", label: "ChEMBL" },
  benchlingsearch: { key: "benchling", label: "Benchling" },
  drugsafetylookup: { key: "drug_safety", label: "Drug Safety" },
  evidenceconflictcheck: { key: "evidence_conflict", label: "Evidence Check" },
}

const TOOL_CALL_STATE_RANK: Record<ToolCallState, number> = {
  queued: 1,
  running: 2,
  completed: 3,
  failed: 4,
}

function toFamilyFallbackLabel(name: string): string {
  const normalized = name.trim()
  if (!normalized) return "Tool"
  return normalized
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function getToolFamily(toolName: string): ToolFamily {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return (
    TOOL_FAMILY_BY_NAME[normalized] || {
      key: normalized || "tool",
      label: toFamilyFallbackLabel(toolName),
    }
  )
}

function mergeToolCallState(previous: ToolCallState, next: ToolCallState): ToolCallState {
  return TOOL_CALL_STATE_RANK[next] >= TOOL_CALL_STATE_RANK[previous] ? next : previous
}

function stateFromToolEvent(event: ToolEvent): ToolCallState {
  if (event.kind === "tool-result") return "completed"
  return event.lifecycle
}

function aggregateGroupState(rows: ToolCallRow[]): ToolCallState {
  const hasRunning = rows.some((row) => row.state === "running")
  const hasCompleted = rows.some((row) => row.state === "completed")
  const hasFailed = rows.some((row) => row.state === "failed")
  if (hasRunning) return "running"
  if (hasCompleted) return "completed"
  if (hasFailed) return "failed"
  return "queued"
}

function buildToolGroupRows(events: TimelineEvent[]): ToolGroupRow[] {
  const familyGroups = new Map<
    string,
    {
      family: ToolFamily
      firstSequence: number
      calls: Map<string, ToolCallRow>
    }
  >()

  events.forEach((event) => {
    if (event.kind !== "tool-lifecycle" && event.kind !== "tool-result") return

    const family = getToolFamily(event.toolName)
    const existingFamily = familyGroups.get(family.key)
    if (!existingFamily) {
      familyGroups.set(family.key, {
        family,
        firstSequence: event.sequence,
        calls: new Map<string, ToolCallRow>(),
      })
    } else {
      existingFamily.firstSequence = Math.min(existingFamily.firstSequence, event.sequence)
    }

    const familyGroup = familyGroups.get(family.key)
    if (!familyGroup) return

    const existingCall = familyGroup.calls.get(event.toolCallId)
    const nextState = stateFromToolEvent(event)
    const detail =
      event.kind === "tool-lifecycle" ? (event.detail || event.toolCallId) : event.toolCallId

    if (!existingCall) {
      const invocation =
        event.kind === "tool-result"
          ? (event.part?.toolInvocation as { args?: unknown; result?: unknown } | undefined)
          : undefined
      familyGroup.calls.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        detail,
        firstSequence: event.sequence,
        state: nextState,
        ...(event.kind === "tool-result"
          ? {
              invocationPart: event.part,
              args: invocation?.args,
              result: invocation?.result,
            }
          : {}),
      })
      return
    }

    existingCall.state = mergeToolCallState(existingCall.state, nextState)
    existingCall.firstSequence = Math.min(existingCall.firstSequence, event.sequence)
    if (event.kind === "tool-lifecycle" && event.detail) {
      existingCall.detail = event.detail
      return
    }
    if (event.kind === "tool-result") {
      const invocation = event.part?.toolInvocation as
        | { args?: unknown; result?: unknown }
        | undefined
      existingCall.invocationPart = event.part
      existingCall.args = invocation?.args
      existingCall.result = invocation?.result
    }
  })

  return Array.from(familyGroups.values())
    .map((group) => {
      const callRows = Array.from(group.calls.values()).sort(
        (left, right) => left.firstSequence - right.firstSequence
      )
      if (callRows.length === 0) return null
      return {
        id: `tool-group:${group.family.key}:${group.firstSequence}`,
        family: group.family,
        firstSequence: group.firstSequence,
        callRows,
        aggregateState: aggregateGroupState(callRows),
      } satisfies ToolGroupRow
    })
    .filter((group): group is ToolGroupRow => Boolean(group))
    .sort((left, right) => left.firstSequence - right.firstSequence)
}

function buildRenderableRows(events: TimelineEvent[]): RenderRow[] {
  const toolGroups = buildToolGroupRows(events)
  const rows: RenderRow[] = toolGroups.map((group) => ({
    type: "tool-group",
    group,
    sortSequence: group.firstSequence,
  }))

  events.forEach((event) => {
    if (event.kind === "tool-lifecycle" || event.kind === "tool-result") {
      return
    }
    rows.push({
      type: "event",
      event,
      sortSequence: event.sequence,
    })
  })

  rows.sort((left, right) => {
    if (left.sortSequence !== right.sortSequence) {
      return left.sortSequence - right.sortSequence
    }
    if (left.type !== right.type) {
      return left.type === "tool-group" ? -1 : 1
    }
    if (left.type === "tool-group" && right.type === "tool-group") {
      return left.group.id.localeCompare(right.group.id)
    }
    if (left.type === "event" && right.type === "event") {
      return left.event.id.localeCompare(right.event.id)
    }
    return 0
  })

  return rows
}

function splitRowsByRail(rows: RenderRow[]): {
  activityRows: RenderRow[]
  answerRows: RenderRow[]
} {
  const activityRows: RenderRow[] = []
  const answerRows: RenderRow[] = []

  rows.forEach((row) => {
    if (row.type === "tool-group") {
      activityRows.push(row)
      return
    }
    if (row.event.kind === "message-text" || row.event.kind === "artifact") {
      answerRows.push(row)
      return
    }
    activityRows.push(row)
  })

  return { activityRows, answerRows }
}

function formatPayload(value: unknown, maxChars = 1400): string {
  if (value === null || typeof value === "undefined") return "None"
  if (typeof value === "string") {
    return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value
  }
  try {
    const serialized = JSON.stringify(value, null, 2)
    if (!serialized) return "None"
    return serialized.length > maxChars
      ? `${serialized.slice(0, maxChars - 3)}...`
      : serialized
  } catch {
    const fallback = String(value)
    return fallback.length > maxChars ? `${fallback.slice(0, maxChars - 3)}...` : fallback
  }
}

function extractResultHighlights(result: unknown): string[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return []
  const source = result as Record<string, unknown>
  const highlights: string[] = []

  if (typeof source.totalResults === "number") {
    highlights.push(`${source.totalResults} result${source.totalResults === 1 ? "" : "s"}`)
  }
  if (Array.isArray(source.citations)) {
    highlights.push(`${source.citations.length} citation${source.citations.length === 1 ? "" : "s"}`)
  }
  if (Array.isArray(source.articles)) {
    highlights.push(`${source.articles.length} article${source.articles.length === 1 ? "" : "s"}`)
  }
  if (Array.isArray(source.results)) {
    highlights.push(`${source.results.length} item${source.results.length === 1 ? "" : "s"}`)
  }
  if (typeof source.found === "boolean") {
    highlights.push(source.found ? "match found" : "no match found")
  }

  return highlights.slice(0, 3)
}

function toolStateLabel(state: ToolCallState): string {
  if (state === "queued") return "Queued"
  if (state === "running") return "Running"
  if (state === "completed") return "Completed"
  return "Failed"
}

function toolStateDotClass(state: ToolCallState): string {
  if (state === "completed") return "bg-emerald-500"
  if (state === "failed") return "bg-red-400"
  if (state === "running") return "bg-amber-400"
  return "bg-muted-foreground/35"
}

function taskStatusSegmentClass(state: TaskBoardEvent["items"][number]["status"]): string {
  if (state === "completed") return "bg-emerald-500/80"
  if (state === "failed") return "bg-red-400/80"
  if (state === "running") return "bg-amber-400/90"
  return "bg-muted-foreground/30"
}

function renderStateIcon(state: ToolCallState) {
  if (state === "completed") {
    return <CheckCircle className="size-3.5 text-foreground/70" weight="fill" />
  }
  if (state === "failed") {
    return <XCircle className="size-3.5 text-red-400" weight="fill" />
  }
  if (state === "running") {
    return <SpinnerGap className="size-3.5 animate-spin text-foreground/75" />
  }
  return <Circle className="size-3 text-muted-foreground" />
}

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function extractActiveThought(events: TimelineEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind === "tool-lifecycle" && event.lifecycle === "running") {
      const detail = event.detail?.trim()
      if (detail && detail !== event.toolCallId) {
        return detail
      }
      return `Running ${humanizeToken(event.toolName)}...`
    }
  }

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== "task-board") continue
    const runningTask = [...event.items].reverse().find((item) => item.status === "running")
    if (!runningTask) continue
    return runningTask.detail || runningTask.reasoning || `${runningTask.label}...`
  }

  return null
}

function normalizeTaskStatusForMessage(
  event: TaskBoardEvent,
  messageStatus: ActivityTimelineProps["status"]
): TaskBoardEvent["items"] {
  const withErrorNormalization =
    messageStatus !== "error"
      ? event.items
      : event.items.map((item) =>
    item.status === "running"
      ? {
          ...item,
          status: "failed" as const,
          detail: item.detail || "Task interrupted due to response error.",
        }
      : item
        )
  // Keep the board focused on actually executed work.
  return withErrorNormalization.filter((item) => item.status !== "pending")
}

function aggregateTaskStatus(items: TaskBoardEvent["items"]): "running" | "success" | "error" {
  if (items.length === 0) return "running"
  if (items.some((item) => item.status === "failed")) return "error"
  if (items.some((item) => item.status === "running")) return "running"
  return "success"
}

function TaskBoardCard({
  event,
  status,
}: {
  event: TaskBoardEvent
  status: ActivityTimelineProps["status"]
}) {
  const [showSequence, setShowSequence] = useState(false)
  const normalizedItems = normalizeTaskStatusForMessage(event, status)
  const completedCount = normalizedItems.filter((item) => item.status === "completed").length
  const activeTask = normalizedItems.find((item) => item.status === "running") || null
  const lastCompletedTask =
    [...normalizedItems].reverse().find((item) => item.status === "completed") || null
  const compactTaskIds = new Set<string>()
  if (lastCompletedTask) compactTaskIds.add(lastCompletedTask.id)
  if (activeTask) compactTaskIds.add(activeTask.id)
  const compactTasks =
    compactTaskIds.size > 0
      ? normalizedItems.filter((item) => compactTaskIds.has(item.id))
      : normalizedItems.slice(0, 2)
  const visibleTasks = showSequence ? normalizedItems : compactTasks
  const tone = aggregateTaskStatus(normalizedItems)
  const toneLabel = tone === "success" ? "Ready" : tone === "error" ? "Warning" : "Active"
  const totalTaskCount = Math.max(1, normalizedItems.length)
  const completionLabel = `${completedCount}/${totalTaskCount}`

  return (
    <div className="rounded-xl border border-border/35 bg-zinc-50/50 px-3.5 py-2.5 backdrop-blur-md dark:bg-zinc-900/50">
      <div className="mb-2 flex items-center gap-1">
        {normalizedItems.length > 0 ? (
          normalizedItems.map((item) => (
            <span
              key={`segment-${item.id}`}
              className={cn(
                "h-[2px] flex-1 rounded-full transition",
                taskStatusSegmentClass(item.status)
              )}
            />
          ))
        ) : (
          <span className="h-[2px] flex-1 rounded-full bg-muted-foreground/25" />
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {tone === "running" ? (
            <span className="h-[5px] w-7 overflow-hidden rounded-full bg-foreground/15">
              <span className="block h-full w-1/2 rounded-full bg-foreground/65" />
            </span>
          ) : tone === "success" ? (
            <CheckCircle className="size-4 text-emerald-600" weight="fill" />
          ) : tone === "error" ? (
            <Circle className="size-3 fill-red-400 text-red-400" weight="fill" />
          ) : (
            <Wrench className="size-4 text-foreground/70" weight="fill" />
          )}
          <p className="truncate text-[14px] font-medium">
            {event.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border/50 px-1.5 py-px text-[11px] text-muted-foreground">
            {completionLabel}
          </span>
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
            <span
              className={cn(
                "size-1.5 rounded-full",
                tone === "success"
                  ? "bg-emerald-500"
                  : tone === "error"
                    ? "bg-amber-500"
                    : "bg-zinc-400"
              )}
            />
            {toneLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowSequence((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/45"
            aria-label={showSequence ? "Hide sequence" : "Show sequence"}
          >
            <span className="hidden sm:inline">{showSequence ? "Hide Sequence" : "Show Sequence"}</span>
            <CaretDown className="size-3.5" />
          </button>
        </div>
      </div>
      {visibleTasks.length > 0 ? (
        <div className="overflow-hidden">
            <div className="mt-2 space-y-1">
              {visibleTasks.map((item, index) => (
                <div
                  key={item.id}
                  className="relative flex items-start justify-between gap-2 rounded-md border border-border/35 bg-zinc-100/40 px-2 py-1.5 text-[13px] backdrop-blur-sm dark:bg-zinc-900/35"
                >
                  <div className="absolute top-0 bottom-0 left-[7px]">
                    {index < visibleTasks.length - 1 ? (
                      <span className="block h-full w-px bg-border/60" />
                    ) : null}
                  </div>
                  <div className="relative mt-0.5 flex w-4 shrink-0 items-center justify-center">
                    {item.status === "completed" ? (
                      <CheckCircle className="size-3.5 text-foreground/70" weight="fill" />
                    ) : item.status === "running" ? (
                      <span className="h-[4px] w-7 overflow-hidden rounded-full bg-foreground/15">
                        <span className="block h-full w-1/2 rounded-full bg-foreground/65" />
                      </span>
                    ) : item.status === "failed" ? (
                      <Circle className="size-2.5 fill-red-400 text-red-400" weight="fill" />
                    ) : (
                      <Circle className="size-2.5 fill-amber-400 text-amber-400" weight="fill" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate font-medium",
                        item.status === "running" && "text-foreground/85"
                      )}
                    >
                      {item.label}
                    </p>
                    {item.description ? (
                      <p className="truncate text-[12px] text-muted-foreground">{item.description}</p>
                    ) : item.detail ? (
                      <p className="truncate text-[12px] text-muted-foreground">{item.detail}</p>
                    ) : null}
                    {item.reasoning ? (
                      <p className="truncate text-[12px] text-muted-foreground/90">{item.reasoning}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
        </div>
      ) : null}
    </div>
  )
}

function GroupedToolActivityCard({ group }: { group: ToolGroupRow }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const aggregateLabel = toolStateLabel(group.aggregateState)
  const callCount = group.callRows.length
  const completedCallCount = group.callRows.filter((row) => row.state === "completed").length
  const failedCallCount = group.callRows.filter((row) => row.state === "failed").length
  const callSummary = `${callCount} attempt${callCount === 1 ? "" : "s"}`

  return (
    <div>
      <div className="rounded-lg border border-border/35 bg-zinc-100/40 px-2.5 py-1.5 backdrop-blur-sm dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13px] font-medium">{group.family.label} Activity</p>
              <span className="text-[11px] text-muted-foreground">{callSummary}</span>
              {completedCallCount > 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  ({completedCallCount} successful)
                </span>
              ) : null}
              {failedCallCount > 0 && completedCallCount === 0 ? (
                <span className="text-[10px] text-muted-foreground">({failedCallCount} failed)</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ActivityStatusChip
              label={aggregateLabel}
              tone={toolLifecycleTone(group.aggregateState)}
              iconOnly
            />
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="rounded-md border border-border/50 px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
            >
              Deep Dive
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="rounded-md border border-border/50 p-1 text-muted-foreground transition hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
              aria-label={isExpanded ? "Hide call details" : "View call details"}
            >
              <CaretDown
                className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")}
              />
            </button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          {group.callRows.map((row, index) => {
            const active = selectedCallId === row.toolCallId
            return (
              <button
                key={`${row.toolCallId}-${index}`}
                type="button"
                onClick={() => {
                  setIsExpanded(true)
                  setSelectedCallId((previous) =>
                    previous === row.toolCallId ? null : row.toolCallId
                  )
                }}
                title={row.detail || `${row.toolName} attempt ${index + 1}`}
                aria-label={`${row.toolName} attempt ${index + 1}`}
                className={cn(
                  "size-1.5 rounded-full transition",
                  toolStateDotClass(row.state),
                  active && "ring-1 ring-foreground/35 ring-offset-1 ring-offset-background"
                )}
              />
            )
          })}
        </div>
        {isExpanded ? (
          <div className="overflow-hidden">
              <div className="mt-1.5 max-h-48 space-y-1 overflow-y-auto pr-1">
                {group.callRows.map((row) => {
                  const hasPayload =
                    typeof row.args !== "undefined" || typeof row.result !== "undefined"
                  const isCallExpanded = selectedCallId === row.toolCallId
                  const resultHighlights = extractResultHighlights(row.result)

                  return (
                    <div
                      key={row.toolCallId}
                      onClick={() =>
                        setSelectedCallId((previous) =>
                          previous === row.toolCallId ? null : row.toolCallId
                        )
                      }
                      className={cn(
                        "cursor-pointer rounded-lg border border-border/40 bg-zinc-100/45 px-2 py-1.5 backdrop-blur-sm dark:bg-zinc-900/45",
                        isCallExpanded && "border-primary/25"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{row.toolName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {row.detail || row.toolCallId}
                          </p>
                          {resultHighlights.length > 0 ? (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {resultHighlights.join(" • ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {renderStateIcon(row.state)}
                          {hasPayload ? (
                            <CaretDown
                              className={cn(
                                "size-3.5 text-muted-foreground transition-transform",
                                isCallExpanded && "rotate-180"
                              )}
                            />
                          ) : null}
                        </div>
                      </div>
                      {hasPayload && isCallExpanded ? (
                        <div className="mt-2 space-y-2 rounded-md border border-border/40 bg-zinc-100/45 p-2 backdrop-blur-sm dark:bg-zinc-900/45">
                          {typeof row.args !== "undefined" ? (
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Arguments
                              </p>
                              <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/40 bg-zinc-100/55 p-2 text-[12px] leading-5 dark:bg-zinc-900/55">
                                {formatPayload(row.args)}
                              </pre>
                            </div>
                          ) : null}
                          {typeof row.result !== "undefined" ? (
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Response
                              </p>
                              <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/40 bg-zinc-100/55 p-2 text-[12px] leading-5 dark:bg-zinc-900/55">
                                {formatPayload(row.result)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function GhostActivityTray({ activeThought }: { activeThought: string }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/8 px-3 py-1.5 backdrop-blur-[12px] dark:bg-white/4">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
        <p className="truncate text-[12px]">{activeThought}</p>
      </div>
    </div>
  )
}

export function ActivityTimeline(props: ActivityTimelineProps) {
  const {
    events,
    status,
    onChartDrilldown,
    isDrilldownModeActive = false,
    shouldShowCitations,
    citations,
    evidenceCitations,
    onExportDocument,
    exportingArtifactId,
  } = props
  const handleChartDrilldown = useCallback(
    (payload: ChartDrilldownPayload) => {
      if (!ENABLE_CHART_DRILLDOWN_SUBLOOP) return
      if (!onChartDrilldown) return
      onChartDrilldown(payload)
    },
    [onChartDrilldown]
  )
  const renderRows = useMemo(() => buildRenderableRows(events), [events])
  const rowsForRender = useMemo(
    () =>
      isDrilldownModeActive
        ? renderRows.filter(
            (row) => !(row.type === "event" && row.event.kind === "task-board")
          )
        : renderRows,
    [isDrilldownModeActive, renderRows]
  )
  const { activityRows, answerRows } = useMemo(
    () => splitRowsByRail(rowsForRender),
    [rowsForRender]
  )
  const hasTaskBoard = useMemo(
    () =>
      rowsForRender.some(
        (row) =>
          row.type === "event" &&
          row.event.kind === "task-board" &&
          row.event.items.length > 0
      ),
    [rowsForRender]
  )
  const activeThought = useMemo(
    () => (status === "streaming" ? extractActiveThought(events) : null),
    [events, status]
  )
  const taskBoardRows = useMemo(
    () =>
      activityRows.filter(
        (row) => row.type === "event" && row.event.kind === "task-board"
      ),
    [activityRows]
  )
  const nonTaskActivityRows = useMemo(
    () =>
      activityRows.filter(
        (row) => !(row.type === "event" && row.event.kind === "task-board")
      ),
    [activityRows]
  )

  const renderRow = (row: RenderRow) => {
    if (row.type === "tool-group") {
      return <GroupedToolActivityCard key={row.group.id} group={row.group} />
    }

    const event = row.event
    if (event.kind === "task-board") {
      if (event.items.length === 0) return null
      return <TaskBoardCard key={event.id} event={event} status={status} />
    }

    if (event.kind === "system-intro") {
      if (hasTaskBoard) return null
      return (
        <div key={event.id} className="text-sm text-muted-foreground">
          {event.text}
        </div>
      )
    }

    if (event.kind === "message-text") {
      if (shouldShowCitations) {
        return (
          <CitationMarkdown
            key={event.id}
            className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)}
            citations={citations}
            evidenceCitations={evidenceCitations}
            onChartDrilldown={handleChartDrilldown}
          >
            {event.text}
          </CitationMarkdown>
        )
      }
      return (
        <MessageContent
          key={event.id}
          className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)}
          markdown
            onChartDrilldown={handleChartDrilldown}
        >
          {event.text}
        </MessageContent>
      )
    }

    if (event.kind === "reasoning") {
      return (
        <Reasoning
          key={event.id}
          reasoning={event.text}
          isStreaming={status === "streaming"}
        />
      )
    }

    if (event.kind === "checklist") {
      if (hasTaskBoard) return null
      const completedCount = event.items.filter((item) => item.status === "completed").length
      return (
        <div key={event.id}>
          <ActivityCard
            icon={<Circle className="size-4" />}
            title={event.title || "Running tasks in parallel"}
            subtitle={`${completedCount}/${event.items.length} completed`}
            status={
              <ActivityStatusChip
                label={completedCount === event.items.length ? "Done" : "In progress"}
                tone={completedCount === event.items.length ? "success" : "running"}
              />
            }
          >
            <div className="space-y-1.5">
              {event.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-sm transition-colors hover:border-border/60 hover:bg-muted/20"
                >
                  {item.status === "completed" ? (
                    <CheckCircle className="size-4 text-emerald-500" weight="fill" />
                  ) : item.status === "failed" ? (
                    <WarningCircle className="size-4 text-red-500" weight="fill" />
                  ) : item.status === "running" ? (
                    <SpinnerGap className="size-4 animate-spin text-primary" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className={cn(item.status === "completed" && "text-muted-foreground")}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </ActivityCard>
        </div>
      )
    }

    if (event.kind === "tool-lifecycle") {
      return (
        <ActivityCard
          key={event.id}
          icon={
            event.lifecycle === "running" ? (
              <SpinnerGap className="size-4 animate-spin" />
            ) : event.lifecycle === "completed" ? (
              <CheckCircle className="size-4" />
            ) : event.lifecycle === "failed" ? (
              <WarningCircle className="size-4" />
            ) : (
              <Wrench className="size-4" />
            )
          }
          title={event.toolName}
          subtitle={event.detail || event.toolCallId}
          status={
            <ActivityStatusChip
              label={toolStateLabel(event.lifecycle)}
              tone={toolLifecycleTone(event.lifecycle)}
            />
          }
        />
      )
    }

    if (event.kind === "tool-result") {
      return null
    }

    if (event.kind === "upload-status") {
      const statusLabel = getUploadStatusLabel({
        status: event.status,
        latestJob: {
          id: `${event.uploadId}-timeline`,
          status: event.status,
          attemptCount: 0,
          updatedAt: event.createdAt || new Date().toISOString(),
          progressStage: event.progressStage,
          progressPercent: event.progressPercent,
        },
      })
      const stageLabel = getUploadProgressStageLabel(event.progressStage)
      const progress =
        typeof event.progressPercent === "number"
          ? Math.max(0, Math.min(100, Math.round(event.progressPercent)))
          : null

      return (
        <ActivityCard
          key={event.id}
          title={event.uploadTitle || "Referenced upload"}
          subtitle={stageLabel || event.uploadId}
          status={
            <ActivityStatusChip
              label={statusLabel}
              tone={uploadStatusTone(event.status)}
            />
          }
        >
          {progress !== null ? (
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/75 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
          {event.lastError ? (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-300">
              {event.lastError}
            </p>
          ) : null}
        </ActivityCard>
      )
    }

    if (event.kind === "artifact") {
      if (event.artifact.artifactType === "document") {
        return (
          <DocumentArtifactCard
            key={event.id}
            artifact={event.artifact}
            onExport={onExportDocument}
            exportingArtifactId={exportingArtifactId}
          />
        )
      }
      return (
        <InteractiveQuizArtifactCard
          key={event.id}
          artifact={event.artifact}
        />
      )
    }

    if (event.kind === "evidence-citations") {
      return (
        <ActivityCard
          key={event.id}
          title="Evidence set updated"
          subtitle={`${event.citations.length} citation${
            event.citations.length === 1 ? "" : "s"
          } attached to this response.`}
          status={<ActivityStatusChip label="Evidence" tone="info" />}
        />
      )
    }

    return null
  }

  return (
    <div className="space-y-2 font-sans">
      {isDrilldownModeActive ? (
        <ActivityCard
          icon={<Flask className="size-4" />}
          title="Drill-down mode active"
          subtitle="Main task board is minimized while the side-panel micro-agent runs."
          status={<ActivityStatusChip label="Isolated run" tone="info" />}
        />
      ) : null}
      {taskBoardRows.length > 0 ? (
        <div className="space-y-1.5">
          {taskBoardRows.map((row) => renderRow(row))}
        </div>
      ) : null}
      {activeThought ? (
        <GhostActivityTray activeThought={activeThought} />
      ) : null}
      {nonTaskActivityRows.length > 0 ? (
        <div className="space-y-1.5">
          {nonTaskActivityRows.map((row) => renderRow(row))}
        </div>
      ) : null}
      {answerRows.length > 0 ? (
        <div className="space-y-1.5">
          {answerRows.map((row) => renderRow(row))}
        </div>
      ) : null}
    </div>
  )
}

