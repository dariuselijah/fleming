import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container"
import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import { ProcessingLoader } from "@/components/prompt-kit/processing-loader"
import { ScrollButton } from "@/components/prompt-kit/scroll-button"
import { isArtifactWorkflowInput } from "@/lib/chat/artifact-workflow"
import { ENABLE_CHAT_ACTIVITY_TIMELINE_V2 } from "@/lib/config"
import { Message as MessageType } from "@ai-sdk/react"
import { useRef, useMemo, useCallback } from "react"
import type {
  OptimisticTaskBoardState,
  ReferencedUploadStatus,
} from "./activity/types"
import { Message } from "./message"
import {
  extractReferencedUploadIdsFromMessage,
  useReferencedUploadStatus,
} from "./use-referenced-upload-status"
import { buildEvidenceSourceId } from "@/lib/evidence/source-id"

function citationMetadataScore(citation: any): number {
  if (!citation || typeof citation !== "object") return 0
  let score = 0
  if (typeof citation.title === "string" && citation.title.trim().length > 0) score += 3
  if (typeof citation.journal === "string" && citation.journal.trim().length > 0) score += 2
  if (Array.isArray(citation.authors) && citation.authors.length > 0) score += 1
  if (typeof citation.url === "string" && citation.url.trim().length > 0) score += 3
  if (typeof citation.sourceId === "string" && citation.sourceId.trim().length > 0) score += 2
  if (typeof citation.pmid === "string" && citation.pmid.trim().length > 0) score += 2
  if (typeof citation.doi === "string" && citation.doi.trim().length > 0) score += 1
  if (typeof citation.sourceLabel === "string" && citation.sourceLabel.trim().length > 0) score += 2
  if (typeof citation.sourceType === "string" && citation.sourceType.trim().length > 0) score += 1
  if (typeof citation.studyType === "string" && citation.studyType.trim().length > 0) score += 1
  if (typeof citation.snippet === "string" && citation.snippet.trim().length > 0) score += 1
  return score
}

function citationSetScore(citations: any[]): number {
  return citations.reduce((total, citation) => total + citationMetadataScore(citation), 0)
}

function pickRicherCitationSet(primary: any[], secondary: any[]): any[] {
  if (!Array.isArray(primary) || primary.length === 0) return secondary || []
  if (!Array.isArray(secondary) || secondary.length === 0) return primary
  const primaryScore = citationSetScore(primary)
  const secondaryScore = citationSetScore(secondary)
  if (secondaryScore > primaryScore + 1) return secondary
  if (secondaryScore >= primaryScore && secondary.length > primary.length) return secondary
  return primary
}

function mergeAnnotationEvidenceCitations(annotations: any[] | undefined): any[] {
  if (!Array.isArray(annotations) || annotations.length === 0) return []

  const mergedBySourceId = new Map<string, any>()
  const order: string[] = []

  annotations.forEach((annotation) => {
    if (annotation?.type !== "evidence-citations" || !Array.isArray(annotation?.citations)) {
      return
    }

    annotation.citations.forEach((citation: any, idx: number) => {
      if (!citation || typeof citation !== "object") return
      const normalized = {
        ...citation,
        sourceId: buildEvidenceSourceId(citation),
      }
      const key = normalized.sourceId || `idx:${idx}`
      const existing = mergedBySourceId.get(key)
      if (!existing) {
        mergedBySourceId.set(key, normalized)
        order.push(key)
        return
      }
      const existingScore = citationMetadataScore(existing)
      const incomingScore = citationMetadataScore(normalized)
      mergedBySourceId.set(
        key,
        incomingScore >= existingScore
          ? { ...existing, ...normalized, sourceId: key }
          : { ...normalized, ...existing, sourceId: key }
      )
    })
  })

  return order
    .map((key) => mergedBySourceId.get(key))
    .filter(Boolean)
    .map((citation, index) => ({
      ...citation,
      index:
        typeof citation.index === "number" && Number.isFinite(citation.index)
          ? citation.index
          : index + 1,
      sourceId:
        typeof citation.sourceId === "string" && citation.sourceId.trim().length > 0
          ? citation.sourceId
          : buildEvidenceSourceId(citation),
    }))
}

