import {
  CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES,
  isImageAttachment,
} from "@/lib/chat-attachments/constants"

export const CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE = 5
export const CHAT_ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

export type ChatImageFileLike = {
  name: string
  type?: string
  size?: number
}

export type ChatImageAttachmentLike = {
  name?: string | null
  url?: string | null
  contentType?: string | null
  mimeType?: string | null
  filePath?: string | null
}

export type ChatImagePolicyRejectionCode =
  | "model-does-not-support-vision"
  | "unsupported-image-type"
  | "image-too-large"
  | "too-many-images"
  | "missing-required-fields"

export function normalizeImageMimeType(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
}

export function isSupportedChatImageMimeType(value?: string | null): boolean {
  const normalized = normalizeImageMimeType(value)
  return CHAT_ALLOWED_IMAGE_MIME_TYPES.includes(
    normalized as (typeof CHAT_ALLOWED_IMAGE_MIME_TYPES)[number]
  )
}

export function estimateDataUrlBytes(url: string): number | null {
  if (!url.startsWith("data:")) return null
  const commaIndex = url.indexOf(",")
  if (commaIndex < 0) return null
  const base64Payload = url.slice(commaIndex + 1)
  if (!base64Payload) return 0
  return Math.floor((base64Payload.length * 3) / 4)
}

export function enforceImageFilePolicy(
  files: ChatImageFileLike[],
  options?: { maxImages?: number }
): {
  accepted: ChatImageFileLike[]
  rejected: Array<{ file: ChatImageFileLike; code: ChatImagePolicyRejectionCode; detail: string }>
} {
  const maxImages = options?.maxImages ?? CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE
  const accepted: ChatImageFileLike[] = []
  const rejected: Array<{ file: ChatImageFileLike; code: ChatImagePolicyRejectionCode; detail: string }> = []

  files.forEach((file) => {
    const normalizedType = normalizeImageMimeType(file.type)
    if (!isSupportedChatImageMimeType(normalizedType)) {
      rejected.push({
        file,
        code: "unsupported-image-type",
        detail: `Unsupported image type "${normalizedType || "unknown"}".`,
      })
      return
    }

    const fileSize = typeof file.size === "number" ? file.size : 0
    if (fileSize > CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES) {
      rejected.push({
        file,
        code: "image-too-large",
        detail: "Image exceeds max allowed size.",
      })
      return
    }

    if (accepted.length >= maxImages) {
      rejected.push({
        file,
        code: "too-many-images",
        detail: `Only ${maxImages} images can be sent in one message.`,
      })
      return
    }

    accepted.push(file)
  })

  return { accepted, rejected }
}

export function enforceImageAttachmentPolicy(
  attachments: ChatImageAttachmentLike[],
  options: { modelSupportsVision: boolean; maxImages?: number }
): {
  accepted: ChatImageAttachmentLike[]
  rejected: Array<{
    attachment: ChatImageAttachmentLike
    code: ChatImagePolicyRejectionCode
    detail: string
  }>
} {
  const maxImages = options.maxImages ?? CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE
  const accepted: ChatImageAttachmentLike[] = []
  const rejected: Array<{
    attachment: ChatImageAttachmentLike
    code: ChatImagePolicyRejectionCode
    detail: string
  }> = []

  attachments.forEach((attachment) => {
    const url = typeof attachment.url === "string" ? attachment.url : ""
    const name = typeof attachment.name === "string" ? attachment.name : ""
    const rawType =
      typeof attachment.contentType === "string"
        ? attachment.contentType
        : attachment.mimeType
    const contentType = normalizeImageMimeType(rawType)

    if (!url || !name) {
      rejected.push({
        attachment,
        code: "missing-required-fields",
        detail: "Attachment is missing required url or name.",
      })
      return
    }

    if (url.startsWith("blob:")) {
      rejected.push({
        attachment,
        code: "missing-required-fields",
        detail: "Blob URLs are not valid for model input. Upload or convert the image first.",
      })
      return
    }

    if (!isImageAttachment(contentType)) {
      rejected.push({
        attachment,
        code: "unsupported-image-type",
        detail: `Attachment content type "${contentType || "unknown"}" is not an image.`,
      })
      return
    }

    if (!options.modelSupportsVision) {
      rejected.push({
        attachment,
        code: "model-does-not-support-vision",
        detail: "The selected model does not support image inputs.",
      })
      return
    }

    if (!isSupportedChatImageMimeType(contentType)) {
      rejected.push({
        attachment,
        code: "unsupported-image-type",
        detail: `Unsupported image type "${contentType}".`,
      })
      return
    }

    const dataUrlBytes = estimateDataUrlBytes(url)
    if (
      typeof dataUrlBytes === "number" &&
      dataUrlBytes > CHAT_ATTACHMENT_MAX_IMAGE_FILE_SIZE_BYTES
    ) {
      rejected.push({
        attachment,
        code: "image-too-large",
        detail: "Inline image payload exceeds max allowed size.",
      })
      return
    }

    if (accepted.length >= maxImages) {
      rejected.push({
        attachment,
        code: "too-many-images",
        detail: `Only ${maxImages} images can be sent in one message.`,
      })
      return
    }

    accepted.push({
      ...attachment,
      contentType,
    })
  })

  return { accepted, rejected }
}
