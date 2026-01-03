import { createClient } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { loadAttachmentsWithSignedUrls } from "@/lib/file-handling"
import type { Message as MessageAISDK } from "ai"
import { readFromIndexedDB, writeToIndexedDB } from "../persist"
import { decryptMessage } from "@/lib/encryption"

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
          "id, content, content_iv, role, experimental_attachments, created_at, parts, message_group_id, model"
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

          // Decrypt message content if encrypted
          // Note: content_iv column may not exist in database yet (migration pending)
          let decryptedContent: string = ""
          try {
            // Ensure we have a valid string to work with
            const rawContent = message.content
            if (typeof rawContent === 'string') {
              decryptedContent = rawContent
            } else if (rawContent === null || rawContent === undefined) {
              decryptedContent = ""
            } else {
              // Handle unexpected types (convert to string)
              console.warn("[getMessagesFromDb] Unexpected content type, converting to string:", typeof rawContent)
              decryptedContent = String(rawContent)
            }

            // Try to get content_iv if it exists (using raw query or type assertion)
            const messageWithIv = message as any
            const contentIv = messageWithIv.content_iv
            if (contentIv && decryptedContent) {
              try {
                decryptedContent = decryptMessage(decryptedContent, contentIv)
                console.log("🔓 Message decrypted during retrieval")
              } catch (error) {
                console.error("Error decrypting message:", error)
                // If decryption fails, use original content (might be plaintext)
                // decryptedContent already contains the original value
              }
            }
          } catch (error) {
            // If content_iv column doesn't exist yet, content is plaintext
            // This is fine for backward compatibility
            // Ensure we have a fallback string
            if (!decryptedContent && message.content) {
              decryptedContent = typeof message.content === 'string' 
                ? message.content 
                : String(message.content || '')
            }
          }

          // Ensure content is always a string (not null, undefined, or object)
          // The AI SDK expects content to be string | ContentPart[], but we store it as string
          const normalizedContent = typeof decryptedContent === 'string' 
            ? decryptedContent 
            : (decryptedContent ? String(decryptedContent) : '')

          // Extract evidence citations from parts if available
          const parts = (message?.parts as MessageAISDK["parts"]) || undefined
          let evidenceCitations: any[] | undefined = undefined
          
          if (parts && Array.isArray(parts)) {
            const metadataPart = parts.find((p: any) => p.type === "metadata" && p.metadata?.evidenceCitations)
            if (metadataPart && metadataPart.metadata?.evidenceCitations) {
              evidenceCitations = metadataPart.metadata.evidenceCitations
              console.log(`📚 [LOAD] Found ${evidenceCitations.length} evidence citations in message ${message.id}`)
            }
          }

          return {
            ...message,
            id: String(message.id),
            content: normalizedContent,
            createdAt: new Date(message.created_at || ""),
            parts: parts,
            message_group_id: message.message_group_id,
            model: message.model,
            experimental_attachments: processedAttachments,
            // Store evidence citations in a custom field for easy access
            evidenceCitations: evidenceCitations,
          } as MessageAISDK & { evidenceCitations?: any[] }
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

      // CRITICAL: Include parts field to preserve evidence citations and other metadata
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        role: message.role,
        content: message.content,
        experimental_attachments: message.experimental_attachments,
        created_at: createdAt,
        message_group_id: (message as any).message_group_id || null,
        model: (message as any).model || null,
        parts: message.parts || null,
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

    // CRITICAL: Include parts field to preserve evidence citations and other metadata
    return {
      chat_id: chatId,
      role: message.role,
      content: message.content,
      experimental_attachments: message.experimental_attachments,
      created_at: createdAt,
      message_group_id: (message as any).message_group_id || null,
      model: (message as any).model || null,
      parts: message.parts || null,
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
  messages: MessageAISDK[],
  evidenceCitations?: any[]
): Promise<void> {
  // CRITICAL: Add evidence citations to assistant messages before saving
  const messagesWithCitations = messages.map((msg) => {
    if (msg.role === 'assistant' && evidenceCitations && evidenceCitations.length > 0) {
      return addEvidenceCitationsToMessage(msg, evidenceCitations)
    }
    return msg
  })
  
  if (evidenceCitations && evidenceCitations.length > 0) {
    console.log(`📚 [SET MESSAGES] Adding ${evidenceCitations.length} evidence citations to assistant messages`)
  }
  
  // Save to IndexedDB first (fast, local)
  await writeToIndexedDB("messages", { id: chatId, messages: messagesWithCitations })
  
  // Save to Supabase in background (slower, persistent)
  Promise.resolve().then(async () => {
    try {
      const success = await insertMessagesToDb(chatId, messagesWithCitations)
      if (!success) {
        console.warn("[setMessages] Failed to save messages to database, but cached locally")
      }
    } catch (error) {
      console.error("[setMessages] Error saving messages to database:", error)
      // Don't throw - messages are already cached locally
    }
  })
}

/**
 * Add evidence citations to message parts as metadata
 */
function addEvidenceCitationsToMessage(
  message: MessageAISDK,
  evidenceCitations?: any[]
): MessageAISDK {
  if (!evidenceCitations || evidenceCitations.length === 0) {
    return message
  }

  // Ensure parts array exists
  const parts = message.parts || []
  
  // Check if metadata part with citations already exists
  const existingMetadataIndex = parts.findIndex(
    (p: any) => p.type === "metadata" && p.metadata?.evidenceCitations
  )
  
  if (existingMetadataIndex >= 0) {
    // Update existing metadata part
    const updatedParts = [...parts]
    updatedParts[existingMetadataIndex] = {
      type: "metadata",
      metadata: {
        evidenceCitations: evidenceCitations,
      },
    }
    return { ...message, parts: updatedParts }
  } else {
    // Add new metadata part
    const metadataPart: any = {
      type: "metadata",
      metadata: {
        evidenceCitations: evidenceCitations,
      },
    }
    return { ...message, parts: [...parts, metadataPart] }
  }
}

// New function for incremental message saving during streaming
export async function saveMessageIncremental(
  chatId: string,
  message: MessageAISDK,
  evidenceCitations?: any[]
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

  // CRITICAL: Add evidence citations to message parts before saving
  const messageWithCitations = addEvidenceCitationsToMessage(message, evidenceCitations)
  if (evidenceCitations && evidenceCitations.length > 0) {
    console.log(`📚 [SAVE INCREMENTAL] Adding ${evidenceCitations.length} evidence citations to message`)
  }

  // Save to IndexedDB immediately (fast)
  try {
    const current = await getCachedMessages(chatId)
    const updated = [...current, messageWithCitations]
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
      if (supabase && (messageWithCitations as any).message_group_id) {
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("chat_id", chatId)
          .eq("message_group_id", (messageWithCitations as any).message_group_id)
          .eq("role", messageWithCitations.role)
          .limit(1)
        
        if (existing && existing.length > 0) {
          console.log('[saveMessageIncremental] Message already exists in DB, skipping:', (messageWithCitations as any).message_group_id)
          return
        }
      }
      
      const success = await insertMessageToDb(chatId, messageWithCitations)
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
