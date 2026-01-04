import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { toast as sonnerToast } from "sonner"
import { getOrCreateGuestUserId } from "@/lib/api"
import { MESSAGE_MAX_LENGTH, getSystemPromptByRole } from "@/lib/config"
import { Attachment } from "@/lib/file-handling"
import { API_ROUTE_CHAT } from "@/lib/routes"
import type { UserProfile } from "@/lib/user/types"
import type { Message } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react"
import { getModelInfo } from "@/lib/models"

type UseChatCoreProps = {
  initialMessages: Message[]
  draftValue: string
  cacheAndAddMessage: (message: Message) => void
  chatId: string | null
  user: UserProfile | null
  files: File[]
  createOptimisticAttachments: (
    files: File[]
  ) => Attachment[]
  setFiles: (files: File[]) => void
  checkLimitsAndNotify: (uid: string) => Promise<boolean>
  cleanupOptimisticAttachments: (attachments?: Array<{ url?: string }>) => void
  ensureChatExists: (uid: string, input: string) => Promise<string | null>
  handleFileUploads: (
    uid: string,
    chatId: string,
    isAuthenticated?: boolean,
    filesToUpload?: File[]
  ) => Promise<Attachment[] | null>
  selectedModel: string
  clearDraft: () => void
  bumpChat: (chatId: string) => void
  setHasDialogAuth: (value: boolean) => void
  setHasRateLimitPaywall?: (value: boolean) => void
  setRateLimitWaitTime?: (value: number | null) => void
  setRateLimitType?: (value: "hourly" | "daily") => void
}

