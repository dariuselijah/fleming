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
  | "message-text"
  | "reasoning"
  | "tool-lifecycle"
  | "tool-result"
  | "upload-status"
  | "artifact"
  | "evidence-citations"
  | "system-intro"

export type ToolLifecycleState = "queued" | "running" | "completed" | "failed"

export type TimelineEventBase = {
  id: string
  kind: TimelineEventKind
  messageId: string
  sequence: number
  createdAt: string | null
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

export type TimelineEvent =
  | MessageTextTimelineEvent
  | ReasoningTimelineEvent
  | ToolLifecycleTimelineEvent
  | ToolResultTimelineEvent
  | UploadStatusTimelineEvent
  | ArtifactTimelineEvent
  | EvidenceCitationsTimelineEvent
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
      maxSteps?: number
      intent?: string
      querySnippet?: string
      selectedConnectorIds?: string[]
      selectedToolNames?: string[]
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
  streamIntroPreview?: string | null
  referencedUploads?: ReferencedUploadStatus[]
}

