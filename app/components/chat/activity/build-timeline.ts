import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import type { UploadProgressStage, UploadStatus } from "@/lib/uploads/types"
import type {
  BuildTimelineInput,
  ClinicalCompletenessSummary,
  ConfidenceTransitionSummary,
  GatekeeperDecisionSummary,
  LoopTransitionSummary,
  MissingVariablePromptSummary,
  OptimisticTaskBoardState,
  RetrievalNoteSummary,
  TaskBoardItem,
  TaskBoardItemStatus,
  TimelineAnnotation,
  TimelineEvent,
  ToolLifecycleState,
} from "./types"

const TOOL_LIFECYCLE_ORDER: Record<ToolLifecycleState, number> = {
  queued: 1,
  running: 2,
  completed: 3,
  failed: 3,
}

const UPLOAD_STATUS_ORDER: Record<UploadStatus, number> = {
  pending: 1,
  processing: 2,
  completed: 3,
  failed: 3,
}

const EVENT_KIND_ORDER: Record<TimelineEvent["kind"], number> = {
  "task-board": 1,
  "system-intro": 2,
  reasoning: 3,
  "message-text": 4,
  checklist: 5,
  "tool-lifecycle": 6,
  "tool-result": 7,
  "upload-status": 8,
  artifact: 9,
  "evidence-citations": 10,
}

type MutableSequence = { value: number }

type RoutingSnapshot = {
  summary?: string
  querySnippet?: string
  taskBoardTitle?: string
  trace: string[]
  selectedConnectorIds: string[]
  selectedToolNames: string[]
  taskPlan: TaskBoardItem[]
  runtimeSteps: TaskBoardItem[]
  runtimeDag: TaskBoardItem[]
  gatekeeperDecisions: GatekeeperDecisionSummary[]
  retrievalNotes: RetrievalNoteSummary[]
  loopTransitions: LoopTransitionSummary[]
  confidenceTransitions: ConfidenceTransitionSummary[]
  incompleteEvidencePolicy?: "none" | "balanced_conditional" | "strict_blocking" | string
  incompleteEvidenceState?: "complete" | "partial" | "incomplete_evidence" | string
  missingVariablePrompts: MissingVariablePromptSummary[]
  complexityMode?: "fast-track" | "deep-dive" | string
  clinicalCompleteness?: ClinicalCompletenessSummary | null
  orchestrationEngine?: string
  loopIterations?: number
  confidence?: number
  sourceDiversity?: number
  sequence: number
  createdAt: string | null
}

const TASK_STATUS_ORDER: Record<TaskBoardItemStatus, number> = {
  pending: 1,
  running: 2,
  completed: 3,
  failed: 4,
}

const RETRIEVAL_TOOL_NAMES = new Set([
  "guidelineSearch",
  "pubmedSearch",
  "pubmedLookup",
  "clinicalTrialsSearch",
  "scholarGatewaySearch",
  "bioRxivSearch",
  "webSearch",
  "uploadContextSearch",
  "rxnormInteractionSearch",
  "openfdaDrugLabelSearch",
])

const SECONDARY_RETRIEVAL_TOOL_NAMES = new Set([
  "pubmedSearch",
  "pubmedLookup",
  "clinicalTrialsSearch",
  "scholarGatewaySearch",
])

