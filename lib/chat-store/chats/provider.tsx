"use client"

import { toast } from "@/components/ui/toast"
import { createContext, useContext, useEffect, useState } from "react"
import { MODEL_DEFAULT, SYSTEM_PROMPT_DEFAULT, getSystemPromptByRole } from "../../config"
import type { Chats } from "../types"
import {
  createNewChat as createNewChatFromDb,
  deleteChat as deleteChatFromDb,
  fetchAndCacheChats,
  getCachedChats,
  updateChatModel as updateChatModelFromDb,
  updateChatTitle,
} from "./api"

interface ChatsContextType {
  chats: Chats[]
  refresh: () => Promise<void>
  isLoading: boolean
  updateTitle: (id: string, title: string) => Promise<void>
  deleteChat: (
    id: string,
    currentChatId?: string,
    redirect?: () => void
  ) => Promise<void>
  setChats: React.Dispatch<React.SetStateAction<Chats[]>>
  createNewChat: (
    userId: string,
    title?: string,
    model?: string,
    isAuthenticated?: boolean,
    systemPrompt?: string,
    projectId?: string,
    userRole?: "general" | "doctor" | "medical_student"
  ) => Promise<Chats | undefined>
  resetChats: () => Promise<void>
  getChatById: (id: string) => Chats | undefined
  updateChatModel: (id: string, model: string) => Promise<void>
  bumpChat: (id: string) => Promise<void>
}
const ChatsContext = createContext<ChatsContextType | null>(null)

export function useChats() {
  const context = useContext(ChatsContext)
  if (!context) throw new Error("useChats must be used within ChatsProvider")
  return context
}

