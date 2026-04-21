import type { Message as MessageAISDK } from "@ai-sdk/react"
import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import type {
  UploadProgressStage,
  UploadStatus,
  UserUploadListItem,
} from "@/lib/uploads/types"

export type TimelineEventKind =
  | "task-board"
  | "message-text"
  | "reasoning"
  | "tool-lifecycle"
  | "tool-result"
  | "upload-status"
  | "artifact"
  | "evidence-citations"
  | "checklist"
  | "system-intro"

export type ToolLifecycleState = "queued" | "running" | "completed" | "failed"

export type TimelineEventBase = {
  id: string
  kind: TimelineEventKind
  messageId: string
  sequence: number
  createdAt: string | null
}

export type TaskBoardItemStatus = "pending" | "running" | "completed" | "failed"

export type TaskBoardItem = {
  id: string
  label: string
  status: TaskBoardItemStatus
  detail?: string
  description?: string
  reasoning?: string
  isCritical?: boolean
  dependsOn?: string[]
  phase?: string
}

export type RetrievalNoteSummary = {
  id: string
  connectorId: string
  outcome: "success" | "no-signal" | "fallback" | "error"
  note: string
  fallbackConnectorId?: string
  detail?: string
}

export type GatekeeperDecisionSummary = {
  scope: "connector" | "tool"
  id: string
  decision: "allow" | "skip"
  reasonCode: string
  reason: string
  detail?: string
}

export type LoopTransitionSummary = {
  iteration: number
  decision: "continue" | "compose"
  reason: string
  observedConfidence: number
  targetConfidence: number
}

export type ConfidenceTransitionSummary = {
  iteration: number
  before: number
  after: number
  reason: string
}

export type MissingVariablePromptSummary = {
  variable: string
  prompt: string
}

export type ClinicalCompletenessSummary = {
  state?: "complete" | "partial" | "incomplete_evidence" | string
  missingCriticalVariables?: string[]
  rationale?: string[]
}

export type TaskBoardTimelineEvent = TimelineEventBase & {
  kind: "task-board"
  title: string
  items: TaskBoardItem[]
  querySnippet?: string
  tools?: string[]
  connectors?: string[]
  trace?: string[]
  taskPlan?: TaskBoardItem[]
  runtimeSteps?: TaskBoardItem[]
  runtimeDag?: TaskBoardItem[]
  gatekeeperDecisions?: GatekeeperDecisionSummary[]
  retrievalNotes?: RetrievalNoteSummary[]
  loopTransitions?: LoopTransitionSummary[]
  confidenceTransitions?: ConfidenceTransitionSummary[]
  incompleteEvidencePolicy?: "none" | "balanced_conditional" | "strict_blocking" | string
  incompleteEvidenceState?: "complete" | "partial" | "incomplete_evidence" | string
  missingVariablePrompts?: MissingVariablePromptSummary[]
  complexityMode?: "fast-track" | "deep-dive" | string
  clinicalCompleteness?: ClinicalCompletenessSummary | null
  summary?: string
}

export type MessageTextTimelineEvent = TimelineEventBase & {
  kind: "message-text"
  text: string
}

export type ReasoningTimelineEvent = TimelineEventBase & {
  kind: "reasoning"
  text: string
}

export type ToolLifecycleTimelineEvent = TimelineEventBase & {
  kind: "tool-lifecycle"
  toolName: string
  toolCallId: string
  lifecycle: ToolLifecycleState
  detail?: string | null
}

export type ToolResultTimelineEvent = TimelineEventBase & {
  kind: "tool-result"
  toolName: string
  toolCallId: string
  part: ToolInvocationUIPart
}

export type UploadStatusTimelineEvent = TimelineEventBase & {
  kind: "upload-status"
  uploadId: string
  uploadTitle: string | null
  status: UploadStatus
  progressStage: UploadProgressStage | null
  progressPercent: number | null
  lastError: string | null
}

export type ArtifactTimelineEvent = TimelineEventBase & {
  kind: "artifact"
  artifact: DocumentArtifact | QuizArtifact
}

export type EvidenceCitationsTimelineEvent = TimelineEventBase & {
  kind: "evidence-citations"
  citations: EvidenceCitation[]
}

export type SystemIntroTimelineEvent = TimelineEventBase & {
  kind: "system-intro"
  text: string
}

export type ChecklistTimelineEvent = TimelineEventBase & {
  kind: "checklist"
  title?: string
  items: Array<{
    id: string
    label: string
    status: "pending" | "running" | "completed" | "failed"
  }>
}

export type TimelineEvent =
  | TaskBoardTimelineEvent
  | MessageTextTimelineEvent
  | ReasoningTimelineEvent
  | ToolLifecycleTimelineEvent
  | ToolResultTimelineEvent
  | UploadStatusTimelineEvent
  | ArtifactTimelineEvent
  | EvidenceCitationsTimelineEvent
  | ChecklistTimelineEvent
  | SystemIntroTimelineEvent

