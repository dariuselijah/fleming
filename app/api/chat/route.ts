import { SYSTEM_PROMPT_DEFAULT, MEDICAL_STUDENT_SYSTEM_PROMPT, getSystemPromptByRole } from "@/lib/config"
import { getAllModels } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { ProviderWithoutOllama } from "@/lib/user-keys"
import { Attachment } from "@ai-sdk/ui-utils"
import { Message as MessageAISDK, streamText, ToolSet } from "ai"
import {
  incrementMessageCount,
  logUserMessage,
  storeAssistantMessage,
  validateAndTrackUsage,
} from "./api"
import { createErrorResponse, extractErrorMessage } from "./utils"
import { 
  analyzeMedicalQuery, 
  MedicalContext, 
  AgentSelection,
  getHealthcareSystemPromptServer,
  orchestrateHealthcareAgents
} from "@/lib/models/healthcare-agents"
import { integrateMedicalKnowledge } from "@/lib/models/medical-knowledge"

export const maxDuration = 60

// Function to quickly assess query complexity for smart orchestration
function assessQueryComplexity(query: string): "simple" | "complex" {
  const queryLower = query.toLowerCase()
  
  // Simple queries that don't need full orchestration
  const simplePatterns = [
    "hello", "hi", "thanks", "thank you", "goodbye", "bye",
    "what is", "what are", "define", "explain", "describe",
    "how to", "steps", "procedure", "protocol",
    "yes", "no", "ok", "okay", "sure", "fine"
  ]
  
  // Complex queries that need full orchestration
  const complexPatterns = [
    "differential diagnosis", "diagnosis", "diagnostic",
    "treatment plan", "treatment options", "therapeutic",
    "medication", "drug", "pharmacology", "interaction",
    "imaging", "x-ray", "mri", "ct", "ultrasound", "radiology",
    "laboratory", "lab values", "biomarker", "test results",
    "risk assessment", "prognosis", "complication",
    "guidelines", "evidence", "research", "study",
    "patient", "case", "scenario", "clinical",
    "emergency", "urgent", "critical", "acute"
  ]
  
  // Check for complex medical patterns
  const hasComplexPatterns = complexPatterns.some(pattern => queryLower.includes(pattern))
  
  // Check for simple patterns
  const hasSimplePatterns = simplePatterns.some(pattern => queryLower.includes(pattern))
  
  // Long queries (>100 chars) are likely complex
  const isLongQuery = query.length > 100
  
  // If it has complex medical patterns or is a long query, it's complex
  if (hasComplexPatterns || isLongQuery) {
    return "complex"
  }
  
  // If it only has simple patterns and is short, it's simple
  if (hasSimplePatterns && query.length < 50) {
    return "simple"
  }
  
  // Default to complex for medical queries to be safe
  return "complex"
}

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: string
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  userRole?: "doctor" | "general" | "medical_student"
  medicalSpecialty?: string
  clinicalDecisionSupport?: boolean
  medicalLiteratureAccess?: boolean
  medicalComplianceMode?: boolean
}

