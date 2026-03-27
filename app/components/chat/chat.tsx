"use client"

import { ChatInput } from "@/app/components/chat-input/chat-input"
import { Conversation } from "@/app/components/chat/conversation"
import { useModel } from "@/app/components/chat/use-model"
import { useChatDraft } from "@/app/hooks/use-chat-draft"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { useChatSession } from "@/lib/chat-store/session/provider"
import { getSystemPromptByRole } from "@/lib/config"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import { normalizeMedicalStudentLearningMode } from "@/lib/medical-student-learning"
import type { CitationStyle } from "@/lib/citations/formatters"
import {
  normalizeClinicianWorkflowMode,
  type ClinicianWorkflowMode,
} from "@/lib/clinician-mode"
import {
  RUN_SAVED_QUESTION_EVENT,
  type RunSavedQuestionEventDetail,
} from "@/lib/saved-clinician-questions"
import { toast } from "@/components/ui/toast"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChatCore } from "./use-chat-core"
import { useChatOperations } from "./use-chat-operations"
import { useFileUpload } from "./use-file-upload"
import { PerformanceMonitor } from "./performance-monitor"
import { OnboardingDialog } from "../onboarding/onboarding-dialog"
import { HealthHomeSection } from "../health/health-home-section"

const FeedbackWidget = dynamic(
  () => import("./feedback-widget").then((mod) => mod.FeedbackWidget),
  { ssr: false }
)

const DialogAuth = dynamic(
  () => import("./dialog-auth").then((mod) => mod.DialogAuth),
  { ssr: false }
)

const RateLimitPaywall = dynamic(
  () => import("./rate-limit-paywall").then((mod) => mod.RateLimitPaywall),
  { ssr: false }
)

