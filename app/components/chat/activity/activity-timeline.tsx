"use client"

import { MessageContent } from "@/components/prompt-kit/message"
import { cn } from "@/lib/utils"
import type { DocumentArtifact } from "@/lib/uploads/artifacts"
import { getUploadProgressStageLabel, getUploadStatusLabel } from "@/lib/uploads/status-label"
import {
  CaretDown,
  CheckCircle,
  SpinnerGap,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react"
import { useMemo, useState } from "react"
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
  shouldShowCitations: boolean
  citations: Map<number, CitationData>
  evidenceCitations?: unknown[]
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
  if (rows.some((row) => row.state === "failed")) return "failed"
  if (rows.every((row) => row.state === "completed")) return "completed"
  if (rows.some((row) => row.state === "running")) return "running"
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

function GroupedToolActivityCard({ group }: { group: ToolGroupRow }) {
  const [isExpanded, setIsExpanded] = useState(group.aggregateState !== "completed")
  const [expandedCalls, setExpandedCalls] = useState<Record<string, boolean>>({})
  const aggregateLabel = toolStateLabel(group.aggregateState)
  const callCount = group.callRows.length

  const toggleCall = (callId: string) => {
    setExpandedCalls((prev) => ({
      ...prev,
      [callId]: !prev[callId],
    }))
  }

  return (
    <ActivityCard
      icon={
        group.aggregateState === "running" ? (
          <SpinnerGap className="size-4 animate-spin" />
        ) : group.aggregateState === "completed" ? (
          <CheckCircle className="size-4" />
        ) : group.aggregateState === "failed" ? (
          <WarningCircle className="size-4" />
        ) : (
          <Wrench className="size-4" />
        )
      }
      title={`${group.family.label} activity`}
      subtitle={`${callCount} call${callCount === 1 ? "" : "s"}`}
      status={<ActivityStatusChip label={aggregateLabel} tone={toolLifecycleTone(group.aggregateState)} />}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-2 py-1 text-left text-xs text-muted-foreground transition hover:bg-muted/45"
      >
        <span>View call details</span>
        <CaretDown className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")} />
      </button>
      {isExpanded ? (
        <div className="mt-2 space-y-1.5">
          {group.callRows.map((row) => {
            const hasPayload =
              typeof row.args !== "undefined" || typeof row.result !== "undefined"
            const isCallExpanded = Boolean(expandedCalls[row.toolCallId])
            const resultHighlights = extractResultHighlights(row.result)

            return (
              <div
                key={row.toolCallId}
                className="rounded-lg border border-border/70 bg-background px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{row.toolName}</p>
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
                    <ActivityStatusChip
                      label={toolStateLabel(row.state)}
                      tone={toolLifecycleTone(row.state)}
                    />
                    {hasPayload ? (
                      <button
                        type="button"
                        onClick={() => toggleCall(row.toolCallId)}
                        className="rounded-md border border-border/70 bg-muted/30 p-1 text-muted-foreground transition hover:bg-muted/45"
                        aria-label="Toggle call response details"
                      >
                        <CaretDown
                          className={cn(
                            "size-3.5 transition-transform",
                            isCallExpanded && "rotate-180"
                          )}
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
                {hasPayload && isCallExpanded ? (
                  <div className="mt-2 space-y-2 rounded-md border border-border/70 bg-muted/15 p-2">
                    {typeof row.args !== "undefined" ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Arguments
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/70 bg-background p-2 text-[11px] leading-5">
                          {formatPayload(row.args)}
                        </pre>
                      </div>
                    ) : null}
                    {typeof row.result !== "undefined" ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Response
                        </p>
                        <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border/70 bg-background p-2 text-[11px] leading-5">
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
      ) : null}
    </ActivityCard>
  )
}

export function ActivityTimeline({
  events,
  status,
  onSuggestion,
  onWorkflowSuggestion,
  shouldShowCitations,
  citations,
  evidenceCitations,
  onExportDocument,
  exportingArtifactId,
}: ActivityTimelineProps) {
  const renderRows = useMemo(() => buildRenderableRows(events), [events])
  const { activityRows, answerRows } = useMemo(
    () => splitRowsByRail(renderRows),
    [renderRows]
  )

  const renderRow = (row: RenderRow) => {
    if (row.type === "tool-group") {
      return <GroupedToolActivityCard key={row.group.id} group={row.group} />
    }

    const event = row.event
    if (event.kind === "system-intro") {
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
            evidenceCitations={evidenceCitations as any}
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
    <div className="space-y-3">
      {activityRows.length > 0 ? (
        <div className="space-y-2.5">
          {activityRows.map((row) => renderRow(row))}
        </div>
      ) : null}
      {answerRows.length > 0 ? (
        <div className="space-y-2.5">
          {answerRows.map((row) => renderRow(row))}
        </div>
      ) : null}
    </div>
  )
}

