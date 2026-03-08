import { decryptMessage, isEncryptionEnabled } from "../../encryption"

type StoredMessageRow = {
  id: string | number
  role: string
  content: unknown
  content_iv?: string | null
  experimental_attachments?: unknown
  created_at?: string | null
  parts?: unknown
  message_group_id?: string | null
  model?: string | null
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ""
  const chunks: string[] = []
  for (const part of parts) {
    const candidate = part as { type?: string; text?: unknown }
    if (candidate?.type === "text" && typeof candidate.text === "string") {
      const value = candidate.text.trim()
      if (value) chunks.push(value)
    }
  }
  return chunks.join("\n\n").trim()
}

function isLikelyCiphertext(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  // Common encrypted storage patterns we should never render directly.
  if (/^[0-9a-f]{32,}:[0-9a-f]{16,}$/i.test(trimmed)) return true
  if (/^[A-Za-z0-9+/=]{80,}$/.test(trimmed) && !/\s/.test(trimmed)) return true
  return false
}

function normalizeDisplayContent(row: StoredMessageRow): string {
  const fallbackFromParts = extractTextFromParts(row.parts)
  const rawContent = typeof row.content === "string" ? row.content : ""
  const contentIv =
    typeof row.content_iv === "string" && row.content_iv.trim().length > 0
      ? row.content_iv
      : null

  if (contentIv) {
    if (!isEncryptionEnabled()) {
      return fallbackFromParts
    }
    try {
      const decrypted = decryptMessage(rawContent, contentIv)
      if (typeof decrypted === "string" && decrypted.trim().length > 0) {
        return decrypted
      }
    } catch {
      return fallbackFromParts
    }
    return fallbackFromParts
  }

  if (rawContent.trim().length > 0 && !isLikelyCiphertext(rawContent)) {
    return rawContent
  }

  return fallbackFromParts
}

export function normalizeStoredMessageRow(
  row: StoredMessageRow
): StoredMessageRow & { content: string; parts: unknown[] | null } {
  const normalizedParts = Array.isArray(row.parts) ? row.parts : null
  const normalizedContent = normalizeDisplayContent({ ...row, parts: normalizedParts })
  return {
    ...row,
    id: String(row.id),
    content: normalizedContent,
    parts: normalizedParts,
    experimental_attachments: Array.isArray(row.experimental_attachments)
      ? row.experimental_attachments
      : [],
  }
}