type ConversationProps = {
  messages: MessageType[]
  status?: "streaming" | "ready" | "submitted" | "error"
  isSubmitting?: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
  onDrilldownInsightAdd?: (input: {
    pointId: string
    query: string
    response: string
    payload: ChartDrilldownPayload
    citations: any[]
  }) => Promise<boolean> | boolean
  discussionInsightCount?: number
  evidenceCitations?: any[]
  streamIntroPreview?: string | null
  optimisticTaskBoard?: OptimisticTaskBoardState | null
}

export function Conversation({
  messages,
  status = "ready",
  isSubmitting = false,
  onDelete,
  onEdit,
  onReload,
  onSuggestion,
  onWorkflowSuggestion,
  onDrilldownInsightAdd,
  discussionInsightCount = 0,
  evidenceCitations = [],
  streamIntroPreview = null,
  optimisticTaskBoard = null,
}: ConversationProps) {
  const initialMessageCount = useRef(messages.length)
  const { uploadsById } = useReferencedUploadStatus({
    messages,
    enabled: ENABLE_CHAT_ACTIVITY_TIMELINE_V2,
  })

  // Memoize message rendering for streaming performance
  const renderedMessages = useMemo(() => {
    // Handle empty messages
    if (!messages || messages.length === 0) {
      return null
    }
    
    const visibleMessages = messages.filter((message) => {
      if (message.role !== "user" || typeof message.content !== "string") return true
      return !isArtifactWorkflowInput(message.content)
    })

    // Filter out duplicate messages by ID to prevent React key conflicts
    const uniqueMessages = visibleMessages.filter((message, index, self) => 
      index === self.findIndex(m => m.id === message.id)
    )
    
    return uniqueMessages?.map((message, index) => {
      const isLast =
        index === uniqueMessages.length - 1 && status !== "submitted"
      const hasScrollAnchor =
        isLast && uniqueMessages.length > initialMessageCount.current

      // CRITICAL: Each message should get its own evidence citations
      // 1. For the last message during streaming, use citations from props (from onResponse header)
      // 2. For loaded messages, use citations from the message's evidenceCitations field (from DB)
      // 3. Also check message.parts for metadata containing evidence citations
      let messageEvidenceCitations: any[] = []
      let persistedEvidenceCitations: any[] = []
      let metadataEvidenceCitations: any[] = []
      
      // Priority 1: For last message during streaming/ready, use props citations
      if (isLast && evidenceCitations.length > 0) {
        messageEvidenceCitations = evidenceCitations
      }
      // Priority 2: Check if message has evidenceCitations field (added by getMessagesFromDb)
      if ((message as any).evidenceCitations && Array.isArray((message as any).evidenceCitations)) {
        persistedEvidenceCitations = (message as any).evidenceCitations
      }
      // Priority 3: Extract from message.parts metadata (fallback)
      if (message.parts && Array.isArray(message.parts)) {
        const metadataPart = message.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
        if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
          metadataEvidenceCitations = (metadataPart as any).metadata.evidenceCitations
        }
      }
      // Priority 4: Extract from message annotations evidence-citations (stream/runtime fallback)
      const annotationEvidenceCitations = mergeAnnotationEvidenceCitations(
        (message as any).annotations
      )
      messageEvidenceCitations = pickRicherCitationSet(
        pickRicherCitationSet(
          pickRicherCitationSet(messageEvidenceCitations, persistedEvidenceCitations),
          metadataEvidenceCitations
        ),
        annotationEvidenceCitations
      )

      const previousUserMessage = [...uniqueMessages.slice(0, index)]
        .reverse()
        .find((candidate) => candidate.role === "user")
      const referencedUploadIds = ENABLE_CHAT_ACTIVITY_TIMELINE_V2
        ? Array.from(
            new Set([
              ...extractReferencedUploadIdsFromMessage(message),
              ...(message.role === "assistant" && previousUserMessage
                ? extractReferencedUploadIdsFromMessage(previousUserMessage)
                : []),
            ])
          )
        : []
      const referencedUploads: ReferencedUploadStatus[] = referencedUploadIds
        .map((uploadId) => uploadsById[uploadId])
        .filter(Boolean) as ReferencedUploadStatus[]

      return (
        <Message
          key={message.id}
          id={message.id}
          variant={message.role}
          attachments={message.experimental_attachments}
          isLast={isLast}
          onDelete={onDelete}
          onEdit={onEdit}
          onReload={onReload}
          onSuggestion={onSuggestion}
          onWorkflowSuggestion={onWorkflowSuggestion}
          onDrilldownInsightAdd={onDrilldownInsightAdd}
          discussionInsightCount={discussionInsightCount}
          hasScrollAnchor={hasScrollAnchor}
          parts={message.parts}
          annotations={(message as any).annotations}
          status={status}
          evidenceCitations={messageEvidenceCitations}
          contextPrompt={previousUserMessage?.content}
          referencedUploads={referencedUploads}
          streamIntroPreview={
            message.role === "assistant" && isLast && status === "streaming"
              ? streamIntroPreview
              : undefined
          }
          optimisticTaskBoard={
            message.role === "assistant" && isLast && status === "streaming"
              ? optimisticTaskBoard
              : null
          }
        >
          {message.content}
        </Message>
      )
    })
  }, [
    messages,
    status,
    onDelete,
    onEdit,
    onReload,
    onSuggestion,
    onWorkflowSuggestion,
    onDrilldownInsightAdd,
    discussionInsightCount,
    evidenceCitations,
    uploadsById,
    optimisticTaskBoard,
  ])

  // Memoize handlers to prevent unnecessary re-renders
  const memoizedOnDelete = useCallback(onDelete, [onDelete])
  const memoizedOnEdit = useCallback(onEdit, [onEdit])
  const memoizedOnReload = useCallback(onReload, [onReload])

  // Always render the same structure to prevent hydration mismatches
  // Don't use early return - always render full structure
  const hasMessages = messages && messages.length > 0
  const lastMessage = hasMessages ? messages[messages.length - 1] : null
  const awaitingAssistantStart = hasMessages && lastMessage?.role === "user"
  const shouldShowProcessing =
    awaitingAssistantStart &&
    (isSubmitting || status === "submitted" || status === "streaming" || status === "ready")

  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto">
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 mx-auto flex w-full flex-col justify-center">
        <div className="h-app-header bg-background flex w-full lg:hidden lg:h-0" />
        <div className="h-app-header bg-background flex w-full mask-b-from-4% mask-b-to-100% lg:hidden" />
      </div>
      <ChatContainerRoot className="relative w-full">
        <ChatContainerContent
          className="flex w-full flex-col items-center pt-20 pb-4"
          style={{
            scrollbarGutter: "stable both-edges",
            scrollbarWidth: "none",
          }}
        >
          {hasMessages && renderedMessages}
          {/* Show loading immediately when user sends message or when streaming */}
          {shouldShowProcessing && (
              <div className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
                {streamIntroPreview ? (
                  <div className="text-muted-foreground text-sm leading-6">
                    {streamIntroPreview}
                  </div>
                ) : (
                  <ProcessingLoader />
                )}
              </div>
            )}
          <div className="absolute bottom-0 flex w-full max-w-3xl flex-1 items-end justify-end gap-4 px-6 pb-2">
            <ScrollButton className="absolute top-[-50px] right-[30px]" />
          </div>
        </ChatContainerContent>
      </ChatContainerRoot>
    </div>
  )
}
