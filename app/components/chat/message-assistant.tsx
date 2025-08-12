import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { cn } from "@/lib/utils"
import type { Message as MessageAISDK } from "@ai-sdk/react"
import { ArrowClockwise, Check, Copy } from "@phosphor-icons/react"
import { ReactNode, useState, useEffect, useRef } from "react"
import { getSources } from "./get-sources"
import { Reasoning } from "./reasoning"
import { SearchImages } from "./search-images"
import { SourcesList } from "./sources-list"
import { ToolInvocation } from "./tool-invocation"
import { InlineArtifact } from "./inline-artifact"

type MessageAssistantProps = {
  children: ReactNode
  isLast?: boolean
  hasScrollAnchor?: boolean
  copied?: boolean
  copyToClipboard?: () => void
  onReload?: () => void
  parts?: MessageAISDK["parts"]
  status?: "streaming" | "ready" | "submitted" | "error"
  className?: string
  chatId?: string
  userId?: string
  isAuthenticated?: boolean
}

// Enhanced streaming indicator component
function StreamingIndicator({ isStreaming }: { isStreaming: boolean }) {
  if (!isStreaming) return null

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>AI is thinking...</span>
    </div>
  )
}

// Enhanced content display with better streaming handling
function StreamingContent({ 
  content, 
  isStreaming, 
  className 
}: { 
  content: string
  isStreaming: boolean
  className?: string 
}) {
  // Ensure content is always a string for markdown parsing
  const safeContent = typeof content === 'string' ? content : ''
  const contentNullOrEmpty = !safeContent || safeContent.trim() === ""
  
  if (contentNullOrEmpty && !isStreaming) {
    return null
  }

  return (
    <div className="relative">
      <MessageContent
        className={cn(
          "prose dark:prose-invert relative min-w-full bg-transparent p-0",
          "prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto",
          isStreaming && "streaming-content",
          className
        )}
        markdown={true}
      >
        {safeContent}
      </MessageContent>
      {isStreaming && (
        <span className="absolute right-0 top-0 inline-block w-1 h-4 bg-muted-foreground ml-1 animate-pulse" />
      )}
    </div>
  )
}

