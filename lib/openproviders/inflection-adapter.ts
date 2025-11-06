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

  // Map model IDs to Inflection AI API config names
  const modelMap: Record<InflectionModel, string> = {
    "pi-3.1": "Pi-3.1",
    "fleming-3.5": "Pi-3.1", // Fleming 3.5 uses Pi model
  }

  const apiConfigName = modelMap[modelId] || "Pi-3.1"

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
        
        // Extract system message if present
        const systemMessage = messages.find(m => m.role === 'system')
        const system = systemMessage && typeof systemMessage.content === 'string' ? systemMessage.content : undefined

        // Convert messages to Inflection AI /external/api/inference format
        // Format: { context: [{ text: "...", type: "Instruction" | "Human" | "AI" }], config: "Pi-3.1" }
        const context: Array<{ text: string; type: string }> = []

        // Add system message as first context item if present
        // Note: Use "Instruction" type for system messages per Inflection API spec
        if (system) {
          context.push({
            text: system,
            type: "Instruction"
          })
        }

        // Convert AI SDK messages to Inflection format
        for (const message of messages) {
          if (message.role === "user" || message.role === "assistant") {
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
              context.push({
                text: content,
                type: message.role === "user" ? "Human" : "AI"
              })
            }
          }
        }

        // Create async generator that handles streaming from Inflection AI
        // Use /external/api/inference/streaming for real streaming support
        async function* streamGenerator() {
          try {
            let response: Response
            try {
              const requestBody = {
                context: context,
                config: apiConfigName,
              }
              
              console.log("[Inflection Adapter] Making streaming request to /external/api/inference/streaming:", {
                url: "https://api.inflection.ai/external/api/inference/streaming",
                config: apiConfigName,
                contextCount: context.length,
                hasApiKey: !!effectiveApiKey,
                apiKeyPrefix: effectiveApiKey?.substring(0, 10) + "..."
              })
              
              response = await fetch(
                "https://api.inflection.ai/external/api/inference/streaming",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${effectiveApiKey}`,
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                  },
                  body: JSON.stringify(requestBody),
                  signal: abortSignal,
                }
              )
            } catch (fetchError: unknown) {
              // Handle network errors and abort signals
              if (fetchError instanceof Error && fetchError.name === "AbortError") {
                throw new Error("Request was aborted")
              }
              const errorMessage = fetchError instanceof Error 
                ? fetchError.message 
                : "Network error occurred"
              throw new Error(`Inflection AI API request failed: ${errorMessage}`)
            }

            // Check response status
            if (!response.ok) {
              let errorText = ""
              try {
                errorText = await response.text()
              } catch {
                errorText = response.statusText
              }
              
              console.error("[Inflection Adapter] API error:", {
                status: response.status,
                statusText: response.statusText,
                errorText,
                config: apiConfigName,
                contextCount: context.length
              })
              
              const error = new Error(
                `Inflection AI API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
              )
              ;(error as any).statusCode = response.status
              throw error
            }

            // Parse Server-Sent Events (SSE) stream from /external/api/inference/streaming
            // Format: data: {"created": ..., "idx": 0, "text": "...", "tool_calls": null}
            if (!response.body) {
              throw new Error("Response body is null - cannot stream")
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            try {
              while (true) {
                if (abortSignal?.aborted) {
                  throw new Error("Request was aborted")
                }

                const { done, value } = await reader.read()
                if (done) {
                  // Process any remaining buffer
                  if (buffer.trim()) {
                    const lines = buffer.split("\n")
                    for (const line of lines) {
                      if (line.trim() && line.startsWith("data: ")) {
                        const data = line.slice(6).trim()
                        if (data && data !== "[DONE]") {
                          try {
                            const parsed = JSON.parse(data)
                            if (parsed.text) {
                              yield {
                                type: "text-delta" as const,
                                textDelta: parsed.text,
                              }
                            }
                          } catch (parseError) {
                            // Skip invalid JSON
                          }
                        }
                      }
                    }
                  }
                  break
                }

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || "" // Keep incomplete line in buffer

                for (const line of lines) {
                  const trimmedLine = line.trim()
                  if (!trimmedLine) continue
                  
                  if (trimmedLine.startsWith("data: ")) {
                    const data = trimmedLine.slice(6).trim()
                    if (data === "[DONE]") {
                      return
                    }
                    if (!data) continue
                    
                    try {
                      const parsed = JSON.parse(data)
                      // Streaming format: {"created": ..., "idx": 0, "text": "...", "tool_calls": null}
                      if (parsed.text) {
                        yield {
                          type: "text-delta" as const,
                          textDelta: parsed.text,
                        }
                      }
                    } catch (parseError) {
                      // Skip invalid JSON lines - log for debugging
                      if (data.length < 100) {
                        console.warn("[Inflection Adapter] Failed to parse SSE data:", data)
                      }
                    }
                  }
                }
              }
            } finally {
              reader.releaseLock()
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
              rawPrompt: JSON.stringify({ context, config: apiConfigName }),
              rawSettings: { stream: true }, // Real streaming from /external/api/inference/streaming
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
            rawPrompt: JSON.stringify({ context: [], config: apiConfigName }),
            rawSettings: { stream: false },
          },
          warnings: undefined,
        }
      }
    },

    doGenerate: async function(options) {
      try {
        const { prompt, abortSignal } = options
        const messages = prompt

        // Convert messages to Inflection AI /external/api/inference format
        const context: Array<{ text: string; type: string }> = []

        // Extract and add system message
        // Note: Use "Instruction" type for system messages per Inflection API spec
        const systemMessage = messages.find(m => m.role === 'system')
        const system = systemMessage && typeof systemMessage.content === 'string' ? systemMessage.content : undefined
        if (system) {
          context.push({
            text: system,
            type: "Instruction"
          })
        }

        // Convert other messages
        for (const message of messages) {
          if (message.role === "user" || message.role === "assistant") {
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
              context.push({
                text: content,
                type: message.role === "user" ? "Human" : "AI"
              })
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
                context: context,
                config: apiConfigName,
              }),
              signal: abortSignal,
            }
          )
        } catch (fetchError: unknown) {
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw new Error("Request was aborted")
          }
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

        const text = data.text || ""

        return {
          text,
          finishReason: "stop",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
          },
          rawCall: {
            rawPrompt: JSON.stringify({ context, config: apiConfigName }),
            rawSettings: { stream: false },
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