export function Chat() {
  const { chatId } = useChatSession()
  const {
    createNewChat,
    getChatById,
    updateChatModel,
    bumpChat,
    isLoading: isChatsLoading,
  } = useChats()

  const currentChat = useMemo(
    () => (chatId ? getChatById(chatId) : null),
    [chatId, getChatById]
  )

  const {
    messages: initialMessages,
    isLoading: isMessagesLoading,
    cacheAndAddMessage,
  } = useMessages()
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const { draftValue, clearDraft } = useChatDraft(chatId)
  
  // Track previous user state to detect login
  const prevUserRef = useRef(user)
  const isInitialMountRef = useRef(true)
  const pendingMessageRef = useRef<{
    content: string
    files: File[]
    selectedModel: string
    enableSearch: boolean
    enableEvidence: boolean
    learningMode: "ask" | "simulate" | "guideline"
    clinicianMode: ClinicianWorkflowMode
    artifactIntent?: "none" | "quiz"
    citationStyle?: CitationStyle
  } | null>(null)

  // File upload functionality
  const {
    files,
    setFiles,
    fileUploadSummary,
    handleFileUploads,
    createOptimisticAttachments,
    cleanupOptimisticAttachments,
    convertBlobUrlsToDataUrls,
    handleFileUpload,
    handleFileRemove,
    getFileStatus,
  } = useFileUpload()

  // Model selection
  const { selectedModel, handleModelChange } = useModel({
    currentChat: currentChat || null,
    user,
    updateChatModel,
    chatId,
  })

  // State to pass between hooks
  const [hasDialogAuth, setHasDialogAuth] = useState(false)
  const [hasRateLimitPaywall, setHasRateLimitPaywall] = useState(false)
  const [rateLimitWaitTime, setRateLimitWaitTime] = useState<number | null>(null)
  const [rateLimitType, setRateLimitType] = useState<"hourly" | "daily">("hourly")
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false)
  const isAuthenticated = useMemo(() => !!user?.id, [user?.id])
  
  // Show onboarding only after login/signup and when not yet completed.
  useEffect(() => {
    if (!preferences || !isAuthenticated) {
      return
    }
    setShowOnboardingDialog(!preferences.onboardingCompleted)
  }, [preferences, isAuthenticated])
  const systemPrompt = useMemo(
    () => getSystemPromptByRole(preferences?.userRole || "general", user?.system_prompt || undefined),
    [user?.system_prompt, preferences?.userRole]
  )

  // Chat operations (utils + handlers) - created first
  const { checkLimitsAndNotify, ensureChatExists, handleDelete, handleEdit } =
    useChatOperations({
      isAuthenticated,
      chatId,
      messages: initialMessages,
      selectedModel,
      systemPrompt,
      createNewChat,
      setHasDialogAuth,
      setMessages: () => {},
      setInput: () => {},
      bumpChat,
      setHasRateLimitPaywall,
      setRateLimitWaitTime,
      setRateLimitType,
    })

  // Core chat functionality (initialization + state + actions)
  const {
    messages,
    input,
    status,
    stop,
    streamIntroPreview,
    optimisticTaskBoard,
    hasSentFirstMessageRef,
    isSubmitting,
    enableSearch,
    setEnableSearch,
    enableEvidence,
    setEnableEvidence,
    learningMode,
    setLearningMode,
    clinicianMode,
    setClinicianMode,
    artifactIntent,
    citationStyle,
    setArtifactIntent,
    setCitationStyle,
    evidenceCitations,
    discussionInsights,
    submit,
    handleSuggestion,
    handleWorkflowSuggestion,
    handleReload,
    handleInputChange,
    addDrilldownInsightToDiscussion,
  } = useChatCore({
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
    convertBlobUrlsToDataUrls,
    selectedModel,
    clearDraft,
    bumpChat,
    setHasDialogAuth,
    setHasRateLimitPaywall,
    setRateLimitWaitTime,
    setRateLimitType,
  })

  // Helper function to send pending message - defined after useChatCore to access submit
  const sendPendingMessage = useCallback(() => {
    if (typeof window === 'undefined') return
    
    const pendingMessageStr = sessionStorage.getItem('pendingMessage')
    if (!pendingMessageStr) return
    
    try {
      const pendingMessage = JSON.parse(pendingMessageStr)
      
      // Store in ref for immediate access
      pendingMessageRef.current = {
        content: pendingMessage.content || '',
        files: [], // Files can't be serialized, user will need to re-upload if needed
        selectedModel: pendingMessage.selectedModel || selectedModel,
        enableSearch: pendingMessage.enableSearch ?? enableSearch,
        enableEvidence: pendingMessage.enableEvidence ?? enableEvidence,
        learningMode: normalizeMedicalStudentLearningMode(
          pendingMessage.learningMode
        ),
        clinicianMode: normalizeClinicianWorkflowMode(
          pendingMessage.clinicianMode
        ),
        artifactIntent: pendingMessage.artifactIntent === "quiz" ? "quiz" : "none",
        citationStyle:
          pendingMessage.citationStyle === "apa" ||
          pendingMessage.citationStyle === "vancouver"
            ? pendingMessage.citationStyle
            : "harvard",
      }
      
      // Set input from pending message
      handleInputChange(pendingMessage.content || '')
      
      // Restore search and evidence settings if they were set
      if (pendingMessage.enableSearch !== undefined) {
        setEnableSearch(pendingMessage.enableSearch)
      }
      if (pendingMessage.enableEvidence !== undefined) {
        setEnableEvidence(pendingMessage.enableEvidence)
      }
      if (pendingMessage.learningMode !== undefined) {
        setLearningMode(
          normalizeMedicalStudentLearningMode(pendingMessage.learningMode)
        )
      }
      if (pendingMessage.clinicianMode !== undefined) {
        setClinicianMode(
          normalizeClinicianWorkflowMode(pendingMessage.clinicianMode)
        )
      }
      if (pendingMessage.artifactIntent === "quiz") {
        setArtifactIntent(pendingMessage.artifactIntent)
      }
      if (
        pendingMessage.citationStyle === "harvard" ||
        pendingMessage.citationStyle === "apa" ||
        pendingMessage.citationStyle === "vancouver"
      ) {
        setCitationStyle(pendingMessage.citationStyle)
      }
      
      // Show notification if files were attached but can't be restored
      if (pendingMessage.hasFiles) {
        toast({
          title: "Message sent",
          description: "Note: Files need to be re-uploaded after login.",
          status: "info",
        })
      }
      
      // Clear pending message from storage
      sessionStorage.removeItem('pendingMessage')
      
      // Close auth dialog if open
      setHasDialogAuth(false)
      
      // Wait for state to update, then send
      // Use requestAnimationFrame to ensure React has processed state updates
      requestAnimationFrame(() => {
        setTimeout(() => {
          submit()
        }, 50)
      })
    } catch (error) {
      console.error('Error parsing pending message:', error)
      sessionStorage.removeItem('pendingMessage')
      pendingMessageRef.current = null
    }
  }, [
    submit,
    handleInputChange,
    setEnableSearch,
    setEnableEvidence,
    setLearningMode,
    setClinicianMode,
    setArtifactIntent,
    setCitationStyle,
    setHasDialogAuth,
    selectedModel,
    enableSearch,
    enableEvidence,
  ])
  
  // Check for pending message on mount (in case user returned from OAuth)
  useEffect(() => {
    if (isInitialMountRef.current && user?.id) {
      // User is authenticated on mount, check for pending message
      sendPendingMessage()
      isInitialMountRef.current = false
      prevUserRef.current = user
      return
    }
    
    // Skip on initial mount if no user
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevUserRef.current = user
      return
    }
    
    const prevUser = prevUserRef.current
    const currentUser = user
    
    // User just logged in (was null, now has id)
    if (!prevUser?.id && currentUser?.id) {
      sendPendingMessage()
    }
    
    // Update ref
    prevUserRef.current = currentUser
  }, [user, sendPendingMessage])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleRunSavedQuestion = (
      event: Event
    ) => {
      const customEvent = event as CustomEvent<RunSavedQuestionEventDetail>
      const detail = customEvent.detail
      if (!detail?.question?.prompt) return

      const prompt = detail.refreshMode
        ? `${detail.question.prompt}\n\nRefresh this answer with the latest evidence, highlight anything that would change management, and keep the output concise and actionable.`
        : detail.question.prompt

      if (status === "streaming") {
        stop()
      }

      setClinicianMode(detail.question.workflow)
      handleSuggestion(prompt)
    }

    window.addEventListener(
      RUN_SAVED_QUESTION_EVENT,
      handleRunSavedQuestion as EventListener
    )

    return () => {
      window.removeEventListener(
        RUN_SAVED_QUESTION_EVENT,
        handleRunSavedQuestion as EventListener
      )
    }
  }, [handleSuggestion, setClinicianMode, status, stop])

  // Memoize the conversation props to prevent unnecessary rerenders
  const conversationProps = useMemo(
    () => ({
      messages,
      status,
      isSubmitting,
      onDelete: handleDelete,
      onEdit: handleEdit,
      onReload: handleReload,
      onSuggestion: handleSuggestion,
      onWorkflowSuggestion: handleWorkflowSuggestion,
      onDrilldownInsightAdd: addDrilldownInsightToDiscussion,
      discussionInsightCount: discussionInsights.length,
      evidenceCitations,
      streamIntroPreview,
      optimisticTaskBoard,
    }),
    [
      messages,
      status,
      isSubmitting,
      handleDelete,
      handleEdit,
      handleReload,
      handleSuggestion,
      handleWorkflowSuggestion,
      addDrilldownInsightToDiscussion,
      discussionInsights.length,
      evidenceCitations,
      streamIntroPreview,
      optimisticTaskBoard,
    ]
  )

  // Memoize the chat input props
  const chatInputProps = useMemo(
    () => {
      // Show suggestions when there are no messages, regardless of chatId
      const shouldShowDoctorSuggestions = preferences.userRole === "doctor"
      const hasSuggestions =
        preferences.promptSuggestions &&
        messages.length === 0 &&
        (preferences.userRole !== "doctor" || shouldShowDoctorSuggestions)
      
      return {
        value: input,
        onSuggestion: handleSuggestion,
        onValueChange: handleInputChange,
        onSend: submit,
        isSubmitting,
        files,
        fileUploadSummary,
        getFileStatus,
        onFileUpload: handleFileUpload,
        onFileRemove: handleFileRemove,
        hasSuggestions,
        hasMessages: messages.length > 0,
        onSelectModel: handleModelChange,
        selectedModel,
        isUserAuthenticated: isAuthenticated,
        stop,
        status,
        setEnableSearch,
        enableSearch,
        setEnableEvidence,
        enableEvidence,
        learningMode,
        onLearningModeChange: setLearningMode,
        clinicianMode,
        onClinicianModeChange: setClinicianMode,
        artifactIntent,
        citationStyle,
        onArtifactIntentChange: setArtifactIntent,
        onCitationStyleChange: setCitationStyle,
      }
    },
    [
      input,
      handleSuggestion,
      handleInputChange,
      submit,
      isSubmitting,
      files,
      fileUploadSummary,
      getFileStatus,
      handleFileUpload,
      handleFileRemove,
      preferences.promptSuggestions,
      preferences.userRole,
      chatId,
      messages.length,
      handleModelChange,
      selectedModel,
      isAuthenticated,
      stop,
      status,
      setEnableSearch,
      enableSearch,
      setEnableEvidence,
      enableEvidence,
      learningMode,
      setLearningMode,
      clinicianMode,
      setClinicianMode,
      artifactIntent,
      citationStyle,
      setArtifactIntent,
      setCitationStyle,
    ]
  )

  // Track when we should prevent transient route changes due to recent chat creation
  const preventRedirectRef = useRef(false)
  const [chatIdChangedTime, setChatIdChangedTime] = useState<number | null>(null)
  
  // Track when chatId changes
  useEffect(() => {
    if (chatId) {
      setChatIdChangedTime(Date.now())
    }
  }, [chatId])
  
  // Don't redirect if:
  // - We're submitting a message (chat might be in the process of being created)
  // - We're streaming a response (status is streaming)
  // - We have messages (even if loading failed, we should show them)
  // - We've sent a message in this session
  // - The chatId is a temporary ID (chat being created)
  // - We're still loading chats (wait for background chat creation to complete)
  // - We just navigated to a new chat (give it time to load)
  const isTemporaryChat = chatId?.startsWith("temp-chat-")
  const hasMessages = messages.length > 0
  const isStreaming = status === "streaming"
  
  // Calculate time since chatId changed - CRITICAL to prevent immediate redirects
  const timeSinceChatIdChange = chatIdChangedTime ? Date.now() - chatIdChangedTime : Infinity
  const recentlyNavigated = timeSinceChatIdChange < 5000 // Within last 5 seconds
  
  // Check sessionStorage for sent message state
  const hasSentMessageInStorage = useMemo(() => {
    if (typeof window === 'undefined' || !chatId) return false
    return sessionStorage.getItem(`hasSentMessage:${chatId}`) === 'true'
  }, [chatId])
  
  // Check if messages are being migrated (stored in sessionStorage)
  const hasMigratedMessages = useMemo(() => {
    if (typeof window === 'undefined' || !chatId) return false
    return (
      sessionStorage.getItem(`pendingMessages:${chatId}`) !== null ||
      sessionStorage.getItem(`messages:${chatId}`) !== null
    )
  }, [chatId])
  
  // IMPORTANT: do not auto-redirect from an existing chat route.
  // Older chats may not be present in the in-memory chat list yet while message hydration is in-flight.

  // CRITICAL: Prevent hydration mismatch
  // Server always renders with messages.length === 0 (no sessionStorage access)
  // Client might restore messages from sessionStorage, causing mismatch
  // Solution: Always start with server state (no messages), then update after mount
  const [isMounted, setIsMounted] = useState(false)
  
  // CRITICAL: Initial state MUST match server (always true if no chatId)
  // Server has no access to sessionStorage, so it always renders with messages.length === 0
  const [showOnboarding, setShowOnboarding] = useState(!chatId)

  // Update after mount to reflect actual client state
  useEffect(() => {
    setIsMounted(true)
    // After mount, check actual state
    // CRITICAL: Only show onboarding if no chatId AND no messages
    // This prevents hydration mismatch because we start with server state
    setShowOnboarding(!chatId && messages.length === 0 && !isSubmitting)
  }, [chatId, messages.length, isSubmitting])
  
  // CRITICAL: Clear sessionStorage on home page to prevent stale messages
  useEffect(() => {
    if (typeof window !== 'undefined' && !chatId && isMounted) {
      // Clear all pending messages when on home page after mount
      sessionStorage.removeItem('pendingMessages:latest')
      const keys = Object.keys(sessionStorage)
      keys.forEach(key => {
        if (key.startsWith('pendingMessages:')) {
          sessionStorage.removeItem(key)
        }
      })
    }
  }, [chatId, isMounted])

  return (
    <>
      <div className={cn(
        "relative flex h-full w-full flex-col",
        showOnboarding
          ? "items-center justify-start px-2 pt-[calc(var(--spacing-app-header)+0.75rem)] sm:px-0 sm:pt-4"
          : "justify-end"
      )}>
        {showOnboarding ? (
          <>
            <div className="flex h-full w-full max-w-3xl min-h-0 flex-col pb-3 sm:pb-4">
              <div className="text-center">
                <h1 className="text-3xl font-medium tracking-tight">
                  What&apos;s on your mind?
                </h1>
              </div>
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 sm:mt-5">
                <HealthHomeSection
                  onJourneyPrompt={handleSuggestion}
                  userRole={preferences.userRole}
                  showWorkspaceLink={false}
                />
              </div>
              <div className="mt-4 sm:mt-5">
                <ChatInput {...chatInputProps} hasSuggestions={false} />
              </div>
            </div>
          </>
        ) : (
          <>
            <Conversation {...conversationProps} />
            <div className="w-full min-w-0 max-w-full px-2 sm:px-4">
              <ChatInput {...chatInputProps} />
            </div>
          </>
        )}
      </div>

      <DialogAuth open={hasDialogAuth} setOpen={setHasDialogAuth} />

      <RateLimitPaywall
        open={hasRateLimitPaywall}
        setOpen={setHasRateLimitPaywall}
        waitTimeSeconds={rateLimitWaitTime}
        limitType={rateLimitType}
      />

      <OnboardingDialog 
        open={showOnboardingDialog} 
        onComplete={() => {
          setShowOnboardingDialog(false)
        }}
      />

      <FeedbackWidget />
      
      {/* Performance Monitor for development */}
      <PerformanceMonitor />
    </>
  )
}