export type ReferencedUploadStatus = Pick<
  UserUploadListItem,
  "id" | "title" | "status" | "lastError" | "latestJob" | "updatedAt"
>

export type TimelineAnnotation =
  | {
      type: "tool-lifecycle"
      sequence?: number
      createdAt?: string
      toolName?: string
      toolCallId?: string
      lifecycle?: ToolLifecycleState
      detail?: string
    }
  | {
      type: "timeline-event"
      event?: unknown
    }
  | {
      type: "upload-status-tracking"
      uploadIds?: string[]
      sequence?: number
      createdAt?: string
    }
  | {
      type: "upload-status"
      sequence?: number
      createdAt?: string
      uploadId?: string
      uploadTitle?: string
      status?: UploadStatus
      progressStage?: UploadProgressStage | null
      progressPercent?: number | null
      lastError?: string | null
    }
  | {
      type: "evidence-citations"
      sequence?: number
      createdAt?: string
      citations?: EvidenceCitation[]
    }
  | {
      type: "langgraph-routing"
      sequence?: number
      createdAt?: string
      trace?: string[]
      summary?: string
      taskBoardTitle?: string
      maxSteps?: number
      intent?: string
      querySnippet?: string
      selectedConnectorIds?: string[]
      selectedToolNames?: string[]
      orchestrationEngine?: string
      loopIterations?: number
      confidence?: number
      sourceDiversity?: number
      runtimeSteps?: Array<{
        id?: string
        label?: string
        status?: "pending" | "running" | "completed" | "failed"
        detail?: string
        description?: string
        reasoning?: string
        isCritical?: boolean
        dependsOn?: string[]
        phase?: string
      }>
      taskPlan?: Array<{
        id?: string
        taskName?: string
        description?: string
        reasoning?: string
        status?: "pending" | "running" | "completed" | "failed"
        dependsOn?: string[]
        phase?: string
        isCritical?: boolean
      }>
      runtimeDag?: Array<{
        id?: string
        label?: string
        status?: "pending" | "running" | "completed" | "failed"
        detail?: string
        dependsOn?: string[]
      }>
      gatekeeperDecisions?: Array<{
        scope?: "connector" | "tool"
        id?: string
        decision?: "allow" | "skip"
        reasonCode?: string
        reason?: string
        detail?: string
      }>
      retrievalNotes?: Array<{
        id?: string
        connectorId?: string
        outcome?: "success" | "no-signal" | "fallback" | "error"
        note?: string
        fallbackConnectorId?: string
        detail?: string
      }>
      loopTransitions?: Array<{
        iteration?: number
        decision?: "continue" | "compose"
        reason?: string
        observedConfidence?: number
        targetConfidence?: number
      }>
      confidenceTransitions?: Array<{
        iteration?: number
        before?: number
        after?: number
        reason?: string
      }>
      incompleteEvidencePolicy?: "none" | "balanced_conditional" | "strict_blocking" | string
      incompleteEvidenceState?: "complete" | "partial" | "incomplete_evidence" | string
      missingVariablePrompts?: Array<{
        variable?: string
        prompt?: string
      }>
      complexityMode?: "fast-track" | "deep-dive" | string
      clinicalCompleteness?: {
        state?: "complete" | "partial" | "incomplete_evidence" | string
        missingCriticalVariables?: string[]
        rationale?: string[]
      } | null
      chartPlan?: {
        enabled?: boolean
        suggestedCount?: number
        reasons?: string[]
        dataShape?: string
        visualMode?: string
        preferredChartTypes?: string[]
        feasibilityScore?: number
      } | null
      modePolicy?: {
        studentMode?: boolean
        clinicianMode?: boolean
        requireStrictUncertainty?: boolean
        requireEvidenceForClinicalClaims?: boolean
      } | null
      artifactWorkflowStage?: string
      learningMode?: string
      clinicianMode?: string
    }
  | {
      type: "checklist"
      sequence?: number
      createdAt?: string
      title?: string
      items?: Array<{
        id?: string
        label?: string
        status?: "pending" | "running" | "completed" | "failed"
      }>
    }
  | {
      type: "artifact-refinement"
      sequence?: number
      createdAt?: string
      refinement?: unknown
    }
  | Record<string, unknown>

export type BuildTimelineInput = {
  messageId: string
  parts?: MessageAISDK["parts"]
  annotations?: TimelineAnnotation[]
  fallbackText: string
  status?: "streaming" | "ready" | "submitted" | "error"
  streamIntroPreview?: string | null
  referencedUploads?: ReferencedUploadStatus[]
  optimisticTaskBoard?: OptimisticTaskBoardState | null
}

export type OptimisticTaskBoardState = {
  title: string
  summary?: string
  querySnippet?: string
  items: TaskBoardItem[]
  createdAt?: string | null
}

