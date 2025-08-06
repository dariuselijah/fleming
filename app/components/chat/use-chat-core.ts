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
import { useStreaming } from "./use-streaming"

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

  // Enhanced streaming management
  const {
    streamingState,
    startStreaming,
    processChunk,
    stopStreaming,
    getStreamingMetrics,
    optimizeStreaming,
    getStreamingConfig,
  } = useStreaming()

  // Ref to track current optimistic message to prevent duplicates
  const currentOptimisticRef = useRef<string | null>(null)
  const processedMessageIds = useRef(new Set<string>())

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

    // Stop streaming on error
    stopStreaming()

    toast({
      title: errorMsg,
      status: "error",
    })
  }, [stopStreaming])

  // Initialize useChat with enhanced streaming support
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
    onFinish: () => {
      // Enhanced finish handling with streaming metrics
      const metrics = getStreamingMetrics()
      console.log("=== CHAT FINISHED WITH METRICS ===")
      console.log("Streaming metrics:", metrics)
      stopStreaming()
    },
    onResponse: (response) => {
      // Start streaming tracking when response begins
      if (input.trim()) {
        startStreaming(input)
      }
    },
  })

  // Enhanced stop function
  const enhancedStop = useCallback(() => {
    console.log("=== STOP CALLED ===")
    stop()
    stopStreaming()
    setIsSubmitting(false)
    currentOptimisticRef.current = null
    processedMessageIds.current.clear()
  }, [stop, stopStreaming])

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
      // Clear processed message IDs when chat changes
      processedMessageIds.current.clear()
    }
    prevChatIdRef.current = chatId
  }, [chatId, messages.length, setMessages])

  // Cleanup processed message IDs when component unmounts or chat changes
  useEffect(() => {
    return () => {
      processedMessageIds.current.clear()
      currentOptimisticRef.current = null
    }
  }, [chatId])

  // Cleanup duplicate messages that might be added by AI SDK
  useEffect(() => {
    if (messages.length > 0) {
      const seenIds = new Set<string>()
      const seenContents = new Set<string>()
      let hasDuplicates = false
      
      const cleanedMessages = messages.filter(msg => {
        // Check for duplicate IDs
        if (seenIds.has(msg.id)) {
          console.log("=== REMOVING DUPLICATE ID ===", msg.id)
          hasDuplicates = true
          return false
        }
        seenIds.add(msg.id)
        
        // Check for duplicate content (for user messages)
        if (msg.role === "user") {
          const contentKey = `${msg.role}-${msg.content}`
          if (seenContents.has(contentKey)) {
            console.log("=== REMOVING DUPLICATE CONTENT ===", msg.content)
            hasDuplicates = true
            return false
          }
          seenContents.add(contentKey)
        }
        
        return true
      })
      
      if (hasDuplicates) {
        console.log("=== CLEANING DUPLICATE MESSAGES ===")
        setMessages(cleanedMessages)
      }
    }
  }, [messages, setMessages])

  // Enhanced submit action with streaming optimization
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
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID for client-side rendering
        role: "user",
        content: input,
        experimental_attachments: processedAttachments,
      }

      // Get optimized streaming configuration
      const streamingConfig = getStreamingConfig(input)
      console.log("=== STREAMING CONFIG FOR SUBMIT ===")
      console.log("Input:", input.substring(0, 100))
      console.log("Config:", streamingConfig)

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
          streamingConfig, // Pass streaming config to API
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
      stopStreaming() // Stop streaming on error
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
    getStreamingConfig,
    stopStreaming,
  ]);

  // Handle suggestion with streaming optimization
  const handleSuggestion = useCallback(
    async (suggestion: string) => {
      // Prevent multiple simultaneous calls
      if (isSubmitting) {
        console.log("=== SUGGESTION BLOCKED: Already submitting ===")
        return
      }
      
      // Check if we're already processing this exact suggestion
      if (currentOptimisticRef.current === suggestion) {
        console.log("=== SUGGESTION BLOCKED: Already processing this suggestion ===")
        return
      }
      
      setIsSubmitting(true)
      currentOptimisticRef.current = suggestion
      
      // Create a truly unique ID with multiple sources of randomness
      const timestamp = Date.now()
      const random1 = Math.random().toString(36).substr(2, 9)
      const random2 = Math.random().toString(36).substr(2, 9)
      const optimisticId = `optimistic-${timestamp}-${random1}-${random2}`
      
      // Check if this ID has already been processed
      if (processedMessageIds.current.has(optimisticId)) {
        console.log("=== SUGGESTION BLOCKED: Message ID already processed ===", optimisticId)
        setIsSubmitting(false)
        currentOptimisticRef.current = null
        return
      }
      
      // Add to processed set
      processedMessageIds.current.add(optimisticId)
      
      const optimisticMessage = {
        id: optimisticId,
        content: suggestion,
        role: "user" as const,
        createdAt: new Date(),
      }

      // Check if this exact suggestion is already being processed
      const existingOptimistic = messages.find(msg => 
        msg.role === "user" && 
        msg.content === suggestion && 
        msg.id.startsWith('optimistic-')
      )
      
      if (existingOptimistic) {
        console.log("=== SUGGESTION BLOCKED: Existing optimistic message found ===")
        setIsSubmitting(false)
        currentOptimisticRef.current = null
        processedMessageIds.current.delete(optimisticId)
        return
      }

      console.log("=== ADDING OPTIMISTIC MESSAGE ===", optimisticId)
      setMessages((prev) => {
        // Double-check for duplicates before adding
        const hasDuplicate = prev.some(msg => msg.id === optimisticId)
        if (hasDuplicate) {
          console.log("=== DUPLICATE DETECTED IN SETMESSAGES ===", optimisticId)
          return prev
        }
        return [...prev, optimisticMessage]
      })

      try {
        const uid = await getOrCreateGuestUserId(user)

        if (!uid) {
          setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId))
          currentOptimisticRef.current = null
          processedMessageIds.current.delete(optimisticId)
          return
        }

        const allowed = await checkLimitsAndNotify(uid)
        if (!allowed) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          currentOptimisticRef.current = null
          processedMessageIds.current.delete(optimisticId)
          return
        }

        const currentChatId = await ensureChatExists(uid, suggestion)
        if (!currentChatId) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          currentOptimisticRef.current = null
          processedMessageIds.current.delete(optimisticId)
          return
        }

        const processedAttachments = await handleFileUploads(uid, currentChatId)
        if (processedAttachments === null) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          currentOptimisticRef.current = null
          processedMessageIds.current.delete(optimisticId)
          return
        }

        const messageToSend: Message = {
          id: `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Different ID for API call
          role: "user",
          content: suggestion,
          experimental_attachments: processedAttachments,
        }

        // Get streaming config for suggestion
        const streamingConfig = getStreamingConfig(suggestion)

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
            streamingConfig,
          },
        }

        console.log("=== CALLING APPEND ===", optimisticId)
        
        // Check if this exact content already exists in messages
        const existingMessageWithSameContent = messages.find(msg => 
          msg.role === "user" && 
          msg.content === suggestion
        )
        
        if (existingMessageWithSameContent) {
          console.log("=== APPEND BLOCKED: Message with same content already exists ===")
          // Remove the optimistic message since the real message already exists
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          currentOptimisticRef.current = null
          processedMessageIds.current.delete(optimisticId)
          setIsSubmitting(false)
          return
        }
        
        // Use a try-catch around append to handle any AI SDK issues
        try {
          await append(messageToSend, options)
          console.log("=== APPEND SUCCESSFUL ===", optimisticId)
        } catch (appendError) {
          console.error("=== APPEND ERROR ===", appendError)
          // Remove the optimistic message on error
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          throw appendError
        }
        
        bumpChat(currentChatId)
      } catch (error) {
        console.error("Error in handleSuggestion:", error)
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        stopStreaming()
        toast({
          title: "An error occurred while processing the suggestion.",
          status: "error",
        })
      } finally {
        setIsSubmitting(false)
        currentOptimisticRef.current = null
        processedMessageIds.current.delete(optimisticId)
      }
    },
    [
      user,
      checkLimitsAndNotify,
      ensureChatExists,
      handleFileUploads,
      append,
      selectedModel,
      systemPrompt,
      enableSearch,
      bumpChat,
      setMessages,
      userPreferences,
      getStreamingConfig,
      stopStreaming,
      isSubmitting,
      messages,
    ]
  )

  // Enhanced reload with streaming optimization
  const handleReload = useCallback(async () => {
    try {
      // Get the last user message for streaming config
      const lastUserMessage = messages
        .filter((m) => m.role === "user")
        .pop()
      
      if (lastUserMessage?.content) {
        const streamingConfig = getStreamingConfig(lastUserMessage.content)
        console.log("=== RELOAD WITH STREAMING CONFIG ===")
        console.log("Config:", streamingConfig)
      }
      
      await reload()
    } catch (error) {
      console.error("Error in handleReload:", error)
      stopStreaming()
      toast({
        title: "An error occurred while reloading the conversation.",
        status: "error",
      })
    }
  }, [reload, messages, getStreamingConfig, stopStreaming])

  // Enhanced input change handler
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value)
    },
    [setInput]
  )

  return {
    messages,
    input,
    status,
    stop: enhancedStop,
    hasSentFirstMessageRef,
    isSubmitting,
    enableSearch,
    setEnableSearch,
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
    // Enhanced streaming state
    streamingState,
    getStreamingMetrics,
    optimizeStreaming,
  }
}
