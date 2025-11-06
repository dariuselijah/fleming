import { toast } from "@/components/ui/toast"
import { checkRateLimits } from "@/lib/api"
import type { Chats } from "@/lib/chat-store/types"
import { REMAINING_QUERY_ALERT_THRESHOLD } from "@/lib/config"
import { Message } from "@ai-sdk/react"
import type { Message as MessageAISDK } from "ai"
import { useRouter } from "next/navigation"
import { useCallback, useRef } from "react"
import { createNewChat } from "@/lib/chat-store/chats/api"
import { getCachedMessages } from "@/lib/chat-store/messages/api"
import { writeToIndexedDB } from "@/lib/chat-store/persist"

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
  setInput: (input: string) => void
  bumpChat?: (id: string) => Promise<void>
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
  bumpChat,
}: UseChatOperationsProps) {
  const router = useRouter()
  // Use ref to track chat creation state
  const chatCreationInProgress = useRef(false)
  const lastChatCreationAttempt = useRef<number>(0)
  const chatCreationDebounceMs = 1000 // 1 second debounce

  // Chat utilities
  const checkLimitsAndNotify = async (uid: string) => {
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
      return false
    }
  }

  const ensureChatExists = async (userId: string, input: string) => {
    const isOnHomePage = typeof window !== 'undefined' && window.location.pathname === "/"
    const pathname = typeof window !== 'undefined' ? window.location.pathname : 'N/A'
    
    // CRITICAL: Check if we're on a chat route - if so, extract chatId from URL
    const isOnChatRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/c/')
    const chatIdFromUrl = isOnChatRoute ? window.location.pathname.split('/c/')[1] : null
    
    console.log('[🐛 ensureChatExists] Called:', {
      chatId,
      chatIdFromUrl,
      isOnHomePage,
      isOnChatRoute,
      pathname,
      isAuthenticated,
      messagesCount: messages.length,
      isTempId: chatId?.startsWith('temp-chat-')
    })
    
    if (!isAuthenticated) {
      const storedGuestChatId = localStorage.getItem("guestChatId")
      if (storedGuestChatId) {
        console.log('[🐛 ensureChatExists] Returning guest chatId:', storedGuestChatId)
        return storedGuestChatId
      }
    }

    // CRITICAL FIX: If we have a valid (non-temp) chatId from URL, prop, or anywhere - NEVER create a new chat
    const validChatId = chatIdFromUrl || (chatId && !chatId.startsWith('temp-chat-') ? chatId : null)
    if (validChatId) {
      // We have a valid chatId - NEVER create new chat
      console.log('[🐛 ensureChatExists] ✅ Already have valid chatId, returning (NOT creating new chat):', validChatId)
      chatCreationInProgress.current = false
      lastChatCreationAttempt.current = 0
      globalChatCreationInProgress = false
      globalLastChatCreationAttempt = 0
      return validChatId
    }
    
    // CRITICAL: If we have messages, we're in an existing conversation - don't create new chat
    if (messages.length > 0) {
      console.log('[🐛 ensureChatExists] ✅ Have existing messages, not creating new chat. messages.length:', messages.length)
      chatCreationInProgress.current = false
      lastChatCreationAttempt.current = 0
      globalChatCreationInProgress = false
      globalLastChatCreationAttempt = 0
      // Return null - the caller should use the existing chatId from ref or state
      return null
    }
    
    // CRITICAL: If we're NOT on home page, we shouldn't be creating a new chat
    // This means we're in an existing chat but chatId wasn't passed correctly
    if (!isOnHomePage) {
      console.warn('[🐛 ensureChatExists] ⚠️ NOT on home page but no valid chatId! This should not happen. Returning null.')
      chatCreationInProgress.current = false
      lastChatCreationAttempt.current = 0
      globalChatCreationInProgress = false
      globalLastChatCreationAttempt = 0
      return null
    }
    
    console.log('[🐛 ensureChatExists] ⚠️ Creating new chat! Reason:', {
      hasChatId: !!chatId,
      isTempId: chatId?.startsWith('temp-chat-'),
      isOnHomePage,
      messagesCount: messages.length
    })
    
    // If we're on home page, always create a new chat (ignore existing chatId)
    if (isOnHomePage) {
      // Clear any existing chat state when starting fresh
      if (typeof window !== 'undefined') {
        // Clear sessionStorage flags
        const keys = Object.keys(sessionStorage)
        keys.forEach(key => {
          if (key.startsWith('hasSentMessage:') || key.startsWith('messages:')) {
            sessionStorage.removeItem(key)
          }
        })
        // Reset chat creation flags
        chatCreationInProgress.current = false
        lastChatCreationAttempt.current = 0
        globalChatCreationInProgress = false
        globalLastChatCreationAttempt = 0
      }
      // Continue to create new chat below
    }

    if (messages.length === 0) {
      const now = Date.now()
      
      // Global debounce chat creation attempts across all components
      if (now - globalLastChatCreationAttempt < GLOBAL_CHAT_CREATION_DEBOUNCE_MS) {
        // For authenticated users, wait a bit and check if chat was created
        if (isAuthenticated) {
          await new Promise(resolve => setTimeout(resolve, 100))
          if (chatId && !chatId.startsWith('temp-chat-')) {
            return chatId
          }
        }
        return isAuthenticated ? null : `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
      }
      
      // Local debounce chat creation attempts
      if (now - lastChatCreationAttempt.current < chatCreationDebounceMs) {
        if (isAuthenticated) {
          await new Promise(resolve => setTimeout(resolve, 100))
          if (chatId && !chatId.startsWith('temp-chat-')) {
            return chatId
          }
        }
        return isAuthenticated ? null : `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
      }
      
      // Check if we're already creating a chat to prevent duplicates (local and global)
      if (chatCreationInProgress.current || globalChatCreationInProgress) {
        // Wait for existing creation to complete
        let attempts = 0
        while ((chatCreationInProgress.current || globalChatCreationInProgress) && attempts < 50) { // Max 5 seconds
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
          // Check if we now have a chatId
          if (chatId && !chatId.startsWith('temp-chat-')) {
            chatCreationInProgress.current = false
            lastChatCreationAttempt.current = 0
            globalChatCreationInProgress = false
            globalLastChatCreationAttempt = 0
            return chatId
          }
        }
      }
      
      try {
        // Mark chat creation as in progress (local and global) and update last attempt time
        chatCreationInProgress.current = true
        lastChatCreationAttempt.current = now
        globalChatCreationInProgress = true
        globalLastChatCreationAttempt = now
        
        // CRITICAL: For authenticated users, create real chat immediately (no temp chat, no navigation)
        // For guest users, use temp chat pattern
        if (isAuthenticated) {
          // Create real chat immediately - wait for it to complete
          const newChat = await createNewChat(
            userId,
            input,
            selectedModel,
            isAuthenticated,
            systemPrompt
          )
          
          if (newChat && newChat.id) {
            const newChatId = newChat.id
            
            // CRITICAL: Don't update URL immediately - this causes a page refresh
            // The chatId will be available via the chatCreated event and state
            // URL will be updated naturally when user navigates or when needed
            
            // Update sessionStorage
            sessionStorage.setItem(`hasSentMessage:${newChatId}`, 'true')
            
            // Dispatch event to notify other components
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('chatCreated', {
                  detail: { chatId: newChatId },
                })
              )
            }
            
            // Bump chat to top of list
            if (bumpChat) {
              await bumpChat(newChatId)
            }
            
            chatCreationInProgress.current = false
            lastChatCreationAttempt.current = 0
            globalChatCreationInProgress = false
            globalLastChatCreationAttempt = 0
            
            console.log('[ensureChatExists] ✅ Created real chat immediately (no temp, no navigation):', newChatId)
            return newChatId
          }
        } else {
          // Guest users: Use temp chat pattern
          const tempChatId = `temp-chat-${now}-${Math.random().toString(36).substring(2, 9)}`
          console.log('[ensureChatExists] Returning temp chat ID for guest:', tempChatId)
          
          // Process chat creation in background for guest users
          const chatCreationPromise = createNewChat(
            userId,
            input,
            selectedModel,
            isAuthenticated,
            systemPrompt
          )
          
          Promise.resolve().then(async () => {
            try {
              const newChat = await chatCreationPromise
              
              if (newChat && newChat.id) {
                localStorage.setItem("guestChatId", newChat.id)
                
                // Migrate messages from temp to real (guest users only)
                const { getCachedMessages } = await import("@/lib/chat-store/messages/api")
                const { writeToIndexedDB } = await import("@/lib/chat-store/persist")
                
                let messagesToMigrate: MessageAISDK[] = []
                for (let i = 0; i < 15; i++) {
                  try {
                    messagesToMigrate = await getCachedMessages(tempChatId)
                    if (messagesToMigrate.length > 0) break
                  } catch (error) {
                    console.error('[ensureChatExists] Error getting cached messages:', error)
                  }
                  await new Promise(resolve => setTimeout(resolve, 200))
                }
                
                if (messagesToMigrate.length > 0) {
                  await writeToIndexedDB("messages", { id: newChat.id, messages: messagesToMigrate })
                  const { setMessages: saveMessagesToDb } = await import("@/lib/chat-store/messages/api")
                  try {
                    await saveMessagesToDb(newChat.id, messagesToMigrate)
                  } catch (dbError) {
                    console.warn('[ensureChatExists] Failed to save messages to database:', dbError)
                  }
                }
              }
            } catch (error) {
              console.error('[ensureChatExists] Background chat creation failed for guest:', error)
            } finally {
              chatCreationInProgress.current = false
              lastChatCreationAttempt.current = 0
              globalChatCreationInProgress = false
              globalLastChatCreationAttempt = 0
            }
          })
          
          return tempChatId
        }
        
        chatCreationInProgress.current = false
        lastChatCreationAttempt.current = 0
        globalChatCreationInProgress = false
        globalLastChatCreationAttempt = 0
        return null
      } catch (err: unknown) {
        console.error('[ensureChatExists] Chat creation failed:', err)
        chatCreationInProgress.current = false
        lastChatCreationAttempt.current = 0
        globalChatCreationInProgress = false
        globalLastChatCreationAttempt = 0
        return null
      }
    }

    return chatId
  }

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const { deleteChat: deleteChatFromDb } = await import(
          "@/lib/chat-store/chats/api"
        )
        await deleteChatFromDb(id)
        toast({ title: "Chat deleted", status: "success" })
      } catch (error) {
        toast({ title: "Failed to delete chat", status: "error" })
      }
    },
    []
  )

  const handleEdit = useCallback(
    async (id: string, newContent: string) => {
      try {
        const { updateChatTitle } = await import("@/lib/chat-store/chats/api")
        await updateChatTitle(id, newContent)
        toast({ title: "Chat updated", status: "success" })
      } catch (error) {
        toast({ title: "Failed to update chat", status: "error" })
      }
    },
    []
  )

  return {
    checkLimitsAndNotify,
    ensureChatExists,
    handleDelete,
    handleEdit,
  }
}
