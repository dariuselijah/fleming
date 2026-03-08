"use client"

import { toast } from "@/components/ui/toast"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { shouldApplyHydrationResult } from "@/lib/chat-store/messages/load-guards"
import { resolveScopedSessionMessages } from "@/lib/chat-store/messages/session-restore"
import type { Message as MessageAISDK } from "ai"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { writeToIndexedDB } from "../persist"
import {
  cacheMessages,
  clearMessagesForChat,
  getCachedMessages,
  getMessagesFromDb,
  setMessages as saveMessages,
} from "./api"

interface MessagesContextType {
  messages: MessageAISDK[]
  isLoading: boolean
  setMessages: React.Dispatch<React.SetStateAction<MessageAISDK[]>>
  refresh: () => Promise<void>
  saveAllMessages: (messages: MessageAISDK[]) => Promise<void>
  cacheAndAddMessage: (message: MessageAISDK) => Promise<void>
  resetMessages: () => Promise<void>
  deleteMessages: () => Promise<void>
}

const MessagesContext = createContext<MessagesContextType | null>(null)

export function useMessages() {
  const context = useContext(MessagesContext)
  if (!context)
    throw new Error("useMessages must be used within MessagesProvider")
  return context
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<MessageAISDK[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { chatId } = useChatSession()
  const messagesRef = useRef(messages)
  const activeLoadTokenRef = useRef(0)
  const activeChatIdRef = useRef<string | null>(chatId)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeChatIdRef.current = chatId
  }, [chatId])

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (chatId === null) {
      setMessages([])
      setIsLoading(false)
    }
  }, [chatId])

  // Listen for reset chat state events
  useEffect(() => {
    const handleResetChatState = () => {
      setMessages([])
      setIsLoading(false)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resetChatState', handleResetChatState)
      return () => {
        window.removeEventListener('resetChatState', handleResetChatState)
      }
    }
  }, [])

  useEffect(() => {
    if (!chatId) {
      activeLoadTokenRef.current += 1
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      setMessages([])
      setIsLoading(false)
      return
    }

    const loadToken = activeLoadTokenRef.current + 1
    activeLoadTokenRef.current = loadToken
    let cancelled = false
    const isActive = () =>
      shouldApplyHydrationResult({
        cancelled,
        activeToken: activeLoadTokenRef.current,
        requestToken: loadToken,
        activeChatId: activeChatIdRef.current,
        requestChatId: chatId,
      })
    const setMessagesIfActive = (
      next:
        | MessageAISDK[]
        | ((prev: MessageAISDK[]) => MessageAISDK[])
    ) => {
      if (!isActive()) return
      setMessages(next as any)
    }
    const setIsLoadingIfActive = (next: boolean) => {
      if (!isActive()) return
      setIsLoading(next)
    }

    const load = async () => {
      setIsLoadingIfActive(true)
      
      // CRITICAL: Check sessionStorage first for messages migrated during redirect
      let sessionMessages: MessageAISDK[] = []
      if (typeof window !== 'undefined') {
        const resolved = resolveScopedSessionMessages({
          chatId,
          pendingRaw:
            sessionStorage.getItem(`pendingMessages:${chatId}`) ||
            sessionStorage.getItem(`messages:${chatId}`),
          latestRaw: null,
        })
        if (Array.isArray(resolved)) {
          sessionMessages = resolved as MessageAISDK[]
          sessionStorage.removeItem(`pendingMessages:${chatId}`)
          sessionStorage.removeItem(`messages:${chatId}`)
        }
      }
      if (!isActive()) return
      
      // Load cached messages first (fast, synchronous)
      let cached: MessageAISDK[] = []
      try {
        cached = await getCachedMessages(chatId)
        if (!isActive()) return
        
        // Show cached messages immediately if available (don't wait for DB)
        if (cached.length > 0 && sessionMessages.length === 0) {
          setMessagesIfActive(cached)
          setIsLoadingIfActive(false) // Set loading to false immediately
        }
      } catch (error) {
        console.error('[MessagesProvider] Failed to load cached messages:', error)
      }
      if (!isActive()) return
      
      // CRITICAL: Always fetch from database in parallel (even if we have cached)
      // This ensures we get the latest data when navigating to existing chats
      // CRITICAL: Wait longer for messages if we don't have any cached (might be streaming)
      const shouldWaitForMessages = cached.length === 0 && sessionMessages.length === 0
      const timeout = shouldWaitForMessages ? 10000 : 5000 // Wait 10s if no cached messages
      
      try {
        const fresh = await Promise.race([
          getMessagesFromDb(chatId),
          new Promise<MessageAISDK[]>((resolve) => 
            setTimeout(() => {
              resolve([])
            }, timeout)
          )
        ]).catch((error) => {
          console.error('[MessagesProvider] Database fetch failed:', error)
          return [] // Return empty array on error, will use cache
        })
        if (!isActive()) return
        
        // Priority: sessionStorage > fresh from DB > cached
        if (sessionMessages.length > 0) {
          setMessagesIfActive(sessionMessages)
          setIsLoadingIfActive(false)
          // Cache them for future use
          cacheMessages(chatId, sessionMessages)
        } else if (fresh.length > 0) {
          // Fresh data from database - use it (even if we already showed cached)
          setMessagesIfActive(fresh)
          setIsLoadingIfActive(false)
          cacheMessages(chatId, fresh)
        } else if (cached.length > 0) {
          // Fallback to cached messages (already shown above, but ensure state is set)
          // Only update if we didn't already set it above (when sessionMessages was empty)
          if (sessionMessages.length === 0) {
            // Already set above, but ensure isLoading is false
            setIsLoadingIfActive(false)
          } else {
            // We had sessionMessages but they're empty, use cached
            setMessagesIfActive(cached)
            setIsLoadingIfActive(false)
          }
          
          // Try to refresh in background if we didn't get fresh data
          if (fresh.length === 0) {
            Promise.resolve().then(async () => {
              try {
                const refreshed = await getMessagesFromDb(chatId)
                if (isActive() && refreshed.length > 0) {
                  setMessagesIfActive(refreshed)
                  cacheMessages(chatId, refreshed)
                }
              } catch (error) {
                console.error('[MessagesProvider] Background refresh failed:', error)
              }
            })
          }
        } else {
          // No messages found - but if we're waiting for streaming, keep trying
          if (shouldWaitForMessages) {
            // Try one more time after a delay (messages might still be saving)
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current)
            }
            retryTimeoutRef.current = setTimeout(async () => {
              try {
                const retryMessages = await getMessagesFromDb(chatId)
                if (!isActive()) return
                if (retryMessages.length > 0) {
                  setMessagesIfActive(retryMessages)
                  cacheMessages(chatId, retryMessages)
                  setIsLoadingIfActive(false)
                  return
                }
              } catch (error) {
                console.error('[MessagesProvider] Retry fetch failed:', error)
              }
              // Still no messages - empty chat
              setMessagesIfActive([])
              setIsLoadingIfActive(false)
              retryTimeoutRef.current = null
            }, 2000)
          } else {
            // No messages found anywhere - empty chat
            setMessagesIfActive([])
            setIsLoadingIfActive(false)
          }
        }
      } catch (error) {
        console.error("[MessagesProvider] Failed to load messages:", error)
        if (!isActive()) return
        // On error, try to use cached or sessionStorage messages
        if (sessionMessages.length > 0) {
          setMessagesIfActive(sessionMessages)
          cacheMessages(chatId, sessionMessages)
        } else if (cached.length > 0) {
          setMessagesIfActive(cached)
        } else {
          setMessagesIfActive([])
        }
        setIsLoadingIfActive(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [chatId]) // CRITICAL: Only depend on chatId - this ensures we reload when navigating to different chat

  const refresh = async () => {
    if (!chatId) return

    try {
      const fresh = await getMessagesFromDb(chatId)
      setMessages(fresh)
    } catch {
      toast({ title: "Failed to refresh messages", status: "error" })
    }
  }

  const cacheAndAddMessage = async (message: MessageAISDK) => {
    if (!chatId) return

    try {
      // CRITICAL: Update state immediately for instant UI update
      setMessages((prev) => {
        const updated = [...prev, message]
        // Write to IndexedDB asynchronously after state update (non-blocking)
        Promise.resolve().then(() => {
          writeToIndexedDB("messages", { id: chatId, messages: updated }).catch((error) => {
            console.error("[cacheAndAddMessage] Failed to write to IndexedDB:", error)
          })
        })
        return updated
      })
    } catch {
      toast({ title: "Failed to save message", status: "error" })
    }
  }

  const saveAllMessages = async (newMessages: MessageAISDK[]) => {
    // @todo: manage the case where the chatId is null (first time the user opens the chat)
    if (!chatId) return

    try {
      await saveMessages(chatId, newMessages)
      setMessages(newMessages)
    } catch {
      toast({ title: "Failed to save messages", status: "error" })
    }
  }

  const deleteMessages = async () => {
    if (!chatId) return

    setMessages([])
    await clearMessagesForChat(chatId)
  }

  const resetMessages = async () => {
    setMessages([])
  }

  return (
    <MessagesContext.Provider
      value={{
        messages,
        isLoading,
        setMessages,
        refresh,
        saveAllMessages,
        cacheAndAddMessage,
        resetMessages,
        deleteMessages,
      }}
    >
      {children}
    </MessagesContext.Provider>
  )
}
