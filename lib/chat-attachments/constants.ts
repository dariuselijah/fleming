export const CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_FILE_SIZE_MB =
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024)

type ChatAttachmentIdentity = {
  name: string
  size: number
  lastModified: number
}

export function getChatAttachmentFileId(file: ChatAttachmentIdentity): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

export function getChatAttachmentSizeLimitLabel(): string {
  return `${CHAT_ATTACHMENT_MAX_FILE_SIZE_MB}MB`
}