export async function POST(req: Request) {
  try {
    const {
      messages,
      chatId,
      userId,
      model,
      isAuthenticated,
      systemPrompt,
      enableSearch,
      message_group_id,
      userRole,
      medicalSpecialty,
      clinicalDecisionSupport,
      medicalLiteratureAccess,
      medicalComplianceMode,
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    // START STREAMING IMMEDIATELY - minimal blocking operations
    let effectiveSystemPrompt = getSystemPromptByRole(userRole, systemPrompt)
    
    // Get model config immediately (this is fast)
    const allModels = await getAllModels()
    const modelConfig = allModels.find((m) => m.id === model)

    if (!modelConfig || !modelConfig.apiSdk) {
      throw new Error(`Model ${model} not found`)
    }

    // Get API key if needed (this is fast)
    let apiKey: string | undefined
    if (isAuthenticated && userId) {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      const provider = getProviderForModel(model)
      apiKey = (await getEffectiveApiKey(userId, provider as ProviderWithoutOllama)) || undefined
    }

    // Filter out blob URLs from messages to prevent AI SDK errors
    // But keep processed attachments (Supabase URLs) for vision models
    const filteredMessages = messages.map(message => {
      if (message.experimental_attachments) {
        // Keep attachments that are actual file URLs (not blob URLs)
        const filteredAttachments = message.experimental_attachments.filter(
          (attachment: any) => {
            // Keep if it's a valid file URL (not a blob URL)
            return attachment.url && !attachment.url.startsWith('blob:')
          }
        )
        
        console.log(`Filtering attachments for message: ${filteredAttachments.length}/${message.experimental_attachments.length} kept`)
        if (filteredAttachments.length > 0) {
          console.log('Kept attachments:', filteredAttachments.map(a => ({ name: a.name, url: a.url?.substring(0, 50) + '...' })))
        }
        
        return {
          ...message,
          experimental_attachments: filteredAttachments.length > 0 ? filteredAttachments : undefined
        }
      }
      return message
    })

    // Start streaming immediately with basic prompt
    const result = streamText({
      model: modelConfig.apiSdk(apiKey, { enableSearch }),
      system: effectiveSystemPrompt,
      messages: filteredMessages,
      tools: {} as ToolSet,
      maxSteps: 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        // Handle completion in background
        Promise.resolve().then(async () => {
          try {
            const supabase = await validateAndTrackUsage({
              userId,
              model,
              isAuthenticated,
            })

            if (supabase) {
              await incrementMessageCount({ supabase, userId })
              
              const userMessage = messages[messages.length - 1]
              if (userMessage?.role === "user") {
                await logUserMessage({
                  supabase,
                  userId,
                  chatId,
                  content: userMessage.content,
                  attachments: userMessage.experimental_attachments as Attachment[],
                  model,
                  isAuthenticated,
                  message_group_id,
                })
              }

              await storeAssistantMessage({
                supabase,
                chatId,
                messages:
                  response.messages as unknown as import("@/app/types/api.types").Message[],
                message_group_id,
                model,
              })
            }
          } catch (error) {
            console.warn("Background operations failed:", error)
          }
        })
      },
    })

    // ENHANCE SYSTEM PROMPT IN BACKGROUND (non-blocking)
    if (userRole === "doctor" || userRole === "medical_student") {
      // Don't await - let this run in background
      Promise.resolve().then(async () => {
        try {
          console.log("Enhancing system prompt in background for role:", userRole)
          
          const healthcarePrompt = getHealthcareSystemPromptServer(
            userRole,
            medicalSpecialty,
            clinicalDecisionSupport,
            medicalLiteratureAccess,
            medicalComplianceMode
          )
          
          if (healthcarePrompt) {
            console.log("Healthcare system prompt generated in background")
            
            // Analyze medical query complexity
            const medicalContext: MedicalContext = {
              userRole: userRole as "doctor" | "medical_student",
              medicalSpecialty,
              specialties: medicalSpecialty ? [medicalSpecialty] : [],
              requiredCapabilities: [],
              clinicalDecisionSupport,
              medicalLiteratureAccess,
              medicalComplianceMode
            }
            
            const agentSelections = analyzeMedicalQuery(messages[messages.length - 1].content, medicalContext)
            
            if (agentSelections.length > 0) {
              try {
                const orchestrationInfo = await orchestrateHealthcareAgents(messages[messages.length - 1].content, medicalContext)
                
                // Integrate medical knowledge
                try {
                  const medicalKnowledge = await integrateMedicalKnowledge(messages[messages.length - 1].content, medicalContext, agentSelections)
                  if (medicalKnowledge.length > 0) {
                    console.log("Medical knowledge integrated in background")
                  }
                } catch (error) {
                  console.warn("Background medical knowledge integration failed:", error)
                }
              } catch (error) {
                console.warn("Background orchestration failed:", error)
              }
            }
          }
        } catch (error) {
          console.warn("Background system prompt enhancement failed:", error)
        }
      })
    }

    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      // Optimize streaming response
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
      getErrorMessage: (error: unknown) => {
        console.error("Error forwarded to client:", error)
        return extractErrorMessage(error)
      },
    })
  } catch (err: unknown) {
    console.error("Error in /api/chat:", err)
    const error = err as {
      code?: string
      message?: string
      statusCode?: number
    }

    return createErrorResponse(error)
  }
}
