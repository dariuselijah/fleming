import type { ContentPart, Message } from "@/app/types/api.types"
import type { TopicContext } from "@/app/types/api.types"
import type { Database, Json } from "@/app/types/database.types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { encryptMessage, isEncryptionEnabled } from "@/lib/encryption"

const DEFAULT_STEP = 0

function dedupeArtifacts(
  artifacts: Record<string, unknown>[],
  artifactType: "document" | "quiz"
): Record<string, unknown>[] {
  const seen = new Set<string>()
  const deduped: Record<string, unknown>[] = []

  for (const artifact of artifacts) {
    const artifactId =
      typeof artifact.artifactId === "string" && artifact.artifactId.trim().length > 0
        ? artifact.artifactId.trim()
        : ""
    const key = artifactId || `${artifactType}:${JSON.stringify(artifact)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(artifact)
  }

  return deduped
}

function parseToolResultPayload(result: unknown): Record<string, unknown> | null {
  if (!result) return null
  if (typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "content" in (result as Record<string, unknown>)
  ) {
    const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
    const textPayload = content?.find((item) => item?.type === "text" && typeof item.text === "string")
    if (!textPayload?.text) return null
    try {
      const parsed = JSON.parse(textPayload.text)
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  return null
}

export async function saveFinalAssistantMessage(
  supabase: SupabaseClient<Database>,
  chatId: string,
  messages: Message[],
  message_group_id?: string,
  model?: string,
  evidenceCitations?: any[],
  topicContext?: TopicContext,
  allowMultipleArtifacts = false
) {
  const parts: ContentPart[] = []
  const textParts: string[] = []
  const documentArtifacts: Record<string, unknown>[] = []
  const quizArtifacts: Record<string, unknown>[] = []

  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") {
          textParts.push(part.text || "")
          parts.push(part)
        } else if (part.type === "tool-invocation" && part.toolInvocation) {
          const { toolCallId } = part.toolInvocation
          if (!toolCallId) continue
          const parsedResult = parseToolResultPayload(part.toolInvocation.result)
          const artifactType = parsedResult?.artifactType
          if (parsedResult && artifactType === "document") {
            documentArtifacts.push(parsedResult)
          } else if (parsedResult && artifactType === "quiz") {
            quizArtifacts.push(parsedResult)
          }
          parts.push({
            ...part,
            toolInvocation: {
              ...part.toolInvocation,
              args: part.toolInvocation?.args || {},
            },
          })
        } else if (part.type === "reasoning") {
          const reasoningText =
            typeof (part as any).text === "string" && (part as any).text.trim().length > 0
              ? (part as any).text
              : typeof (part as any).reasoning === "string" &&
                  (part as any).reasoning.trim().length > 0
                ? (part as any).reasoning
                : ""
          parts.push({
            type: "reasoning",
            reasoning: reasoningText,
            details: [
              {
                type: "text",
                text: reasoningText,
              },
            ],
          })
        } else if (part.type === "step-start") {
          parts.push(part)
        }
      }
    } else if (msg.role === "tool" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-result") {
          const toolCallId = part.toolCallId || ""
          const parsedResult = parseToolResultPayload(part.result)
          const artifactType = parsedResult?.artifactType
          if (parsedResult && artifactType === "document") {
            documentArtifacts.push(parsedResult)
          } else if (parsedResult && artifactType === "quiz") {
            quizArtifacts.push(parsedResult)
          }
          parts.push({
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              step: DEFAULT_STEP,
              toolCallId,
              toolName: part.toolName || "",
              result: part.result,
            },
          })
        }
      }
    }
  }
  
  const dedupedDocumentArtifacts = dedupeArtifacts(documentArtifacts, "document")
  const dedupedQuizArtifacts = dedupeArtifacts(quizArtifacts, "quiz")
  const finalDocumentArtifacts = allowMultipleArtifacts
    ? dedupedDocumentArtifacts
    : dedupedDocumentArtifacts.slice(0, 1)
  const finalQuizArtifacts = allowMultipleArtifacts
    ? dedupedQuizArtifacts
    : dedupedQuizArtifacts.slice(0, 1)

  if (
    (evidenceCitations && evidenceCitations.length > 0) ||
    topicContext ||
    finalDocumentArtifacts.length > 0 ||
    finalQuizArtifacts.length > 0
  ) {
    const citationStyle =
      finalDocumentArtifacts.length > 0
        ? (finalDocumentArtifacts[0]?.citationStyle as string | undefined)
        : undefined
    const metadataPart: any = {
      type: "metadata",
      metadata: {
        ...(evidenceCitations && evidenceCitations.length > 0
          ? { evidenceCitations: evidenceCitations }
          : {}),
        ...(topicContext ? { topicContext } : {}),
        ...(finalDocumentArtifacts.length > 0
          ? { documentArtifacts: finalDocumentArtifacts }
          : {}),
        ...(finalQuizArtifacts.length > 0
          ? { quizArtifacts: finalQuizArtifacts }
          : {}),
        ...(citationStyle ? { citationStyle } : {}),
      },
    }
    parts.push(metadataPart)
    if (evidenceCitations && evidenceCitations.length > 0) {
      console.log(`📚 [SAVE] Storing ${evidenceCitations.length} evidence citations with message`)
    }
  }

  const finalPlainText = textParts.join("\n\n")

  // Encrypt assistant message content before storing (if encryption is enabled)
  let encryptedContent = finalPlainText || ""
  let contentIv: string | null = null

  if (isEncryptionEnabled() && finalPlainText) {
    const encrypted = encryptMessage(finalPlainText)
    encryptedContent = encrypted.encrypted
    contentIv = encrypted.iv
    console.log("🔒 Assistant message encrypted before storage")
  }

  const { error } = await supabase.from("messages").insert({
    chat_id: chatId,
    role: "assistant",
    content: encryptedContent,
    content_iv: contentIv,
    parts: parts as unknown as Json,
    message_group_id,
    model,
  } as any) // Type assertion needed for content_iv column

  if (error) {
    console.error("Error saving final assistant message:", error)
    throw new Error(`Failed to save assistant message: ${error.message}`)
  } else {
    console.log("Assistant message saved successfully (merged).")
  }
}
