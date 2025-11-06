import type { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from "@ai-sdk/provider"
import { createInflectionModel } from "./inflection-adapter"
import { openproviders } from "./index"

/**
 * Creates a composite LanguageModelV1 adapter for Fleming 3.5
 * - Uses Grok-4-fast-reasoning directly when images are present
 * - Uses Pi 3.1 latest for normal conversation (no images)
 */
export function createFleming35Model(
  apiKey?: string,
  grokApiKey?: string
): LanguageModelV1 {
  const piModel = createInflectionModel("pi-3.1-latest", apiKey)
  
  // Helper function to check if messages contain images
  function hasImages(messages: Array<{ role: string; content?: any; experimental_attachments?: any[] }>): boolean {
    for (const message of messages) {
      if (message.experimental_attachments && message.experimental_attachments.length > 0) {
        const hasImage = message.experimental_attachments.some(
          (att: any) => att.contentType?.startsWith("image/") || att.contentType?.startsWith("application/")
        )
        if (hasImage) return true
      }
      // Also check content for image URLs
      if (message.content) {
        if (typeof message.content === "string") {
          // Check for data URLs or image URLs
          if (message.content.includes("data:image/") || message.content.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)) {
            return true
          }
        } else if (Array.isArray(message.content)) {
          const hasImagePart = message.content.some(
            (part: any) => part.type === "image" || 
                          (part.type === "text" && (part.text?.includes("data:image/") || part.text?.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)))
          )
          if (hasImagePart) return true
        }
      }
    }
    return false
  }

  // Helper function to validate and prepare image URLs for Grok
  // Grok can accept data URLs (base64) and HTTPS URLs, but not blob URLs
  async function prepareImageUrl(url: string | null | undefined): Promise<string | null> {
    if (!url || typeof url !== "string") {
      console.warn("[Fleming 3.5] Invalid URL provided to prepareImageUrl:", typeof url, url)
      return null
    }
    
    // Data URLs (base64) - use directly
    if (url.startsWith("data:image/") || url.startsWith("data:application/")) {
      return url
    }
    
    // HTTPS URLs (signed URLs) - use directly
    if (url.startsWith("https://")) {
      return url
    }
    
    // Blob URLs - cannot be accessed from server, need to be converted on client
    // Return null to skip this image instead of throwing
    if (url.startsWith("blob:")) {
      console.warn("[Fleming 3.5] Blob URL detected - skipping. Blob URLs must be converted to data URLs or signed URLs before sending to server:", url.substring(0, 50))
      return null
    }
    
    // HTTP URLs - log warning but try to use
    if (url.startsWith("http://")) {
      console.warn("[Fleming 3.5] HTTP URL detected (not HTTPS):", url.substring(0, 50))
      return url
    }
    
    // Unknown format - log warning but try to use
    console.warn("[Fleming 3.5] Unknown URL format:", url.substring(0, 50))
    return url
  }

  // Helper function to extract image attachments from messages
  async function extractImageAttachments(messages: Array<{ role: string; content?: any; experimental_attachments?: any[] }>): Promise<Array<{ url: string; contentType?: string }>> {
    const images: Array<{ url: string; contentType?: string }> = []
    for (const message of messages) {
      // Check experimental_attachments first
      if (message.experimental_attachments) {
        for (const att of message.experimental_attachments) {
          if (att.contentType?.startsWith("image/") || att.contentType?.startsWith("application/")) {
            if (att.url) {
              try {
                const preparedUrl = await prepareImageUrl(att.url)
                if (preparedUrl) {
                  images.push({ url: preparedUrl, contentType: att.contentType })
                }
                // If preparedUrl is null, skip this image (likely a blob URL)
              } catch (error) {
                console.error("[Fleming 3.5] Failed to prepare image URL:", error)
                // Skip this image but continue processing others
              }
            }
          }
        }
      }
      
      // Check content array format (AI SDK format with image parts)
      if (message.content && Array.isArray(message.content)) {
        console.log(`[Fleming 3.5] Checking content array with ${message.content.length} parts`)
        for (const part of message.content) {
          if (part.type === "image") {
            try {
              // Handle string URLs, URL objects, and nested object structures
              let imageUrl: string | null = null
              
              if (typeof part.image === "string") {
                imageUrl = part.image
                console.log(`[Fleming 3.5] Found string image URL: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
              } else if (part.image instanceof URL) {
                // AI SDK converts string URLs to URL objects - extract href
                imageUrl = part.image.href
                console.log(`[Fleming 3.5] Found URL object, extracted href: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
              } else if (part.image && typeof part.image === "object") {
                // Try various possible object structures
                if ("href" in part.image && typeof part.image.href === "string") {
                  imageUrl = part.image.href
                  console.log(`[Fleming 3.5] Found image URL in object.href: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
                } else if ("url" in part.image && typeof part.image.url === "string") {
                  imageUrl = part.image.url
                  console.log(`[Fleming 3.5] Found image URL in object.url: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
                } else if ("image" in part.image && typeof part.image.image === "string") {
                  imageUrl = part.image.image
                  console.log(`[Fleming 3.5] Found image URL in object.image: ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
                } else if ("toString" in part.image && typeof part.image.toString === "function") {
                  // Try toString() as fallback for URL-like objects
                  imageUrl = part.image.toString()
                  console.log(`[Fleming 3.5] Extracted URL using toString(): ${imageUrl ? imageUrl.substring(0, 50) + '...' : 'null'}`)
                } else {
                  console.warn("[Fleming 3.5] Image part has object but no recognizable URL property:", part.image)
                }
              }
              
              if (imageUrl && typeof imageUrl === "string") {
                const preparedUrl = await prepareImageUrl(imageUrl)
                if (preparedUrl) {
                  images.push({ url: preparedUrl, contentType: part.contentType || "image/jpeg" })
                  console.log(`[Fleming 3.5] Successfully prepared image URL`)
                } else {
                  console.warn(`[Fleming 3.5] Failed to prepare image URL: ${imageUrl.substring(0, 50)}...`)
                }
              } else {
                console.warn("[Fleming 3.5] Invalid image format in content array:", typeof part.image, part.image)
              }
            } catch (error) {
              console.error("[Fleming 3.5] Failed to prepare image URL from content array:", error, "part.image:", part.image)
            }
          }
        }
      }
      
      // Also check content for image URLs in string format
      if (message.content && typeof message.content === "string") {
        const imageUrlMatch = message.content.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)
        if (imageUrlMatch) {
          try {
            const preparedUrl = await prepareImageUrl(imageUrlMatch[0])
            if (preparedUrl) {
              images.push({ url: preparedUrl })
            }
          } catch (error) {
            console.error("[Fleming 3.5] Failed to prepare image URL from content:", error)
          }
        }
      }
    }
    return images
  }

  // Helper function to get text content from a message
  function getTextContent(message: { content?: any }): string {
    if (!message.content) return ""
    if (typeof message.content === "string") return message.content
    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => {
          if (part.type === "text") return part.text || ""
          return ""
        })
        .join("")
    }
    return ""
  }

  const model: LanguageModelV1 = {
    specificationVersion: 'v1',
    modelId: "fleming-3.5",
    provider: "fleming",
    defaultObjectGenerationMode: undefined,
    supportsUrl: () => false,
    supportsImageUrls: false, // Fleming 3.5 does not support images - use Fleming 4 instead
    supportsStructuredOutputs: false,

    doStream: async function(options: LanguageModelV1CallOptions) {
      console.log("[Fleming 3.5] doStream called - using Pi 3.1 for text-only processing")
      try {
        const { prompt } = options
        const messages = prompt
        console.log(`[Fleming 3.5] Received ${messages.length} messages`)

        // Fleming 3.5 does not support images - always use Pi 3.1
        // Images should be handled by switching to Fleming 4 in the API route
        // Clean messages to remove any attachments and use text-only content
        const cleanedMessages = messages.map(msg => {
          const textContent = getTextContent(msg)
          if (msg.role === "system") {
            return {
              role: msg.role,
              content: typeof msg.content === "string" ? msg.content : textContent,
            }
          } else if (msg.role === "user" || msg.role === "assistant") {
            if (textContent) {
              return {
                role: msg.role,
                content: textContent,
              }
            } else if (typeof msg.content === "string") {
              return {
                role: msg.role,
                content: msg.content,
              }
            }
          }
          const { experimental_attachments, ...rest } = msg as any
          return rest
        })
        
        return await piModel.doStream({
          ...options,
          prompt: cleanedMessages
        })
      } catch (error) {
        console.error("[Fleming 3.5] Error in doStream:", error)
        throw error
      }
    },

    doGenerate: async function(options: LanguageModelV1CallOptions) {
      console.log("[Fleming 3.5] doGenerate called - using Pi 3.1 for text-only processing")
      try {
        const { prompt } = options
        const messages = prompt

        // Fleming 3.5 does not support images - always use Pi 3.1
        // Clean messages to remove any attachments and use text-only content
        const cleanedMessages = messages.map(msg => {
          const textContent = getTextContent(msg)
          if (msg.role === "system") {
            return {
              role: msg.role,
              content: typeof msg.content === "string" ? msg.content : textContent,
            }
          } else if (msg.role === "user" || msg.role === "assistant") {
            if (textContent) {
              return {
                role: msg.role,
                content: textContent,
              }
            } else if (typeof msg.content === "string") {
              return {
                role: msg.role,
                content: msg.content,
              }
            }
          }
          const { experimental_attachments, ...rest } = msg as any
          return rest
        })
        
        return await piModel.doGenerate({
          ...options,
          prompt: cleanedMessages
        })
      } catch (error) {
        console.error("[Fleming 3.5] Error in doGenerate:", error)
        throw error
      }
    },
  }

  return model
}

// Legacy function - kept for backward compatibility but images are not supported
// Images are now handled by switching to Fleming 4 in the API route
function hasImages(messages: Array<{ role: string; content?: any; experimental_attachments?: any[] }>): boolean {
  // This function is no longer used but kept for backward compatibility
  return false
}