export function MessageAssistant({
  children,
  isLast,
  hasScrollAnchor,
  copied,
  copyToClipboard,
  onReload,
  parts,
  status,
  className,
  chatId,
  userId,
  isAuthenticated,
}: MessageAssistantProps) {
  const { preferences } = useUserPreferences()
  const sources = getSources(parts)
  const toolInvocationParts = parts?.filter(
    (part) => part.type === "tool-invocation"
  )
  const reasoningParts = parts?.find((part) => part.type === "reasoning")
  
  // Ensure children is always a string for markdown parsing
  const safeChildren = typeof children === 'string' ? children : (children ? String(children) : '')
  const contentNullOrEmpty = !safeChildren || safeChildren.trim() === ""
  const isLastStreaming = status === "streaming" && isLast
  const isStreaming = status === "streaming"
  
  const searchImageResults =
    parts
      ?.filter(
        (part) =>
          part.type === "tool-invocation" &&
          part.toolInvocation?.state === "result" &&
          part.toolInvocation?.toolName === "imageSearch" &&
          part.toolInvocation?.result?.content?.[0]?.type === "images"
      )
      .flatMap((part) => {
        try {
          return part.type === "tool-invocation" &&
            part.toolInvocation?.state === "result" &&
            part.toolInvocation?.toolName === "imageSearch" &&
            part.toolInvocation?.result?.content?.[0]?.type === "images"
              ? (part.toolInvocation?.result?.content?.[0]?.results ?? [])
              : []
        } catch (error) {
          console.warn("Error processing image search results:", error)
          return []
        }
      }) ?? []

  return (
    <Message
      className={cn(
        "group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor",
        isStreaming && "streaming-message",
        className
      )}
    >
      <div className={cn("flex min-w-full flex-col gap-2", isLast && "pb-8")}>
        {reasoningParts && reasoningParts.reasoning && (
          <Reasoning
            reasoning={reasoningParts.reasoning}
            isStreaming={status === "streaming"}
          />
        )}

        {toolInvocationParts &&
          toolInvocationParts.length > 0 &&
          preferences.showToolInvocations && (
            <ToolInvocation toolInvocations={toolInvocationParts} />
          )}

        {searchImageResults.length > 0 && (
          <SearchImages results={searchImageResults} />
        )}

        <StreamingContent 
          content={safeChildren} 
          isStreaming={isStreaming}
        />

        {/* Inline Artifacts */}
        {chatId && userId && isAuthenticated && (
          <InlineArtifacts 
            chatId={chatId}
            userId={userId}
            isAuthenticated={isAuthenticated}
            messageContent={safeChildren}
          />
        )}

        {sources && sources.length > 0 && <SourcesList sources={sources} />}

        {/* Show streaming indicator when streaming and no content yet */}
        {isStreaming && contentNullOrEmpty && (
          <div className="mt-2">
            <StreamingIndicator isStreaming={isStreaming} />
          </div>
        )}

        {Boolean(isLastStreaming || contentNullOrEmpty) ? null : (
          <MessageActions
            className={cn(
              "-ml-2 flex gap-0 opacity-0 transition-opacity group-hover:opacity-100",
              isStreaming && "opacity-100" // Show actions during streaming
            )}
          >
            <MessageAction
              tooltip={copied ? "Copied!" : "Copy text"}
              side="bottom"
            >
              <button
                className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
                aria-label="Copy text"
                onClick={copyToClipboard}
                type="button"
                disabled={isStreaming} // Disable during streaming
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </MessageAction>
            {isLast ? (
              <MessageAction
                tooltip="Regenerate"
                side="bottom"
                delayDuration={0}
              >
                <button
                  className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
                  aria-label="Regenerate"
                  onClick={onReload}
                  type="button"
                  disabled={isStreaming} // Disable during streaming
                >
                  <ArrowClockwise className="size-4" />
                </button>
              </MessageAction>
            ) : null}
          </MessageActions>
        )}
      </div>
    </Message>
  )
}

// Component to fetch and display inline artifacts for a specific message
function InlineArtifacts({ 
  chatId, 
  userId, 
  isAuthenticated,
  messageContent
}: { 
  chatId: string
  userId: string
  isAuthenticated: boolean
  messageContent: string
}) {
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasFetched = useRef(false)
  const mounted = useRef(false)
  const fetchPromise = useRef<Promise<void> | null>(null)

  // Fetch artifacts only once when the component mounts
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    
    const fetchArtifacts = async () => {
      if (hasFetched.current || fetchPromise.current) return
      
      hasFetched.current = true
      setIsLoading(true)
      
      try {
        console.log('🔄 Fetching artifacts for chat:', chatId, 'user:', userId)
        const response = await fetch(`/api/get-ai-artifacts?chatId=${chatId}&userId=${userId}&isAuthenticated=${isAuthenticated}`)
        if (response.ok) {
          const data = await response.json()
          console.log('📦 Artifacts API response:', data)
          
          const chatArtifacts = data.artifacts || []
          console.log('🎯 Found artifacts:', chatArtifacts.length, chatArtifacts)
          
          setArtifacts(chatArtifacts)
        } else {
          console.error("❌ Failed to fetch artifacts:", response.status, response.statusText)
        }
      } catch (error) {
        console.warn('⚠️ Failed to fetch artifacts:', error)
      } finally {
        setIsLoading(false)
        fetchPromise.current = null
      }
    }

    fetchArtifacts()
  }, []) // Empty dependency array - only run once
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        <span>Loading artifacts...</span>
      </div>
    )
  }
  
  if (artifacts.length === 0) {
    return null // Don't show anything if no artifacts
  }

  return (
    <div className="mt-4 space-y-3">
      {artifacts.map((artifact) => (
        <InlineArtifact
          key={artifact.id}
          id={artifact.id}
          title={artifact.title}
          content={artifact.content}
          contentType={artifact.content_type}
          metadata={artifact.metadata}
          created_at={artifact.created_at}
          userId={userId}
          isAuthenticated={isAuthenticated}
        />
      ))}
    </div>
  )
}
