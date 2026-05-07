import { Message as MessageType } from "@ai-sdk/react"
import React, { useState, useCallback, useMemo } from "react"
import { MessageAssistant } from "./message-assistant"
import { MessageUser } from "./message-user"
import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import { parseLearningCard } from "@/lib/medical-student-learning"
import type { EvidenceCitation } from "@/lib/evidence/types"
import type {
  OptimisticTaskBoardState,
  ReferencedUploadStatus,
} from "./activity/types"

type MessageProps = {
  variant: MessageType["role"]
  children: string
  id: string
  attachments?: MessageType["experimental_attachments"]
  isLast?: boolean
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
    citations: EvidenceCitation[]
  }) => Promise<boolean> | boolean
  discussionInsightCount?: number
  hasScrollAnchor?: boolean
  parts?: MessageType["parts"]
  annotations?: Array<{ type?: string; refinement?: unknown }>
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  evidenceCitations?: any[]
  contextPrompt?: string
  streamIntroPreview?: string | null
  referencedUploads?: ReferencedUploadStatus[]
  optimisticTaskBoard?: OptimisticTaskBoardState | null
}

function MessageImpl({
  variant,
  children,
  id,
  attachments,
  isLast,
  onDelete,
  onEdit,
  onReload,
  onSuggestion,
  onWorkflowSuggestion,
  onDrilldownInsightAdd,
  discussionInsightCount = 0,
  hasScrollAnchor,
  parts,
  annotations,
  status,
  className,
  evidenceCitations = [],
  contextPrompt,
  streamIntroPreview,
  referencedUploads = [],
  optimisticTaskBoard = null,
}: MessageProps) {
  const [copied, setCopied] = useState(false)
  const clipboardText = useMemo(() => {
    if (variant !== "assistant") return children
    return parseLearningCard(children).cleanContent
  }, [variant, children])

  // Memoize handlers to prevent unnecessary re-renders during streaming
  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(clipboardText)
    setCopied(true)
    setTimeout(() => setCopied(false), 500)
  }, [clipboardText])

  const memoizedOnDelete = useCallback(() => onDelete(id), [onDelete, id])
  const memoizedOnEdit = useCallback((newText: string) => onEdit(id, newText), [onEdit, id])
  const memoizedOnReload = useCallback(() => onReload(), [onReload])

  // Memoize message variant rendering to prevent unnecessary re-renders
  const messageContent = useMemo(() => {
    if (variant === "user") {
      return (
        <MessageUser
          copied={copied}
          copyToClipboard={copyToClipboard}
          onReload={memoizedOnReload}
          onEdit={memoizedOnEdit}
          onDelete={memoizedOnDelete}
          id={id}
          hasScrollAnchor={hasScrollAnchor}
          attachments={attachments}
          className={className}
        >
          {children}
        </MessageUser>
      )
    }

    if (variant === "assistant") {
      return (
        <MessageAssistant
          messageId={id}
          copied={copied}
          copyToClipboard={copyToClipboard}
          onReload={memoizedOnReload}
          onSuggestion={onSuggestion}
          onWorkflowSuggestion={onWorkflowSuggestion}
          onDrilldownInsightAdd={onDrilldownInsightAdd}
          discussionInsightCount={discussionInsightCount}
          isLast={isLast}
          hasScrollAnchor={hasScrollAnchor}
          parts={parts}
          annotations={annotations}
          status={status}
          className={className}
          evidenceCitations={evidenceCitations}
          contextPrompt={contextPrompt}
          streamIntroPreview={streamIntroPreview}
          referencedUploads={referencedUploads}
          optimisticTaskBoard={optimisticTaskBoard}
        >
          {children}
        </MessageAssistant>
      )
    }

    return null
  }, [
    variant,
    copied,
    copyToClipboard,
    memoizedOnReload,
    memoizedOnEdit,
    memoizedOnDelete,
    onSuggestion,
    onWorkflowSuggestion,
    onDrilldownInsightAdd,
    discussionInsightCount,
    id,
    hasScrollAnchor,
    attachments,
    className,
    children,
    isLast,
    parts,
    annotations,
    status,
    evidenceCitations,
    contextPrompt,
    streamIntroPreview,
    referencedUploads,
    optimisticTaskBoard,
  ])

  return messageContent
}

/**
 * PERF: React.memo with a custom equality check so historical messages don't
 * re-render on every streaming token of the latest message. The streaming
 * message itself still re-renders because its `children`, `parts`, or
 * `annotations` change between renders.
 */
function arePropsEqualForMessage(prev: MessageProps, next: MessageProps): boolean {
  if (prev.id !== next.id) return false
  if (prev.variant !== next.variant) return false
  if (prev.children !== next.children) return false
  if (prev.isLast !== next.isLast) return false
  if (prev.status !== next.status) return false
  if (prev.hasScrollAnchor !== next.hasScrollAnchor) return false
  if (prev.discussionInsightCount !== next.discussionInsightCount) return false
  if (prev.contextPrompt !== next.contextPrompt) return false
  if (prev.streamIntroPreview !== next.streamIntroPreview) return false
  if (prev.className !== next.className) return false
  if (prev.parts !== next.parts) return false
  if (prev.annotations !== next.annotations) return false
  if (prev.attachments !== next.attachments) return false
  if (prev.evidenceCitations !== next.evidenceCitations) return false
  if (prev.referencedUploads !== next.referencedUploads) return false
  if (prev.optimisticTaskBoard !== next.optimisticTaskBoard) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.onEdit !== next.onEdit) return false
  if (prev.onReload !== next.onReload) return false
  if (prev.onSuggestion !== next.onSuggestion) return false
  if (prev.onWorkflowSuggestion !== next.onWorkflowSuggestion) return false
  if (prev.onDrilldownInsightAdd !== next.onDrilldownInsightAdd) return false
  return true
}

export const Message = React.memo(MessageImpl, arePropsEqualForMessage)