export function ChatsProvider({
  userId,
  children,
}: {
  userId?: string
  children: React.ReactNode
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [chats, setChats] = useState<Chats[]>([])

  const refresh = async () => {
    if (!userId) return

    const fresh = await fetchAndCacheChats(userId)
    setChats(fresh)
  }

  useEffect(() => {
    if (!userId) return

    const load = async () => {
      setIsLoading(true)
      const cached = await getCachedChats()
      setChats(cached)

      try {
        const fresh = await fetchAndCacheChats(userId)
        setChats(fresh)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [userId])

  // Listen for reset chat state events
  useEffect(() => {
    const handleResetChatState = () => {
      // Don't reset chats on new chat, just refresh to get latest
      if (userId) {
        refresh()
      }
    }

    const handleChatCreated = async (event: Event) => {
      // Refresh chats when a new chat is created in the background
      if (userId) {
        refresh()
      }
      
      // Update sessionStorage when chat is created in background
      const customEvent = event as CustomEvent
      if (customEvent.detail?.chatId && typeof window !== 'undefined') {
        const newChatId = customEvent.detail.chatId
        
        // Find sessionStorage keys that start with 'hasSentMessage:'
        // and move them to the new chatId
        const keys = Object.keys(sessionStorage)
        const messageKeys = keys.filter(k => k.startsWith('hasSentMessage:'))
        for (const key of messageKeys) {
          const value = sessionStorage.getItem(key)
          if (value === 'true') {
            // Clear old key and set new key
            sessionStorage.removeItem(key)
            sessionStorage.setItem(`hasSentMessage:${newChatId}`, 'true')
            break
          }
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resetChatState', handleResetChatState)
      window.addEventListener('chatCreated', handleChatCreated)
      return () => {
        window.removeEventListener('resetChatState', handleResetChatState)
        window.removeEventListener('chatCreated', handleChatCreated)
      }
    }
  }, [userId, refresh])

  const updateTitle = async (id: string, title: string) => {
    const prev = [...chats]
    const updatedChatWithNewTitle = prev.map((c) =>
      c.id === id ? { ...c, title, updated_at: new Date().toISOString() } : c
    )
    const sorted = updatedChatWithNewTitle.sort(
      (a, b) => +new Date(b.updated_at || "") - +new Date(a.updated_at || "")
    )
    setChats(sorted)
    try {
      await updateChatTitle(id, title)
    } catch {
      setChats(prev)
      toast({ title: "Failed to update title", status: "error" })
    }
  }

  const deleteChat = async (
    id: string,
    currentChatId?: string,
    redirect?: () => void
  ) => {
    const prev = [...chats]
    setChats((prev) => prev.filter((c) => c.id !== id))

    try {
      await deleteChatFromDb(id)
      if (id === currentChatId && redirect) redirect()
    } catch {
      setChats(prev)
      toast({ title: "Failed to delete chat", status: "error" })
    }
  }

  const createNewChat = async (
    userId: string,
    title?: string,
    model?: string,
    isAuthenticated?: boolean,
    systemPrompt?: string,
    projectId?: string,
    userRole?: "general" | "doctor" | "medical_student"
  ) => {
    if (!userId) return
    const prev = [...chats]

    // CRITICAL: Check if chat with same title/content already exists to prevent duplicates
    // This prevents creating multiple chats when ensureChatExists is called multiple times
    const existingChat = chats.find(
      (c) => c.title === (title || "New Chat") && 
             c.user_id === userId &&
             Math.abs(new Date(c.created_at).getTime() - Date.now()) < 5000 // Created within last 5 seconds
    )
    
    if (existingChat && !existingChat.id.startsWith('optimistic-')) {
      console.log('[createNewChat] Chat with same title already exists, returning existing:', existingChat.id)
      return existingChat
    }

    const optimisticId = `optimistic-${Date.now().toString()}`
    
    // CRITICAL: Check if optimistic chat with same ID already exists
    const existingOptimistic = chats.find((c) => c.id === optimisticId)
    if (existingOptimistic) {
      console.log('[createNewChat] Optimistic chat already exists, skipping duplicate:', optimisticId)
      return existingOptimistic
    }
    
    const optimisticChat = {
      id: optimisticId,
      title: title || "New Chat",
      created_at: new Date().toISOString(),
      model: model || MODEL_DEFAULT,
      system_prompt: getSystemPromptByRole(userRole, systemPrompt),
      user_id: userId,
      public: true,
      updated_at: new Date().toISOString(),
      project_id: null,
    }
    
    // CRITICAL: Only add if it doesn't already exist
    setChats((prev) => {
      const exists = prev.some((c) => c.id === optimisticId)
      if (exists) {
        console.log('[createNewChat] Optimistic chat already in state, skipping')
        return prev
      }
      return [optimisticChat, ...prev]
    })

    try {
      const newChat = await createNewChatFromDb(
        userId,
        title,
        model,
        isAuthenticated,
        projectId
      )

      setChats((prev) => [
        newChat,
        ...prev.filter((c) => c.id !== optimisticId),
      ])

      return newChat
    } catch {
      setChats(prev)
      toast({ title: "Failed to create chat", status: "error" })
    }
  }

  const resetChats = async () => {
    setChats([])
  }

  const getChatById = (id: string) => {
    const chat = chats.find((c) => c.id === id)
    return chat
  }

  const updateChatModel = async (id: string, model: string) => {
    const prev = [...chats]
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, model } : c)))
    try {
      await updateChatModelFromDb(id, model)
    } catch {
      setChats(prev)
      toast({ title: "Failed to update model", status: "error" })
    }
  }

  const bumpChat = async (id: string) => {
    const prev = [...chats]
    const updatedChatWithNewUpdatedAt = prev.map((c) =>
      c.id === id ? { ...c, updated_at: new Date().toISOString() } : c
    )
    const sorted = updatedChatWithNewUpdatedAt.sort(
      (a, b) => +new Date(b.updated_at || "") - +new Date(a.updated_at || "")
    )
    setChats(sorted)
  }

  return (
    <ChatsContext.Provider
      value={{
        chats,
        refresh,
        updateTitle,
        deleteChat,
        setChats,
        createNewChat,
        resetChats,
        getChatById,
        updateChatModel,
        bumpChat,
        isLoading,
      }}
    >
      {children}
    </ChatsContext.Provider>
  )
}
