import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import type { UploadProgressStage, UploadStatus } from "@/lib/uploads/types"
import type {
  BuildTimelineInput,
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
  "system-intro": 1,
  reasoning: 2,
  "message-text": 3,
  "tool-lifecycle": 4,
  "tool-result": 5,
  "upload-status": 6,
  artifact: 7,
  "evidence-citations": 8,
}

type MutableSequence = { value: number }

const ENABLE_DEBUG_ROUTING_TRACE =
  process.env.NEXT_PUBLIC_ENABLE_DEBUG_ROUTING_TRACE === "true"

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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
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

function summarizeLangGraphTrace(trace: string[]): string | null {
  if (!Array.isArray(trace) || trace.length === 0) return null

  const lowerTrace = trace.map((item) => String(item).toLowerCase())
  const classifyToken = lowerTrace.find((item) => item.startsWith("classify:"))
  const modeToken = lowerTrace.find((item) => item.startsWith("mode:"))
  const toolToken = lowerTrace.find((item) => item.startsWith("route:tools="))
  const connectorToken = lowerTrace.find((item) => item.startsWith("route:connectors="))

  const summaryParts: string[] = []
  const intent = classifyToken?.split(":")[1]?.trim()
  if (intent) {
    summaryParts.push(`Interpreting this as a ${intent} request.`)
  } else {
    summaryParts.push("Selecting the best response path for your request.")
  }

  if (modeToken?.includes("student=true")) {
    summaryParts.push("Using student learning mode.")
  } else if (modeToken?.includes("clinician=true")) {
    summaryParts.push("Using clinician guidance mode.")
  }

  if (toolToken) {
    const countMatch = toolToken.match(/route:tools=(\d+)/)
    const toolCount = countMatch?.[1] ? Number.parseInt(countMatch[1], 10) : null
    if (toolCount && Number.isFinite(toolCount) && toolCount > 0) {
      summaryParts.push(
        `Planning ${toolCount} tool step${toolCount === 1 ? "" : "s"} to gather context quickly.`
      )
    }
  }

  if (connectorToken) {
    const values = connectorToken
      .replace("route:connectors=", "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3)
    if (values.length > 0) {
      summaryParts.push(`Prioritizing ${values.join(", ")} sources first.`)
    }
  }

  if (summaryParts.length > 0) {
    return summaryParts.join(" ")
  }

  return "Selecting the most relevant tools and sources for this request."
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
    const summaryText = asString(record.summary)
    const trace = Array.isArray(record.trace)
      ? record.trace.map((item) => String(item))
      : []
    const text = ENABLE_DEBUG_ROUTING_TRACE
      ? trace.length > 0
        ? `Routing trace: ${trace.join(" -> ")}`
        : summaryText
      : summaryText || summarizeLangGraphTrace(trace)
    if (!text) return null
    return {
      id: `reasoning:langgraph:${messageId}`,
      kind: "reasoning",
      messageId,
      sequence: normalizeSequence(record.sequence, sequenceState),
      createdAt,
      text,
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
  }

  return null
}

function mergeTimelineEvents(previous: TimelineEvent, next: TimelineEvent): TimelineEvent {
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
  streamIntroPreview,
  referencedUploads,
}: BuildTimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const sequenceState: MutableSequence = { value: 0 }
  const artifactIds = new Set<string>()

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
      const item = part as any
      const sequence = nextSequence(sequenceState)
      if (item?.type === "text" && typeof item.text === "string") {
        const text = sanitizeTimelineText(item.text).trim()
        if (!text) return
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

      if (item?.type === "reasoning" && typeof item.reasoning === "string") {
        const text = item.reasoning.trim()
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
      const parsed = parseTimelineEventAnnotation(annotation, messageId, sequenceState)
      if (parsed) {
        events.push(parsed)
      }
    })
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

  return sortTimelineEvents(Array.from(deduped.values()))
}

