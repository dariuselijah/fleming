import {
  cacheMessages,
  getCachedMessages,
  getMessagesFromDb,
} from "@/lib/chat-store/messages/api"
import { useCallback, useEffect, useRef, useState } from "react"
import type { EvidenceCitation } from "@/lib/evidence/types"

interface ChatMessage {
  id: string
  content: string
  role: "user" | "assistant"
  created_at: string
  evidenceCitations?: EvidenceCitation[]
}

interface UseChatPreviewReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  fetchPreview: (chatId: string) => Promise<void>
  clearPreview: () => void
}

export function useChatPreview(): UseChatPreviewReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track current request to prevent race conditions
  const currentRequestRef = useRef<string | null>(null)
  const lastFetchedChatIdRef = useRef<string | null>(null) // Track last fetched chatId to prevent duplicate fetches
  const messagesRef = useRef<ChatMessage[]>([]) // Track messages in ref to avoid closure issues
  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Helper function to validate and normalize evidenceCitations
  const normalizeEvidenceCitations = (citations: any): EvidenceCitation[] | undefined => {
    if (!citations) return undefined
    if (!Array.isArray(citations) || citations.length === 0) return undefined
    
    // Validate that citations have required fields
    const validCitations = citations.filter((c: any) => 
      c && 
      typeof c.index === 'number' && 
      c.title && 
      typeof c.title === 'string'
    )
    
    return validCitations.length > 0 ? validCitations : undefined
  }

  const fetchPreview = useCallback(async (chatId: string) => {
    if (!chatId) {
      setMessages([])
      lastFetchedChatIdRef.current = null
      messagesRef.current = []
      return
    }

    // CRITICAL: If this is the same chatId we just fetched, skip to prevent duplicate fetches
    if (chatId === lastFetchedChatIdRef.current && messagesRef.current.length > 0) {
      return
    }

    // CRITICAL: Clear messages immediately when switching to a different chat
    if (chatId !== lastFetchedChatIdRef.current) {
      setMessages([])
      setIsLoading(true)
    }

    // Clear any existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // Debounce the request to prevent rapid-fire calls
    debounceTimeoutRef.current = setTimeout(async () => {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Set this as the current request
      currentRequestRef.current = chatId

      // Create new abort controller
      const controller = new AbortController()
      abortControllerRef.current = controller

      setError(null)

      try {
        // Check cache first
        const cached = await getCachedMessages(chatId)

        if (cached && cached.length > 0) {
          // If we have cached messages, show them immediately
          if (
            currentRequestRef.current === chatId &&
            !controller.signal.aborted
          ) {
            // Deduplicate by ID and get last 5 unique messages
            const seen = new Set<string>()
            const uniqueCached = cached.filter((msg) => {
              if (seen.has(msg.id)) return false
              seen.add(msg.id)
              return true
            })
            
            const cachedMessages = uniqueCached
              .slice(-5) // Get last 5 messages
              .map((msg) => {
                // Validate and normalize evidenceCitations
                const evidenceCitations = normalizeEvidenceCitations((msg as any).evidenceCitations)
                
                return {
                  id: String(msg.id),
                  content: String(msg.content || ''),
                  role: msg.role as "user" | "assistant",
                  created_at:
                    msg.createdAt?.toISOString() || new Date().toISOString(),
                  evidenceCitations,
                }
              })
              // Sort by created_at to ensure chronological order
              .sort((a, b) => {
                const timeA = new Date(a.created_at).getTime()
                const timeB = new Date(b.created_at).getTime()
                return timeA - timeB
              })
            
            if (currentRequestRef.current === chatId && !controller.signal.aborted) {
              lastFetchedChatIdRef.current = chatId
              messagesRef.current = cachedMessages
              setMessages(cachedMessages)
              setIsLoading(false)
            }
          }
        } else {
          // No cache, fetch from database
          if (currentRequestRef.current === chatId && !controller.signal.aborted) {
            setIsLoading(true)
          }

          const fresh = await getMessagesFromDb(chatId)
          if (
            fresh &&
            currentRequestRef.current === chatId &&
            !controller.signal.aborted
          ) {
            // Cache the fresh messages
            await cacheMessages(chatId, fresh)

            // Deduplicate by ID and get last 5 unique messages
            const seen = new Set<string>()
            const uniqueFresh = fresh.filter((msg) => {
              if (seen.has(msg.id)) return false
              seen.add(msg.id)
              return true
            })

            const freshMessages = uniqueFresh
              .slice(-5) // Get last 5 messages
              .map((msg) => {
                // Validate and normalize evidenceCitations
                const evidenceCitations = normalizeEvidenceCitations((msg as any).evidenceCitations)
                
                return {
                  id: String(msg.id),
                  content: String(msg.content || ''),
                  role: msg.role as "user" | "assistant",
                  created_at:
                    msg.createdAt?.toISOString() || new Date().toISOString(),
                  evidenceCitations,
                }
              })
              // Sort by created_at to ensure chronological order
              .sort((a, b) => {
                const timeA = new Date(a.created_at).getTime()
                const timeB = new Date(b.created_at).getTime()
                return timeA - timeB
              })
            
            if (currentRequestRef.current === chatId && !controller.signal.aborted) {
              lastFetchedChatIdRef.current = chatId
              messagesRef.current = freshMessages
              setMessages(freshMessages)
            }
          }
        }
      } catch (err) {
        // Only update error state if this is still the current request and not aborted
        if (
          currentRequestRef.current === chatId &&
          !controller.signal.aborted
        ) {
          console.error("Error fetching chat preview:", err)
          setError(
            err instanceof Error ? err.message : "Unknown error occurred"
          )
          setMessages([])
          messagesRef.current = []
          lastFetchedChatIdRef.current = null
        }
      } finally {
        // Only update loading state if this is still the current request
        if (
          currentRequestRef.current === chatId &&
          !controller.signal.aborted
        ) {
          setIsLoading(false)
        }
      }
    }, 200) // 200ms debounce to prevent rapid calls
  }, []) // No dependencies - use refs for state that needs to be checked

  const clearPreview = useCallback(() => {
    // Clear debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
      debounceTimeoutRef.current = null
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Clear current request tracking
    currentRequestRef.current = null
    lastFetchedChatIdRef.current = null // Clear last fetched chatId
    messagesRef.current = [] // Clear messages ref

    // Reset state
    setMessages([])
    setError(null)
    setIsLoading(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    messages,
    isLoading,
    error,
    fetchPreview,
    clearPreview,
  }
}
