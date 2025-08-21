import { toast } from "@/components/ui/toast"
import * as fileType from "file-type"
import { DAILY_FILE_UPLOAD_LIMIT } from "./config"
import { isSupabaseEnabled } from "./supabase/config"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

export type Attachment = {
  name: string
  contentType: string
  url: string
  filePath?: string // Store file path for secure access
}

export async function validateFile(
  file: File
): Promise<{ isValid: boolean; error?: string }> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    }
  }

  const buffer = await file.arrayBuffer()
  const type = await fileType.fileTypeFromBuffer(
    Buffer.from(buffer.slice(0, 4100))
  )

  if (!type || !ALLOWED_FILE_TYPES.includes(type.mime)) {
    return {
      isValid: false,
      error: "File type not supported or doesn't match its extension",
    }
  }

  return { isValid: true }
}

export function createAttachment(file: File, url: string, filePath?: string): Attachment {
  return {
    name: file.name,
    contentType: file.type,
    url,
    filePath
  }
}

// Function to generate a new signed URL for secure file access
export async function getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  if (!isSupabaseEnabled) {
    throw new Error("Supabase not enabled")
  }

  try {
    const response = await fetch("/api/get-signed-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filePath,
        expiresIn,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to generate signed URL")
    }

    const result = await response.json()
    return result.signedUrl
  } catch (error) {
    throw new Error(`Error generating signed URL: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

// Function to generate signed URL with retry for newly uploaded files
export async function getSignedUrlWithRetry(filePath: string, expiresIn: number = 3600, maxRetries: number = 5): Promise<string> {
  if (!isSupabaseEnabled) {
    throw new Error("Supabase not enabled")
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("/api/get-signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath,
          expiresIn,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (errorData.error?.includes("Object not found") && attempt < maxRetries) {
          // Wait longer between retries for newly uploaded files
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
          continue
        }
        throw new Error(errorData.error || "Failed to generate signed URL")
      }

      const result = await response.json()
      return result.signedUrl
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
  }

  throw new Error("Failed to generate signed URL after retries")
}

export async function processFiles(
  files: File[],
  chatId: string,
  userId: string,
  isAuthenticated: boolean = false
): Promise<Attachment[]> {
  const attachments: Attachment[] = []

  for (const file of files) {
    const validation = await validateFile(file)
    if (!validation.isValid) {
      console.warn(`File ${file.name} validation failed:`, validation.error)
      toast({
        title: "File validation failed",
        description: validation.error,
        status: "error",
      })
      continue
    }

    try {
      let url: string
      let filePath: string | undefined

      if (isSupabaseEnabled) {
        // Use server-side API for file uploads
        const formData = new FormData()
        formData.append("file", file)
        formData.append("userId", userId)
        formData.append("chatId", chatId)
        formData.append("isAuthenticated", isAuthenticated.toString())

        const response = await fetch("/api/upload-file", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          let errorMessage = "Upload failed"
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (jsonError) {
            console.error("Failed to parse error response:", jsonError)
            // If we can't parse the error response, use the status text
            errorMessage = response.statusText || errorMessage
          }
          throw new Error(errorMessage)
        }

        let result
        try {
          result = await response.json()
        } catch (jsonError) {
          console.error("Failed to parse success response:", jsonError)
          throw new Error("Invalid response from server")
        }
        
        url = result.signedUrl
        filePath = result.filePath
      } else {
        url = URL.createObjectURL(file)
      }

      attachments.push(createAttachment(file, url, filePath))
      console.log(`File ${file.name} processed successfully`)
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error)
      // Don't show toast for individual file failures - let the caller handle it
      // This prevents multiple toasts from appearing
    }
  }

  // Log the final result
  console.log(`File processing completed. ${attachments.length}/${files.length} files succeeded`)
  return attachments
}

// Function to load existing attachments with fresh signed URLs
export async function loadAttachmentsWithSignedUrls(
  attachments: Attachment[]
): Promise<Attachment[]> {
  if (!isSupabaseEnabled) {
    return attachments // Return as-is if no Supabase
  }

  const updatedAttachments: Attachment[] = []

  for (const attachment of attachments) {
    try {
      // If the attachment has a filePath, generate a fresh signed URL
      if (attachment.filePath) {
        const signedUrl = await getSignedUrlWithRetry(attachment.filePath)
        updatedAttachments.push({
          ...attachment,
          url: signedUrl
        })
      } else {
        // If no filePath, assume it's already a signed URL or blob URL
        updatedAttachments.push(attachment)
      }
    } catch (error) {
      console.error(`Error generating signed URL for ${attachment.name}:`, error)
      // Keep the original attachment even if signed URL generation fails
      updatedAttachments.push(attachment)
    }
  }

  return updatedAttachments
}

// Function to get attachments from database with fresh signed URLs
export async function getAttachmentsFromDb(
  chatId: string,
  userId: string
): Promise<Attachment[]> {
  if (!isSupabaseEnabled) {
    return []
  }

  try {
    const response = await fetch("/api/get-attachments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId,
        userId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Error fetching attachments:", errorData.error)
      return []
    }

    const result = await response.json()
    return result.attachments || []
  } catch (error) {
    console.error("Error fetching attachments:", error)
    return []
  }
}

export class FileUploadLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "DAILY_FILE_LIMIT_REACHED"
  }
}

export async function checkFileUploadLimit(userId: string) {
  if (!isSupabaseEnabled) return 0

  try {
    const response = await fetch("/api/check-file-upload-limit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to check file upload limit")
    }

    const result = await response.json()
    const count = result.count || 0
    
    if (count >= DAILY_FILE_UPLOAD_LIMIT) {
      throw new FileUploadLimitError("Daily file upload limit reached.")
    }

    return count
  } catch (error) {
    console.error("Error checking file upload limit:", error)
    if (error instanceof FileUploadLimitError) {
      throw error
    }
    toast({
      title: "File upload is not supported in this deployment",
      status: "info",
    })
    return 0
  }
}
