export const CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES = 60 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_NON_IMAGE_FILE_SIZE_BYTES = 512 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES = CHAT_ATTACHMENT_MAX_NON_IMAGE_FILE_SIZE_BYTES
export const CHAT_ATTACHMENT_MAX_FILE_SIZE_MB =
  CHAT_ATTACHMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024)
export const CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_MB =
  CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024)

type ChatAttachmentIdentity = {
  name: string
  size: number
  lastModified: number
}

export function getChatAttachmentFileId(file: ChatAttachmentIdentity): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

export function isImageAttachment(contentType?: string): boolean {
  return typeof contentType === "string" && contentType.startsWith("image/")
}

export function getChatAttachmentMaxFileSizeBytes(contentType?: string): number {
  return isImageAttachment(contentType)
    ? CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES
    : CHAT_ATTACHMENT_MAX_NON_IMAGE_FILE_SIZE_BYTES
}

export function getChatAttachmentSizeLimitLabel(contentType?: string): string {
  const maxBytes = getChatAttachmentMaxFileSizeBytes(contentType)
  return `${maxBytes / (1024 * 1024)}MB`
}
