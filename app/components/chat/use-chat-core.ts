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
  const systemPrompt = useMemo(() => {
    console.log("=== SYSTEM PROMPT DETERMINATION ===")
    console.log("user?.system_prompt:", user?.system_prompt)
    console.log("userPreferences.preferences.userRole:", userPreferences.preferences.userRole)
    
    // If user has a custom system prompt, use it
    if (user?.system_prompt) {
      console.log("Using custom user system prompt")
      return user.system_prompt
    }
    
    // If user role is doctor, use healthcare system prompt
    if (userPreferences.preferences.userRole === "doctor") {
      console.log("User role is doctor - using healthcare system prompt")
      // Import the healthcare system prompt function
      const { getHealthcareSystemPromptServer } = require("@/lib/models/healthcare-agents")
      
      const healthcarePrompt = getHealthcareSystemPromptServer(
        userPreferences.preferences.userRole,
        userPreferences.preferences.medicalSpecialty,
        userPreferences.preferences.clinicalDecisionSupport,
        userPreferences.preferences.medicalLiteratureAccess,
        userPreferences.preferences.medicalComplianceMode
      )
      
      if (healthcarePrompt) {
        console.log("Healthcare system prompt generated successfully")
        return healthcarePrompt
      } else {
        console.log("Healthcare system prompt generation failed, using default")
      }
    }
    
    console.log("Using default system prompt")
    return SYSTEM_PROMPT_DEFAULT
  }, [user?.system_prompt, userPreferences.preferences.userRole])

  // Log system prompt on load
  useEffect(() => {
    console.log("=== SYSTEM PROMPT ON LOAD ===")
    console.log("user?.system_prompt:", user?.system_prompt)
    console.log("SYSTEM_PROMPT_DEFAULT length:", SYSTEM_PROMPT_DEFAULT.length)
    console.log("Final systemPrompt length:", systemPrompt.length)
    console.log("System prompt preview:", systemPrompt.substring(0, 200))
    console.log("=== END SYSTEM PROMPT ON LOAD ===")
  }, [systemPrompt, user?.system_prompt])

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

  // Initialize useChat
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

  // Submit action
  const submit = useCallback(async () => {
    console.log("=== SUBMIT ACTION TRIGGERED ===")
    if (!input.trim() && files.length === 0) return
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
      
      console.log("=== CALLING append ===");
      const appendPromise = append(messageToSend, options);
      
      setInput("");
      setFiles([]);
      clearDraft();

      await appendPromise;
      console.log("=== append CALLED ===");

      bumpChat(currentChatId);
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
    setIsSubmitting,
    setHasDialogAuth,
    setInput,
    setFiles,
    userPreferences,
  ]);

  // Handle suggestion
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

        append(
          {
            role: "user",
            content: suggestion,
          },
          options
        )
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

  // Handle input change - now with access to the real setInput function!
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
