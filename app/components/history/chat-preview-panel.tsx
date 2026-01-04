import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
import { useLayoutEffect, useRef, useState, useEffect, useMemo } from "react"
import {
  Message as MessageContainer,
  MessageContent,
} from "@/components/prompt-kit/message"
import {
  ChatContainerRoot,
  ChatContainerContent,
} from "@/components/prompt-kit/chat-container"
import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceReferencesSection } from "@/app/components/chat/evidence-references-section"
import type { EvidenceCitation } from "@/lib/evidence/types"

type ChatPreviewPanelProps = {
  chatId: string | null
  onHover?: (isHovering: boolean) => void
  messages?: ChatMessage[]
  isLoading?: boolean
  error?: string | null
  onFetchPreview?: (chatId: string) => Promise<void>
}

type ChatMessage = {
  id: string
  content: string
  role: "user" | "assistant"
  created_at: string
  evidenceCitations?: EvidenceCitation[]
}

type MessageBubbleProps = {
  content: string
  role: "user" | "assistant"
  id: string
  evidenceCitations?: EvidenceCitation[]
  isLast?: boolean
}

function MessageBubble({ content, role, evidenceCitations }: MessageBubbleProps) {
  // CRITICAL: Validate evidenceCitations before using
  const hasValidCitations = useMemo(() => {
    if (!evidenceCitations || !Array.isArray(evidenceCitations)) return false
    // Check if citations have required fields (index and title)
    return evidenceCitations.length > 0 && 
           evidenceCitations.every(c => 
             c && 
             typeof c.index === 'number' && 
             c.title && 
             typeof c.title === 'string'
           )
  }, [evidenceCitations])

  if (role === "user") {
    return (
      <MessageContainer className="group flex w-full max-w-3xl flex-col items-end gap-0.5 px-6 pb-2">
        <MessageContent
          className="bg-accent relative max-w-[70%] rounded-3xl px-5 py-2.5"
          markdown={true}
          components={{
            code: ({ children }) => <>{children}</>,
            pre: ({ children }) => <>{children}</>,
            h1: ({ children }) => <p>{children}</p>,
            h2: ({ children }) => <p>{children}</p>,
            h3: ({ children }) => <p>{children}</p>,
            h4: ({ children }) => <p>{children}</p>,
            h5: ({ children }) => <p>{children}</p>,
            h6: ({ children }) => <p>{children}</p>,
            p: ({ children }) => <p>{children}</p>,
            li: ({ children }) => <p>- {children}</p>,
            ul: ({ children }) => <>{children}</>,
            ol: ({ children }) => <>{children}</>,
          }}
        >
          {content}
        </MessageContent>
      </MessageContainer>
    )
  }

  // Assistant message
  return (
    <MessageContainer className="group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2">
      <div className="flex min-w-full flex-col gap-2">
        {hasValidCitations ? (
          <CitationMarkdown
            citations={new Map()}
            evidenceCitations={evidenceCitations}
            className="prose dark:prose-invert relative min-w-full bg-transparent p-0 prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
          >
            {content}
          </CitationMarkdown>
        ) : (
          <MessageContent
            className="prose dark:prose-invert relative min-w-full bg-transparent p-0 prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
            markdown={true}
          >
            {content}
          </MessageContent>
        )}
        {hasValidCitations && (
          <EvidenceReferencesSection citations={evidenceCitations} />
        )}
      </div>
    </MessageContainer>
  )
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading messages...</span>
      </div>
    </div>
  )
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string
  onRetry?: () => void
}) {
  const isNetworkError =
    error.includes("fetch") ||
    error.includes("network") ||
    error.includes("HTTP") ||
    error.includes("Failed to fetch")

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-muted-foreground max-w-[300px] space-y-3 text-center">
        <div className="flex justify-center">
          <AlertCircle className="text-muted-foreground/50 h-8 w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Failed to load preview</p>
          <p className="text-xs break-words opacity-70">{error}</p>
        </div>
        {isNetworkError && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="h-8 text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-32 items-center justify-center p-4">
      <p className="text-muted-foreground text-center text-sm">
        No messages in this conversation yet
      </p>
    </div>
  )
}

