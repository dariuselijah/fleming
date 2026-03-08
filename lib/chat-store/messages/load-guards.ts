export function shouldApplyHydrationResult(params: {
  cancelled: boolean
  activeToken: number
  requestToken: number
  activeChatId: string | null
  requestChatId: string | null
}): boolean {
  const { cancelled, activeToken, requestToken, activeChatId, requestChatId } = params
  return !cancelled && activeToken === requestToken && activeChatId === requestChatId
}
