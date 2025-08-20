import { Message as MessageType } from "@ai-sdk/react"
import React, { useState, useCallback, useMemo } from "react"
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
}

export function Message({
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
          copied={copied}
          copyToClipboard={copyToClipboard}
          onReload={memoizedOnReload}
          isLast={isLast}
          hasScrollAnchor={hasScrollAnchor}
          parts={parts}
          status={status}
          className={className}
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
    id,
    hasScrollAnchor,
    attachments,
    className,
    children,
    isLast,
    parts,
    status
  ])

  return messageContent
}
