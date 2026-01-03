import { saveFinalAssistantMessage } from "@/app/api/chat/db"
import type {
  ChatApiParams,
  LogUserMessageParams,
  StoreAssistantMessageParams,
  SupabaseClientType,
} from "@/app/types/api.types"
import { FREE_MODELS_IDS, NON_AUTH_ALLOWED_MODELS } from "@/lib/config"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import { sanitizeUserInput } from "@/lib/sanitize"
import { validateUserIdentity } from "@/lib/server/api"
import { checkUsageByModel, incrementUsage } from "@/lib/usage"
import { getEffectiveApiKey, type ProviderWithoutOllama } from "@/lib/user-keys"
import { encryptMessage, isEncryptionEnabled } from "@/lib/encryption"

export async function validateAndTrackUsage({
  userId,
  model,
  isAuthenticated,
}: ChatApiParams): Promise<SupabaseClientType | null> {
  const supabase = await validateUserIdentity(userId, isAuthenticated)
  if (!supabase) return null

  // Check if user is authenticated
  if (!isAuthenticated) {
    // For unauthenticated users, only allow specific models
    if (!NON_AUTH_ALLOWED_MODELS.includes(model)) {
      throw new Error(
        "This model requires authentication. Please sign in to access more models."
      )
    }
  } else {
    // For authenticated users, check API key requirements
    const provider = getProviderForModel(model)

    // Check for effective API key (user key OR environment key)
    const effectiveApiKey = await getEffectiveApiKey(
      userId,
      provider as ProviderWithoutOllama
    )

    // If no API key (user or env) and model is not in free list, deny access
    if (!effectiveApiKey && !FREE_MODELS_IDS.includes(model)) {
      throw new Error(
        `This model requires an API key for ${provider}. Please add your API key in settings or use a free model.`
      )
    }
  }

  // Check usage limits for the model
  await checkUsageByModel(supabase, userId, model, isAuthenticated)

  return supabase
}

export async function incrementMessageCount({
  supabase,
  userId,
}: {
  supabase: SupabaseClientType
  userId: string
}): Promise<void> {
  if (!supabase) return

  try {
    await incrementUsage(supabase, userId)
  } catch (err) {
    console.error("Failed to increment message count:", err)
    // Don't throw error as this shouldn't block the chat
  }
}

export async function logUserMessage({
  supabase,
  userId,
  chatId,
  content,
  attachments,
  model,
  isAuthenticated,
  message_group_id,
}: LogUserMessageParams): Promise<void> {
  if (!supabase) return

  // CRITICAL: Check if user message with this message_group_id already exists
  // This prevents duplicate saves when onFinish is called multiple times
  if (message_group_id) {
    const { data: existingMessages, error: checkError } = await supabase
      .from("messages")
      .select("id")
      .eq("chat_id", chatId)
      .eq("message_group_id", message_group_id)
      .eq("role", "user")
      .limit(1)

    if (checkError) {
      console.error("Error checking for existing user message:", checkError)
      // Continue anyway - better to have duplicate than lose message
    } else if (existingMessages && existingMessages.length > 0) {
      console.log("User message already exists for message_group_id:", message_group_id, "- skipping save")
      return
    }
  }

  // Encrypt message content before storing (if encryption is enabled)
  const sanitizedContent = sanitizeUserInput(content)
  let encryptedContent = sanitizedContent
  let contentIv: string | null = null

  if (isEncryptionEnabled() && sanitizedContent) {
    const encrypted = encryptMessage(sanitizedContent)
    encryptedContent = encrypted.encrypted
    contentIv = encrypted.iv
    console.log("🔒 User message encrypted before storage")
  }

  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: encryptedContent,
    content_iv: contentIv,
    experimental_attachments: attachments,
    user_id: userId,
    message_group_id,
  } as any) // Type assertion needed for content_iv column

  if (error) {
    console.error("Error saving user message:", error)
  }
}

export async function storeAssistantMessage({
  supabase,
  chatId,
  messages,
  message_group_id,
  model,
  evidenceCitations,
}: StoreAssistantMessageParams & { evidenceCitations?: any[] }): Promise<void> {
  if (!supabase) return
  try {
    await saveFinalAssistantMessage(
      supabase,
      chatId,
      messages,
      message_group_id,
      model,
      evidenceCitations
    )
  } catch (err) {
    console.error("Failed to save assistant messages:", err)
  }
}
