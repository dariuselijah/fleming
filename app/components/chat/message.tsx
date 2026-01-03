import { Message as MessageType } from "@ai-sdk/react"
import React, { useState, useCallback, useMemo, memo } from "react"
import { MessageAssistant } from "./message-assistant"
import { MessageUser } from "./message-user"

type MessageProps = {
  variant: MessageType["role"]
  children: string
  id: string
  attachments?: MessageType["experimental_attachments"]
  isLast?: boolean
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
  hasScrollAnchor?: boolean
  parts?: MessageType["parts"]
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  evidenceCitations?: any[]
}

// Memoize the component to prevent re-renders when props haven't changed
// Only the last message should re-render during streaming
export const Message = memo(function Message({
  variant,
  children,
  id,
  attachments,
  isLast,
  onDelete,
  onEdit,
  onReload,
  hasScrollAnchor,
  parts,
  status,
  className,
  evidenceCitations = [],
}: MessageProps) {
  const [copied, setCopied] = useState(false)

  // Memoize handlers to prevent unnecessary re-renders during streaming
  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 500)
  }, [children])

  const memoizedOnDelete = useCallback(() => onDelete(id), [onDelete, id])
  const memoizedOnEdit = useCallback((newText: string) => onEdit(id, newText), [onEdit, id])
  const memoizedOnReload = useCallback(() => onReload(), [onReload])

  // Render directly without useMemo - React.memo handles the optimization
  // Only re-render when props actually change
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
        copied={copied}
        copyToClipboard={copyToClipboard}
        onReload={memoizedOnReload}
        isLast={isLast}
        hasScrollAnchor={hasScrollAnchor}
        parts={parts}
        status={status}
        className={className}
        evidenceCitations={evidenceCitations}
      >
        {children}
      </MessageAssistant>
    )
  }

  return null
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these props change (not children for non-last messages)
  if (prevProps.id !== nextProps.id) return false
  if (prevProps.variant !== nextProps.variant) return false
  if (prevProps.isLast !== nextProps.isLast) return false
  if (prevProps.status !== nextProps.status) return false
  if (prevProps.hasScrollAnchor !== nextProps.hasScrollAnchor) return false
  if (prevProps.className !== nextProps.className) return false
  
  // For the last message, always update (streaming content)
  // For other messages, only update if content actually changed
  if (nextProps.isLast) {
    // Last message - always update during streaming
    if (prevProps.children !== nextProps.children) return false
  } else {
    // Non-last messages - only update if content changed significantly
    // This prevents unnecessary re-renders of old messages
    if (prevProps.children !== nextProps.children) return false
  }
  
  // Check parts array changes
  if (prevProps.parts !== nextProps.parts) {
    if (prevProps.parts?.length !== nextProps.parts?.length) return false
    // Deep comparison would be expensive, so we allow re-render if parts reference changed
    // This is fine since parts don't change often
  }
  
  // Check evidenceCitations changes
  if (prevProps.evidenceCitations !== nextProps.evidenceCitations) {
    if (prevProps.evidenceCitations?.length !== nextProps.evidenceCitations?.length) return false
  }
  
  // Check attachments changes
  if (prevProps.attachments !== nextProps.attachments) {
    if (prevProps.attachments?.length !== nextProps.attachments?.length) return false
  }
  
  // Props are equal, skip re-render
  return true
})
