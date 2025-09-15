import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { toast } from "@/components/ui/toast"
import { getOrCreateGuestUserId } from "@/lib/api"
import { MESSAGE_MAX_LENGTH, getSystemPromptByRole } from "@/lib/config"
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
    chatId: string,
    isAuthenticated?: boolean
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

    // Store input and files for async processing
    const currentInput = input
    const currentFiles = [...files]
    
    // Clear input and files immediately for better UX
    setInput("")
    setFiles([])
    clearDraft()

    try {
      const uid = await getOrCreateGuestUserId(user)
      if (!uid) {
        setIsSubmitting(false)
        setHasDialogAuth(true)
        return
      }

      const allowed = await checkLimitsAndNotify(uid)
      if (!allowed) {
        setIsSubmitting(false)
        return
      }

      // Start streaming immediately with the message
      const options = {
        body: {
          chatId: chatId || "temp", // Use existing chatId or temp for immediate streaming
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
     
      // Append message with processed attachments (or none if upload failed)
      append({
        role: "user",
        content: currentInput,
        experimental_attachments: undefined,  // Files added later if successful
      }, options)
         
      // Handle file uploads first if there are files
      let processedAttachments: Attachment[] | null = null
      if (currentFiles.length > 0) {
        try {
          const currentChatId = await ensureChatExists(uid, currentInput)
          if (currentChatId) {
            // Update chatId if it changed
            if (currentChatId !== chatId) {
              bumpChat(currentChatId)
            }
            
            // Upload files before sending message
            processedAttachments = await handleFileUploads(uid, currentChatId, !!user?.id)
            console.log("File uploads completed:", processedAttachments?.length || 0, "files")
          }
        } catch (error) {
          console.error("File upload failed:", error)
          toast({
            title: "File upload failed",
            description: "Your message was sent, but files couldn't be uploaded.",
            status: "warning",
          })
        }
      }

      // Append message with processed attachments (or none if upload failed)
      //append({
      //  role: "user",
      //  content: currentInput,
      //  experimental_attachments: processedAttachments || undefined,
      //}, options)

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
    chatId,
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

      // Start streaming immediately for instant feedback
      const options = {
        body: {
          chatId: chatId || "temp", // Use existing chatId or temp for immediate streaming
          userId: "temp", // Will be updated in background
          model: selectedModel,
          isAuthenticated,
          systemPrompt: getSystemPromptByRole(userPreferences.preferences.userRole),
        },
      }

      // Append message immediately
      append(
        {
          role: "user",
          content: suggestion,
        },
        options
      )

      try {
        const uid = await getOrCreateGuestUserId(user)
        if (!uid) {
          return
        }

        const allowed = await checkLimitsAndNotify(uid)
        if (!allowed) {
          return
        }

        const currentChatId = await ensureChatExists(uid, suggestion)
        if (currentChatId && currentChatId !== chatId) {
          bumpChat(currentChatId)
        }
      } catch {
        toast({ title: "Failed to send suggestion", status: "error" })
      } finally {
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
    setEnableSearch,

    // Actions
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
  }
}
