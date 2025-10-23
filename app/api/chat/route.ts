import { SYSTEM_PROMPT_DEFAULT, MEDICAL_STUDENT_SYSTEM_PROMPT, getSystemPromptByRole } from "@/lib/config"
import { getAllModels, getModelInfo } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
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
import { integrateMedicalKnowledge, checkDrugInteractions, DrugInteraction } from "@/lib/models/medical-knowledge"

export const maxDuration = 60

// CACHED SYSTEM PROMPTS for instant access
const systemPromptCache = new Map<string, string>()
const getCachedSystemPrompt = (role: "doctor" | "general" | "medical_student" | undefined, specialty?: string, customPrompt?: string): string => {
  if (customPrompt) return customPrompt
  
  const cacheKey = `${role || 'general'}-${specialty || 'default'}`
  if (!systemPromptCache.has(cacheKey)) {
    const prompt = getSystemPromptByRole(role, customPrompt)
    systemPromptCache.set(cacheKey, prompt)
  }
  return systemPromptCache.get(cacheKey)!
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

type ChatRequest = {
  messages: MessageAISDK[]
  chatId: string
  userId: string
  model: SupportedModel
  isAuthenticated: boolean
  systemPrompt: string
  enableSearch: boolean
  message_group_id?: string
  userRole?: "doctor" | "general" | "medical_student"
  medicalSpecialty?: string
  clinicalDecisionSupport?: boolean
  medicalLiteratureAccess?: boolean
  medicalComplianceMode?: boolean
  // Patient health context
  healthContext?: string
  healthConditions?: string[]
  medications?: string[]
  allergies?: string[]
  familyHistory?: string
  lifestyleFactors?: string
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
      healthContext,
      healthConditions,
      medications,
      allergies,
      familyHistory,
      lifestyleFactors,
    } = (await req.json()) as ChatRequest

    if (!messages || !chatId || !userId) {
      return new Response(
        JSON.stringify({ error: "Error, missing information" }),
        { status: 400 }
      )
    }

    // START STREAMING IMMEDIATELY - minimal blocking operations
    let effectiveSystemPrompt = getCachedSystemPrompt(
      userRole || "general",
      medicalSpecialty,
      systemPrompt
    )

    // Check for drug interactions if user has medications
    let drugInteractions: DrugInteraction[] = []
    if (medications && medications.length >= 2) {
      console.log("🔍 Checking drug interactions for medications:", medications)
      try {
        drugInteractions = await checkDrugInteractions(medications)
        console.log(`✅ Drug interaction check complete. Found ${drugInteractions.length} interactions.`)
        if (drugInteractions.length > 0) {
          console.log("⚠️ Drug interactions found:", drugInteractions.map(i => `${i.drug1} + ${i.drug2} (${i.severity})`))
        }
      } catch (error) {
        console.error("❌ Error checking drug interactions:", error)
      }
    }

    // Add health context to system prompt - IMPORTANT: For ALL users (general, doctor, medical_student)
    const hasHealthContext = healthContext || healthConditions || medications || allergies || familyHistory || lifestyleFactors

    if (hasHealthContext) {
      // For healthcare professionals: use specialized healthcare prompt
      if (userRole === "doctor" || userRole === "medical_student") {
        const healthcarePrompt = getHealthcareSystemPromptServer(
          userRole,
          medicalSpecialty,
          clinicalDecisionSupport,
          medicalLiteratureAccess,
          medicalComplianceMode,
          {
            healthContext,
            healthConditions,
            medications,
            allergies,
            familyHistory,
            lifestyleFactors
          }
        )

        if (healthcarePrompt) {
          effectiveSystemPrompt = healthcarePrompt
        }

        // Add drug interaction warnings for healthcare professionals
        if (drugInteractions.length > 0) {
          effectiveSystemPrompt += "\n\n=== ⚠️ DETECTED DRUG INTERACTIONS ==="
          effectiveSystemPrompt += `\n\n${drugInteractions.length} potential drug interaction(s) detected in patient's current medication list:`

          drugInteractions.forEach((interaction, index) => {
            effectiveSystemPrompt += `\n\n${index + 1}. **${interaction.drug1}** + **${interaction.drug2}**`
            effectiveSystemPrompt += `\n   - Severity: ${interaction.severity.toUpperCase()}`
            effectiveSystemPrompt += `\n   - Description: ${interaction.description}`
            effectiveSystemPrompt += `\n   - Recommendation: ${interaction.recommendation}`
            if (interaction.source) {
              effectiveSystemPrompt += `\n   - Source: ${interaction.source}`
            }
          })

          effectiveSystemPrompt += "\n\n=== END DRUG INTERACTIONS ==="
          effectiveSystemPrompt += "\n\n⚠️ CRITICAL: Consider these interactions when making any medication recommendations. Consult with pharmacist or use clinical decision support tools for comprehensive interaction checking."
        }
      }
      // For general users: add health context with safety disclaimers
      else {
        effectiveSystemPrompt += "\n\n=== USER HEALTH INFORMATION ==="
        effectiveSystemPrompt += "\n\nIMPORTANT: The user has provided the following health information. You MUST consider this in your responses, especially when discussing medications, treatments, or health advice."

        if (healthContext) {
          effectiveSystemPrompt += `\n\nGeneral Health Information:\n${healthContext}`
        }

        if (healthConditions && healthConditions.length > 0) {
          effectiveSystemPrompt += `\n\nKnown Health Conditions:\n${healthConditions.map(c => `- ${c}`).join('\n')}`
          effectiveSystemPrompt += `\n\n⚠️ CRITICAL: Always consider how advice might interact with these existing conditions.`
        }

        if (medications && medications.length > 0) {
          effectiveSystemPrompt += `\n\nCurrent Medications:\n${medications.map(m => `- ${m}`).join('\n')}`
          effectiveSystemPrompt += `\n\n⚠️ CRITICAL: The user is taking these medications. ALWAYS:\n- Warn about potential drug interactions before suggesting ANY new medication or supplement\n- Remind them to consult their doctor or pharmacist before starting anything new\n- Flag any obvious contraindications or risks`
        }

        // Add drug interaction warnings for general users
        if (drugInteractions.length > 0) {
          effectiveSystemPrompt += `\n\n⚠️ DETECTED DRUG INTERACTIONS IN YOUR MEDICATION LIST:`

          drugInteractions.forEach((interaction, index) => {
            effectiveSystemPrompt += `\n\n${index + 1}. **${interaction.drug1}** + **${interaction.drug2}**`
            effectiveSystemPrompt += `\n   - Severity: ${interaction.severity.toUpperCase()}`
            effectiveSystemPrompt += `\n   - ${interaction.description}`
            effectiveSystemPrompt += `\n   - ${interaction.recommendation}`
          })

          effectiveSystemPrompt += `\n\n⚠️ IMPORTANT: You MUST inform the user about these detected interactions in your response, especially if they ask about their medications or any new treatments. Emphasize that they should discuss these interactions with their doctor or pharmacist.`
        }

        if (allergies && allergies.length > 0) {
          effectiveSystemPrompt += `\n\n🚨 ALLERGIES (NEVER RECOMMEND THESE):\n${allergies.map(a => `- ${a}`).join('\n')}`
          effectiveSystemPrompt += `\n\n⚠️ CRITICAL: NEVER suggest medications, treatments, or substances that contain these allergens. This could be life-threatening.`
        }

        if (familyHistory) {
          effectiveSystemPrompt += `\n\nFamily Medical History:\n${familyHistory}`
        }

        if (lifestyleFactors) {
          effectiveSystemPrompt += `\n\nLifestyle Factors:\n${lifestyleFactors}`
        }

        effectiveSystemPrompt += "\n\n=== END USER HEALTH INFORMATION ==="
        effectiveSystemPrompt += "\n\nREMINDER: You are NOT a doctor. However, you MUST use the health information above to:"
        effectiveSystemPrompt += "\n1. Avoid recommending anything contraindicated by their medications, allergies, or conditions"
        effectiveSystemPrompt += "\n2. Warn them about potential interactions or risks"
        effectiveSystemPrompt += "\n3. Emphasize the importance of consulting their healthcare provider, especially given their specific health context"
        effectiveSystemPrompt += "\n4. Provide safer, more personalized guidance that accounts for their situation"
      }
    }
    
    // INSTANT MODEL LOADING - no async operations, no delays
    console.log(`🔍 Looking for model: "${model}"`)
    const modelConfig = getModelInfo(model)
    console.log(`📋 Model config found:`, modelConfig ? `${modelConfig.id} (${modelConfig.name})` : 'null')

    if (!modelConfig || !modelConfig.apiSdk) {
      console.error(`❌ Model "${model}" not found or missing apiSdk`)
      throw new Error(`Model ${model} not found`)
    }

    // Get API key if needed (this is fast) - only for real users
    let apiKey: string | undefined
    if (isAuthenticated && userId && userId !== "temp") {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      const provider = getProviderForModel(model)
      apiKey = (await getEffectiveApiKey(userId, provider as ProviderWithoutOllama)) || undefined
    }

    // Filter out invalid attachments but keep data URLs and blob URLs for vision models
    // Vision models can process both data URLs (base64) and blob URLs directly
    const filteredMessages = messages.map(message => {
      if (message.experimental_attachments) {
        // Keep all valid attachments including data URLs and blob URLs for vision models
        const filteredAttachments = message.experimental_attachments.filter(
          (attachment: any) => {
            // Keep if it has a valid URL (including data URLs and blob URLs for vision models)
            return attachment.url && attachment.name && attachment.contentType
          }
        )
        
        console.log(`Processing attachments for message: ${filteredAttachments.length}/${message.experimental_attachments.length} valid`)
        if (filteredAttachments.length > 0) {
          console.log('Valid attachments:', filteredAttachments.map(a => ({ 
            name: a.name, 
            contentType: a.contentType,
            url: a.url?.startsWith('blob:') ? 'blob:...' : 
                 a.url?.startsWith('data:') ? 'data:...' : 
                 a.url?.substring(0, 50) + '...' 
          })))
        }
        
        return {
          ...message,
          experimental_attachments: filteredAttachments.length > 0 ? filteredAttachments : undefined
        }
      }
      return message
    })

    // START STREAMING IMMEDIATELY with basic prompt
    console.log("🚀 Starting streaming immediately...")
    const startTime = performance.now()
    
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
            // Only process completion if we have a real userId and chatId
            if (userId === "temp" || chatId === "temp" || chatId.startsWith("temp-chat-")) {
              console.log("Skipping completion processing for temp userId or chatId")
              return
            }

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

    const streamingStartTime = performance.now() - startTime
    console.log(`✅ Streaming started in ${streamingStartTime.toFixed(0)}ms`)

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

    console.log("✅ Streaming response ready, returning to client")
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
