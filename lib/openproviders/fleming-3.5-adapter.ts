import type { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from "@ai-sdk/provider"
import { streamText } from "ai"
import { createInflectionModel } from "./inflection-adapter"
import { openproviders } from "./index"
import { FLEMING_3_5_IMAGE_ANALYSIS_PROMPT } from "@/lib/config"

/**
 * Creates a composite LanguageModelV1 adapter for Fleming 3.5
 * - Uses Grok-4-fast-reasoning for image analysis when images are present
 * - Uses Pi 3.1 latest for conversation (with image descriptions if images were analyzed)
 * - Uses Pi 3.1 latest directly when no images are present
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

  // Helper function to extract image attachments from messages
  function extractImageAttachments(messages: Array<{ role: string; content?: any; experimental_attachments?: any[] }>): Array<{ url: string; contentType?: string }> {
    const images: Array<{ url: string; contentType?: string }> = []
    for (const message of messages) {
      if (message.experimental_attachments) {
        for (const att of message.experimental_attachments) {
          if (att.contentType?.startsWith("image/") || att.contentType?.startsWith("application/")) {
            if (att.url) {
              images.push({ url: att.url, contentType: att.contentType })
            }
          }
        }
      }
      // Also check content for image URLs
      if (message.content && typeof message.content === "string") {
        const imageUrlMatch = message.content.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp)/i)
        if (imageUrlMatch) {
          images.push({ url: imageUrlMatch[0] })
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
    supportsImageUrls: true, // Fleming 3.5 supports images via Grok
    supportsStructuredOutputs: false,

    doStream: async function(options: LanguageModelV1CallOptions) {
      try {
        const { prompt, abortSignal } = options
        const messages = prompt

        // Check if there are images in the messages
        const hasImageAttachments = hasImages(messages)

        if (hasImageAttachments) {
          // Image analysis flow: Use Grok to analyze images, then Pi for conversation
          async function* imageAnalysisStream() {
            try {
              // Get the last user message (most recent)
              const lastUserMessage = [...messages].reverse().find(m => m.role === "user")
              if (!lastUserMessage) {
                throw new Error("No user message found")
              }

              // Extract images and text
              const images = extractImageAttachments(messages)
              const userText = getTextContent(lastUserMessage)

              // Prepare messages for Grok image analysis
              const grokMessages: Array<{ role: "user" | "assistant" | "system"; content: any }> = [
                {
                  role: "system",
                  content: FLEMING_3_5_IMAGE_ANALYSIS_PROMPT
                },
                {
                  role: "user",
                  content: [
                    ...images.map(img => ({
                      type: "image" as const,
                      image: img.url
                    })),
                    {
                      type: "text" as const,
                      text: userText || "Please analyze these images comprehensively and extract all relevant information."
                    }
                  ]
                }
              ]

              // Use Grok to analyze images
              const grokModel = openproviders("grok-4-fast-reasoning", undefined, grokApiKey)
              
              // Stream image analysis using Grok and collect the full text
              let imageAnalysis = ""
              try {
                const grokStream = await streamText({
                  model: grokModel,
                  messages: grokMessages,
                  abortSignal
                })
                
                // Collect the full text from the stream
                for await (const chunk of grokStream.textStream) {
                  imageAnalysis += chunk
                }
              } catch (error) {
                console.error("[Fleming 3.5] Error analyzing images with Grok:", error)
                imageAnalysis = "Unable to analyze images. Please describe the images in your message."
              }

              // Now prepare messages for Pi with image analysis included
              const piMessages = messages.map(msg => {
                if (msg.role === "user" && msg === lastUserMessage) {
                  // Replace the last user message with text + image analysis
                  const originalText = getTextContent(msg)
                  const combinedText = originalText 
                    ? `${originalText}\n\n[Image Analysis]: ${imageAnalysis}`
                    : `[Image Analysis]: ${imageAnalysis}`
                  
                  return {
                    ...msg,
                    content: combinedText,
                    experimental_attachments: undefined // Remove attachments since we've analyzed them
                  }
                }
                return {
                  ...msg,
                  experimental_attachments: undefined // Remove attachments from all messages
                }
              })

              // Stream from Pi with the combined message
              const piStreamResult = await piModel.doStream({
                ...options,
                prompt: piMessages
              })

              // Forward Pi's stream
              for await (const chunk of piStreamResult.stream) {
                if (abortSignal?.aborted) {
                  throw new Error("Request was aborted")
                }
                yield chunk
              }
            } catch (error: unknown) {
              console.error("[Fleming 3.5] Error in image analysis stream:", error)
              const errorMessage = error instanceof Error ? error.message : String(error)
              throw new Error(`Fleming 3.5 image analysis failed: ${errorMessage}`)
            }
          }

          const stream = new ReadableStream<LanguageModelV1StreamPart>({
            async start(controller) {
              try {
                for await (const chunk of imageAnalysisStream()) {
                  controller.enqueue(chunk)
                }
                controller.close()
              } catch (error) {
                controller.error(error)
              }
            },
          })

          return {
            stream,
            rawCall: {
              rawPrompt: JSON.stringify({ messages, hasImages: true }),
              rawSettings: {},
            },
            warnings: undefined,
          }
        } else {
          // Direct flow: No images, use Pi directly
          // Remove any attachments from messages before passing to Pi
          const cleanedMessages = messages.map(msg => ({
            ...msg,
            experimental_attachments: undefined
          }))

          return await piModel.doStream({
            ...options,
            prompt: cleanedMessages
          })
        }
      } catch (syncError: unknown) {
        console.error("[Fleming 3.5] Synchronous error in doStream:", syncError)
        
        async function* errorGenerator() {
          const error = syncError instanceof Error 
            ? syncError 
            : new Error(String(syncError))
          throw error
        }

        const errorStream = new ReadableStream<LanguageModelV1StreamPart>({
          async start(controller) {
            try {
              for await (const chunk of errorGenerator()) {
                controller.enqueue(chunk)
              }
              controller.close()
            } catch (error) {
              controller.error(error)
            }
          },
        })

        return {
          stream: errorStream,
          rawCall: {
            rawPrompt: JSON.stringify({ messages: [] }),
            rawSettings: {},
          },
          warnings: undefined,
        }
      }
    },

    doGenerate: async function(options) {
      const { prompt, abortSignal } = options
      const messages = prompt

      // Check if there are images
      const hasImageAttachments = hasImages(messages)

      if (hasImageAttachments) {
        // Image analysis flow
        const lastUserMessage = [...messages].reverse().find(m => m.role === "user")
        if (!lastUserMessage) {
          throw new Error("No user message found")
        }

        const images = extractImageAttachments(messages)
        const userText = getTextContent(lastUserMessage)

        // Analyze images with Grok
        const grokModel = openproviders("grok-4-fast-reasoning", undefined, grokApiKey)
        const grokMessages: Array<{ role: "user" | "assistant" | "system"; content: any }> = [
          {
            role: "system",
            content: FLEMING_3_5_IMAGE_ANALYSIS_PROMPT
          },
          {
            role: "user",
            content: [
              ...images.map(img => ({
                type: "image" as const,
                image: img.url
              })),
              {
                type: "text" as const,
                text: userText || "Please analyze these images comprehensively and extract all relevant information."
              }
            ]
          }
        ]

        let imageAnalysis = ""
        try {
          const grokStream = await streamText({
            model: grokModel,
            messages: grokMessages,
            abortSignal
          })
          
          // Collect the full text from the stream
          for await (const chunk of grokStream.textStream) {
            imageAnalysis += chunk
          }
        } catch (error) {
          console.error("[Fleming 3.5] Error analyzing images with Grok:", error)
          imageAnalysis = "Unable to analyze images. Please describe the images in your message."
        }

        // Prepare messages for Pi
        const piMessages = messages.map(msg => {
          if (msg.role === "user" && msg === lastUserMessage) {
            const originalText = getTextContent(msg)
            const combinedText = originalText 
              ? `${originalText}\n\n[Image Analysis]: ${imageAnalysis}`
              : `[Image Analysis]: ${imageAnalysis}`
            
            return {
              ...msg,
              content: combinedText,
              experimental_attachments: undefined
            }
          }
          return {
            ...msg,
            experimental_attachments: undefined
          }
        })

        return await piModel.doGenerate({
          ...options,
          prompt: piMessages
        })
      } else {
        // Direct flow: No images, use Pi directly
        const cleanedMessages = messages.map(msg => ({
          ...msg,
          experimental_attachments: undefined
        }))

        return await piModel.doGenerate({
          ...options,
          prompt: cleanedMessages
        })
      }
    },
  }

  return model
}

