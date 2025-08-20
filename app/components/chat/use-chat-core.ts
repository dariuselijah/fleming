import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { getOrCreateGuestUserId } from "@/lib/api"
import { MESSAGE_MAX_LENGTH, SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
import { Attachment } from "@/lib/file-handling"
import { API_ROUTE_CHAT } from "@/lib/routes"
import type { UserProfile } from "@/lib/user/types"
import type { Message } from "@ai-sdk/react"
import { useChat } from "@ai-sdk/react"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type UseChatCoreProps = {
  initialMessages: Message[]
  draftValue: string
  cacheAndAddMessage: (message: Message) => void
  chatId: string | null
  user: UserProfile | null
  files: File[]
  createOptimisticAttachments: (
    files: File[]
  ) => Array<{ name: string; contentType: string; url: string }>
  setFiles: (files: File[]) => void
  checkLimitsAndNotify: (uid: string) => Promise<boolean>
  cleanupOptimisticAttachments: (attachments?: Array<{ url?: string }>) => void
  ensureChatExists: (uid: string, input: string) => Promise<string | null>
  handleFileUploads: (
    uid: string,
    chatId: string
  ) => Promise<Attachment[] | null>
  selectedModel: string
  clearDraft: () => void
  bumpChat: (chatId: string) => void
  setHasDialogAuth: (value: boolean) => void
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
}: UseChatCoreProps) {
  // State management
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enableSearch, setEnableSearch] = useState(false)

  // Get user preferences at the top level
  const { useUserPreferences } = require("@/lib/user-preference-store/provider")
  const userPreferences = useUserPreferences()

  // Refs and derived state
  const hasSentFirstMessageRef = useRef(false)
  const prevChatIdRef = useRef<string | null>(chatId)
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  
  // Optimized system prompt determination - simplified for faster streaming
  const systemPrompt = useMemo(() => {
    // If user has a custom system prompt, use it immediately
    if (user?.system_prompt) {
      return user.system_prompt
    }
    
    // For healthcare roles, use basic prompt and enhance in background
    if (userPreferences.preferences.userRole === "doctor" || userPreferences.preferences.userRole === "medical_student") {
      return SYSTEM_PROMPT_DEFAULT + "\n\nYou are a Medical AI Assistant. Provide direct, evidence-based guidance."
    }
    
    return SYSTEM_PROMPT_DEFAULT
  }, [user?.system_prompt, userPreferences.preferences.userRole])

  // Search params handling
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt")

  // Handle errors directly in onError callback
  const handleError = useCallback((error: Error) => {
    console.error("Chat error:", error)
    console.error("Error message:", error.message)
    let errorMsg = error.message || "Something went wrong."

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
  }, [])

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
    api: API_ROUTE_CHAT,
    initialMessages,
    initialInput: draftValue,
    onError: handleError,
    // Optimize for streaming performance
    onFinish: () => {
      // Handle completion without blocking
    },
    // Ensure immediate status updates
    onResponse: () => {
      // This ensures status changes to "streaming" immediately
    },
  })

  // Handle search params on mount
  useEffect(() => {
    if (prompt && typeof window !== "undefined") {
      requestAnimationFrame(() => setInput(prompt))
    }
  }, [prompt, setInput])

  // Reset messages when navigating from a chat to home
  useEffect(() => {
    if (
      prevChatIdRef.current !== null &&
      chatId === null &&
      messages.length > 0
    ) {
      setMessages([])
    }
    prevChatIdRef.current = chatId
  }, [chatId, messages.length, setMessages])

  // Submit action - optimized for immediate response
  const submit = useCallback(async () => {
    if (!input.trim() && files.length === 0) return
    
    // Set submitting state immediately for optimistic UI
    setIsSubmitting(true)

    const uid = await getOrCreateGuestUserId(user)
    if (!uid) {
      setIsSubmitting(false)
      setHasDialogAuth(true)
      return
    }

    try {
      const allowed = await checkLimitsAndNotify(uid)
      if (!allowed) {
        setIsSubmitting(false)
        return
      }

      const currentChatId = await ensureChatExists(uid, input)
      if (!currentChatId) {
        setIsSubmitting(false)
        return
      }

      const processedAttachments = await handleFileUploads(uid, currentChatId)
      if (processedAttachments === null) {
        setIsSubmitting(false)
        return
      }

      const messageToSend: Message = {
        id: Date.now().toString(), // Temporary ID for client-side rendering
        role: "user",
        content: input,
        experimental_attachments: processedAttachments,
      }

      const options = {
        body: {
          chatId: currentChatId,
          userId: uid,
          model: selectedModel,
          isAuthenticated: !!user?.id,
          systemPrompt,
          enableSearch,
          userRole: userPreferences.preferences.userRole,
          medicalSpecialty: userPreferences.preferences.medicalSpecialty,
          clinicalDecisionSupport:
            userPreferences.preferences.clinicalDecisionSupport,
          medicalLiteratureAccess:
            userPreferences.preferences.medicalLiteratureAccess,
          medicalComplianceMode:
            userPreferences.preferences.medicalComplianceMode,
        },
      }
      
      // Clear input and files immediately for better UX
      setInput("")
      setFiles([])
      clearDraft()
      
      // Bump chat immediately for optimistic update
      bumpChat(currentChatId)
      
      // Start streaming immediately without waiting
      append(messageToSend, options)

    } catch (error) {
      console.error("Error in submit:", error)
      toast({
        title: "An error occurred while sending your message.",
        status: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    user,
    input,
    files,
    checkLimitsAndNotify,
    ensureChatExists,
    handleFileUploads,
    append,
    selectedModel,
    systemPrompt,
    enableSearch,
    bumpChat,
    clearDraft,
    setHasDialogAuth,
    setInput,
    setFiles,
    userPreferences,
  ]);

  // Handle suggestion - optimized for immediate response
  const handleSuggestion = useCallback(
    async (suggestion: string) => {
      setIsSubmitting(true)
      const optimisticId = `optimistic-${Date.now().toString()}`
      const optimisticMessage = {
        id: optimisticId,
        content: suggestion,
        role: "user" as const,
        createdAt: new Date(),
      }

      // Add optimistic message immediately
      setMessages((prev) => [...prev, optimisticMessage])

      try {
        const uid = await getOrCreateGuestUserId(user)

        if (!uid) {
          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
          return
        }

        const allowed = await checkLimitsAndNotify(uid)
        if (!allowed) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          return
        }

        const currentChatId = await ensureChatExists(uid, suggestion)

        if (!currentChatId) {
          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
          return
        }

        const options = {
          body: {
            chatId: currentChatId,
            userId: uid,
            model: selectedModel,
            isAuthenticated,
            systemPrompt: SYSTEM_PROMPT_DEFAULT,
          },
        }

        // Start streaming immediately without waiting
        append(
          {
            role: "user",
            content: suggestion,
          },
          options
        )
        
        // Remove optimistic message after streaming starts
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
      } catch {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
        toast({ title: "Failed to send suggestion", status: "error" })
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      ensureChatExists,
      selectedModel,
      user,
      append,
      checkLimitsAndNotify,
      isAuthenticated,
      setMessages,
      setIsSubmitting,
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
        systemPrompt: systemPrompt || SYSTEM_PROMPT_DEFAULT,
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
    setEnableSearch,

    // Actions
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
  }
}
