import { toast } from "@/components/ui/toast"
import { checkRateLimits } from "@/lib/api"
import type { Chats } from "@/lib/chat-store/types"
import { REMAINING_QUERY_ALERT_THRESHOLD } from "@/lib/config"
import { Message } from "@ai-sdk/react"
import { useRouter } from "next/navigation"
import { startTransition, useCallback, useRef } from "react"

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
  setHasRateLimitPaywall?: (value: boolean) => void
  setRateLimitWaitTime?: (value: number | null) => void
  setRateLimitType?: (value: "hourly" | "daily") => void
}

export function useChatOperations({
  isAuthenticated,
  chatId,
  messages: _messages,
  selectedModel,
  systemPrompt,
  createNewChat,
  setHasDialogAuth,
  setMessages: _setMessages,
  setInput: _setInput,
  bumpChat,
  setHasRateLimitPaywall,
  setRateLimitWaitTime,
  setRateLimitType,
}: UseChatOperationsProps) {
  const router = useRouter()
  const chatCreationPromiseRef = useRef<Promise<string | null> | null>(null)

  // Chat utilities
  const checkLimitsAndNotify = async (uid: string) => {
    try {
      const rateData = await checkRateLimits(uid, isAuthenticated)

      // Check hourly rate limit first (ChatGPT-style)
      if (rateData.remainingHourly !== undefined && rateData.remainingHourly <= 0) {
        if (setHasRateLimitPaywall && setRateLimitWaitTime && setRateLimitType) {
          setRateLimitWaitTime(rateData.waitTimeSeconds || null)
          setRateLimitType("hourly")
          setHasRateLimitPaywall(true)
        }
        return false
      }

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

  const ensureChatExists = async (
    userId: string,
    input: string,
    options?: { navigate?: boolean }
  ) => {
    const chatIdFromUrl =
      typeof window !== "undefined" && window.location.pathname.startsWith("/c/")
        ? window.location.pathname.split("/c/")[1]
        : null
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : null

    const hasPersistentChatId = (value: string | null | undefined) =>
      Boolean(value && value !== "temp" && !value.startsWith("temp-chat-"))

    if (hasPersistentChatId(chatIdFromUrl)) {
      return chatIdFromUrl as string
    }

    if (hasPersistentChatId(chatId)) {
      return chatId as string
    }

    if (!isAuthenticated) {
      const storedGuestChatId =
        typeof window !== "undefined" ? localStorage.getItem("guestChatId") : null
      if (storedGuestChatId) return storedGuestChatId
      return `temp-chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    }

    if (chatCreationPromiseRef.current) {
      return await chatCreationPromiseRef.current
    }

    chatCreationPromiseRef.current = (async () => {
      try {
        const newChat = await createNewChat(
          userId,
          input,
          selectedModel,
          isAuthenticated,
          systemPrompt
        )

        if (!newChat?.id) return null

        const newChatId = newChat.id

        if (typeof window !== "undefined") {
          sessionStorage.setItem(`hasSentMessage:${newChatId}`, "true")
          window.dispatchEvent(
            new CustomEvent("chatCreated", {
              detail: { chatId: newChatId },
            })
          )
        }

        if (bumpChat) {
          await bumpChat(newChatId)
        }

        const shouldNavigate = options?.navigate ?? true
        const expectedPath = `/c/${newChatId}`
        if (shouldNavigate && currentPath !== expectedPath) {
          startTransition(() => {
            router.replace(expectedPath, { scroll: false })
          })
        }

        return newChatId
      } catch (err) {
        console.error("[ensureChatExists] Failed to create chat:", err)
        return null
      }
    })()

    try {
      return await chatCreationPromiseRef.current
    } finally {
      chatCreationPromiseRef.current = null
    }
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
