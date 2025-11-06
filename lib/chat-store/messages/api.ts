import { createClient } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { loadAttachmentsWithSignedUrls } from "@/lib/file-handling"
import type { Message as MessageAISDK } from "ai"
import { readFromIndexedDB, writeToIndexedDB } from "../persist"

export async function getMessagesFromDb(
  chatId: string,
  retries = 3
): Promise<MessageAISDK[]> {
  // fallback to local cache only
  if (!isSupabaseEnabled) {
    const cached = await getCachedMessages(chatId)
    return cached
  }

  const supabase = createClient()
  if (!supabase) {
    // Fallback to cache if Supabase not available
    return await getCachedMessages(chatId)
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, content, role, experimental_attachments, created_at, parts, message_group_id, model"
        )
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })

      if (error) {
        throw error
      }

      if (!data) {
        // No messages found, return empty array
        return []
      }

      // Process messages and load fresh signed URLs for attachments
      const processedMessages = await Promise.all(
        data.map(async (message) => {
          let processedAttachments = message.experimental_attachments || []
          
          // If there are attachments, load fresh signed URLs
          if (processedAttachments.length > 0) {
            try {
              processedAttachments = await loadAttachmentsWithSignedUrls(
                processedAttachments.map(a => ({ ...a, name: a.name || "", contentType: a.contentType || "" }))
              )
            } catch (error) {
              console.error("Error loading attachments with signed URLs:", error)
              // Keep original attachments if signed URL generation fails
            }
          }

          return {
            ...message,
            id: String(message.id),
            content: message.content ?? "",
            createdAt: new Date(message.created_at || ""),
            parts: (message?.parts as MessageAISDK["parts"]) || undefined,
            message_group_id: message.message_group_id,
            model: message.model,
            experimental_attachments: processedAttachments,
          }
        })
      )

      return processedMessages
    } catch (error) {
      console.error(`[getMessagesFromDb] Attempt ${attempt}/${retries} failed:`, error)
      if (attempt === retries) {
        console.error("[getMessagesFromDb] All retry attempts failed, falling back to cache")
        // Fallback to cache on final failure
        return await getCachedMessages(chatId)
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100))
    }
  }
  
  // Should never reach here, but fallback to cache
  return await getCachedMessages(chatId)
}

async function insertMessageToDb(chatId: string, message: MessageAISDK, retries = 3): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // CRITICAL: Handle createdAt - it might be a Date object or a string (from sessionStorage)
      let createdAt: string
      if (message.createdAt) {
        if (typeof message.createdAt === 'string') {
          // Already a string (from JSON serialization), use it directly
          createdAt = message.createdAt
        } else if (message.createdAt instanceof Date) {
          // Date object, convert to ISO string
          createdAt = message.createdAt.toISOString()
        } else {
          // Fallback to current date
          createdAt = new Date().toISOString()
        }
      } else {
        createdAt = new Date().toISOString()
      }

      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        role: message.role,
        content: message.content,
        experimental_attachments: message.experimental_attachments,
        created_at: createdAt,
        message_group_id: (message as any).message_group_id || null,
        model: (message as any).model || null,
      })

      if (error) {
        throw error
      }
      return true
    } catch (error) {
      console.error(`[insertMessageToDb] Attempt ${attempt}/${retries} failed:`, error)
      if (attempt === retries) {
        console.error("[insertMessageToDb] All retry attempts failed")
        return false
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100))
    }
  }
  return false
}

async function insertMessagesToDb(chatId: string, messages: MessageAISDK[], retries = 3): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false

  if (messages.length === 0) return true

  const payload = messages.map((message) => {
    // CRITICAL: Handle createdAt - it might be a Date object or a string (from sessionStorage)
    let createdAt: string
    if (message.createdAt) {
      if (typeof message.createdAt === 'string') {
        // Already a string (from JSON serialization), use it directly
        createdAt = message.createdAt
      } else if (message.createdAt instanceof Date) {
        // Date object, convert to ISO string
        createdAt = message.createdAt.toISOString()
      } else {
        // Fallback to current date
        createdAt = new Date().toISOString()
      }
    } else {
      createdAt = new Date().toISOString()
    }

    return {
      chat_id: chatId,
      role: message.role,
      content: message.content,
      experimental_attachments: message.experimental_attachments,
      created_at: createdAt,
      message_group_id: (message as any).message_group_id || null,
      model: (message as any).model || null,
    }
  })

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabase.from("messages").insert(payload)
      if (error) {
        throw error
      }
      return true
    } catch (error) {
      console.error(`[insertMessagesToDb] Attempt ${attempt}/${retries} failed:`, error)
      if (attempt === retries) {
        console.error("[insertMessagesToDb] All retry attempts failed")
        return false
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100))
    }
  }
  return false
}

