import type { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart } from "@ai-sdk/provider"
import { env } from "./env"
import type { InflectionModel } from "./types"

/**
 * Creates a custom LanguageModelV1 adapter for Inflection AI
 * since they use a different API format than the standard AI SDK
 */
export function createInflectionModel(
  modelId: InflectionModel,
  apiKey?: string
): LanguageModelV1 {
  const effectiveApiKey = apiKey || env.INFLECTION_AI_API_KEY

  if (!effectiveApiKey) {
    throw new Error(
      "Inflection AI API key is required. Set INFLECTION_AI environment variable or provide apiKey parameter."
    )
  }

  // Map model IDs to Inflection AI config names
  const configMap: Record<InflectionModel, string> = {
    "pi-3.1": "Pi-3.1",
    "pi-3.1-latest": "Pi-3.1",
  }

  const config = configMap[modelId] || "Pi-3.1"

  const model: LanguageModelV1 = {
    specificationVersion: 'v1',
    modelId: modelId,
    provider: "inflection",
    defaultObjectGenerationMode: undefined,
    supportsUrl: () => false,
    supportsImageUrls: false,
    supportsStructuredOutputs: false,

    doStream: async function(options: LanguageModelV1CallOptions) {
      // CRITICAL: This function must NEVER throw synchronously
      // All errors must be thrown from within the generator
      try {
        const { prompt, abortSignal } = options
        const messages = prompt
        // Extract system message if present (first message with role 'system')
        const systemMessage = messages.find(m => m.role === 'system')
        const system = systemMessage && typeof systemMessage.content === 'string' ? systemMessage.content : undefined
        // Filter out system messages from the messages array for Inflection API
        const messagesWithoutSystem = messages.filter(m => m.role !== 'system')

        // Create async generator that handles both success and error cases
        // All async work must happen inside the generator to ensure proper error handling
        async function* streamGenerator() {
          let context: Array<{ text: string; type: "Human" | "AI" }> = []
          
          try {
            // Convert messages to Inflection AI format
            context = []

            // Add system message if present
            if (system) {
              context.push({
                text: system,
                type: "Human",
              })
            }

            // Convert AI SDK messages to Inflection format
            for (const message of messagesWithoutSystem) {
              if (message.role === "user") {
                const content =
                  typeof message.content === "string"
                    ? message.content
                    : message.content
                        .map((part) => {
                          if (part.type === "text") return part.text
                          return ""
                        })
                        .join("")
                if (content) {
                  context.push({ text: content, type: "Human" })
                }
              } else if (message.role === "assistant") {
                const content =
                  typeof message.content === "string"
                    ? message.content
                    : message.content
                        .map((part) => {
                          if (part.type === "text") return part.text
                          return ""
                        })
                        .join("")
                if (content) {
                  context.push({ text: content, type: "AI" })
                }
              }
            }

            // Make the API request
            let response: Response
            try {
              response = await fetch(
                "https://api.inflection.ai/external/api/inference",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${effectiveApiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    context,
                    config,
                  }),
                  signal: abortSignal,
                }
              )
            } catch (fetchError: unknown) {
              // Handle network errors and abort signals
              if (fetchError instanceof Error && fetchError.name === "AbortError") {
                throw new Error("Request was aborted")
              }
              // Re-throw as a proper Error object
              const errorMessage = fetchError instanceof Error 
                ? fetchError.message 
                : "Network error occurred"
              throw new Error(`Inflection AI API request failed: ${errorMessage}`)
            }

            if (!response.ok) {
              let errorText = ""
              try {
                errorText = await response.text()
              } catch {
                errorText = response.statusText
              }
              const error = new Error(
                `Inflection AI API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
              )
              // Add status code for better error handling
              ;(error as any).statusCode = response.status
              throw error
            }

            // Inflection AI returns JSON response, not streaming
            // Parse the response and convert to streaming format
            let data: any
            try {
              const responseText = await response.text()
              console.log("[Inflection Adapter] Raw API response:", responseText.substring(0, 500))
              try {
                data = JSON.parse(responseText)
                console.log("[Inflection Adapter] Parsed response data:", JSON.stringify(data).substring(0, 500))
              } catch {
                // If JSON parsing fails, treat the text as the response
                data = responseText
              }
            } catch (parseError) {
              console.error("[Inflection Adapter] Failed to read response:", parseError)
              throw new Error(`Failed to read Inflection AI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
            }
            
            // Extract text from response - try multiple possible fields
            // Based on Inflection AI docs, the response might be in different formats
            let text = ""
            if (typeof data === "string") {
              text = data
            } else if (data && typeof data === "object") {
              // Try common response field names (check output first as it's most likely)
              text = data.output || data.text || data.content || data.message || data.response || data.data || ""
              
              // If response is an array, try to extract text from first item
              if (!text && Array.isArray(data) && data.length > 0) {
                const firstItem = data[0]
                if (typeof firstItem === "string") {
                  text = firstItem
                } else if (firstItem && typeof firstItem === "object") {
                  text = firstItem.output || firstItem.text || firstItem.content || firstItem.message || ""
                }
              }
              
              // Log if we couldn't find text in expected fields
              if (!text) {
                console.warn("[Inflection Adapter] Could not find text in response, available keys:", Object.keys(data))
              }
            }
            
            // If still no text, stringify the whole response as fallback
            if (!text && data) {
              if (typeof data === "string") {
                text = data
              } else {
                // Try to find any string value in the object
                const stringValues = Object.values(data).filter(v => typeof v === "string" && v.length > 0)
                if (stringValues.length > 0) {
                  text = stringValues[0] as string
                } else {
                  text = JSON.stringify(data)
                }
              }
            }
            
            // Ensure we have at least some text
            if (!text) {
              console.error("[Inflection Adapter] No text found in response, data:", data)
              text = "No response received from Inflection AI"
            }
            
            console.log("[Inflection Adapter] Extracted text length:", text.length)
            
            // Stream text immediately in small chunks for better perceived responsiveness
            // Since Inflection AI returns complete JSON (not streaming), we simulate streaming
            // by chunking the response immediately after receiving it
            // Use 2-character chunks for fast, smooth streaming
            const chunkSize = 2
            for (let i = 0; i < text.length; i += chunkSize) {
              // Check if aborted before yielding each chunk
              if (abortSignal?.aborted) {
                throw new Error("Request was aborted")
              }
              
              // Yield small chunks for fast perceived streaming
              const chunk = text.slice(i, i + chunkSize)
              if (chunk) {
                yield {
                  type: "text-delta" as const,
                  textDelta: chunk,
                }
              }
            }
          } catch (error: unknown) {
            // Log the error for debugging
            console.error("[Inflection Adapter] Error in streamGenerator:", error)
            
            // Ensure error is a proper Error object with all required properties
            let finalError: Error
            if (error instanceof Error) {
              finalError = error
            } else {
              finalError = new Error(String(error))
            }
            
            // Ensure the error has a proper stack trace and message
            if (!finalError.stack) {
              Error.captureStackTrace?.(finalError)
            }
            
            throw finalError
          }
        }
        
        // Convert AsyncGenerator to ReadableStream
        const stream = new ReadableStream<LanguageModelV1StreamPart>({
          async start(controller) {
            try {
              for await (const chunk of streamGenerator()) {
                controller.enqueue(chunk)
              }
              controller.close()
            } catch (error) {
              controller.error(error)
            }
          },
        })
        
        // Always return immediately with a stream
        // The generator will handle all async work and errors
        return {
          stream,
          rawCall: {
            rawPrompt: JSON.stringify({ context: [], config }),
            rawSettings: {},
          },
          warnings: undefined,
        }
      } catch (syncError: unknown) {
        // This should never happen, but if it does, create an error generator
        console.error("[Inflection Adapter] Synchronous error in doStream (this should not happen):", syncError)
        
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
            rawPrompt: JSON.stringify({ context: [], config }),
            rawSettings: {},
          },
          warnings: undefined,
        }
      }
    },

    doGenerate: async function(options) {
      try {
        const { prompt, abortSignal } = options
        const messages = prompt
        // Extract system message if present (first message with role 'system')
        const systemMessage = messages.find(m => m.role === 'system')
        const system = systemMessage && typeof systemMessage.content === 'string' ? systemMessage.content : undefined
        // Filter out system messages from the messages array for Inflection API
        const messagesWithoutSystem = messages.filter(m => m.role !== 'system')

        // Convert messages to Inflection AI format
        const context: Array<{ text: string; type: "Human" | "AI" }> = []

        if (system) {
          context.push({
            text: system,
            type: "Human",
          })
        }

        for (const message of messages) {
          if (message.role === "user") {
            const content =
              typeof message.content === "string"
                ? message.content
                : message.content
                    .map((part: { type: string; text?: string }) => {
                      if (part.type === "text") return part.text || ""
                      return ""
                    })
                    .join("")
            if (content) {
              context.push({ text: content, type: "Human" })
            }
          } else if (message.role === "assistant") {
            const content =
              typeof message.content === "string"
                ? message.content
                : message.content
                    .map((part: { type: string; text?: string }) => {
                      if (part.type === "text") return part.text || ""
                      return ""
                    })
                    .join("")
            if (content) {
              context.push({ text: content, type: "AI" })
            }
          }
        }

        let response: Response
        try {
          response = await fetch(
            "https://api.inflection.ai/external/api/inference",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${effectiveApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                context,
                config,
              }),
              signal: abortSignal,
            }
          )
        } catch (fetchError: unknown) {
          // Handle network errors and abort signals
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw new Error("Request was aborted")
          }
          // Re-throw as a proper Error object
          const errorMessage = fetchError instanceof Error 
            ? fetchError.message 
            : "Network error occurred"
          throw new Error(`Inflection AI API request failed: ${errorMessage}`)
        }

        if (!response.ok) {
          let errorText = ""
          try {
            errorText = await response.text()
          } catch {
            errorText = response.statusText
          }
          const error = new Error(
            `Inflection AI API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
          )
          // Add status code for better error handling
          ;(error as any).statusCode = response.status
          throw error
        }

        let data: any
        try {
          data = await response.json()
        } catch (parseError) {
          let text = ""
          try {
            text = await response.text()
          } catch {
            text = "Failed to read response"
          }
          throw new Error(`Failed to parse Inflection AI response: ${text}`)
        }

        const text = data.text || data.content || data.message || data.response || ""

        return {
          text,
          finishReason: "stop" as const,
          usage: {
            promptTokens: data.usage?.prompt_tokens || data.usage?.promptTokens || 0,
            completionTokens: data.usage?.completion_tokens || data.usage?.completionTokens || 0,
          },
          rawCall: {
            rawPrompt: JSON.stringify({ context, config }),
            rawSettings: {},
          },
          warnings: undefined,
        }
      } catch (error: unknown) {
        // Log the error for debugging
        console.error("[Inflection Adapter] Error in doGenerate:", error)
        
        // Ensure all errors are proper Error objects with proper structure
        if (error instanceof Error) {
          // Ensure the error has all necessary properties
          const formattedError = new Error(error.message)
          // Copy over any additional properties that might be needed
          if ((error as any).statusCode) {
            (formattedError as any).statusCode = (error as any).statusCode
          }
          if ((error as any).code) {
            (formattedError as any).code = (error as any).code
          }
          throw formattedError
        }
        // Convert unknown errors to Error objects
        throw new Error(String(error))
      }
    },
  }

  return model
}

