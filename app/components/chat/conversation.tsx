import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/prompt-kit/chat-container"
import { Loader } from "@/components/prompt-kit/loader"
import { ScrollButton } from "@/components/prompt-kit/scroll-button"
import { Message as MessageType } from "@ai-sdk/react"
import { useRef, useMemo } from "react"
import { Message } from "./message"

type ConversationProps = {
  messages: MessageType[]
  status?: "streaming" | "ready" | "submitted" | "error"
  onDelete: (id: string) => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
}

export function Conversation({
  messages,
  status = "ready",
  onDelete,
  onEdit,
  onReload,
}: ConversationProps) {
  const initialMessageCount = useRef(messages.length)

  // Memoize message rendering for streaming performance
  const renderedMessages = useMemo(() => {
    // Filter out duplicate messages by ID to prevent React key conflicts
    const uniqueMessages = messages.filter((message, index, self) => 
      index === self.findIndex(m => m.id === message.id)
    )
    
    return uniqueMessages?.map((message, index) => {
      const isLast =
        index === uniqueMessages.length - 1 && status !== "submitted"
      const hasScrollAnchor =
        isLast && uniqueMessages.length > initialMessageCount.current

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
        >
          {message.content}
        </Message>
      )
    })
  }, [messages, status, onDelete, onEdit, onReload])

  if (!messages || messages.length === 0)
    return <div className="h-full w-full"></div>

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
          {renderedMessages}
          {/* Show loading immediately when user sends message or when streaming */}
          {(status === "submitted" || status === "streaming" || 
            (messages.length > 0 && messages[messages.length - 1].role === "user" && status === "ready")) &&
            messages.length > 0 &&
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