const CHART_FENCE_PATTERN = /```(?:chart|chart-spec|chartjson|healthchart)\b/i

function clampTaskLabel(label: string): string {
  const normalized = label.replace(/\s+/g, " ").trim()
  return normalized.length > 40 ? normalized.slice(0, 40).trim() : normalized
}

function nextSequence(state: MutableSequence): number {
  state.value += 1
  return state.value
}

function normalizeSequence(
  sequence: unknown,
  state: MutableSequence
): number {
  if (typeof sequence === "number" && Number.isFinite(sequence)) {
    state.value = Math.max(state.value, sequence)
    return sequence
  }
  return nextSequence(state)
}

function normalizePassiveSequence(
  sequence: unknown,
  state: MutableSequence
): number {
  if (typeof sequence === "number" && Number.isFinite(sequence)) {
    state.value = Math.max(state.value, sequence)
    return sequence
  }
  return state.value
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractReasoningText(part: unknown): string | null {
  const record = asObject(part)
  if (!record) return null
  const explicit = asString(record.reasoning)
  if (explicit) return explicit
  return asString(record.text)
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
}

function asLifecycle(value: unknown): ToolLifecycleState | null {
  if (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value
  }
  return null
}

function asUploadStatus(value: unknown): UploadStatus | null {
  if (
    value === "pending" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value
  }
  return null
}

function asUploadProgressStage(value: unknown): UploadProgressStage | null {
  if (
    value === "queued" ||
    value === "uploading" ||
    value === "extracting_pages" ||
    value === "chunking" ||
    value === "embedding" ||
    value === "ready" ||
    value === "failed"
  ) {
    return value
  }
  return null
}

function asChecklistItemStatus(
  value: unknown
): "pending" | "running" | "completed" | "failed" {
  if (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value
  }
  return "pending"
}

function isDocumentArtifact(value: unknown): value is DocumentArtifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as DocumentArtifact).artifactType === "document" &&
      typeof (value as DocumentArtifact).artifactId === "string" &&
      Array.isArray((value as DocumentArtifact).sections)
  )
}

function isQuizArtifact(value: unknown): value is QuizArtifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as QuizArtifact).artifactType === "quiz" &&
      typeof (value as QuizArtifact).artifactId === "string" &&
      Array.isArray((value as QuizArtifact).questions)
  )
}

function parseArtifactFromToolResult(
  result: unknown
): DocumentArtifact | QuizArtifact | null {
  if (isDocumentArtifact(result) || isQuizArtifact(result)) {
    return result
  }
  return null
}

function isQuizWorkflowToolName(toolName: string): boolean {
  return /generatequizfromupload|refinequizrequirements/i.test(toolName)
}

function looksLikeTransientQuizText(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const hasQuizHeading = /\bquiz\b[:\s]/i.test(normalized)
  const numberedQuestionMatches = normalized.match(/(?:^|\n)\s*\d+\.\s+/gm) || []
  const choiceMatches = normalized.match(/(?:^|\n)\s*[a-e][\).\:]\s+/gim) || []
  const hasAnswerSection =
    /\banswers?(?:\s*&\s*|\s+and\s+)?(?:rationale|explanation|key)?\b/i.test(normalized) ||
    /\bhow'?d you do\??/i.test(normalized)
  return (
    (hasQuizHeading &&
      numberedQuestionMatches.length >= 2 &&
      choiceMatches.length >= 4) ||
    (numberedQuestionMatches.length >= 3 && choiceMatches.length >= 4) ||
    (hasAnswerSection && numberedQuestionMatches.length >= 1)
  )
}

function normalizeEvidenceCitations(
  citations: unknown
): EvidenceCitation[] {
  if (!Array.isArray(citations)) return []
  const seen = new Set<string>()
  const normalized: EvidenceCitation[] = []

  citations.forEach((citation, index) => {
    const item = asObject(citation)
    if (!item) return
    const title = asString(item.title)
    const url = asString(item.url)
    const pmid = asString(item.pmid)
    const doi = asString(item.doi)
    const key = pmid || doi || url || `${title || "citation"}:${index}`
    if (seen.has(key)) return
    seen.add(key)
    normalized.push({
      ...(item as unknown as EvidenceCitation),
      index: normalized.length + 1,
    })
  })

  return normalized
}

export function sanitizeTimelineText(text: string): string {
  if (!text) return ""
  return text
    .replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
    .replace(/\[tool\s+slide\s+([^\]]+)\]/gi, " (slide $1)")
    .replace(/\[tool\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[source\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[doc\s+([^\]]+)\]/gi, " ($1)")
    .replace(/[ \t]{2,}/g, " ")
}

function normalizeToolCallId(
  toolName: string,
  candidate: unknown,
  fallbackSuffix: string
): string {
  const parsed = asString(candidate)
  if (parsed) return parsed
  return `${toolName || "tool"}-${fallbackSuffix}`
}

function mergeTaskStatus(
  previous: TaskBoardItemStatus,
  next: TaskBoardItemStatus
): TaskBoardItemStatus {
  return TASK_STATUS_ORDER[next] >= TASK_STATUS_ORDER[previous] ? next : previous
}

function lastValue<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined
  return values[values.length - 1]
}

function sanitizeRoutingSummary(summary: string | null | undefined): string | undefined {
  if (!summary) return undefined
  const normalized = summary.replace(/\s+/g, " ").trim()
  if (!normalized) return undefined
  if (
    /(?:\bclassify:[^\s]+.*->|\broute:tools=|\broute:connectors=|\bmode:[^=\s;]+=[^;\s]+)/i.test(
      normalized
    )
  ) {
    return "Workflow selected and orchestration started."
  }
  const stripped = normalized
    .replace(/\bRoute:\s*.+$/i, "")
    .replace(/\bTools?:\s*.+$/i, "")
    .replace(/\bConnectors?:\s*.+$/i, "")
    .trim()
  if (!stripped) return "Workflow selected and orchestration started."
  return stripped.length > 140 ? `${stripped.slice(0, 137)}...` : stripped
}

function parseRoutingSnapshot(
  annotation: TimelineAnnotation,
  sequenceState: MutableSequence
): RoutingSnapshot | null {
  const record = asObject(annotation)
  if (!record || record.type !== "langgraph-routing") return null

  const trace = Array.isArray(record.trace)
    ? record.trace.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : []
  const selectedConnectorIds = Array.isArray(record.selectedConnectorIds)
    ? record.selectedConnectorIds
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : []
  const selectedToolNames = Array.isArray(record.selectedToolNames)
    ? record.selectedToolNames
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : []
  const runtimeSteps = Array.isArray(record.runtimeSteps)
    ? record.runtimeSteps
        .map((step, index) => {
          const item = asObject(step)
          if (!item) return null
          const label = asString(item.label)
          if (!label) return null
          const detail = asString(item.detail) || undefined
          const description = asString(item.description) || undefined
          const reasoning = asString(item.reasoning) || undefined
          const isCritical = typeof item.isCritical === "boolean" ? item.isCritical : undefined
          const dependsOn = asStringArray(item.dependsOn)
          const phase = asString(item.phase) || undefined
          const runtimeStep: TaskBoardItem = {
            id: asString(item.id) || `runtime-step-${index + 1}`,
            label,
            status: asChecklistItemStatus(item.status),
            ...(detail ? { detail } : {}),
            ...(description ? { description } : {}),
            ...(reasoning ? { reasoning } : {}),
            ...(typeof isCritical === "boolean" ? { isCritical } : {}),
            ...(dependsOn.length > 0 ? { dependsOn } : {}),
            ...(phase ? { phase } : {}),
          }
          return runtimeStep
        })
        .filter((item): item is TaskBoardItem => item !== null)
    : []
  const taskPlan = Array.isArray(record.taskPlan)
    ? record.taskPlan
        .map((task, index) => {
          const item = asObject(task)
          if (!item) return null
          const taskName = asString(item.taskName)
          const label = taskName || asString(item.label)
          if (!label) return null
          const description = asString(item.description) || undefined
          const reasoning = asString(item.reasoning) || undefined
          const dependsOn = asStringArray(item.dependsOn)
          const phase = asString(item.phase) || undefined
          const isCritical = typeof item.isCritical === "boolean" ? item.isCritical : undefined
          const detail = [description, reasoning].filter((part): part is string => Boolean(part)).join(" ")
          const taskPlanItem: TaskBoardItem = {
            id: asString(item.id) || `task-plan-${index + 1}`,
            label,
            status: asChecklistItemStatus(item.status),
            ...(detail ? { detail } : {}),
            ...(description ? { description } : {}),
            ...(reasoning ? { reasoning } : {}),
            ...(typeof isCritical === "boolean" ? { isCritical } : {}),
            ...(dependsOn.length > 0 ? { dependsOn } : {}),
            ...(phase ? { phase } : {}),
          }
          return taskPlanItem
        })
        .filter((item): item is TaskBoardItem => item !== null)
    : []
  const runtimeDag = Array.isArray(record.runtimeDag)
    ? record.runtimeDag
        .map((node, index) => {
          const item = asObject(node)
          if (!item) return null
          const label = asString(item.label)
          if (!label) return null
          const detail = asString(item.detail) || undefined
          const dependsOn = asStringArray(item.dependsOn)
          const runtimeDagNode: TaskBoardItem = {
            id: asString(item.id) || `runtime-dag-${index + 1}`,
            label,
            status: asChecklistItemStatus(item.status),
            ...(detail ? { detail } : {}),
            ...(dependsOn.length > 0 ? { dependsOn } : {}),
          }
          return runtimeDagNode
        })
        .filter((item): item is TaskBoardItem => item !== null)
    : []
  const gatekeeperDecisions = Array.isArray(record.gatekeeperDecisions)
    ? record.gatekeeperDecisions
        .map((decision) => {
          const item = asObject(decision)
          if (!item) return null
          const scope = item.scope === "connector" || item.scope === "tool" ? item.scope : null
          const id = asString(item.id)
          const reasonCode = asString(item.reasonCode)
          const reason = asString(item.reason)
          const decisionValue = item.decision === "allow" || item.decision === "skip"
            ? item.decision
            : null
          if (!scope || !id || !reasonCode || !reason || !decisionValue) return null
          const detail = asString(item.detail) || undefined
          const gatekeeperDecision: GatekeeperDecisionSummary = {
            scope,
            id,
            decision: decisionValue,
            reasonCode,
            reason,
            ...(detail ? { detail } : {}),
          }
          return gatekeeperDecision
        })
        .filter((item): item is GatekeeperDecisionSummary => item !== null)
    : []
  const retrievalNotes = Array.isArray(record.retrievalNotes)
    ? record.retrievalNotes
        .map((note, index) => {
          const item = asObject(note)
          if (!item) return null
          const connectorId = asString(item.connectorId)
          const noteText = asString(item.note)
          const outcome =
            item.outcome === "success" ||
            item.outcome === "no-signal" ||
            item.outcome === "fallback" ||
            item.outcome === "error"
              ? item.outcome
              : null
          if (!connectorId || !noteText || !outcome) return null
          const parsedNote: RetrievalNoteSummary = {
            id: asString(item.id) || `retrieval-note-${index + 1}`,
            connectorId,
            outcome,
            note: noteText,
            ...(asString(item.fallbackConnectorId)
              ? { fallbackConnectorId: asString(item.fallbackConnectorId) as string }
              : {}),
            ...(asString(item.detail) ? { detail: asString(item.detail) as string } : {}),
          }
          return parsedNote
        })
        .filter((item): item is RetrievalNoteSummary => item !== null)
    : []
  const loopTransitions = Array.isArray(record.loopTransitions)
    ? record.loopTransitions
        .map((transition) => {
          const item = asObject(transition)
          if (!item) return null
          const iteration = asNumber(item.iteration)
          const observedConfidence = asNumber(item.observedConfidence)
          const targetConfidence = asNumber(item.targetConfidence)
          const reason = asString(item.reason)
          const decision = item.decision === "continue" || item.decision === "compose"
            ? item.decision
            : null
          if (
            iteration === null ||
            observedConfidence === null ||
            targetConfidence === null ||
            !reason ||
            !decision
          ) {
            return null
          }
          return {
            iteration,
            decision,
            reason,
            observedConfidence,
            targetConfidence,
          }
        })
        .filter((item): item is LoopTransitionSummary => Boolean(item))
    : []
  const confidenceTransitions = Array.isArray(record.confidenceTransitions)
    ? record.confidenceTransitions
        .map((transition) => {
          const item = asObject(transition)
          if (!item) return null
          const iteration = asNumber(item.iteration)
          const before = asNumber(item.before)
          const after = asNumber(item.after)
          const reason = asString(item.reason)
          if (iteration === null || before === null || after === null || !reason) return null
          return {
            iteration,
            before,
            after,
            reason,
          }
        })
        .filter((item): item is ConfidenceTransitionSummary => Boolean(item))
    : []
  const missingVariablePrompts = Array.isArray(record.missingVariablePrompts)
    ? record.missingVariablePrompts
        .map((promptEntry) => {
          const item = asObject(promptEntry)
          if (!item) return null
          const variable = asString(item.variable)
          const prompt = asString(item.prompt)
          if (!variable || !prompt) return null
          return { variable, prompt }
        })
        .filter((item): item is MissingVariablePromptSummary => Boolean(item))
    : []
  const incompleteEvidencePolicy = asString(record.incompleteEvidencePolicy) || undefined
  const incompleteEvidenceState = asString(record.incompleteEvidenceState) || undefined
  const complexityMode = asString(record.complexityMode) || undefined
  const querySnippet = asString(record.querySnippet) || undefined
  const taskBoardTitle = asString(record.taskBoardTitle) || undefined
  const clinicalCompletenessRecord = asObject(record.clinicalCompleteness)
  const clinicalCompleteness: ClinicalCompletenessSummary | null = clinicalCompletenessRecord
    ? {
        state: asString(clinicalCompletenessRecord.state) || undefined,
        missingCriticalVariables: asStringArray(
          clinicalCompletenessRecord.missingCriticalVariables
        ),
        rationale: asStringArray(clinicalCompletenessRecord.rationale),
      }
    : null
  const summary = sanitizeRoutingSummary(asString(record.summary))
  const orchestrationEngine = asString(record.orchestrationEngine) || undefined
  const loopIterations = asNumber(record.loopIterations) || undefined
  const confidence = asNumber(record.confidence) || undefined
  const sourceDiversity = asNumber(record.sourceDiversity) || undefined

  if (
    !summary &&
    trace.length === 0 &&
    selectedConnectorIds.length === 0 &&
    selectedToolNames.length === 0 &&
    taskPlan.length === 0 &&
    runtimeSteps.length === 0 &&
    runtimeDag.length === 0 &&
    gatekeeperDecisions.length === 0 &&
    retrievalNotes.length === 0 &&
    loopTransitions.length === 0 &&
    confidenceTransitions.length === 0 &&
    missingVariablePrompts.length === 0 &&
    !querySnippet &&
    !taskBoardTitle
  ) {
    return null
  }

  return {
    summary,
    querySnippet,
    taskBoardTitle,
    trace,
    selectedConnectorIds,
    selectedToolNames,
    taskPlan,
    runtimeSteps,
    runtimeDag,
    gatekeeperDecisions,
    retrievalNotes,
    loopTransitions,
    confidenceTransitions,
    incompleteEvidencePolicy,
    incompleteEvidenceState,
    missingVariablePrompts,
    complexityMode,
    clinicalCompleteness,
    orchestrationEngine,
    loopIterations,
    confidence,
    sourceDiversity,
    sequence: normalizePassiveSequence(record.sequence, sequenceState),
    createdAt: asString(record.createdAt) || null,
  }
}

function mergeRoutingSnapshots(
  snapshots: RoutingSnapshot[]
): RoutingSnapshot | null {
  if (snapshots.length === 0) return null
  const sorted = [...snapshots].sort((left, right) => left.sequence - right.sequence)
  const latest = sorted[sorted.length - 1]
  const trace = Array.from(new Set(sorted.flatMap((snapshot) => snapshot.trace)))
  const selectedConnectorIds = Array.from(
    new Set(sorted.flatMap((snapshot) => snapshot.selectedConnectorIds))
  )
  const selectedToolNames = Array.from(
    new Set(sorted.flatMap((snapshot) => snapshot.selectedToolNames))
  )
  const mergeScopedTaskItemsFromLatest = (
    getItems: (snapshot: RoutingSnapshot) => TaskBoardItem[]
  ): TaskBoardItem[] => {
    const latestItems = getItems(latest)
    if (latestItems.length === 0) return []
    const latestIds = new Set(latestItems.map((item) => item.id))
    const mergedById = new Map<string, TaskBoardItem>()
    sorted.forEach((snapshot) => {
      getItems(snapshot).forEach((item) => {
        if (!latestIds.has(item.id)) return
        const existing = mergedById.get(item.id)
        if (!existing) {
          mergedById.set(item.id, item)
          return
        }
        mergedById.set(item.id, {
          ...existing,
          ...item,
          status: mergeTaskStatus(existing.status, item.status),
        })
      })
    })
    return latestItems.map((item) => mergedById.get(item.id) || item)
  }
  const mergedTaskPlan = mergeScopedTaskItemsFromLatest((snapshot) => snapshot.taskPlan)
  const mergedRuntimeSteps = mergeScopedTaskItemsFromLatest(
    (snapshot) => snapshot.runtimeSteps
  )
  const mergedRuntimeDag = mergeScopedTaskItemsFromLatest((snapshot) => snapshot.runtimeDag)
  const gatekeeperMap = new Map<string, GatekeeperDecisionSummary>()
  sorted.forEach((snapshot) => {
    snapshot.gatekeeperDecisions.forEach((decision) => {
      const key = `${decision.scope}:${decision.id}`
      const existing = gatekeeperMap.get(key)
      if (!existing) {
        gatekeeperMap.set(key, decision)
        return
      }
      if (existing.decision === "skip" && decision.decision === "allow") {
        return
      }
      gatekeeperMap.set(key, decision)
    })
  })
  const retrievalNoteMap = new Map<string, RetrievalNoteSummary>()
  sorted.forEach((snapshot) => {
    snapshot.retrievalNotes.forEach((note) => {
      const key = `${note.connectorId}:${note.outcome}:${note.note}`
      retrievalNoteMap.set(key, note)
    })
  })
  const loopTransitionMap = new Map<number, LoopTransitionSummary>()
  sorted.forEach((snapshot) => {
    snapshot.loopTransitions.forEach((transition) => {
      loopTransitionMap.set(transition.iteration, transition)
    })
  })
  const confidenceTransitionMap = new Map<number, ConfidenceTransitionSummary>()
  sorted.forEach((snapshot) => {
    snapshot.confidenceTransitions.forEach((transition) => {
      confidenceTransitionMap.set(transition.iteration, transition)
    })
  })
  const missingVariablePromptMap = new Map<string, MissingVariablePromptSummary>()
  sorted.forEach((snapshot) => {
    snapshot.missingVariablePrompts.forEach((entry) => {
      missingVariablePromptMap.set(entry.variable, entry)
    })
  })

  return {
    ...latest,
    trace,
    selectedConnectorIds,
    selectedToolNames,
    taskPlan: mergedTaskPlan,
    runtimeSteps: mergedRuntimeSteps,
    runtimeDag: mergedRuntimeDag,
    gatekeeperDecisions: Array.from(gatekeeperMap.values()),
    retrievalNotes: Array.from(retrievalNoteMap.values()),
    loopTransitions: Array.from(loopTransitionMap.values()).sort(
      (left, right) => left.iteration - right.iteration
    ),
    confidenceTransitions: Array.from(confidenceTransitionMap.values()).sort(
      (left, right) => left.iteration - right.iteration
    ),
    missingVariablePrompts: Array.from(missingVariablePromptMap.values()),
    incompleteEvidencePolicy:
      lastValue(
        sorted
          .map((snapshot) => snapshot.incompleteEvidencePolicy)
          .filter((value): value is string => Boolean(value))
      ) || latest.incompleteEvidencePolicy,
    incompleteEvidenceState:
      lastValue(
        sorted
          .map((snapshot) => snapshot.incompleteEvidenceState)
          .filter((value): value is string => Boolean(value))
      ) || latest.incompleteEvidenceState,
    complexityMode:
      lastValue(
        sorted
          .map((snapshot) => snapshot.complexityMode)
          .filter((value): value is string => Boolean(value))
      ) || latest.complexityMode,
    clinicalCompleteness:
      lastValue(
        sorted
          .map((snapshot) => snapshot.clinicalCompleteness)
          .filter(
            (value): value is ClinicalCompletenessSummary =>
              Boolean(value && typeof value === "object")
          )
      ) || latest.clinicalCompleteness,
    orchestrationEngine:
      lastValue(
        sorted
          .map((snapshot) => snapshot.orchestrationEngine)
          .filter((item): item is string => Boolean(item))
      ) || latest.orchestrationEngine,
    loopIterations:
      lastValue(
        sorted
          .map((snapshot) => snapshot.loopIterations)
          .filter((item): item is number => typeof item === "number")
      ) || latest.loopIterations,
    confidence:
      lastValue(
        sorted
          .map((snapshot) => snapshot.confidence)
          .filter((item): item is number => typeof item === "number")
      ) || latest.confidence,
    querySnippet:
      lastValue(
        sorted
          .map((snapshot) => snapshot.querySnippet)
          .filter((item): item is string => Boolean(item))
      ) || latest.querySnippet,
    taskBoardTitle:
      lastValue(
        sorted
          .map((snapshot) => snapshot.taskBoardTitle)
          .filter((item): item is string => Boolean(item))
      ) || latest.taskBoardTitle,
    sourceDiversity:
      lastValue(
        sorted
          .map((snapshot) => snapshot.sourceDiversity)
          .filter((item): item is number => typeof item === "number")
      ) || latest.sourceDiversity,
  }
}

function buildOptimisticRoutingSnapshot(
  optimisticTaskBoard: OptimisticTaskBoardState
): RoutingSnapshot {
  return {
    summary: optimisticTaskBoard.summary,
    querySnippet: optimisticTaskBoard.querySnippet,
    taskBoardTitle: optimisticTaskBoard.title,
    trace: [],
    selectedConnectorIds: [],
    selectedToolNames: [],
    taskPlan: optimisticTaskBoard.items,
    runtimeSteps: optimisticTaskBoard.items,
    runtimeDag: [],
    gatekeeperDecisions: [],
    retrievalNotes: [],
    loopTransitions: [],
    confidenceTransitions: [],
    missingVariablePrompts: [],
    clinicalCompleteness: null,
    sequence: 0,
    createdAt: optimisticTaskBoard.createdAt || null,
  }
}

function getToolResultPayload(event: Extract<TimelineEvent, { kind: "tool-result" }>): unknown {
  const invocation =
    event.part && typeof event.part === "object"
      ? ((event.part as unknown as { toolInvocation?: unknown }).toolInvocation as
          | { result?: unknown }
          | undefined)
      : undefined
  return invocation?.result
}

function countToolResultRecords(result: unknown): number {
  if (Array.isArray(result)) return result.length
  if (!result || typeof result !== "object") return 0
  const candidate = result as Record<string, unknown>
  if (Array.isArray(candidate.results)) return candidate.results.length
  if (Array.isArray(candidate.articles)) return candidate.articles.length
  if (Array.isArray(candidate.trials)) return candidate.trials.length
  if (Array.isArray(candidate.citations)) return candidate.citations.length
  if (typeof candidate.totalResults === "number") return Math.max(0, candidate.totalResults)
  if (typeof candidate.rawTotalResults === "number") return Math.max(0, candidate.rawTotalResults)
  if (typeof candidate.found === "boolean") return candidate.found ? 1 : 0
  if (candidate.article && typeof candidate.article === "object") return 1
  return 0
}

function summarizeToolExecutionTruth(events: TimelineEvent[]): {
  retrievalResultEvents: number
  retrievalSuccessEvents: number
  retrievalFailureEvents: number
  retrievalLifecycleEvents: number
  retrievalInFlightEvents: number
  guidelineDirectMiss: boolean
  secondaryRepositorySuccessEvents: number
  comparativeDataPoints: number
  evidenceCitationCount: number
  hasRenderableOutput: boolean
  chartOutputDetected: boolean
  firstNoSignalReason?: string
} {
  let retrievalResultEvents = 0
  let retrievalSuccessEvents = 0
  let retrievalFailureEvents = 0
  let retrievalLifecycleEvents = 0
  let retrievalInFlightEvents = 0
  let guidelineDirectMiss = false
  let secondaryRepositorySuccessEvents = 0
  let comparativeEvidenceCount = 0
  let evidenceCitationCount = 0
  let hasRenderableOutput = false
  let chartOutputDetected = false
  let firstNoSignalReason: string | undefined
  const sourceLabelByTool: Record<string, string> = {
    guidelineSearch: "Guideline Index",
    pubmedSearch: "PubMed",
    pubmedLookup: "PubMed",
    clinicalTrialsSearch: "ClinicalTrials.gov",
    scholarGatewaySearch: "Scholar Gateway",
    bioRxivSearch: "bioRxiv",
    webSearch: "Web Search",
    uploadContextSearch: "Upload Context",
    rxnormInteractionSearch: "RxNorm DDI",
    openfdaDrugLabelSearch: "FDA Drug Labels",
  }

  events.forEach((event) => {
    if (event.kind === "message-text") {
      if (event.text.trim().length > 0) {
        hasRenderableOutput = true
        if (!chartOutputDetected && CHART_FENCE_PATTERN.test(event.text)) {
          chartOutputDetected = true
        }
      }
      return
    }
    if (event.kind === "artifact") {
      hasRenderableOutput = true
      return
    }
    if (event.kind === "tool-result") {
      const toolName = event.toolName
      if (!RETRIEVAL_TOOL_NAMES.has(toolName)) return
      retrievalResultEvents += 1
      const payload = getToolResultPayload(event)
      const count = countToolResultRecords(payload)
      if (toolName === "guidelineSearch" && payload && typeof payload === "object") {
        const strategy = (payload as Record<string, unknown>).strategy
        if (strategy && typeof strategy === "object") {
          const directMatches = (strategy as Record<string, unknown>).directMatches
          if (typeof directMatches === "number" && directMatches <= 0) {
            guidelineDirectMiss = true
          }
        } else if (count === 0) {
          guidelineDirectMiss = true
        }
      }
      if (count > 0) {
        retrievalSuccessEvents += 1
        if (SECONDARY_RETRIEVAL_TOOL_NAMES.has(toolName)) {
          secondaryRepositorySuccessEvents += 1
        }
        comparativeEvidenceCount += count
      }
      if (count === 0) {
        retrievalFailureEvents += 1
        if (!firstNoSignalReason) {
          const sourceLabel = sourceLabelByTool[toolName] || "primary source"
          firstNoSignalReason = `No direct matches found in ${sourceLabel}. Attempting query expansion...`
        }
      }
      return
    }
    if (event.kind === "evidence-citations") {
      if (Array.isArray(event.citations)) {
        evidenceCitationCount = Math.max(evidenceCitationCount, event.citations.length)
      }
      return
    }
    if (event.kind === "tool-lifecycle" && RETRIEVAL_TOOL_NAMES.has(event.toolName)) {
      retrievalLifecycleEvents += 1
      if (event.lifecycle === "queued" || event.lifecycle === "running") {
        retrievalInFlightEvents += 1
      }
      if (event.lifecycle === "failed") {
        retrievalFailureEvents += 1
        if (event.toolName === "guidelineSearch") {
          guidelineDirectMiss = true
        }
        if (!firstNoSignalReason && typeof event.detail === "string" && event.detail.trim()) {
          firstNoSignalReason = event.detail.trim()
        }
      }
      if (event.lifecycle === "completed") {
        retrievalSuccessEvents += 1
        if (SECONDARY_RETRIEVAL_TOOL_NAMES.has(event.toolName)) {
          secondaryRepositorySuccessEvents += 1
        }
      }
    }
  })

  return {
    retrievalResultEvents,
    retrievalSuccessEvents,
    retrievalFailureEvents,
    retrievalLifecycleEvents,
    retrievalInFlightEvents,
    guidelineDirectMiss,
    secondaryRepositorySuccessEvents,
    comparativeDataPoints: Math.max(comparativeEvidenceCount, evidenceCitationCount),
    evidenceCitationCount,
    hasRenderableOutput,
    chartOutputDetected,
    firstNoSignalReason,
  }
}

function isRetrievalTaskItem(item: TaskBoardItem): boolean {
  if (item.phase === "retrieval") return true
  return /\b(evidence|guideline|trial|retriev|source)\b/i.test(item.label)
}

function isVisualizationTaskItem(item: TaskBoardItem): boolean {
  if (item.phase === "visualization") return true
  return /\b(chart|matrix|trend|distribution|decision tree|visual)\b/i.test(item.label)
}

function inferToolNames(events: TimelineEvent[]): string[] {
  const names = new Set<string>()
  events.forEach((event) => {
    if (event.kind === "tool-lifecycle" || event.kind === "tool-result") {
      names.add(event.toolName)
    }
  })
  return Array.from(names)
}

function buildTaskBoardItems(
  routing: RoutingSnapshot | null,
  events: TimelineEvent[],
  messageStatus?: BuildTimelineInput["status"]
): TaskBoardItem[] {
  const taskPlanItems = routing?.taskPlan || []
  const runtimeDagItems = routing?.runtimeDag || []
  const runtimeStepItems = routing?.runtimeSteps || []
  const primaryItems: TaskBoardItem[] =
    taskPlanItems.length > 0
      ? taskPlanItems
      : runtimeStepItems.length > 0
        ? runtimeStepItems
      : runtimeDagItems
  const mergedItems = new Map<string, TaskBoardItem>()
  primaryItems.forEach((item) => {
    const normalizedItem: TaskBoardItem = {
      ...item,
      label: clampTaskLabel(item.label),
    }
    const existing = mergedItems.get(item.id)
    if (!existing) {
      mergedItems.set(item.id, normalizedItem)
      return
    }
    mergedItems.set(item.id, {
      ...existing,
      ...normalizedItem,
      status: mergeTaskStatus(existing.status, item.status),
      detail: normalizedItem.detail || existing.detail,
    })
  })
  const items = Array.from(mergedItems.values()).filter((item) => item.status !== "pending")
  const truth = summarizeToolExecutionTruth(events)
  const isTerminalMessageStatus = messageStatus === "ready" || messageStatus === "error"
  const hasCompletedDownstreamTask = items.some(
    (item) => item.status === "completed" && !isRetrievalTaskItem(item)
  )
  const shouldFinalizeFromOutputSignal =
    truth.retrievalInFlightEvents === 0 &&
    truth.hasRenderableOutput &&
    hasCompletedDownstreamTask
  const canFinalizeWithoutFurtherRetrieval =
    isTerminalMessageStatus || shouldFinalizeFromOutputSignal

  const retrievalIndexes = items.reduce<number[]>((accumulator, item, index) => {
    if (isRetrievalTaskItem(item)) {
      accumulator.push(index)
    }
    return accumulator
  }, [])
  if (retrievalIndexes.length > 0) {
    retrievalIndexes.forEach((retrievalIndex) => {
      const retrievalItem = items[retrievalIndex]
      if (truth.retrievalResultEvents > 0 || truth.retrievalFailureEvents > 0) {
        if (truth.retrievalSuccessEvents > 0) {
          retrievalItem.status = "completed"
          if (truth.guidelineDirectMiss) {
            retrievalItem.detail =
              "No direct guideline PDF matches in current index; checking secondary medical databases."
            retrievalItem.reasoning =
              truth.firstNoSignalReason ||
              "No direct matches found in Guideline Index. Attempting query expansion..."
          }
        } else {
          retrievalItem.status = "failed"
          retrievalItem.detail =
            truth.firstNoSignalReason ||
            (truth.guidelineDirectMiss
              ? "No direct guideline PDF matches in current index; checking secondary medical databases."
              : "No direct matches found in retrieval connectors. Attempting query expansion...")
          retrievalItem.reasoning = retrievalItem.detail
        }
      } else if (truth.evidenceCitationCount > 0) {
        retrievalItem.status = "completed"
        retrievalItem.detail = `Validated against ${truth.evidenceCitationCount} evidence citation${
          truth.evidenceCitationCount === 1 ? "" : "s"
        }.`
        retrievalItem.reasoning =
          retrievalItem.reasoning ||
          `Evidence pipeline produced ${truth.evidenceCitationCount} validated citation${
            truth.evidenceCitationCount === 1 ? "" : "s"
          }.`
      } else if (canFinalizeWithoutFurtherRetrieval) {
        const retrievalNeverExecuted =
          truth.retrievalLifecycleEvents === 0 && truth.retrievalResultEvents === 0
        retrievalItem.status = "failed"
        retrievalItem.detail =
          retrievalNeverExecuted
            ? "Retrieval tools were planned but no retrieval output was emitted for this turn."
            : truth.firstNoSignalReason ||
              "No direct matches found in selected sources. Attempting query expansion..."
        retrievalItem.reasoning = retrievalItem.detail
      } else if (retrievalItem.status === "completed") {
        retrievalItem.status = "running"
        retrievalItem.detail =
          retrievalItem.detail ||
          "Awaiting retrieval connector outputs before completion is confirmed."
      }
    })
  }

  if (truth.guidelineDirectMiss) {
    const broadeningId = "task-retrieval-broaden"
    const existingBroadening = items.find((item) => item.id === broadeningId)
    const broadeningStatus: TaskBoardItemStatus =
      truth.secondaryRepositorySuccessEvents > 0
        ? "completed"
        : truth.retrievalResultEvents > 0 ||
            truth.retrievalFailureEvents > 0 ||
            canFinalizeWithoutFurtherRetrieval
          ? "failed"
          : "running"
    const broadeningDetail =
      "No direct guideline PDF matches in current index; checking secondary medical databases."
    if (existingBroadening) {
      existingBroadening.status = broadeningStatus
      existingBroadening.detail = broadeningDetail
    } else {
      const row: TaskBoardItem = {
        id: broadeningId,
        label: clampTaskLabel("Broadening search parameters"),
        status: broadeningStatus,
        detail: broadeningDetail,
        reasoning:
          truth.firstNoSignalReason ||
          "No direct matches found in Guideline Index. Attempting query expansion...",
        phase: "retrieval",
        isCritical: false,
      }
      if (retrievalIndexes.length > 0) {
        const anchorIndex = retrievalIndexes[retrievalIndexes.length - 1]
        items.splice(anchorIndex + 1, 0, row)
      } else {
        items.push(row)
      }
    }
  }

  const visualizationIndex = items.findIndex((item) => isVisualizationTaskItem(item))
  if (visualizationIndex >= 0) {
    const currentVisualization = items[visualizationIndex]
    if (truth.chartOutputDetected) {
      items[visualizationIndex] = {
        ...currentVisualization,
        status: "completed",
        detail:
          currentVisualization.detail || "Visualization rendered from structured chart data.",
        reasoning:
          currentVisualization.reasoning ||
          "Chart output detected in assistant response; visualization task confirmed.",
      }
    } else if (truth.comparativeDataPoints < 2 && canFinalizeWithoutFurtherRetrieval) {
      items[visualizationIndex] = {
        ...currentVisualization,
        status: "failed",
        detail: "Insufficient comparative data for visualization",
        reasoning: "Insufficient comparative data for visualization",
      }
    }
  }

  return items
}

function buildTaskBoardEvent(
  messageId: string,
  events: TimelineEvent[],
  routing: RoutingSnapshot | null,
  messageStatus?: BuildTimelineInput["status"]
): TimelineEvent {
  const eventTools = inferToolNames(events)
  const tools = Array.from(
    new Set([...(routing?.selectedToolNames || []), ...eventTools])
  )
  const connectors = Array.from(new Set(routing?.selectedConnectorIds || []))
  const trace = routing?.trace || []

  return {
    id: `task-board:${messageId}`,
    kind: "task-board",
    messageId,
    sequence: 0,
    createdAt: routing?.createdAt || null,
    title: routing?.taskBoardTitle || "Agent Logic Board",
    items: buildTaskBoardItems(routing, events, messageStatus),
    querySnippet: routing?.querySnippet,
    tools,
    connectors,
    trace,
    taskPlan: routing?.taskPlan || [],
    runtimeSteps: routing?.runtimeSteps || [],
    runtimeDag: routing?.runtimeDag || [],
    gatekeeperDecisions: routing?.gatekeeperDecisions || [],
    retrievalNotes: routing?.retrievalNotes || [],
    loopTransitions: routing?.loopTransitions || [],
    confidenceTransitions: routing?.confidenceTransitions || [],
    incompleteEvidencePolicy: routing?.incompleteEvidencePolicy,
    incompleteEvidenceState: routing?.incompleteEvidenceState,
    missingVariablePrompts: routing?.missingVariablePrompts || [],
    complexityMode: routing?.complexityMode,
    clinicalCompleteness: routing?.clinicalCompleteness || null,
    summary: routing?.summary || (routing?.querySnippet ? `Focus: ${routing.querySnippet}` : undefined),
  }
}

function mergeTaskBoardItems(
  previous: TaskBoardItem[],
  next: TaskBoardItem[]
): TaskBoardItem[] {
  if (next.length === 0) return []
  const previousById = new Map(previous.map((item) => [item.id, item] as const))
  return next.map((item) => {
    const existing = previousById.get(item.id)
    if (!existing) return item
    return {
      ...existing,
      ...item,
      status: mergeTaskStatus(existing.status, item.status),
    }
  })
}

function maybePushArtifactFromToolResult(
  events: TimelineEvent[],
  artifact: DocumentArtifact | QuizArtifact | null,
  messageId: string,
  sequence: number,
  createdAt: string | null
) {
  if (!artifact) return
  events.push({
    id: `artifact:${artifact.artifactType}:${artifact.artifactId}`,
    kind: "artifact",
    messageId,
    sequence,
    createdAt,
    artifact,
  })
}

function parseTimelineEventAnnotation(
  annotation: TimelineAnnotation,
  messageId: string,
  sequenceState: MutableSequence
): TimelineEvent | null {
  const record = asObject(annotation)
  if (!record) return null
  const type = asString(record.type)
  if (!type) return null
  const createdAt = asString(record.createdAt) || null

  if (type === "tool-lifecycle") {
    const toolName = asString(record.toolName) || "tool"
    const lifecycle = asLifecycle(record.lifecycle) || "running"
    const toolCallId = normalizeToolCallId(
      toolName,
      record.toolCallId,
      `${toolName}-${sequenceState.value + 1}`
    )
    return {
      id: `tool-lifecycle:${toolCallId}`,
      kind: "tool-lifecycle",
      messageId,
      sequence: normalizeSequence(record.sequence, sequenceState),
      createdAt,
      toolName,
      toolCallId,
      lifecycle,
      detail: asString(record.detail),
    }
  }

  if (type === "upload-status") {
    const uploadId = asString(record.uploadId)
    if (!uploadId) return null
    const status = asUploadStatus(record.status) || "processing"
    return {
      id: `upload-status:${uploadId}`,
      kind: "upload-status",
      messageId,
      sequence: normalizeSequence(record.sequence, sequenceState),
      createdAt,
      uploadId,
      uploadTitle: asString(record.uploadTitle),
      status,
      progressStage: asUploadProgressStage(record.progressStage),
      progressPercent: asNumber(record.progressPercent),
      lastError: asString(record.lastError),
    }
  }

  if (type === "evidence-citations") {
    const citations = normalizeEvidenceCitations(record.citations)
    if (citations.length === 0) return null
    return {
      id: `evidence-citations:${messageId}`,
      kind: "evidence-citations",
      messageId,
      sequence: normalizeSequence(record.sequence, sequenceState),
      createdAt,
      citations,
    }
  }

  if (type === "langgraph-routing") {
    return null
  }

  if (type === "checklist") {
    const rawItems = Array.isArray(record.items) ? record.items : []
    const items = rawItems
      .map((item, index) => {
        const entry = asObject(item)
        if (!entry) return null
        const label = asString(entry.label)
        if (!label) return null
        const id = asString(entry.id) || `checklist-item-${index + 1}`
        return {
          id,
          label,
          status: asChecklistItemStatus(entry.status),
        }
      })
      .filter(Boolean) as Array<{
      id: string
      label: string
      status: "pending" | "running" | "completed" | "failed"
    }>

    if (items.length === 0) return null
    return {
      id: `checklist:${messageId}:${items.map((item) => item.id).join(",")}`,
      kind: "checklist",
      messageId,
      sequence: normalizeSequence(record.sequence, sequenceState),
      createdAt,
      title: asString(record.title) || undefined,
      items,
    }
  }

  if (type === "timeline-event") {
    const eventRecord = asObject(record.event)
    if (!eventRecord) return null
    const kind = asString(eventRecord.kind)
    if (kind === "tool-lifecycle") {
      const toolName = asString(eventRecord.toolName) || "tool"
      const lifecycle = asLifecycle(eventRecord.lifecycle) || "running"
      const toolCallId = normalizeToolCallId(
        toolName,
        eventRecord.toolCallId,
        `${toolName}-${sequenceState.value + 1}`
      )
      return {
        id: `tool-lifecycle:${toolCallId}`,
        kind: "tool-lifecycle",
        messageId,
        sequence: normalizeSequence(eventRecord.sequence, sequenceState),
        createdAt: asString(eventRecord.createdAt) || createdAt,
        toolName,
        toolCallId,
        lifecycle,
        detail: asString(eventRecord.detail),
      }
    }
    if (kind === "upload-status") {
      const uploadId = asString(eventRecord.uploadId)
      if (!uploadId) return null
      const status = asUploadStatus(eventRecord.status) || "processing"
      return {
        id: `upload-status:${uploadId}`,
        kind: "upload-status",
        messageId,
        sequence: normalizeSequence(eventRecord.sequence, sequenceState),
        createdAt: asString(eventRecord.createdAt) || createdAt,
        uploadId,
        uploadTitle: asString(eventRecord.uploadTitle),
        status,
        progressStage: asUploadProgressStage(eventRecord.progressStage),
        progressPercent: asNumber(eventRecord.progressPercent),
        lastError: asString(eventRecord.lastError),
      }
    }
    if (kind === "system-intro") {
      const text = asString(eventRecord.text)
      if (!text) return null
      return {
        id: `system-intro:${messageId}`,
        kind: "system-intro",
        messageId,
        sequence: normalizeSequence(eventRecord.sequence, sequenceState),
        createdAt: asString(eventRecord.createdAt) || createdAt,
        text,
      }
    }
    if (kind === "checklist") {
      const rawItems = Array.isArray(eventRecord.items) ? eventRecord.items : []
      const items = rawItems
        .map((item, index) => {
          const entry = asObject(item)
          if (!entry) return null
          const label = asString(entry.label)
          if (!label) return null
          const id = asString(entry.id) || `checklist-item-${index + 1}`
          return {
            id,
            label,
            status: asChecklistItemStatus(entry.status),
          }
        })
        .filter(Boolean) as Array<{
        id: string
        label: string
        status: "pending" | "running" | "completed" | "failed"
      }>
      if (items.length === 0) return null
      return {
        id: `checklist:${messageId}:${items.map((item) => item.id).join(",")}`,
        kind: "checklist",
        messageId,
        sequence: normalizeSequence(eventRecord.sequence, sequenceState),
        createdAt: asString(eventRecord.createdAt) || createdAt,
        title: asString(eventRecord.title) || undefined,
        items,
      }
    }
  }

  return null
}

function mergeTimelineEvents(previous: TimelineEvent, next: TimelineEvent): TimelineEvent {
  if (previous.kind === "task-board" && next.kind === "task-board") {
    return {
      ...previous,
      ...next,
      items: mergeTaskBoardItems(previous.items, next.items),
      tools: Array.from(new Set([...(previous.tools || []), ...(next.tools || [])])),
      connectors: Array.from(
        new Set([...(previous.connectors || []), ...(next.connectors || [])])
      ),
      trace: Array.from(new Set([...(previous.trace || []), ...(next.trace || [])])),
      taskPlan: mergeTaskBoardItems(previous.taskPlan || [], next.taskPlan || []),
      runtimeSteps: mergeTaskBoardItems(
        previous.runtimeSteps || [],
        next.runtimeSteps || []
      ),
      runtimeDag: mergeTaskBoardItems(previous.runtimeDag || [], next.runtimeDag || []),
      gatekeeperDecisions: Array.from(
        new Map(
          [...(previous.gatekeeperDecisions || []), ...(next.gatekeeperDecisions || [])].map(
            (decision) => [`${decision.scope}:${decision.id}`, decision] as const
          )
        ).values()
      ),
      retrievalNotes: Array.from(
        new Map(
          [...(previous.retrievalNotes || []), ...(next.retrievalNotes || [])].map(
            (note) => [`${note.connectorId}:${note.outcome}:${note.note}`, note] as const
          )
        ).values()
      ),
      loopTransitions: Array.from(
        new Map(
          [...(previous.loopTransitions || []), ...(next.loopTransitions || [])].map(
            (transition) => [transition.iteration, transition] as const
          )
        ).values()
      ).sort((left, right) => left.iteration - right.iteration),
      confidenceTransitions: Array.from(
        new Map(
          [
            ...(previous.confidenceTransitions || []),
            ...(next.confidenceTransitions || []),
          ].map((transition) => [transition.iteration, transition] as const)
        ).values()
      ).sort((left, right) => left.iteration - right.iteration),
      missingVariablePrompts: Array.from(
        new Map(
          [...(previous.missingVariablePrompts || []), ...(next.missingVariablePrompts || [])].map(
            (prompt) => [prompt.variable, prompt] as const
          )
        ).values()
      ),
      incompleteEvidencePolicy:
        next.incompleteEvidencePolicy || previous.incompleteEvidencePolicy,
      incompleteEvidenceState:
        next.incompleteEvidenceState || previous.incompleteEvidenceState,
      complexityMode: next.complexityMode || previous.complexityMode,
      clinicalCompleteness: next.clinicalCompleteness || previous.clinicalCompleteness,
      summary: next.summary || previous.summary,
      sequence: Math.min(previous.sequence, next.sequence),
      createdAt: next.createdAt || previous.createdAt,
    }
  }

  if (previous.kind === "tool-lifecycle" && next.kind === "tool-lifecycle") {
    const prevRank = TOOL_LIFECYCLE_ORDER[previous.lifecycle]
    const nextRank = TOOL_LIFECYCLE_ORDER[next.lifecycle]
    if (nextRank > prevRank) return next
    if (nextRank < prevRank) return previous
    return next.sequence >= previous.sequence ? next : previous
  }

  if (previous.kind === "upload-status" && next.kind === "upload-status") {
    const prevRank = UPLOAD_STATUS_ORDER[previous.status]
    const nextRank = UPLOAD_STATUS_ORDER[next.status]
    if (nextRank > prevRank) return next
    if (nextRank < prevRank) return previous
    const prevProgress = previous.progressPercent || 0
    const nextProgress = next.progressPercent || 0
    if (nextProgress > prevProgress) return next
    if (nextProgress < prevProgress) return previous
    return next.sequence >= previous.sequence ? next : previous
  }

  if (
    previous.kind === "evidence-citations" &&
    next.kind === "evidence-citations"
  ) {
    const merged = normalizeEvidenceCitations([
      ...previous.citations,
      ...next.citations,
    ])
    return {
      ...next,
      citations: merged,
    }
  }

  return next.sequence >= previous.sequence ? next : previous
}

function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence
    }
    if (left.kind !== right.kind) {
      return EVENT_KIND_ORDER[left.kind] - EVENT_KIND_ORDER[right.kind]
    }
    return left.id.localeCompare(right.id)
  })
}

export function collectTrackedUploadIds(
  annotations: TimelineAnnotation[] | undefined
): string[] {
  if (!Array.isArray(annotations) || annotations.length === 0) return []
  const ids = new Set<string>()
  annotations.forEach((annotation) => {
    const record = asObject(annotation)
    if (!record) return
    if (record.type === "upload-status-tracking" && Array.isArray(record.uploadIds)) {
      record.uploadIds.forEach((value) => {
        const parsed = asString(value)
        if (parsed) ids.add(parsed)
      })
    }
  })
  return Array.from(ids)
}

export function buildChatActivityTimeline({
  messageId,
  parts,
  annotations,
  fallbackText,
  status,
  streamIntroPreview,
  referencedUploads,
  optimisticTaskBoard,
}: BuildTimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const sequenceState: MutableSequence = { value: 0 }
  const artifactIds = new Set<string>()
  const routingSnapshots: RoutingSnapshot[] = []
  const hasQuizWorkflowToolInvocation = Array.isArray(parts)
    ? parts.some((part) => {
        const record = asObject(part)
        if (record?.type !== "tool-invocation") return false
        const invocation = asObject(record.toolInvocation)
        const toolName = String(invocation?.toolName || "")
        return isQuizWorkflowToolName(toolName)
      })
    : false
  const hasQuizArtifactSurface = Array.isArray(parts)
    ? parts.some((part) => {
        const record = asObject(part)
        if (!record) return false
        if (record.type === "tool-invocation") {
          const invocation = asObject(record.toolInvocation)
          if (invocation?.state !== "result") return false
          const artifact = parseArtifactFromToolResult(invocation.result)
          return artifact?.artifactType === "quiz"
        }
        if (record.type === "metadata") {
          const metadata = asObject(record.metadata)
          const quizArtifacts = metadata?.quizArtifacts
          return Array.isArray(quizArtifacts) && quizArtifacts.length > 0
        }
        return false
      })
    : false

  if (streamIntroPreview && streamIntroPreview.trim().length > 0) {
    events.push({
      id: `system-intro:${messageId}`,
      kind: "system-intro",
      messageId,
      sequence: nextSequence(sequenceState),
      createdAt: null,
      text: streamIntroPreview.trim(),
    })
  }

  if (Array.isArray(parts)) {
    parts.forEach((part, index) => {
      const item = asObject(part)
      if (!item) return
      const sequence = nextSequence(sequenceState)
      if (item?.type === "text" && typeof item.text === "string") {
        const text = sanitizeTimelineText(item.text).trim()
        if (!text) return
        if (
          hasQuizWorkflowToolInvocation &&
          looksLikeTransientQuizText(text) &&
          (hasQuizArtifactSurface || text.length > 160)
        ) {
          // Prevent flicker: hide transient long-form quiz prose during quiz workflow.
          return
        }
        events.push({
          id: `message-text:${messageId}:${index}`,
          kind: "message-text",
          messageId,
          sequence,
          createdAt: null,
          text,
        })
        return
      }

      if (item?.type === "reasoning") {
        const text = extractReasoningText(item)
        if (!text) return
        events.push({
          id: `reasoning:${messageId}:${index}`,
          kind: "reasoning",
          messageId,
          sequence,
          createdAt: null,
          text,
        })
        return
      }

      if (item?.type === "tool-invocation" && item.toolInvocation) {
        const invocation = item as ToolInvocationUIPart
        const toolName = String(invocation.toolInvocation.toolName || "tool")
        const toolCallId = normalizeToolCallId(
          toolName,
          invocation.toolInvocation.toolCallId,
          `${index}`
        )

        if (invocation.toolInvocation.state === "result") {
          events.push({
            id: `tool-result:${toolCallId}`,
            kind: "tool-result",
            messageId,
            sequence,
            createdAt: null,
            toolName,
            toolCallId,
            part: invocation,
          })

          const artifact = parseArtifactFromToolResult(invocation.toolInvocation.result)
          if (artifact) {
            const artifactId = `artifact:${artifact.artifactType}:${artifact.artifactId}`
            if (!artifactIds.has(artifactId)) {
              artifactIds.add(artifactId)
              maybePushArtifactFromToolResult(
                events,
                artifact,
                messageId,
                sequence + 0.01,
                null
              )
            }
          }
          return
        }

        events.push({
          id: `tool-lifecycle:${toolCallId}`,
          kind: "tool-lifecycle",
          messageId,
          sequence,
          createdAt: null,
          toolName,
          toolCallId,
          lifecycle: "running",
        })
        return
      }

      if (item?.type === "metadata" && item.metadata) {
        const metadata = item.metadata as {
          documentArtifacts?: unknown[]
          quizArtifacts?: unknown[]
        }
        const artifacts = [
          ...(Array.isArray(metadata.documentArtifacts)
            ? metadata.documentArtifacts.filter(isDocumentArtifact)
            : []),
          ...(Array.isArray(metadata.quizArtifacts)
            ? metadata.quizArtifacts.filter(isQuizArtifact)
            : []),
        ]
        artifacts.forEach((artifact) => {
          const artifactId = `artifact:${artifact.artifactType}:${artifact.artifactId}`
          if (artifactIds.has(artifactId)) return
          artifactIds.add(artifactId)
          maybePushArtifactFromToolResult(
            events,
            artifact,
            messageId,
            sequence + 0.01,
            null
          )
        })
      }
    })
  }

  if (Array.isArray(annotations)) {
    annotations.forEach((annotation) => {
      const routingSnapshot = parseRoutingSnapshot(annotation, sequenceState)
      if (routingSnapshot) {
        routingSnapshots.push(routingSnapshot)
      }
      const parsed = parseTimelineEventAnnotation(annotation, messageId, sequenceState)
      if (parsed) {
        events.push(parsed)
      }
    })
  }

  if (routingSnapshots.length === 0 && optimisticTaskBoard) {
    routingSnapshots.push(buildOptimisticRoutingSnapshot(optimisticTaskBoard))
  }

  if (Array.isArray(referencedUploads)) {
    referencedUploads.forEach((upload) => {
      const sequence = nextSequence(sequenceState)
      events.push({
        id: `upload-status:${upload.id}`,
        kind: "upload-status",
        messageId,
        sequence,
        createdAt: upload.latestJob?.updatedAt || upload.updatedAt || null,
        uploadId: upload.id,
        uploadTitle: upload.title || null,
        status: upload.status,
        progressStage: upload.latestJob?.progressStage || null,
        progressPercent:
          typeof upload.latestJob?.progressPercent === "number"
            ? upload.latestJob.progressPercent
            : null,
        lastError: upload.lastError || null,
      })
    })
  }

  const hasMessageText = events.some((event) => event.kind === "message-text")
  const sanitizedFallback = sanitizeTimelineText(fallbackText).trim()
  if (!hasMessageText && sanitizedFallback) {
    events.push({
      id: `message-text:${messageId}:fallback`,
      kind: "message-text",
      messageId,
      sequence: nextSequence(sequenceState),
      createdAt: null,
      text: sanitizedFallback,
    })
  }

  const deduped = new Map<string, TimelineEvent>()
  events.forEach((event) => {
    const existing = deduped.get(event.id)
    if (!existing) {
      deduped.set(event.id, event)
      return
    }
    deduped.set(event.id, mergeTimelineEvents(existing, event))
  })

  const sortedEvents = sortTimelineEvents(Array.from(deduped.values()))
  const routingSnapshot = mergeRoutingSnapshots(routingSnapshots)
  const taskBoardEvent = buildTaskBoardEvent(
    messageId,
    sortedEvents,
    routingSnapshot,
    status
  )
  const withoutTaskBoard = sortedEvents.filter((event) => event.kind !== "task-board")

  return sortTimelineEvents([taskBoardEvent, ...withoutTaskBoard])
}

