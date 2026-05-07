import { loadAttachmentsWithSignedUrls } from "@/lib/file-handling"
import type { Message as MessageAISDK } from "ai"
import { readFromIndexedDB, writeToIndexedDB } from "../persist"
const MESSAGE_FETCH_TIMEOUT_MS = 12000

function looksLikeCiphertext(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^[0-9a-f]{32,}:[0-9a-f]{16,}$/i.test(trimmed)) return true
  if (/^[A-Za-z0-9+/=]{80,}$/.test(trimmed) && !/\s/.test(trimmed)) return true
  return false
}

function textFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  const textParts: string[] = []
  for (const part of parts as Array<{ type?: string; text?: unknown }>) {
    if (part?.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) {
      textParts.push(part.text)
    }
  }
  return textParts.join("\n\n").trim()
}

async function fetchMessagesFromServer(chatId: string): Promise<MessageAISDK[]> {
  if (!chatId || chatId.startsWith("temp-chat-") || chatId === "temp") {
    return []
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MESSAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(
      `/api/chats/${chatId}/messages?ts=${Date.now()}`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      }
    )
    // No row in DB or chat not visible to this user — treat as empty, use IndexedDB cache if any.
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch messages (${response.status})`)
    }
    const result = await response.json()
    return Array.isArray(result?.messages) ? result.messages : []
  } finally {
    clearTimeout(timeout)
  }
}

export async function getMessagesFromDb(
  chatId: string,
  retries = 3
): Promise<MessageAISDK[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const serverMessages = await fetchMessagesFromServer(chatId)
      const processedMessages = await Promise.all(
        serverMessages.map(async (message: any) => {
          let processedAttachments = message.experimental_attachments || []
          
          // If there are attachments, load fresh signed URLs
          if (processedAttachments.length > 0) {
            try {
              processedAttachments = await loadAttachmentsWithSignedUrls(
                processedAttachments.map((a: any) => ({ ...a, name: a.name || "", contentType: a.contentType || "" }))
              )
            } catch (error) {
              console.error("Error loading attachments with signed URLs:", error)
              // Keep original attachments if signed URL generation fails
            }
          }
          const normalizedContent =
            typeof message.content === "string" &&
            message.content.trim().length > 0 &&
            !looksLikeCiphertext(message.content)
              ? message.content
              : textFromParts(message.parts)

          // Extract evidence citations from parts if available
          const parts = ((message as any)?.parts as MessageAISDK["parts"]) || undefined
          let evidenceCitations: any[] | undefined = undefined
          let topicContext: any | undefined = undefined
          let documentArtifacts: any[] | undefined = undefined
          let quizArtifacts: any[] | undefined = undefined
          let citationStyle: string | undefined = undefined
          
          if (parts && Array.isArray(parts)) {
            const metadataPart = parts.find((p: any) => p.type === "metadata" && (p as any).metadata)
            if (metadataPart && (metadataPart as any).metadata?.evidenceCitations) {
              evidenceCitations = (metadataPart as any).metadata.evidenceCitations
              // PERF: skip eager refresh of signed URLs here. previewReference /
              // figureReferences are only needed when the user expands a citation
              // popover. Refreshing all of them on chat load triggered N+1 HTTP
              // calls to /api/get-signed-url and was the dominant load-time cost
              // for chats with many citations. The popover handles lazy refresh
              // on demand if a URL is stale.
            }
            if (metadataPart && (metadataPart as any).metadata?.topicContext) {
              topicContext = (metadataPart as any).metadata.topicContext
            }
            if (metadataPart && Array.isArray((metadataPart as any).metadata?.documentArtifacts)) {
              documentArtifacts = (metadataPart as any).metadata.documentArtifacts
            }
            if (metadataPart && Array.isArray((metadataPart as any).metadata?.quizArtifacts)) {
              quizArtifacts = (metadataPart as any).metadata.quizArtifacts
            }
            if (metadataPart && typeof (metadataPart as any).metadata?.citationStyle === "string") {
              citationStyle = (metadataPart as any).metadata.citationStyle
            }
          }

          const messageAny = message as any
          return {
            ...messageAny,
            id: String(messageAny.id),
            content: normalizedContent,
            createdAt: new Date(messageAny.created_at || ""),
            parts: parts,
            message_group_id: messageAny.message_group_id,
            model: messageAny.model,
            experimental_attachments: processedAttachments,
            // Store evidence citations in a custom field for easy access
            evidenceCitations: evidenceCitations,
            topicContext,
            documentArtifacts,
            quizArtifacts,
            citationStyle,
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

type ChatMessageEntry = {
  id: string
  messages: MessageAISDK[]
}

export async function getCachedMessages(
  chatId: string
): Promise<MessageAISDK[]> {
  const entry = await readFromIndexedDB<ChatMessageEntry>("messages", chatId)

  if (!entry || Array.isArray(entry)) return []

  return (entry.messages || [])
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : ""
      const fallback = textFromParts(message.parts)
      const safeContent =
        content && !looksLikeCiphertext(content) ? content : fallback
      return {
        ...message,
        content: safeContent,
      }
    })
    .sort((a, b) => +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0))
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
  
  // Local cache only. Durable persistence is server-authoritative from /api/chat.
  await writeToIndexedDB("messages", { id: chatId, messages: messagesWithCitations })
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
    (p: any) => p.type === "metadata" && p.metadata
  )
  
  if (existingMetadataIndex >= 0) {
    // Update existing metadata part
    const updatedParts = [...parts]
    const existingMetadata = (updatedParts[existingMetadataIndex] as any)?.metadata || {}
    updatedParts[existingMetadataIndex] = {
      type: "metadata" as any,
      metadata: {
        ...existingMetadata,
        evidenceCitations: evidenceCitations,
      },
    } as any
    return { ...message, parts: updatedParts }
  } else {
    // Add new metadata part
    const metadataPart: any = {
      type: "metadata" as any,
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

  // CRITICAL: Add evidence citations to message parts before saving
  const messageWithCitations = addEvidenceCitationsToMessage(message, evidenceCitations)
  if (evidenceCitations && evidenceCitations.length > 0) {
    console.log(`📚 [SAVE INCREMENTAL] Adding ${evidenceCitations.length} evidence citations to message`)
  }

  // Save to IndexedDB immediately (fast)
  try {
    const current = await getCachedMessages(chatId)
    const existingIdx = current.findIndex((cached) => cached.id === messageWithCitations.id)
    let updated = current

    if (existingIdx >= 0) {
      const existing = current[existingIdx]
      const existingSnapshot = JSON.stringify({
        content: existing.content,
        parts: existing.parts,
      })
      const incomingSnapshot = JSON.stringify({
        content: messageWithCitations.content,
        parts: messageWithCitations.parts,
      })

      if (existingSnapshot === incomingSnapshot) {
        return
      }

      updated = [...current]
      updated[existingIdx] = {
        ...existing,
        ...messageWithCitations,
      }
    } else {
      updated = [...current, messageWithCitations]
    }

    await writeToIndexedDB("messages", { id: chatId, messages: updated })
  } catch (error) {
    console.error("[saveMessageIncremental] Failed to cache message:", error)
  }

  // Local cache only. Durable persistence is server-authoritative from /api/chat.
}

export async function clearMessagesCache(chatId: string): Promise<void> {
  await writeToIndexedDB("messages", { id: chatId, messages: [] })
}

export async function clearMessagesForChat(chatId: string): Promise<void> {
  await clearMessagesCache(chatId)
}
