import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container"
import { Loader } from "@/components/prompt-kit/loader"
import { ScrollButton } from "@/components/prompt-kit/scroll-button"
import { Message as MessageType } from "@ai-sdk/react"
import { useRef, useMemo, useCallback, useEffect } from "react"
import { Message } from "./message"

type ConversationProps = {
  messages: MessageType[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
  evidenceCitations?: any[]
}

export function Conversation({
  messages,
  status = "ready",
  onDelete,
  onEdit,
  onReload,
  evidenceCitations = [],
}: ConversationProps) {
  const initialMessageCount = useRef(messages.length)

  // Memoize message rendering for streaming performance
  // React.memo on Message components will prevent re-renders of unchanged messages
  // Only the last message will re-render during streaming
  const renderedMessages = useMemo(() => {
    // Handle empty messages
    if (!messages || messages.length === 0) {
      return null
    }
    
    // Filter out duplicate messages by ID to prevent React key conflicts
    const uniqueMessages = messages.filter((message, index, self) => 
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
      
      // Priority 1: For last message during streaming/ready, use props citations
      if (isLast && evidenceCitations.length > 0) {
        messageEvidenceCitations = evidenceCitations
      } 
      // Priority 2: Check if message has evidenceCitations field (added by getMessagesFromDb)
      else if ((message as any).evidenceCitations && Array.isArray((message as any).evidenceCitations)) {
        messageEvidenceCitations = (message as any).evidenceCitations
      }
      // Priority 3: Extract from message.parts metadata (fallback)
      else if (message.parts && Array.isArray(message.parts)) {
        const metadataPart = message.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
        if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
          messageEvidenceCitations = (metadataPart as any).metadata.evidenceCitations
        }
      }

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
          hasScrollAnchor={hasScrollAnchor}
          parts={message.parts}
          status={status}
          evidenceCitations={messageEvidenceCitations}
        >
          {message.content}
        </Message>
      )
    })
  }, [messages, status, onDelete, onEdit, onReload, evidenceCitations])

  // Memoize handlers to prevent unnecessary re-renders
  const memoizedOnDelete = useCallback(onDelete, [onDelete])
  const memoizedOnEdit = useCallback(onEdit, [onEdit])
  const memoizedOnReload = useCallback(onReload, [onReload])

  // Always render the same structure to prevent hydration mismatches
  // Don't use early return - always render full structure
  const hasMessages = messages && messages.length > 0

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
          {(status === "submitted" || status === "streaming" || 
            (hasMessages && messages[messages.length - 1].role === "user" && status === "ready")) &&
            hasMessages &&
            messages[messages.length - 1].role === "user" && (
              <div className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
                <Loader>Processing...</Loader>
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
