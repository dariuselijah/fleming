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
import { toast } from "@/components/ui/toast"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import { redirect } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChatCore } from "./use-chat-core"
import { useChatOperations } from "./use-chat-operations"
import { useFileUpload } from "./use-file-upload"
import { PerformanceMonitor } from "./performance-monitor"
import { OnboardingDialog } from "../onboarding/onboarding-dialog"

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

  const { messages: initialMessages, cacheAndAddMessage } = useMessages()
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
  } | null>(null)

  // File upload functionality
  const {
    files,
    setFiles,
    handleFileUploads,
    createOptimisticAttachments,
    cleanupOptimisticAttachments,
    handleFileUpload,
    handleFileRemove,
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
  const onboardingShownRef = useRef(false)
  const lastUserIdRef = useRef<string | undefined>(user?.id)
  
  // Reset onboarding shown ref when user changes
  useEffect(() => {
    if (lastUserIdRef.current !== user?.id) {
      onboardingShownRef.current = false
      lastUserIdRef.current = user?.id
    }
  }, [user?.id])
  
  // Check if onboarding dialog should be shown (only once per user)
  useEffect(() => {
    // If already completed, don't show
    if (preferences?.onboardingCompleted) {
      setShowOnboardingDialog(false)
      onboardingShownRef.current = true // Mark as shown to prevent future attempts
      return
    }
    
    // If already shown in this session for this user, don't show again
    if (onboardingShownRef.current) {
      return
    }
    
    // Show only if authenticated, preferences are loaded, and not completed
    if (isAuthenticated && preferences && !preferences.onboardingCompleted) {
      // Mark as shown to prevent showing again
      onboardingShownRef.current = true
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        setShowOnboardingDialog(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, preferences])
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
    hasSentFirstMessageRef,
    isSubmitting,
    enableSearch,
    setEnableSearch,
    enableEvidence,
    setEnableEvidence,
    evidenceCitations,
    submit,
    handleSuggestion,
    handleReload,
    handleInputChange,
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
  }, [submit, handleInputChange, setEnableSearch, setEnableEvidence, setHasDialogAuth, selectedModel, enableSearch, enableEvidence])
  
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

  // Memoize the conversation props to prevent unnecessary rerenders
  const conversationProps = useMemo(
    () => ({
      messages,
      status,
      onDelete: handleDelete,
      onEdit: handleEdit,
      onReload: handleReload,
      evidenceCitations,
    }),
    [messages, status, handleDelete, handleEdit, handleReload, evidenceCitations]
  )

  // Memoize the chat input props
  const chatInputProps = useMemo(
    () => {
      // Show suggestions when there are no messages, regardless of chatId
      const hasSuggestions = preferences.promptSuggestions && messages.length === 0
      
      return {
        value: input,
        onSuggestion: handleSuggestion,
        onValueChange: handleInputChange,
        onSend: submit,
        isSubmitting,
        files,
        onFileUpload: handleFileUpload,
        onFileRemove: handleFileRemove,
        hasSuggestions,
        onSelectModel: handleModelChange,
        selectedModel,
        isUserAuthenticated: isAuthenticated,
        stop,
        status,
        setEnableSearch,
        enableSearch,
        setEnableEvidence,
        enableEvidence,
      }
    },
    [
      input,
      handleSuggestion,
      handleInputChange,
      submit,
      isSubmitting,
      files,
      handleFileUpload,
      handleFileRemove,
      preferences.promptSuggestions,
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
    ]
  )

  // Handle redirect for invalid chatId - only redirect if we're certain the chat doesn't exist
  // and we're not in a transient state during chat creation
  // Track when we should prevent redirect due to recent chat creation
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
    return sessionStorage.getItem(`messages:${chatId}`) !== null
  }, [chatId])
  
  // Only redirect in very specific circumstances - avoid redirecting after sending a message or recent navigation
  const shouldRedirect = 
    chatId &&
    !isChatsLoading &&
    !currentChat &&
    !isSubmitting &&
    status === "ready" &&
    !hasMessages &&
    !hasSentFirstMessageRef?.current &&
    !hasSentMessageInStorage &&
    !isTemporaryChat &&
    !isStreaming &&
    !preventRedirectRef.current &&
    !recentlyNavigated && // CRITICAL: Don't redirect if we just navigated to this chat
    !hasMigratedMessages // CRITICAL: Don't redirect if messages are being migrated
  
  if (shouldRedirect) {
    console.log("[REDIRECT] Redirecting because:", {
      chatId,
      isChatsLoading,
      currentChat: !!currentChat,
      isSubmitting,
      status,
      hasMessages,
      hasSentFirstMessage: hasSentFirstMessageRef?.current,
      hasSentMessageInStorage,
      isTemporaryChat,
      isStreaming,
      recentlyNavigated,
      hasMigratedMessages,
      timeSinceChatIdChange: timeSinceChatIdChange.toFixed(0) + 'ms'
    })
    return redirect("/")
  }

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
    setShowOnboarding(!chatId && messages.length === 0)
  }, [chatId, messages.length])
  
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
        showOnboarding ? "items-center justify-center" : "justify-end"
      )}>
        {showOnboarding ? (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-medium tracking-tight">
                What&apos;s on your mind?
              </h1>
            </div>
            <div className="w-full max-w-3xl">
              <ChatInput {...chatInputProps} />
            </div>
          </>
        ) : (
          <>
            <Conversation {...conversationProps} />
            <div className="w-full">
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
          // Mark as shown to prevent showing again
          onboardingShownRef.current = true
        }}
      />

      <FeedbackWidget />
      
      {/* Performance Monitor for development */}
      <PerformanceMonitor />
    </>
  )
}
