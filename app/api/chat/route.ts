import { SYSTEM_PROMPT_DEFAULT } from "@/lib/config"
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

// Enhanced chunking configuration for better streaming performance
const STREAMING_CONFIG = {
  // Optimal chunk size for smooth streaming (words per chunk)
  CHUNK_SIZE: 15,
  // Minimum delay between chunks to prevent overwhelming the client
  MIN_CHUNK_DELAY: 50,
  // Maximum delay between chunks to maintain responsiveness
  MAX_CHUNK_DELAY: 200,
  // Enable adaptive chunking based on response length
  ADAPTIVE_CHUNKING: true,
  // Enable streaming optimizations
  STREAMING_OPTIMIZATIONS: true
}

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

// Enhanced streaming configuration based on query complexity
function getStreamingConfig(query: string) {
  const complexity = assessQueryComplexity(query)
  
  if (complexity === "simple") {
    return {
      ...STREAMING_CONFIG,
      CHUNK_SIZE: 20, // Larger chunks for simple queries
      MIN_CHUNK_DELAY: 30, // Faster streaming for simple queries
      MAX_CHUNK_DELAY: 100
    }
  }
  
  return {
    ...STREAMING_CONFIG,
    CHUNK_SIZE: 10, // Smaller chunks for complex queries
    MIN_CHUNK_DELAY: 75, // Slightly slower for complex queries
    MAX_CHUNK_DELAY: 250
  }
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
  userRole?: "doctor" | "general"
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

    console.log("=== REQUEST DEBUG ===")
    console.log("Received userRole from frontend:", userRole)
    console.log("Received medicalSpecialty from frontend:", medicalSpecialty)
    console.log("Received clinicalDecisionSupport from frontend:", clinicalDecisionSupport)
    console.log("Received medicalLiteratureAccess from frontend:", medicalLiteratureAccess)
    console.log("Received medicalComplianceMode from frontend:", medicalComplianceMode)
    console.log("=== END REQUEST DEBUG ===")

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    const supabase = await validateAndTrackUsage({
      userId,
      model,
      isAuthenticated,
    })

    // Increment message count for successful validation
    if (supabase) {
      await incrementMessageCount({ supabase, userId })
    }

    const userMessage = messages[messages.length - 1]

    if (supabase && userMessage?.role === "user") {
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

    const allModels = await getAllModels()
    const modelConfig = allModels.find((m) => m.id === model)

    if (!modelConfig || !modelConfig.apiSdk) {
      throw new Error(`Model ${model} not found`)
    }

    let effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT_DEFAULT

    // Role-based system prompt selection:
    // - userRole === "doctor": Healthcare professional mode with medical AI assistant
    // - userRole === "general" or undefined: General user mode with appropriate disclaimers
    if (userRole === "doctor") {
      console.log("Healthcare professional mode detected - userRole:", userRole)
      console.log("Original systemPrompt from frontend:", systemPrompt)
      
      // Force healthcare system for all doctors, regardless of frontend systemPrompt
      const healthcarePrompt = getHealthcareSystemPromptServer(
        userRole,
        medicalSpecialty,
        clinicalDecisionSupport,
        medicalLiteratureAccess,
        medicalComplianceMode
      )
      
      // Always use healthcare system for doctors, override frontend systemPrompt
      effectiveSystemPrompt = healthcarePrompt || SYSTEM_PROMPT_DEFAULT
      
      console.log("Healthcare prompt result:", healthcarePrompt ? "Generated" : "Failed/Empty")
      
      // Add extremely strong doctor-focused instructions
      effectiveSystemPrompt += `\n\nCRITICAL INSTRUCTIONS: You are a Medical AI Assistant speaking to a healthcare professional. NEVER use patient-facing language like "I'm not a doctor", "I can't diagnose", "talk to your doctor", or "I can't provide medical advice". You are a medical AI assistant designed to support clinical decision-making. Provide direct, evidence-based clinical guidance as you would to a medical colleague. Use medical terminology appropriately and maintain professional clinical standards.`
      
      console.log("Healthcare system prompt applied for doctor role")
      
      // Always use healthcare agents for medical professionals
      const medicalContext: MedicalContext = {
        userRole: "doctor",
        medicalSpecialty,
        specialties: medicalSpecialty ? [medicalSpecialty] : [],
        requiredCapabilities: [],
        clinicalDecisionSupport,
        medicalLiteratureAccess,
        medicalComplianceMode
      }
      
      // Always analyze and orchestrate for healthcare professionals
      const agentSelections = analyzeMedicalQuery(userMessage.content, medicalContext)
      
      if (agentSelections.length > 0) {
        try {
          const orchestrationInfo = await orchestrateHealthcareAgents(userMessage.content, medicalContext)
          effectiveSystemPrompt += `\n\n${orchestrationInfo}`
          
          // Integrate medical knowledge for comprehensive responses
          try {
            const medicalKnowledge = await integrateMedicalKnowledge(userMessage.content, medicalContext, agentSelections)
            if (medicalKnowledge.length > 0) {
              effectiveSystemPrompt += `\n\nMEDICAL KNOWLEDGE SOURCES:\n`
              medicalKnowledge.slice(0, 3).forEach((knowledge, index) => {
                effectiveSystemPrompt += `${index + 1}. ${knowledge.source}: ${knowledge.title} (Evidence Level: ${knowledge.evidenceLevel})\n`
              })
              effectiveSystemPrompt += `\nUse this evidence-based information to support your recommendations.`
            }
          } catch (error) {
            console.warn("Medical knowledge integration failed:", error)
          }
        } catch (error) {
          console.warn("Orchestration failed, falling back to direct response:", error)
        }
      }
      
      // Always add compliance reminders
      effectiveSystemPrompt += `\n\nIMPORTANT: You are assisting a healthcare professional. Provide direct, evidence-based medical guidance as you would to a clinical colleague. Include appropriate disclaimers for clinical use and suggest specialist consultation when needed.`
    } else {
      // Even for non-doctor roles, ensure we don't use patient-facing language if this is a medical query
      if (userMessage.content.toLowerCase().includes('pain') || 
          userMessage.content.toLowerCase().includes('symptom') || 
          userMessage.content.toLowerCase().includes('diagnosis') ||
          userMessage.content.toLowerCase().includes('treatment')) {
        effectiveSystemPrompt += `\n\nNOTE: If this is a medical query, provide evidence-based information while maintaining appropriate professional standards.`
      }
    }

    let apiKey: string | undefined
    if (isAuthenticated && userId) {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      const provider = getProviderForModel(model)
      apiKey =
        (await getEffectiveApiKey(userId, provider as ProviderWithoutOllama)) ||
        undefined
    }

    console.log("Final system prompt for userRole:", userRole, "Length:", effectiveSystemPrompt.length)
    console.log("System prompt preview:", effectiveSystemPrompt.substring(0, 500))
    console.log("=== FULL SYSTEM PROMPT ===")
    console.log(effectiveSystemPrompt)
    console.log("=== END SYSTEM PROMPT ===")
    
    // Only add fallback for medical queries if userRole is explicitly "general" (not undefined or other values)
    if (userRole === "general" && (
      userMessage.content.toLowerCase().includes('pain') || 
      userMessage.content.toLowerCase().includes('symptom') || 
      userMessage.content.toLowerCase().includes('diagnosis') ||
      userMessage.content.toLowerCase().includes('treatment') ||
      userMessage.content.toLowerCase().includes('medical') ||
      userMessage.content.toLowerCase().includes('patient')
    )) {
      effectiveSystemPrompt += `\n\nNOTE: This appears to be a medical query. Provide evidence-based information while maintaining appropriate professional standards.`
    }
    
    // RAG Integration - Add relevant context from user's materials
    if (enableSearch) {
      try {
        const { ragSearchService } = await import('@/lib/rag/core/search')
        const relevantContext = await ragSearchService.getRelevantContext(
          userMessage.content,
          userId,
          {
            threshold: 0.6,
            limit: 3,
            maxTokens: 3000
          }
        )

        if (relevantContext.sources.length > 0) {
          const contextText = relevantContext.sources
            .map(source => `[${source.material_type.toUpperCase()}] ${source.title}:\n${source.content_preview}`)
            .join('\n\n')

          effectiveSystemPrompt += `\n\nRELEVANT CONTEXT FROM YOUR MATERIALS:\n${contextText}\n\nUse this information to provide more accurate and contextual responses. If the information isn't in your materials, say so.`
          
          console.log("RAG context added:", relevantContext.sources.length, "sources")
        }
      } catch (error) {
        console.warn('RAG search failed, continuing without context:', error)
      }
    }
    
    // Get optimized streaming configuration based on query complexity
    const streamingConfig = getStreamingConfig(userMessage.content)
    console.log("=== STREAMING CONFIG ===")
    console.log("Query complexity:", assessQueryComplexity(userMessage.content))
    console.log("Chunk size:", streamingConfig.CHUNK_SIZE)
    console.log("Min delay:", streamingConfig.MIN_CHUNK_DELAY)
    console.log("Max delay:", streamingConfig.MAX_CHUNK_DELAY)
    console.log("=== END STREAMING CONFIG ===")
    
    const result = streamText({
      model: modelConfig.apiSdk(apiKey, { enableSearch }),
      system: effectiveSystemPrompt,
      messages: messages,
      tools: {} as ToolSet,
      maxSteps: 10,
      
      // Enhanced error handling with better user feedback
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
        const errorMessage = err instanceof Error ? err.message : String(err)
        
        // Log detailed error information for debugging
        console.error("Error details:", {
          message: errorMessage,
          stack: err instanceof Error ? err.stack : undefined,
          timestamp: new Date().toISOString(),
          userId,
          chatId,
          model
        })
      },

      // Enhanced finish handler with better logging
      onFinish: async ({ response, usage }) => {
        console.log("=== STREAMING FINISHED ===")
        console.log("Response length:", response.messages.length)
        console.log("Usage:", usage)
        
        if (supabase) {
          try {
            await storeAssistantMessage({
              supabase,
              chatId,
              messages:
                response.messages as unknown as import("@/app/types/api.types").Message[],
              message_group_id,
              model,
            })
            console.log("Assistant message stored successfully")
          } catch (error) {
            console.error("Failed to store assistant message:", error)
          }
        }
      },
    })

    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      
      // Enhanced error message extraction
      getErrorMessage: (error: unknown) => {
        console.error("Error forwarded to client:", error)
        const extractedMessage = extractErrorMessage(error)
        
        // Provide more user-friendly error messages
        if (extractedMessage.includes("rate limit") || extractedMessage.includes("quota")) {
          return "You've reached your message limit. Please try again later or upgrade your plan."
        }
        
        if (extractedMessage.includes("authentication") || extractedMessage.includes("unauthorized")) {
          return "Authentication error. Please check your API keys in settings."
        }
        
        if (extractedMessage.includes("network") || extractedMessage.includes("fetch")) {
          return "Network error. Please check your connection and try again."
        }
        
        return extractedMessage || "An unexpected error occurred. Please try again."
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