export function useChatCore({
  initialMessages,
  draftValue,
  cacheAndAddMessage,
  chatId,
  user,
  files,
  createOptimisticAttachments,
  setFiles,
  checkLimitsAndNotify,
  cleanupOptimisticAttachments,
  ensureChatExists,
  handleFileUploads,
  selectedModel,
  clearDraft,
  bumpChat,
  setHasDialogAuth,
  setHasRateLimitPaywall,
  setRateLimitWaitTime,
  setRateLimitType,
}: UseChatCoreProps) {
  const router = useRouter()
  // State management
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enableSearch, setEnableSearch] = useState(false)
  const [enableEvidence, setEnableEvidence] = useState(true) // Always enabled by default
  
  // Evidence citations from server - indexed by message ID or last response
  // Use ref to persist across hook reinitializations (e.g., URL changes)
  const evidenceCitationsRef = useRef<any[]>([])
  const [evidenceCitations, setEvidenceCitationsState] = useState<any[]>([])
  
  // Wrapper to update both state, ref, and sessionStorage
  const setEvidenceCitations = useCallback((citations: any[]) => {
    console.log('📚 [EVIDENCE] Setting evidence citations:', citations.length)
    evidenceCitationsRef.current = citations
    setEvidenceCitationsState(citations)
    
    // Store in sessionStorage for persistence across restores
    if (typeof window !== 'undefined' && citations.length > 0) {
      const key = chatId || 'pending'
      try {
        sessionStorage.setItem(`evidenceCitations:${key}`, JSON.stringify(citations))
        sessionStorage.setItem('evidenceCitations:latest', JSON.stringify({ chatId: key, citations, timestamp: Date.now() }))
        console.log('📚 [EVIDENCE] Stored citations to sessionStorage for key:', key)
      } catch (e) {
        console.error('📚 [EVIDENCE] Failed to store citations to sessionStorage:', e)
      }
    }
  }, [chatId])
  
  // Track which chatId we've already restored citations for to prevent duplicate restores
  const restoredChatIdRef = useRef<string | null>(null)
  const isRestoringRef = useRef(false) // Prevent concurrent restores
  
  // Reset restore tracking when navigating away (chatId becomes null)
  useEffect(() => {
    if (!chatId && restoredChatIdRef.current !== null) {
      restoredChatIdRef.current = null
      isRestoringRef.current = false
    }
  }, [chatId])
  
  // Extract evidence citations from loaded messages (from database)
  useEffect(() => {
    if (!initialMessages || initialMessages.length === 0) return
    
    // Find the last assistant message with evidence citations
    for (let i = initialMessages.length - 1; i >= 0; i--) {
      const msg = initialMessages[i] as any
      if (msg.role === 'assistant' && msg.evidenceCitations && Array.isArray(msg.evidenceCitations) && msg.evidenceCitations.length > 0) {
        console.log(`📚 [RESTORE] Found ${msg.evidenceCitations.length} evidence citations in loaded message`)
        evidenceCitationsRef.current = msg.evidenceCitations
        setEvidenceCitationsState(msg.evidenceCitations)
        
        // Also store in sessionStorage for persistence
        if (typeof window !== 'undefined' && chatId) {
          try {
            sessionStorage.setItem(`evidenceCitations:${chatId}`, JSON.stringify(msg.evidenceCitations))
            sessionStorage.setItem('evidenceCitations:latest', JSON.stringify({ chatId, citations: msg.evidenceCitations, timestamp: Date.now() }))
            restoredChatIdRef.current = chatId
          } catch (e) {
            console.error('📚 [RESTORE] Failed to store citations to sessionStorage:', e)
          }
        }
        break // Only restore from the most recent assistant message
      }
    }
  }, [initialMessages, chatId])
  
  // Restore evidence citations from sessionStorage when chatId changes (only once per chatId)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isRestoringRef.current) return // Prevent concurrent restores
    
    // Skip if we've already restored for this chatId
    if (chatId && restoredChatIdRef.current === chatId) {
      return
    }
    
    isRestoringRef.current = true
    
    try {
      // Skip if we already have citations in ref (they were set from onResponse)
      if (evidenceCitationsRef.current.length > 0 && chatId && restoredChatIdRef.current === null) {
        // Citations already exist from onResponse, just mark as restored
        restoredChatIdRef.current = chatId
        return
      }
      
      // First try to restore from current chatId
      if (chatId) {
        const key = `evidenceCitations:${chatId}`
        const stored = sessionStorage.getItem(key)
        if (stored) {
          try {
            const citations = JSON.parse(stored)
            if (Array.isArray(citations) && citations.length > 0) {
              // Only update if different from current ref
              const currentIds = evidenceCitationsRef.current.map(c => c.index).sort().join(',')
              const newIds = citations.map(c => c.index).sort().join(',')
              if (currentIds !== newIds) {
                console.log('📚 [EVIDENCE] Restored citations from sessionStorage for chatId:', chatId, citations.length)
                evidenceCitationsRef.current = citations
                setEvidenceCitationsState(citations)
              }
              restoredChatIdRef.current = chatId
              return
            }
          } catch (e) {
            console.error('📚 [EVIDENCE] Failed to parse stored citations:', e)
          }
        }
      }
      
      // Fallback to latest (only if we don't have a chatId or haven't restored yet)
      if (!chatId || restoredChatIdRef.current === null) {
        const latest = sessionStorage.getItem('evidenceCitations:latest')
        if (latest) {
          try {
            const latestData = JSON.parse(latest)
            if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
              // Only use if recent (within last 30 seconds) or matches current chatId
              const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 30000)
              const matchesChatId = !chatId || latestData.chatId === chatId
              
              if (isRecent || matchesChatId) {
                // Only update if different from current ref
                const currentIds = evidenceCitationsRef.current.map(c => c.index).sort().join(',')
                const newIds = latestData.citations.map(c => c.index).sort().join(',')
                if (currentIds !== newIds) {
                  console.log('📚 [EVIDENCE] Restored citations from latest sessionStorage:', latestData.citations.length)
                  evidenceCitationsRef.current = latestData.citations
                  setEvidenceCitationsState(latestData.citations)
                }
                if (chatId) {
                  restoredChatIdRef.current = chatId
                }
                return
              }
            }
          } catch (e) {
            console.error('📚 [EVIDENCE] Failed to parse latest citations:', e)
          }
        }
      }
      
      // Mark as restored even if we didn't find anything (prevents infinite loops)
      if (chatId) {
        restoredChatIdRef.current = chatId
      }
    } finally {
      // Always reset the restoring flag
      isRestoringRef.current = false
    }
  }, [chatId]) // Only depend on chatId, NOT evidenceCitations

  // Get user preferences at the top level
  const { useUserPreferences } = require("@/lib/user-preference-store/provider")
  const userPreferences = useUserPreferences()

  // Auto-enable web search for healthcare professionals using Fleming 4
  useEffect(() => {
    const isHealthcareMode = userPreferences.preferences.userRole === "doctor" || 
                            userPreferences.preferences.userRole === "medical_student"
    const isFleming4 = selectedModel === "fleming-4"
    const modelConfig = getModelInfo(selectedModel)
    const hasWebSearchSupport = Boolean(modelConfig?.webSearch)
    
    if (isHealthcareMode && isFleming4 && hasWebSearchSupport && !enableSearch) {
      setEnableSearch(true)
    }
  }, [selectedModel, userPreferences.preferences.userRole, enableSearch, setEnableSearch])

  // Refs and derived state
  const hasSentFirstMessageRef = useRef(false)
  // CRITICAL: Initialize to null, not chatId, so we can detect transitions properly
  const prevChatIdRef = useRef<string | null>(null)
  const lastUsedTempChatIdRef = useRef<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  
  // Track sent messages in sessionStorage to persist across navigation
  const sessionKey = `hasSentMessage:${chatId || 'none'}`
  const checkHasSentMessage = () => {
    if (typeof window === 'undefined') return false
    const stored = sessionStorage.getItem(sessionKey)
    if (stored === 'true') {
      hasSentFirstMessageRef.current = true
      return true
    }
    return false
  }
  
  // Check on mount if we've already sent a message in this chat
  useEffect(() => {
    checkHasSentMessage()
  }, [chatId])
  
  // Optimized system prompt determination - simplified for faster streaming
  const systemPrompt = useMemo(() => {
    // If user has a custom system prompt, use it immediately
    if (user?.system_prompt) {
      return user.system_prompt
    }
    
    // Use the utility function to get the appropriate system prompt based on user role
    return getSystemPromptByRole(userPreferences.preferences.userRole)
  }, [user?.system_prompt, userPreferences.preferences.userRole])

  // Search params handling
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt")

  // Handle errors directly in onError callback
  const handleError = useCallback((error: Error) => {
    console.error("Chat error:", error)
    console.error("Error message:", error.message)
    let errorMsg = error.message || "Something went wrong."

    // Check if this is a rate limit error with wait time
    // The error might have waitTimeSeconds attached if it came from our API
    const errorAny = error as any
    if (
      errorMsg.includes("Rate limit") ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("429") ||
      errorAny.statusCode === 429 ||
      errorAny.code === "RATE_LIMIT_EXCEEDED"
    ) {
      // Try to extract wait time from error
      const waitTime = errorAny.waitTimeSeconds || errorAny.waitTime || null
      const limitType = errorAny.limitType || "hourly"
      
      // Show paywall if we have the setters
      if (setHasRateLimitPaywall && setRateLimitWaitTime && setRateLimitType) {
        setRateLimitWaitTime(waitTime)
        setRateLimitType(limitType)
        setHasRateLimitPaywall(true)
      } else {
        // Fallback to toast if paywall setters not available
        toast({
          title: errorMsg,
          status: "error",
        })
      }
      return
    }

    // Handle specific image-related errors
    if (errorMsg.includes("Fetching image failed") || errorMsg.includes("400 Bad Request")) {
      errorMsg = "There was an issue with image search results. The chat will continue without images."
      console.warn("Image search error detected, continuing without images:", error)
    } else if (errorMsg === "An error occurred" || errorMsg === "fetch failed") {
      errorMsg = "Something went wrong. Please try again."
    }

    toast({
      title: errorMsg,
      status: "error",
    })
  }, [setHasRateLimitPaywall, setRateLimitWaitTime, setRateLimitType])

  // Track the last saved message count to detect new messages during streaming
  const lastSavedMessageCountRef = useRef(0)
  const currentChatIdForSavingRef = useRef<string | null>(null)
  const isStreamingRef = useRef(false)
  const messagesBeforeNavigationRef = useRef<Message[]>([])
  const stableChatIdRef = useRef<string | undefined>(undefined) // Stable ID for useChat to prevent resets
  
  // CRITICAL: Determine stable chatId for useChat
  // Strategy: Allow reset when navigating to a NEW chat, but prevent reset during streaming
  const stableChatId = useMemo(() => {
    // CRITICAL: If we're actively streaming, NEVER change the id - this prevents reset
    if (isStreamingRef.current && stableChatIdRef.current) {
      return stableChatIdRef.current
    }
    
    // If we have a real chatId, use it (this allows reset when navigating to new chat)
    // This is OK because we've stored messages in sessionStorage and they'll be in initialMessages
    if (chatId && !chatId.startsWith('temp-chat-')) {
      stableChatIdRef.current = chatId
      return chatId
    }
    
    // For temp chats or null, keep previous stable ID or use undefined
    return stableChatIdRef.current || undefined
  }, [chatId])
  
  // CRITICAL: Get messages from sessionStorage BEFORE useChat initializes
  // This ensures messages are available when useChat resets due to id change
  // CRITICAL: Don't restore messages if we're on home page (chatId is null) - clear them instead
  const restoredInitialMessages = useMemo(() => {
    // CRITICAL: If we're on home page (no chatId), don't restore any messages
    // This prevents old messages from being restored when starting a new chat
    // Server always has no messages on home page, so client should match
    if (!chatId) {
      return []
    }
    
    // First, try to get from "latest" key (most recent messages before navigation)
    if (typeof window !== 'undefined' && chatId) {
      const latest = sessionStorage.getItem('pendingMessages:latest')
      if (latest) {
        try {
          const latestData = JSON.parse(latest)
          if (latestData.messages && Array.isArray(latestData.messages) && latestData.messages.length > 0) {
            // Only restore if messages match current chatId (not from a different chat)
            const matchesChatId = latestData.chatId === chatId
            const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 10000)
            if (matchesChatId && isRecent) {
              console.log('[🐛 RESTORE] Found', latestData.messages.length, 'messages in latest key for chatId:', chatId)
              return latestData.messages
            } else {
              // Clear stale messages that don't match
              sessionStorage.removeItem('pendingMessages:latest')
            }
          }
        } catch (e) {
          console.error('[🐛 RESTORE] Failed to parse latest messages:', e)
          sessionStorage.removeItem('pendingMessages:latest')
        }
      }
      
      // Second, try with current chatId
      const pendingKey = `pendingMessages:${chatId}`
      const pending = sessionStorage.getItem(pendingKey)
      if (pending) {
        try {
          const parsed = JSON.parse(pending)
          if (parsed.length > 0) {
            console.log('[🐛 RESTORE] Found', parsed.length, 'messages for chatId:', chatId)
            return parsed
          }
        } catch (e) {
          console.error('[🐛 RESTORE] Failed to parse pending messages:', e)
          sessionStorage.removeItem(pendingKey)
        }
      }
    }
    
    // Fallback to initialMessages from provider
    return initialMessages
  }, [chatId, initialMessages])
  
  // CRITICAL: Track previous chatId to detect navigation
  const prevChatIdForRestoreRef = useRef<string | null>(null)

  // Initialize useChat with optimized settings
  const {
    messages,
    input,
    handleSubmit,
    status,
    error,
    reload,
    stop,
    setMessages,
    setInput,
    append,
  } = useChat({
    id: stableChatId, // CRITICAL: Use stable ID to prevent resets during streaming
    api: API_ROUTE_CHAT,
    initialMessages: restoredInitialMessages.length > 0 ? restoredInitialMessages : undefined, // CRITICAL: Restore from sessionStorage
    initialInput: draftValue,
    onError: (error) => {
      // CRITICAL: Reset submitting state on error
      setIsSubmitting(false)
      handleError(error)
    },
    // Optimize for streaming performance
    onFinish: async (message) => {
      // CRITICAL: Save all messages when streaming completes
      // Use the real chatId (not temp) if available
      const realChatId = chatId && !chatId.startsWith('temp-chat-') ? chatId : currentChatIdForSavingRef.current
      if (realChatId && !realChatId.startsWith('temp-chat-') && messagesRef.current.length > 0) {
        try {
          const { setMessages: saveMessagesToDb } = await import("@/lib/chat-store/messages/api")
          // CRITICAL: Get evidence citations from ref, or try sessionStorage as fallback
          let citationsToSave = evidenceCitationsRef.current.length > 0 ? evidenceCitationsRef.current : undefined
          
          // Fallback 1: Check sessionStorage if ref is empty
          if (!citationsToSave && typeof window !== 'undefined') {
            try {
              const latest = sessionStorage.getItem('evidenceCitations:latest')
              if (latest) {
                const latestData = JSON.parse(latest)
                if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
                  const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 60000) // 1 minute
                  const matchesChatId = !realChatId || latestData.chatId === realChatId || !latestData.chatId
                  if (isRecent && matchesChatId) {
                    citationsToSave = latestData.citations
                    console.log('📚 [onFinish] Restored citations from sessionStorage for save:', citationsToSave.length)
                  }
                }
              }
            } catch (e) {
              console.error('📚 [onFinish] Failed to parse sessionStorage citations:', e)
            }
          }
          
          // Fallback 2: Extract from the last assistant message's parts if available
          if (!citationsToSave && messagesRef.current.length > 0) {
            const lastAssistantMessage = [...messagesRef.current].reverse().find(m => m.role === 'assistant')
            if (lastAssistantMessage?.parts && Array.isArray(lastAssistantMessage.parts)) {
              const metadataPart = lastAssistantMessage.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
              if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
                citationsToSave = (metadataPart as any).metadata.evidenceCitations
                console.log('📚 [onFinish] Extracted citations from message parts for save:', citationsToSave.length)
              }
            }
          }
          
          await saveMessagesToDb(realChatId, messagesRef.current, citationsToSave)
          console.log('[🐛 onFinish] Saved', messagesRef.current.length, 'messages to chatId:', realChatId, citationsToSave ? `with ${citationsToSave.length} citations` : '')
        } catch (error) {
          console.error('[🐛 onFinish] Failed to save messages:', error)
        }
      }
      
      // CRITICAL: Update URL after message is fully sent and saved
      // This prevents useChat from resetting during message submission
      if (realChatId && !realChatId.startsWith('temp-chat-') && typeof window !== 'undefined') {
        const currentPath = window.location.pathname
        const expectedPath = `/c/${realChatId}`
        if (currentPath !== expectedPath) {
          // Use a small delay to ensure all state updates are complete
          setTimeout(() => {
            startTransition(() => {
              router.replace(expectedPath, { scroll: false })
            })
          }, 100)
        }
      }
      
      setIsSubmitting(false)
    },
    // Ensure immediate status updates and extract evidence citations from headers
    onResponse: (response) => {
      // This ensures status changes to "streaming" immediately
      // Also extract evidence citations from response headers
      console.log('📚 [EVIDENCE] onResponse called, checking headers...')
      console.log('📚 [EVIDENCE] Available headers:', [...response.headers.keys()])
      
      try {
        const evidenceHeader = response.headers.get('X-Evidence-Citations')
        console.log('📚 [EVIDENCE] X-Evidence-Citations header:', evidenceHeader ? `${evidenceHeader.substring(0, 50)}...` : 'NOT FOUND')
        
        if (evidenceHeader) {
          // Decode base64 and parse JSON
          const citationsJson = atob(evidenceHeader)
          const citations = JSON.parse(citationsJson)
          console.log(`📚 [EVIDENCE] Successfully parsed ${citations.length} citations from server`)
          setEvidenceCitations(citations)
        } else {
          console.log('📚 [EVIDENCE] No evidence citations header found in response')
        }
      } catch (e) {
        console.error('📚 [EVIDENCE] Failed to parse evidence citations from header:', e)
      }
    },
  })
  
  // CRITICAL: Save messages incrementally during streaming
  // This ensures messages are saved even if navigation happens before onFinish
  useEffect(() => {
    // Only save if we have a real chatId (not temp) and messages have increased
    const realChatId = chatId && !chatId.startsWith('temp-chat-') ? chatId : currentChatIdForSavingRef.current
    if (!realChatId || realChatId.startsWith('temp-chat-')) {
      return // Don't save for temp chats
    }
    
    // Only save if we have new messages and we're streaming or just finished
    // CRITICAL: Only save assistant messages that are complete (have content)
    if (messages.length > lastSavedMessageCountRef.current && (status === 'streaming' || status === 'ready')) {
      const newMessages = messages.slice(lastSavedMessageCountRef.current)
      const assistantMessagesToSave = newMessages.filter(
        m => m.role === 'assistant' && m.content && (typeof m.content === 'string' ? m.content.length > 0 : true)
      )
      
      if (assistantMessagesToSave.length === 0) {
        // Update count even if no messages to save (to avoid re-checking)
        lastSavedMessageCountRef.current = messages.length
        return
      }
      
      // Save new messages incrementally
      Promise.resolve().then(async () => {
        try {
          const { saveMessageIncremental } = await import("@/lib/chat-store/messages/api")
          // CRITICAL: Get evidence citations from ref, or try sessionStorage as fallback
          let citationsToSave = evidenceCitationsRef.current.length > 0 ? evidenceCitationsRef.current : undefined
          
          // Fallback 1: Check sessionStorage if ref is empty
          if (!citationsToSave && typeof window !== 'undefined') {
            try {
              const latest = sessionStorage.getItem('evidenceCitations:latest')
              if (latest) {
                const latestData = JSON.parse(latest)
                if (latestData.citations && Array.isArray(latestData.citations) && latestData.citations.length > 0) {
                  const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 60000) // 1 minute
                  const matchesChatId = !realChatId || latestData.chatId === realChatId || !latestData.chatId
                  if (isRecent && matchesChatId) {
                    citationsToSave = latestData.citations
                    console.log('📚 [STREAMING] Restored citations from sessionStorage for save:', citationsToSave.length)
                  }
                }
              }
            } catch (e) {
              console.error('📚 [STREAMING] Failed to parse sessionStorage citations:', e)
            }
          }
          
          // Fallback 2: Extract from the message being saved if available
          if (!citationsToSave && assistantMessagesToSave.length > 0) {
            const messageToCheck = assistantMessagesToSave[assistantMessagesToSave.length - 1]
            if (messageToCheck?.parts && Array.isArray(messageToCheck.parts)) {
              const metadataPart = messageToCheck.parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
              if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
                citationsToSave = (metadataPart as any).metadata.evidenceCitations
                console.log('📚 [STREAMING] Extracted citations from message parts for save:', citationsToSave.length)
              }
            }
          }
          
          for (const message of assistantMessagesToSave) {
            await saveMessageIncremental(realChatId, message, citationsToSave)
          }
          lastSavedMessageCountRef.current = messages.length
          console.log('[🐛 STREAMING] Saved', assistantMessagesToSave.length, 'new assistant messages incrementally to chatId:', realChatId, citationsToSave ? `with ${citationsToSave.length} citations` : '')
        } catch (error) {
          console.error('[🐛 STREAMING] Failed to save messages incrementally:', error)
        }
      })
    }
  }, [messages, chatId, status])
  
  // CRITICAL: Track if we're streaming and preserve messages during navigation
  useEffect(() => {
    isStreamingRef.current = status === 'streaming' || isSubmitting
    // Only store backup when streaming AND messages change significantly
    if ((status === 'streaming' || isSubmitting) && messages.length > 0) {
      const prevCount = messagesBeforeNavigationRef.current.length
      // Only update if message count increased (new messages arrived)
      if (messages.length > prevCount) {
        messagesBeforeNavigationRef.current = [...messages]
        console.log('[🐛 STREAMING TRACK] Stored', messages.length, 'messages before potential navigation')
      }
    }
  }, [status, isSubmitting, messages.length]) // Only depend on length, not full messages array
  
  // CRITICAL: Store messages in sessionStorage before navigation to prevent loss
  // This must be AFTER useChat hook so messages is defined
  // DEBOUNCED: Only store when messages actually change, not on every render
  const lastStoredMessagesRef = useRef<string>('')
  useEffect(() => {
    if (messages.length > 0 && typeof window !== 'undefined') {
      // Serialize messages to check if they actually changed
      const messagesKey = JSON.stringify(messages.map(m => ({ id: m.id, role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 50) : '' })))
      
      // Only store if messages actually changed
      if (messagesKey !== lastStoredMessagesRef.current) {
        const key = chatId || 'pending'
        sessionStorage.setItem(`pendingMessages:${key}`, JSON.stringify(messages))
        sessionStorage.setItem('pendingMessages:latest', JSON.stringify({ chatId: key, messages, timestamp: Date.now() }))
        messagesBeforeNavigationRef.current = [...messages]
        lastStoredMessagesRef.current = messagesKey
        console.log('[🐛 STORE] Stored', messages.length, 'messages to sessionStorage with key:', key)
      }
    }
  }, [messages.length, chatId]) // Only depend on length and chatId
  
  // Keep messages ref in sync with messages from useChat
  useEffect(() => {
    messagesRef.current = messages
    // CRITICAL: If messages were cleared but we have them in the backup ref, restore them immediately
    // This prevents blank screen when useChat resets during navigation
    if (messages.length === 0 && messagesBeforeNavigationRef.current.length > 0) {
      const isCurrentlyStreaming = status === 'streaming' || isSubmitting
      if (isCurrentlyStreaming) {
        console.log('[🐛 MESSAGE RESTORE] ⚠️ CRITICAL: Messages cleared during streaming, restoring from backup:', messagesBeforeNavigationRef.current.length)
        // Use setTimeout to ensure this runs after useChat's internal state update
        setTimeout(() => {
          setMessages(messagesBeforeNavigationRef.current)
        }, 0)
      }
    }
  }, [messages, status, isSubmitting, setMessages])
  
  // CRITICAL: Watch status changes and ensure isSubmitting resets properly
  useEffect(() => {
    if (status === 'ready' || status === 'error') {
      setIsSubmitting(false)
      // CRITICAL: Reset streaming ref when status becomes ready
      isStreamingRef.current = false
    } else if (status === 'streaming' || status === 'submitted') {
      isStreamingRef.current = true
    }
  }, [status])
  
  // CRITICAL: Clear sessionStorage and reset state when navigating to home page
  useEffect(() => {
    if (typeof window !== 'undefined' && !chatId) {
      // Clear all pending messages when on home page
      sessionStorage.removeItem('pendingMessages:latest')
      const keys = Object.keys(sessionStorage)
      keys.forEach(key => {
        if (key.startsWith('pendingMessages:')) {
          sessionStorage.removeItem(key)
        }
      })
      // Reset streaming state and clear messages
      isStreamingRef.current = false
      messagesBeforeNavigationRef.current = []
      // CRITICAL: Reset status if stuck
      if (status !== 'ready' && status !== 'error') {
        // Force reset by clearing messages if status is stuck
        if (messages.length === 0) {
          // Status should reset naturally, but ensure it does
        }
      }
    }
  }, [chatId, status, messages.length])
  
  // CRITICAL: Update currentChatIdForSavingRef when chatId changes from temp to real
  useEffect(() => {
    if (chatId && !chatId.startsWith('temp-chat-')) {
      currentChatIdForSavingRef.current = chatId
      // Reset message count when chatId changes to start fresh
      lastSavedMessageCountRef.current = 0
      console.log('[🐛 CHATID UPDATE] Updated currentChatIdForSavingRef to real chatId:', chatId)
    }
  }, [chatId])

  // CRITICAL: Listen for chatCreated event to update chatId ref when chat is created
  useEffect(() => {
    const handleChatCreated = (event: CustomEvent<{ chatId: string }>) => {
      const newChatId = event.detail.chatId
      if (newChatId && !newChatId.startsWith('temp-chat-')) {
        currentChatIdForSavingRef.current = newChatId
        console.log('[🐛 CHAT CREATED] Updated currentChatIdForSavingRef from event:', newChatId)
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('chatCreated', handleChatCreated as EventListener)
      return () => {
        window.removeEventListener('chatCreated', handleChatCreated as EventListener)
      }
    }
  }, [])
  
  // CRITICAL: Track if this is the first render
  const isFirstRenderRef = useRef(true)
  
  // CRITICAL: Initialize prevChatIdRef on first render, but only if chatId is null
  // If chatId is already set (from URL), we want to detect the transition from null
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      // Don't set prevChatIdRef if chatId is already set - we want to detect the transition
      // Only set it if chatId is null (we're on home page)
      if (chatId === null) {
        prevChatIdRef.current = null
      }
      // Otherwise, leave it as null so we can detect the transition when chatId changes
    }
  }, [])
  
  // CRITICAL: Update prevChatIdRef FIRST, before any logic
  // This ensures we can detect transitions properly on the next render
  useEffect(() => {
    const prev = prevChatIdRef.current
    if (chatId !== prev) {
      prevChatIdRef.current = chatId
      console.log('[🐛 PREV CHATID] Updated:', { from: prev, to: chatId })
    }
  }, [chatId])
  
  // CRITICAL: Consolidated message syncing - SINGLE SOURCE OF TRUTH
  // This prevents race conditions and conflicting effects
  useEffect(() => {
    // CRITICAL: Capture prevChatId at the VERY START
    const prevChatId = prevChatIdRef.current
    
    // Calculate all transition states
    const chatIdChanged = prevChatId !== chatId
    const isNavigatingToHome = prevChatId !== null && chatId === null
    const isNavigatingFromHome = prevChatId === null && chatId !== null && !chatId.startsWith('temp-chat-')
    const isStreamingOrSubmitting = status === 'streaming' || isSubmitting
    const hasSentMessage = typeof window !== 'undefined' && chatId 
      ? sessionStorage.getItem(`hasSentMessage:${chatId}`) === 'true'
      : false
    const isTransitioningFromTemp = prevChatId?.startsWith('temp-chat-') && chatId && !chatId.startsWith('temp-chat-')
    
    // Use ref to get current messages without causing re-renders
    const currentMessages = messagesRef.current
    const currentMessagesLength = currentMessages.length
    
    // CRITICAL: Try to restore from sessionStorage IMMEDIATELY if messages are empty
    // This handles the case where useChat reset cleared messages
    if (messages.length === 0 && typeof window !== 'undefined') {
      // First, try "latest" key (most recent messages before navigation)
      const latest = sessionStorage.getItem('pendingMessages:latest')
      if (latest) {
        try {
          const latestData = JSON.parse(latest)
          if (latestData.messages && Array.isArray(latestData.messages) && latestData.messages.length > 0) {
            // Check if these messages are recent (within last 10 seconds)
            const isRecent = !latestData.timestamp || (Date.now() - latestData.timestamp < 10000)
            if (isRecent) {
              console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring', latestData.messages.length, 'messages from latest key (useChat reset)')
              setMessages(latestData.messages)
              messagesBeforeNavigationRef.current = latestData.messages
              // Don't remove yet - keep for next render if needed
              return // Don't continue - we've restored messages
            }
          }
        } catch (e) {
          console.error('[🐛 MESSAGE SYNC] Failed to parse latest messages:', e)
        }
      }
      
      // Second, try with current chatId
      if (chatId) {
        const pendingKey = `pendingMessages:${chatId}`
        const pending = sessionStorage.getItem(pendingKey)
        if (pending) {
          try {
            const parsed = JSON.parse(pending)
            if (parsed.length > 0) {
              console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring', parsed.length, 'messages from sessionStorage for chatId:', chatId)
              setMessages(parsed)
              messagesBeforeNavigationRef.current = parsed
              sessionStorage.removeItem(pendingKey)
              return // Don't continue - we've restored messages
            }
          } catch (e) {
            console.error('[🐛 MESSAGE SYNC] Failed to restore from sessionStorage:', e)
          }
        }
      }
    }
    
    // CRITICAL: Log the state for debugging
    if (chatIdChanged || isNavigatingFromHome || isTransitioningFromTemp || (messages.length === 0 && currentMessagesLength > 0)) {
      console.log('[🐛 MESSAGE SYNC] State check:', {
        chatId,
        prevChatId,
        chatIdChanged,
        isNavigatingToHome,
        isNavigatingFromHome,
        isTransitioningFromTemp,
        isStreamingOrSubmitting,
        hasSentMessage,
        messagesCount: currentMessagesLength,
        messagesInState: messages.length,
        initialMessagesCount: initialMessages.length,
        status,
        hasBackupMessages: messagesBeforeNavigationRef.current.length,
        stableChatId
      })
    }
    
    // 1. NAVIGATING TO HOME: Clear messages only when going to home page
    if (isNavigatingToHome && currentMessagesLength > 0) {
      console.log('[🐛 MESSAGE SYNC] Navigating to home, clearing messages')
      setMessages([])
      return
    }
    
    // 2. NAVIGATING FROM HOME (null) TO REAL CHAT: This happens when chat is created and we navigate
    // CRITICAL: Preserve messages if we're streaming or have messages
    if (isNavigatingFromHome) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Navigating from home to real chat!', {
        messagesCount: currentMessagesLength,
        messagesInState: messages.length,
        isStreaming: isStreamingOrSubmitting,
        initialMessagesCount: initialMessages.length,
        hasBackupMessages: messagesBeforeNavigationRef.current.length
      })
      
      // CRITICAL: Priority order:
      // 1. Messages in state (from streaming) - highest priority
      // 2. Messages in ref (backup) - second priority
      // 3. initialMessages (from database) - third priority
      
      if (messages.length > 0) {
        // We have messages in state - preserve them
        console.log('[🐛 MESSAGE SYNC] ✅ Preserving messages in state:', messages.length)
        messagesBeforeNavigationRef.current = [...messages]
        // Don't sync - keep current messages
        return
      } else if (currentMessagesLength > 0) {
        // We have messages in ref but not in state - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref after navigation:', currentMessagesLength)
        setMessages(currentMessages)
        messagesBeforeNavigationRef.current = currentMessages
        return
      } else if (messagesBeforeNavigationRef.current.length > 0) {
        // We have backup messages - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring backup messages after navigation:', messagesBeforeNavigationRef.current.length)
        setMessages(messagesBeforeNavigationRef.current)
        return
      } else if (initialMessages.length > 0) {
        // Use initialMessages from database
        console.log('[🐛 MESSAGE SYNC] Using initialMessages after navigation from home:', initialMessages.length)
      setMessages(initialMessages)
        return
      } else {
        // No messages anywhere - might still be streaming, wait
        console.log('[🐛 MESSAGE SYNC] ⚠️ No messages found after navigation, waiting for streaming...')
        // Don't clear - wait for messages to arrive
        return
      }
    }
    
    // 3. TRANSITIONING FROM TEMP TO REAL CHAT: Preserve messages
    if (isTransitioningFromTemp) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Transitioning from temp to real chat!', {
        prevChatId,
        chatId,
        messagesInState: messages.length,
        messagesInRef: currentMessagesLength,
        hasBackup: messagesBeforeNavigationRef.current.length,
        initialMessagesCount: initialMessages.length
      })
      
      // CRITICAL: Priority order for messages during temp-to-real transition:
      // 1. Messages in state (from streaming) - highest priority
      // 2. Messages in ref (backup) - second priority  
      // 3. Messages in backup ref - third priority
      // 4. sessionStorage for this chatId - fourth priority
      // 5. initialMessages (from database) - fifth priority
      
      if (messages.length > 0) {
        // We have messages in state - preserve them
        console.log('[🐛 MESSAGE SYNC] ✅ Preserving messages in state during transition:', messages.length)
        messagesBeforeNavigationRef.current = [...messages]
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve current messages
      } else if (currentMessagesLength > 0) {
        // We have messages in ref but not in state - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref during transition:', currentMessagesLength)
        setMessages(currentMessages)
        messagesBeforeNavigationRef.current = currentMessages
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages: currentMessages })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages: currentMessages }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve restored messages
      } else if (messagesBeforeNavigationRef.current.length > 0) {
        // We have backup messages - restore them
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring backup messages during transition:', messagesBeforeNavigationRef.current.length)
        setMessages(messagesBeforeNavigationRef.current)
        // Cache to new chat ID
        if (chatId) {
          Promise.resolve().then(async () => {
            try {
              const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
              await writeToIndexedDB("messages", { id: chatId, messages: messagesBeforeNavigationRef.current })
              if (typeof window !== 'undefined') {
                (window as any).__lastMessagesForMigration = { chatId, messages: messagesBeforeNavigationRef.current }
              }
            } catch (error) {
              console.error('[🐛 MESSAGE SYNC] Failed to cache messages:', error)
            }
          })
        }
        return // Don't sync - preserve restored messages
      } else if (typeof window !== 'undefined' && chatId) {
        // Try to get messages from sessionStorage for this chatId
        const sessionKey = `messages:${chatId}`
        const sessionData = sessionStorage.getItem(sessionKey)
        if (sessionData) {
          try {
            const sessionMessages = JSON.parse(sessionData)
            if (Array.isArray(sessionMessages) && sessionMessages.length > 0) {
              console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from sessionStorage during transition:', sessionMessages.length)
              setMessages(sessionMessages)
              messagesBeforeNavigationRef.current = sessionMessages
              return // Don't sync - preserve restored messages
            }
          } catch (e) {
            console.error('[🐛 MESSAGE SYNC] Failed to parse sessionStorage messages:', e)
          }
        }
      }
      
      // If we still don't have messages, check initialMessages but don't overwrite if we're streaming
      if (initialMessages.length > 0 && !isStreamingOrSubmitting) {
        console.log('[🐛 MESSAGE SYNC] Using initialMessages during transition:', initialMessages.length)
        setMessages(initialMessages)
        messagesBeforeNavigationRef.current = initialMessages
        return
      }
      
      // If we're streaming, wait for messages to arrive
      if (isStreamingOrSubmitting) {
        console.log('[🐛 MESSAGE SYNC] Streaming in progress during transition, waiting for messages...')
        return // Don't clear - wait for messages
      }
      
      // Last resort: if no messages found anywhere, log warning but don't clear
      console.warn('[🐛 MESSAGE SYNC] ⚠️ No messages found during temp-to-real transition!')
      return // Don't sync - preserve whatever we have
    }
    
    // 4. CHAT ID CHANGED: Sync from initialMessages if available
    // CRITICAL: NEVER clear messages if initialMessages is empty - wait for async load
    if (chatIdChanged) {
      // CRITICAL: If we're streaming, preserve current messages - don't sync yet
      if (isStreamingOrSubmitting && currentMessagesLength > 0) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ Streaming in progress, preserving', currentMessagesLength, 'messages during chatId change')
        // Ensure messages are set if they got cleared
        if (messages.length === 0) {
          setMessages(currentMessages)
        }
        return
      }
      
      if (initialMessages.length > 0) {
        // We have initialMessages - sync them
        const currentMessageIds = new Set(currentMessages.map(m => m.id))
        const initialMessageIds = new Set(initialMessages.map(m => m.id))
        const areDifferent = 
          currentMessageIds.size !== initialMessageIds.size ||
          Array.from(currentMessageIds).some(id => !initialMessageIds.has(id))
        
        if (areDifferent) {
          console.log('[🐛 MESSAGE SYNC] ✅ Syncing messages from initialMessages after chatId change:', initialMessages.length)
          setMessages(initialMessages)
        } else if (messages.length === 0 && currentMessagesLength > 0) {
          // Messages got cleared but we have them in ref - restore them
          console.log('[🐛 MESSAGE SYNC] ⚠️ Messages were cleared, restoring from ref:', currentMessagesLength)
          setMessages(currentMessages)
        }
      } else if (currentMessagesLength === 0 && !hasSentMessage && !isStreamingOrSubmitting) {
        // No messages, no initialMessages, haven't sent message, not streaming
        // This is a new empty chat - keep it empty
        console.log('[🐛 MESSAGE SYNC] New empty chat, keeping messages empty')
      } else if (currentMessagesLength > 0) {
        // CRITICAL: We have messages - preserve them even if initialMessages is empty
        // This prevents the blank screen bug!
        if (messages.length === 0) {
          console.log('[🐛 MESSAGE SYNC] ⚠️ Restoring messages from ref (preventing blank screen):', currentMessagesLength)
          setMessages(currentMessages)
        } else {
          console.log('[🐛 MESSAGE SYNC] ⚠️ Preserving messages during chatId change (preventing blank screen), waiting for initialMessages to load')
        }
      }
      return
    }
    
    // 5. CHAT ID UNCHANGED: Sync if initialMessages loaded and we have no messages
    // CRITICAL: Only sync if we're not streaming and messages are truly empty
    // BUT: Don't sync if we have messages in ref (they might have just been cleared by useChat reset)
    if (!chatIdChanged && initialMessages.length > 0 && messages.length === 0 && !isStreamingOrSubmitting) {
      // CRITICAL: Check if we have messages in ref first - if so, restore them instead of syncing
      if (currentMessagesLength > 0) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ Messages cleared but ref has them, restoring from ref instead of syncing:', currentMessagesLength)
        setMessages(currentMessages)
        return
      }
      
      // Also check if we have messages in sessionStorage for this chatId
      if (typeof window !== 'undefined' && chatId) {
        const sessionKey = `pendingMessages:${chatId}`
        const latestKey = 'pendingMessages:latest'
        const sessionData = sessionStorage.getItem(sessionKey) || sessionStorage.getItem(latestKey)
        if (sessionData) {
          try {
            const sessionMessages = JSON.parse(sessionData)
            if (Array.isArray(sessionMessages.messages) && sessionMessages.messages.length > 0) {
              // Check if these messages are recent (within last 30 seconds)
              const isRecent = !sessionMessages.timestamp || (Date.now() - sessionMessages.timestamp < 30000)
              if (isRecent) {
                console.log('[🐛 MESSAGE SYNC] ⚠️ Found recent messages in sessionStorage, restoring instead of syncing:', sessionMessages.messages.length)
                setMessages(sessionMessages.messages)
                messagesRef.current = sessionMessages.messages
                return
              }
            }
          } catch (e) {
            console.error('[🐛 MESSAGE SYNC] Failed to parse sessionStorage messages:', e)
          }
        }
      }
      
      // Only sync if we truly have no messages anywhere
      console.log('[🐛 MESSAGE SYNC] ✅ Syncing initialMessages to empty messages state:', initialMessages.length)
      setMessages(initialMessages)
      return
    }
    
    // 6. CRITICAL: If messages are empty but we have backup messages, restore them
    // This handles the case where useChat reset cleared messages during navigation
    if (messages.length === 0 && messagesBeforeNavigationRef.current.length > 0) {
      const isCurrentlyStreaming = status === 'streaming' || isSubmitting
      if (isCurrentlyStreaming || chatId) {
        console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from backup ref:', {
          backupCount: messagesBeforeNavigationRef.current.length,
          isStreaming: isCurrentlyStreaming,
          chatId
        })
        setMessages(messagesBeforeNavigationRef.current)
        return
      }
    }
    
    // 7. CRITICAL: If we have messages in ref but not in state, and we have a chatId, restore them
    // This handles cases where messages got cleared but we have them cached
    if (messages.length === 0 && currentMessagesLength > 0 && chatId && !isStreamingOrSubmitting) {
      console.log('[🐛 MESSAGE SYNC] ⚠️ CRITICAL: Restoring messages from ref (messages cleared but ref has them):', currentMessagesLength)
      setMessages(currentMessages)
      return
    }
    
  }, [chatId, initialMessages, status, isSubmitting, setMessages, messages, stableChatId]) // Include messages to detect when they're cleared
  
  // Cache messages to temp chat ID as they come in (for migration)
  useEffect(() => {
    if (chatId && chatId.startsWith('temp-chat-') && messages.length > 0) {
      Promise.resolve().then(async () => {
        try {
          const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
          await writeToIndexedDB("messages", { id: chatId, messages })
          if (typeof window !== 'undefined') {
            (window as any).__lastMessagesForMigration = { chatId, messages }
          }
        } catch (error) {
          console.error('[useChatCore] Failed to cache messages:', error)
        }
      })
    }
  }, [chatId, messages])
  
  // Clear migration data when no longer needed
  useEffect(() => {
    if (chatId && !chatId.startsWith('temp-chat-') && typeof window !== 'undefined') {
      delete (window as any).__lastMessagesForMigration
    }
  }, [chatId])

  // Handle search params on mount
  useEffect(() => {
    if (prompt && typeof window !== "undefined") {
      requestAnimationFrame(() => setInput(prompt))
    }
  }, [prompt, setInput])

  // Submit action - optimized for immediate response
  const submit = useCallback(async () => {
    if (!input.trim() && files.length === 0) return
   
    // CRITICAL: Check authentication FIRST before doing anything
    const isAuthenticated = !!user?.id
    
    if (!isAuthenticated) {
      // Store pending message for sending after authentication
      // Note: Files can't be serialized, so we store file metadata
      const fileMetadata = files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }))
      
      const pendingMessage = {
        content: input.trim(),
        files: fileMetadata, // Store metadata only
        hasFiles: files.length > 0,
        selectedModel,
        enableSearch,
        enableEvidence,
        timestamp: Date.now(),
      }
      
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pendingMessage', JSON.stringify(pendingMessage))
        // Store files in a separate way if needed (IndexedDB or temporary storage)
        // For now, we'll just note that files need to be re-uploaded
        if (files.length > 0) {
          console.log('Files were attached but cannot be preserved. User will need to re-upload after login.')
        }
      }
      
      // Redirect to login page immediately
      router.push('/auth')
      return
    }

    // Set submitting state immediately for optimistic UI
    setIsSubmitting(true)

    // Store input and files for async processing
    const currentInput = input
    const currentFiles = [...files]
    
    // Clear input and files immediately for better UX
    setInput("")
    setFiles([])
    clearDraft()

    // CRITICAL: Determine optimistic chatId synchronously (from cache/refs) - NO async calls
    const isOnChatRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/c/')
    const chatIdFromUrl = isOnChatRoute ? window.location.pathname.split('/c/')[1] : null
    const existingChatIdFromRef = currentChatIdForSavingRef.current
    
    // Quick synchronous chatId resolution (priority: URL > prop > ref > temp)
    let optimisticChatId = chatIdFromUrl || chatId || existingChatIdFromRef || "temp"
    
    // Create optimistic attachments immediately (no upload yet)
    let optimisticAttachments: Attachment[] | undefined = undefined
    if (currentFiles.length > 0) {
      optimisticAttachments = createOptimisticAttachments(currentFiles)
    }

    // CRITICAL: Append message IMMEDIATELY with optimistic values - message appears instantly
    const optimisticOptions = {
      body: {
        chatId: optimisticChatId,
        userId: user?.id || "temp", // Use cached userId if available
        model: selectedModel,
        isAuthenticated: !!user?.id,
        systemPrompt,
        enableSearch,
        enableEvidence,
        // CRITICAL: Ensure userRole is passed correctly for evidence mode
        userRole: userPreferences.preferences.userRole || "general",
        medicalSpecialty: userPreferences.preferences.medicalSpecialty,
        clinicalDecisionSupport: userPreferences.preferences.clinicalDecisionSupport,
        medicalLiteratureAccess: userPreferences.preferences.medicalLiteratureAccess,
        medicalComplianceMode: userPreferences.preferences.medicalComplianceMode,
      },
    }

    append({
      role: "user",
      content: currentInput,
      experimental_attachments: optimisticAttachments,
    }, optimisticOptions)

    // Mark that we've sent the first message to prevent redirect
    hasSentFirstMessageRef.current = true
    if (typeof window !== 'undefined' && optimisticChatId) {
      sessionStorage.setItem(`hasSentMessage:${optimisticChatId}`, 'true')
    }

    // NOW do async work in parallel (non-blocking - message already visible)
    try {
      // Run critical async operations in parallel
      const [uid, allowed] = await Promise.all([
        getOrCreateGuestUserId(user),
        // Pre-check limits with cached userId if available (non-blocking)
        user?.id ? checkLimitsAndNotify(user.id) : Promise.resolve(true)
      ])

      if (!uid) {
        setIsSubmitting(false)
        setHasDialogAuth(true)
        return
      }

      if (!allowed) {
        setIsSubmitting(false)
        return
      }

      // Determine real chatId (use cached values to avoid DB call when possible)
      const isOnHomePage = typeof window !== 'undefined' && window.location.pathname === "/"
      const hasExistingMessages = messages.length > 0
      
      let currentChatId = optimisticChatId
      
      // Only call ensureChatExists if we truly don't have a valid chatId
      if ((!currentChatId || currentChatId === "temp" || currentChatId.startsWith('temp-chat-')) && 
          isAuthenticated && isOnHomePage && !hasExistingMessages) {
        try {
          const chatIdFromEnsure = await ensureChatExists(uid, currentInput)
          if (chatIdFromEnsure && !chatIdFromEnsure.toString().startsWith('temp')) {
            currentChatId = chatIdFromEnsure.toString()
            if (currentChatId !== chatId) {
              bumpChat(currentChatId)
            }
          }
        } catch (error) {
          console.error('[🐛 SUBMIT] Chat creation failed:', error)
          // Continue with optimistic chatId
        }
      }

      // Update chatId ref for next message
      if (currentChatId && !currentChatId.startsWith('temp-chat-')) {
        currentChatIdForSavingRef.current = currentChatId
      }

      // Handle file uploads in background (non-blocking)
      if (currentFiles.length > 0 && currentChatId && currentChatId !== "temp") {
        Promise.resolve().then(async () => {
          try {
            const uploadingToastId = toast({
              title: `Uploading ${currentFiles.length} file${currentFiles.length > 1 ? 's' : ''}...`,
              description: "Please wait while your files are being uploaded",
              status: "info",
            })

            const processedAttachments = await handleFileUploads(uid, currentChatId, !!user?.id, currentFiles)
            
            sonnerToast.dismiss(uploadingToastId)
            if (processedAttachments && processedAttachments.length > 0) {
              toast({
                title: "Files uploaded successfully",
                description: `${processedAttachments.length} file${processedAttachments.length > 1 ? 's' : ''} ready`,
                status: "success",
              })
              // Note: Real attachments will be used in the API call via streaming
            }
          } catch (error) {
            console.error("File upload failed:", error)
            toast({
              title: "File upload failed",
              description: "Your message was sent, but files couldn't be uploaded.",
              status: "warning",
            })
          }
        })
      }

    } catch (error) {
      console.error("Error in submit:", error)
      toast({
        title: "An error occurred while sending your message.",
        status: "error",
      })
      setIsSubmitting(false)
    }
    // Note: Don't set isSubmitting to false here - let onFinish handle it
  }, [
    user,
    input,
    files,
    chatId,
    messages,
    checkLimitsAndNotify,
    ensureChatExists,
    handleFileUploads,
    append,
    selectedModel,
    systemPrompt,
    enableSearch,
    enableEvidence,
    bumpChat,
    clearDraft,
    setHasDialogAuth,
    setInput,
    setFiles,
    userPreferences,
    createOptimisticAttachments,
    isAuthenticated,
    setHasRateLimitPaywall,
    setRateLimitWaitTime,
    setRateLimitType,
  ]);

  // Handle suggestion - optimized for immediate response
  const handleSuggestion = useCallback(
    async (suggestion: string) => {
      // CRITICAL: Check authentication FIRST before doing anything
      const isAuthenticated = !!user?.id
      
      if (!isAuthenticated) {
        // Store pending message for sending after authentication
        const pendingMessage = {
          content: suggestion,
          files: [],
          hasFiles: false,
          selectedModel,
          enableSearch,
          enableEvidence,
          timestamp: Date.now(),
        }
        
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('pendingMessage', JSON.stringify(pendingMessage))
        }
        
        // Redirect to login page immediately
        router.push('/auth')
        return
      }

      setIsSubmitting(true)

      // CRITICAL: Determine optimistic chatId synchronously (from cache/refs) - NO async calls
      const optimisticChatId = chatId || currentChatIdForSavingRef.current || "temp"

      // CRITICAL: Append message IMMEDIATELY with optimistic values - message appears instantly
      const optimisticOptions = {
        body: {
          chatId: optimisticChatId,
          userId: user?.id || "temp", // Use cached userId if available
          model: selectedModel,
          isAuthenticated: !!user?.id,
          systemPrompt: getSystemPromptByRole(userPreferences.preferences.userRole),
        },
      }

      append({
        role: "user",
        content: suggestion,
      }, optimisticOptions)

      // Mark that we've sent the first message to prevent redirect
      hasSentFirstMessageRef.current = true
      if (typeof window !== 'undefined' && optimisticChatId) {
        sessionStorage.setItem(`hasSentMessage:${optimisticChatId}`, 'true')
      }

      // NOW do async work in parallel (non-blocking - message already visible)
      try {
        // Run critical async operations in parallel
        const [uid, allowed] = await Promise.all([
          getOrCreateGuestUserId(user),
          // Pre-check limits with cached userId if available (non-blocking)
          user?.id ? checkLimitsAndNotify(user.id) : Promise.resolve(true)
        ])

        if (!uid) {
          setIsSubmitting(false)
          return
        }

        if (!allowed) {
          setIsSubmitting(false)
          return
        }

        // Determine real chatId (use cached values to avoid DB call when possible)
        const isOnHomePage = typeof window !== 'undefined' && window.location.pathname === "/"
        let currentChatId = optimisticChatId

        // Only call ensureChatExists if we truly don't have a valid chatId
        if (isAuthenticated && isOnHomePage && (!currentChatId || currentChatId.startsWith('temp'))) {
          try {
            const quickChatId = await ensureChatExists(uid, suggestion)
            if (quickChatId && !quickChatId.toString().startsWith('temp')) {
              currentChatId = quickChatId.toString()
              if (currentChatId !== chatId) {
                bumpChat(currentChatId)
              }
            }
          } catch (error) {
            console.error('[🐛 SUGGESTION] Chat creation failed:', error)
            // Continue with optimistic chatId
          }
        } else if (chatId && !chatId.startsWith('temp')) {
          currentChatId = chatId
        }

        // Update chatId ref for next message
        if (currentChatId && !currentChatId.startsWith('temp-chat-')) {
          currentChatIdForSavingRef.current = currentChatId
        }

      } catch {
        toast({ title: "Failed to send suggestion", status: "error" })
        setIsSubmitting(false)
      }
    },
    [
      chatId,
      selectedModel,
      user,
      append,
      checkLimitsAndNotify,
      ensureChatExists,
      isAuthenticated,
      bumpChat,
      userPreferences,
      router,
      enableSearch,
      enableEvidence,
    ]
  )

  // Handle reload
  const handleReload = useCallback(async () => {
    const uid = await getOrCreateGuestUserId(user)
    if (!uid) {
      return
    }

    const options = {
      body: {
        chatId,
        userId: uid,
        model: selectedModel,
        isAuthenticated,
        systemPrompt: systemPrompt || getSystemPromptByRole(userPreferences.preferences.userRole),
      },
    }

    reload(options)
  }, [user, chatId, selectedModel, isAuthenticated, systemPrompt, reload])

  // Handle input change - optimized for streaming
  const { setDraftValue } = useChatDraft(chatId)
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value)
      setDraftValue(value)
    },
    [setInput, setDraftValue]
  )

  return {
    // Chat state
    messages,
    input,
    handleSubmit,
    status,
    error,
    reload,
    stop,
    setMessages,
    setInput,
    append,
    isAuthenticated,
    systemPrompt,
    hasSentFirstMessageRef,

    // Component state
    isSubmitting,
    setIsSubmitting,
    enableSearch,
    enableEvidence,
    setEnableEvidence,
    setEnableSearch,
    
    // Evidence citations from medical evidence database
    evidenceCitations,

    // Actions
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
  }
}
