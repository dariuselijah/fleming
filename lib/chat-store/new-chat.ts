function chatIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname || !pathname.startsWith("/c/")) return null
  const [, , chatId] = pathname.split("/")
  return chatId || null
}

export function resetChatClientState(pathname?: string | null) {
  if (typeof window === "undefined") return

  const local = window.localStorage
  const session = window.sessionStorage
  const activeChatId = chatIdFromPathname(pathname ?? window.location.pathname)

  local.removeItem("chatDraft")
  session.removeItem("pendingMessages:latest")
  session.removeItem("evidenceCitations:latest")
  session.removeItem("pendingMessage")

  if (activeChatId) {
    session.removeItem(`hasSentMessage:${activeChatId}`)
    session.removeItem(`messages:${activeChatId}`)
    session.removeItem(`pendingMessages:${activeChatId}`)
    session.removeItem(`evidenceCitations:${activeChatId}`)
    session.removeItem(`topicContext:${activeChatId}`)
  }

  if ((window as any).__lastMessagesForMigration) {
    delete (window as any).__lastMessagesForMigration
  }

  window.dispatchEvent(
    new CustomEvent("resetChatState", {
      detail: { reason: "new-chat", chatId: activeChatId },
    })
  )
}
