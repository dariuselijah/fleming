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
  
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    activeChatIdRef.current = chatId
  }, [chatId])

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

      let sessionMessages: MessageAISDK[] = []
      if (typeof window !== "undefined") {
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

      let cached: MessageAISDK[] = []
      try {
        cached = await getCachedMessages(chatId)
        if (!isActive()) return
      } catch (error) {
        console.error("[MessagesProvider] Failed to load cached messages:", error)
      }
      if (!isActive()) return

      // Hydration order is deterministic to avoid blank overwrites:
      // session-scoped snapshot -> indexed cache -> database refresh.
      if (sessionMessages.length > 0) {
        setMessagesIfActive(sessionMessages)
        setIsLoadingIfActive(false)
        cacheMessages(chatId, sessionMessages).catch((error) => {
          console.error("[MessagesProvider] Failed to cache session messages:", error)
        })
      } else if (cached.length > 0) {
        setMessagesIfActive(cached)
        setIsLoadingIfActive(false)
      }

      try {
        const fresh = await Promise.race([
          getMessagesFromDb(chatId),
          new Promise<MessageAISDK[]>((resolve) =>
            setTimeout(() => {
              resolve([])
            }, 8000)
          )
        ]).catch((error) => {
          console.error("[MessagesProvider] Database fetch failed:", error)
          return []
        })
        if (!isActive()) return

        if (fresh.length > 0) {
          setMessagesIfActive(fresh)
          setIsLoadingIfActive(false)
          cacheMessages(chatId, fresh).catch((error) => {
            console.error("[MessagesProvider] Failed to cache fresh messages:", error)
          })
        } else if (cached.length > 0) {
          setIsLoadingIfActive(false)
        } else if (sessionMessages.length > 0) {
          setIsLoadingIfActive(false)
        } else {
          setMessagesIfActive([])
          setIsLoadingIfActive(false)
        }
      } catch (error) {
        console.error("[MessagesProvider] Failed to load messages:", error)
        if (!isActive()) return
        if (sessionMessages.length > 0) {
          setMessagesIfActive(sessionMessages)
          cacheMessages(chatId, sessionMessages).catch((cacheError) => {
            console.error("[MessagesProvider] Failed to cache session fallback:", cacheError)
          })
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