async function deleteMessagesFromDb(chatId: string) {
  const supabase = createClient()
  if (!supabase) return

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("chat_id", chatId)

  if (error) {
    console.error("Failed to clear messages from database:", error)
  }
}

type ChatMessageEntry = {
  id: string
  messages: MessageAISDK[]
}

export async function getCachedMessages(
  chatId: string
): Promise<MessageAISDK[]> {
  const entry = await readFromIndexedDB<ChatMessageEntry>("messages", chatId)

  if (!entry || Array.isArray(entry)) return []

  return (entry.messages || []).sort(
    (a, b) => +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0)
  )
}

export async function cacheMessages(
  chatId: string,
  messages: MessageAISDK[]
): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages })
}

export async function addMessage(
  chatId: string,
  message: MessageAISDK
): Promise<void> {
  await insertMessageToDb(chatId, message)
  const current = await getCachedMessages(chatId)
  const updated = [...current, message]

  await writeToIndexedDB("messages", { id: chatId, messages: updated })
}

export async function setMessages(
  chatId: string,
  messages: MessageAISDK[]
): Promise<void> {
  // Save to IndexedDB first (fast, local)
  await writeToIndexedDB("messages", { id: chatId, messages })
  
  // Save to Supabase in background (slower, persistent)
  Promise.resolve().then(async () => {
    try {
      const success = await insertMessagesToDb(chatId, messages)
      if (!success) {
        console.warn("[setMessages] Failed to save messages to database, but cached locally")
      }
    } catch (error) {
      console.error("[setMessages] Error saving messages to database:", error)
      // Don't throw - messages are already cached locally
    }
  })
}

// New function for incremental message saving during streaming
export async function saveMessageIncremental(
  chatId: string,
  message: MessageAISDK
): Promise<void> {
  if (!chatId || chatId.startsWith("temp-chat-") || chatId === "temp") {
    // Skip saving for temp chats
    return
  }

  // CRITICAL: Check if message already exists to prevent duplicates
  try {
    const current = await getCachedMessages(chatId)
    const messageExists = current.some(m => m.id === message.id)
    if (messageExists) {
      console.log('[saveMessageIncremental] Message already exists, skipping:', message.id)
      return
    }
  } catch (error) {
    console.error("[saveMessageIncremental] Failed to check cached messages:", error)
  }

  // Save to IndexedDB immediately (fast)
  try {
    const current = await getCachedMessages(chatId)
    const updated = [...current, message]
    await writeToIndexedDB("messages", { id: chatId, messages: updated })
  } catch (error) {
    console.error("[saveMessageIncremental] Failed to cache message:", error)
  }

  // Save to Supabase in background (slower, but important for persistence)
  // CRITICAL: Check database for duplicates before inserting
  Promise.resolve().then(async () => {
    try {
      // Check if message already exists in database (by message_group_id or content)
      const supabase = createClient()
      if (supabase && (message as any).message_group_id) {
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("chat_id", chatId)
          .eq("message_group_id", (message as any).message_group_id)
          .eq("role", message.role)
          .limit(1)
        
        if (existing && existing.length > 0) {
          console.log('[saveMessageIncremental] Message already exists in DB, skipping:', (message as any).message_group_id)
          return
        }
      }
      
      const success = await insertMessageToDb(chatId, message)
      if (!success) {
        console.warn("[saveMessageIncremental] Failed to save message to database, will retry later")
      }
    } catch (error) {
      console.error("[saveMessageIncremental] Error saving message to database:", error)
      // Don't throw - message is already cached locally
    }
  })
}

export async function clearMessagesCache(chatId: string): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages: [] })
}

export async function clearMessagesForChat(chatId: string): Promise<void> {
  await deleteMessagesFromDb(chatId)
  await clearMessagesCache(chatId)
}