function DefaultState() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="text-muted-foreground space-y-2 text-center">
        <p className="text-sm opacity-60">Select a conversation to preview</p>
      </div>
    </div>
  )
}

export function ChatPreviewPanel({
  chatId,
  onHover,
  messages = [],
  isLoading = false,
  error = null,
  onFetchPreview,
}: ChatPreviewPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const lastChatIdRef = useRef<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  // Deduplicate messages by ID and sort by created_at to prevent duplicates and ensure order
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>()
    const deduplicated = messages.filter((msg) => {
      if (seen.has(msg.id)) {
        return false
      }
      seen.add(msg.id)
      return true
    })
    // Sort by created_at to ensure chronological order
    return deduplicated.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime()
      const timeB = new Date(b.created_at).getTime()
      return timeA - timeB
    })
  }, [messages])

  // Track the last chatId we scrolled for and the scroll height to prevent re-scrolling
  const lastScrolledChatIdRef = useRef<string | null>(null)
  const lastScrollHeightRef = useRef<number>(0)

  // Fetch messages when chatId changes
  useEffect(() => {
    if (chatId && chatId !== lastChatIdRef.current) {
      lastChatIdRef.current = chatId
      lastScrolledChatIdRef.current = null // Reset scroll flag for new chat
      lastScrollHeightRef.current = 0 // Reset scroll height
      setRetryCount(0)
      if (onFetchPreview) {
        onFetchPreview(chatId)
      }
    } else if (!chatId) {
      // Clear when chatId is null
      lastChatIdRef.current = null
      lastScrolledChatIdRef.current = null
      lastScrollHeightRef.current = 0
    }
  }, [chatId, onFetchPreview])

  const handleRetry = () => {
    if (chatId && onFetchPreview && retryCount < maxRetries) {
      setRetryCount((prev) => prev + 1)
      onFetchPreview(chatId)
    }
  }

  // Scroll to bottom only once per chatId when messages first load
  useLayoutEffect(() => {
    // Only scroll if:
    // 1. We have a chatId
    // 2. We have messages
    // 3. We haven't scrolled for this chatId yet
    // 4. The chatId matches the current lastChatIdRef (to avoid scrolling during transitions)
    if (
      chatId &&
      uniqueMessages.length > 0 &&
      chatId !== lastScrolledChatIdRef.current &&
      chatId === lastChatIdRef.current &&
      scrollAreaRef.current
    ) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      )
      if (scrollContainer) {
        // Mark that we've scrolled for this chatId
        lastScrolledChatIdRef.current = chatId
        // Use a small delay to ensure DOM is fully updated
        const timeoutId = setTimeout(() => {
          if (
            scrollContainer &&
            chatId === lastScrolledChatIdRef.current &&
            chatId === lastChatIdRef.current
          ) {
            const newScrollHeight = scrollContainer.scrollHeight
            // Only scroll if the content height has actually changed
            if (newScrollHeight !== lastScrollHeightRef.current) {
              lastScrollHeightRef.current = newScrollHeight
              scrollContainer.scrollTop = newScrollHeight
            }
          }
        }, 50)
        return () => clearTimeout(timeoutId)
      }
    }
  }, [chatId, uniqueMessages.length])

  return (
    <div
      className="bg-background col-span-3 border-l"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      key={chatId}
    >
      <div className="h-[480px]">
        {!chatId && <DefaultState />}
        {chatId && isLoading && <LoadingState />}
        {chatId && error && !isLoading && (
          <ErrorState
            error={error}
            onRetry={retryCount < maxRetries ? handleRetry : undefined}
          />
        )}
        {chatId && !isLoading && !error && messages.length === 0 && (
          <EmptyState />
        )}
        {chatId && !isLoading && !error && uniqueMessages.length > 0 && (
          <ScrollArea ref={scrollAreaRef} className="h-full">
            <div className="relative flex h-full w-full flex-col items-center">
              <div className="w-full">
                <div className="flex justify-center py-2 w-full">
                  <div className="text-muted-foreground bg-muted/50 rounded-full px-2 py-1 text-xs">
                    Last {uniqueMessages.length} messages
                  </div>
                </div>
                {uniqueMessages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    role={message.role}
                    evidenceCitations={message.evidenceCitations}
                    isLast={index === uniqueMessages.length - 1}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
