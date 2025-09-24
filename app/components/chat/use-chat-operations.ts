import { toast } from "@/components/ui/toast"
import { checkRateLimits } from "@/lib/api"
import type { Chats } from "@/lib/chat-store/types"
import { REMAINING_QUERY_ALERT_THRESHOLD } from "@/lib/config"
import { Message } from "@ai-sdk/react"
import { useCallback, useRef } from "react"

// Global chat creation lock to prevent multiple chats across components
let globalChatCreationInProgress = false
let globalLastChatCreationAttempt = 0
const GLOBAL_CHAT_CREATION_DEBOUNCE_MS = 2000 // 2 seconds global debounce

type UseChatOperationsProps = {
  isAuthenticated: boolean
  chatId: string | null
  messages: Message[]
  selectedModel: string
  systemPrompt: string
  createNewChat: (
    userId: string,
    title?: string,
    model?: string,
    isAuthenticated?: boolean,
    systemPrompt?: string
  ) => Promise<Chats | undefined>
  setHasDialogAuth: (value: boolean) => void
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[])
  ) => void
}

export function useChatOperations({
  isAuthenticated,
  chatId,
  messages,
  selectedModel,
  systemPrompt,
  createNewChat,
  setHasDialogAuth,
  setMessages,
}: UseChatOperationsProps) {
  // Use ref to track chat creation state
  const chatCreationInProgress = useRef(false)
  const lastChatCreationAttempt = useRef<number>(0)
  const chatCreationDebounceMs = 1000 // 1 second debounce

  // Chat utilities
  const checkLimitsAndNotify = async (uid: string): Promise<boolean> => {
    try {
      const rateData = await checkRateLimits(uid, isAuthenticated)

      if (rateData.remaining === 0 && !isAuthenticated) {
        setHasDialogAuth(true)
        return false
      }

      if (rateData.remaining === REMAINING_QUERY_ALERT_THRESHOLD) {
        toast({
          title: `Only ${rateData.remaining} quer${
            rateData.remaining === 1 ? "y" : "ies"
          } remaining today.`,
          status: "info",
        })
      }

      if (rateData.remainingPro === REMAINING_QUERY_ALERT_THRESHOLD) {
        toast({
          title: `Only ${rateData.remainingPro} pro quer${
            rateData.remainingPro === 1 ? "y" : "ies"
          } remaining today.`,
          status: "info",
        })
      }

      return true
    } catch (err) {
      console.error("Rate limit check failed:", err)
      return false
    }
  }

  const ensureChatExists = async (userId: string, input: string) => {
    if (!isAuthenticated) {
      const storedGuestChatId = localStorage.getItem("guestChatId")
      if (storedGuestChatId) return storedGuestChatId
    }

    // If we already have a chatId, return it immediately and reset state
    if (chatId) {
      // Reset chat creation state since we have a valid chat
      chatCreationInProgress.current = false
      lastChatCreationAttempt.current = 0
      globalChatCreationInProgress = false
      globalLastChatCreationAttempt = 0
      return chatId
    }

    if (messages.length === 0) {
      const now = Date.now()
      
      // Global debounce chat creation attempts across all components
      if (now - globalLastChatCreationAttempt < GLOBAL_CHAT_CREATION_DEBOUNCE_MS) {
        return `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
      }
      
      // Local debounce chat creation attempts
      if (now - lastChatCreationAttempt.current < chatCreationDebounceMs) {
        return `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
      }
      
      // Check if we're already creating a chat to prevent duplicates (local and global)
      if (chatCreationInProgress.current || globalChatCreationInProgress) {
        // Wait for existing creation to complete
        let attempts = 0
        while ((chatCreationInProgress.current || globalChatCreationInProgress) && attempts < 50) { // Max 5 seconds
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        
        // Check if we now have a chatId
        if (chatId) {
          chatCreationInProgress.current = false
          lastChatCreationAttempt.current = 0
          globalChatCreationInProgress = false
          globalLastChatCreationAttempt = 0
          return chatId
        }
      }
      
      try {
        // Mark chat creation as in progress (local and global) and update last attempt time
        chatCreationInProgress.current = true
        lastChatCreationAttempt.current = now
        globalChatCreationInProgress = true
        globalLastChatCreationAttempt = now
        
        // OPTIMISTIC CHAT CREATION - try to create immediately first
        const chatCreationPromise = createNewChat(
          userId,
          input,
          selectedModel,
          isAuthenticated,
          systemPrompt
        )

        // Wait a short time for immediate creation (non-blocking for streaming)
        const immediateResult = await Promise.race([
          chatCreationPromise,
          new Promise(resolve => setTimeout(() => resolve(null), 200)) // 200ms timeout
        ])

        if (immediateResult && typeof immediateResult === 'object' && 'id' in immediateResult) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newChatId = (immediateResult as any).id
          if (isAuthenticated) {
            window.history.pushState(null, "", `/c/${newChatId}`)
          } else {
            localStorage.setItem("guestChatId", newChatId)
          }
          chatCreationInProgress.current = false
          lastChatCreationAttempt.current = 0
          globalChatCreationInProgress = false
          globalLastChatCreationAttempt = 0
          return newChatId
        }

        // If immediate creation didn't complete, return temp ID and continue in background
        const tempChatId = `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
        
        // Process chat creation in background
        Promise.resolve().then(async () => {
          try {
            const newChat = await chatCreationPromise
            if (!newChat) return
            
            if (isAuthenticated) {
              window.history.pushState(null, "", `/c/${newChat.id}`)
            } else {
              localStorage.setItem("guestChatId", newChat.id)
            }
            
            // Update the chatId state in the parent component
            // This prevents future calls from creating new chats
            if (typeof window !== 'undefined') {
              // Dispatch a custom event to notify parent component
              window.dispatchEvent(new CustomEvent('chatCreated', { 
                detail: { chatId: newChat.id } 
              }))
            }
          } catch (err) {
            console.log('Background chat creation error:', err)
            // Don't show error toast - user is already streaming
          } finally {
            chatCreationInProgress.current = false
            lastChatCreationAttempt.current = 0
            globalChatCreationInProgress = false
            globalLastChatCreationAttempt = 0
          }
        })

        return tempChatId
      } catch (err) {
        console.log('Chat creation error:', err)
        chatCreationInProgress.current = false
        lastChatCreationAttempt.current = 0
        globalChatCreationInProgress = false
        globalLastChatCreationAttempt = 0
        // Return temp ID even if creation fails - don't block streaming
        return `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
      }
    }

    return chatId
  }

  // Message handlers
  const handleDelete = useCallback(
    (id: string) => {
      setMessages(messages.filter((message) => message.id !== id))
    },
    [messages, setMessages]
  )

  const handleEdit = useCallback(
    (id: string, newText: string) => {
      setMessages(
        messages.map((message) =>
          message.id === id ? { ...message, content: newText } : message
        )
      )
    },
    [messages, setMessages]
  )

  return {
    // Utils
    checkLimitsAndNotify,
    ensureChatExists,

    // Handlers
    handleDelete,
    handleEdit,
  }
}
