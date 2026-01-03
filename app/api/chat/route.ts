import { SYSTEM_PROMPT_DEFAULT, MEDICAL_STUDENT_SYSTEM_PROMPT, getSystemPromptByRole, FLEMING_4_SYSTEM_PROMPT } from "@/lib/config"
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
import { integrateMedicalKnowledge } from "@/lib/models/medical-knowledge"
import { anonymizeMessages } from "@/lib/anonymize"
import { synthesizeEvidence, buildEvidenceSystemPrompt } from "@/lib/evidence"
import { synthesizeEvidenceEnhanced } from "@/lib/evidence/synthesis-enhanced"

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
  enableEvidence?: boolean  // NEW: Enable evidence-backed responses
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
      enableSearch: enableSearchFromClient,
      enableEvidence: enableEvidenceFromClient,
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

    // CRITICAL: Check rate limits BEFORE streaming starts
    // Skip for temp users/chats
    if (userId !== "temp" && chatId !== "temp" && !chatId.startsWith("temp-chat-")) {
      try {
        const supabase = await validateAndTrackUsage({
          userId,
          model,
          isAuthenticated,
        })
        // If validation fails, it will throw an error with waitTimeSeconds
      } catch (error: any) {
        // If it's a rate limit error with wait time, return it with proper status
        if (error.code === "DAILY_LIMIT_REACHED" || error.limitType === "hourly") {
          return new Response(
            JSON.stringify({
              error: error.message,
              code: error.code || "RATE_LIMIT_EXCEEDED",
              waitTimeSeconds: error.waitTimeSeconds || null,
              limitType: error.limitType || "daily",
            }),
            { status: 429 }
          )
        }
        // Re-throw other errors
        throw error
      }
    }

    // START STREAMING IMMEDIATELY - minimal blocking operations
    // Apply enhanced system prompts for Fleming models
    // CRITICAL: For Fleming models, always use Fleming-specific prompts (ignore systemPrompt parameter)
    // This ensures Fleming models behave as AI doctors without disclaimers
    let effectiveModel = model
    let effectiveSystemPrompt: string
    if (effectiveModel === "fleming-4") {
      effectiveSystemPrompt = FLEMING_4_SYSTEM_PROMPT
      console.log(`[Fleming 4] Using Fleming 4 system prompt (AI doctor mode)`)
    } else {
      // For non-Fleming models, use the standard prompt logic
      effectiveSystemPrompt = getCachedSystemPrompt(
        userRole || "general", 
        medicalSpecialty, 
        systemPrompt
      )
    }
    
    // INSTANT MODEL LOADING - no async operations, no delays
    console.log(`🔍 Looking for model: "${effectiveModel}"${effectiveModel !== model ? ` (switched from ${model})` : ''}`)
    const modelConfig = getModelInfo(effectiveModel)
    console.log(`📋 Model config found:`, modelConfig ? `${modelConfig.id} (${modelConfig.name})` : 'null')
    
    // Auto-enable web search for healthcare professionals using Fleming 4
    const isHealthcareMode = userRole === "doctor" || userRole === "medical_student"
    const isFleming4 = effectiveModel === "fleming-4"
    const hasWebSearchSupport = Boolean(modelConfig?.webSearch)
    const finalEnableSearch = enableSearchFromClient || (isHealthcareMode && isFleming4 && hasWebSearchSupport)
    
    // EVIDENCE MODE: Auto-enable for healthcare professionals or if explicitly requested
    const finalEnableEvidence = enableEvidenceFromClient || (isHealthcareMode && medicalLiteratureAccess)
    
    if (!modelConfig || !modelConfig.apiSdk) {
      console.error(`❌ Model "${model}" not found or missing apiSdk`)
      throw new Error(`Model ${model} not found`)
    }

    // Get API key if needed (this is fast) - only for real users
    // Get it early so it can be used for evidence synthesis
    let apiKey: string | undefined
    let evidenceApiKey: string | undefined
    if (isAuthenticated && userId && userId !== "temp") {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      const provider = getProviderForModel(effectiveModel)
      apiKey = (await getEffectiveApiKey(userId, provider as ProviderWithoutOllama)) || undefined
      
      // Get OpenAI key for evidence synthesis (LLM-based query understanding and reranking)
      if (finalEnableEvidence) {
        evidenceApiKey = (await getEffectiveApiKey(userId, 'openai' as ProviderWithoutOllama)) || undefined
        // Fallback to main API key if OpenAI key not available
        if (!evidenceApiKey) {
          evidenceApiKey = apiKey
        }
      }
    }
    
    // If evidence mode is enabled, synthesize evidence from medical_evidence table
    // Use enhanced contextual relevance system for world-class citation attribution
    let evidenceContext: Awaited<ReturnType<typeof synthesizeEvidenceEnhanced>> | null = null
    if (finalEnableEvidence) {
      try {
        // Get the last user message for evidence search
        const lastUserMessage = messages.filter(m => m.role === 'user').pop()
        const queryText = typeof lastUserMessage?.content === 'string' 
          ? lastUserMessage.content 
          : ''
        
        if (queryText.length > 0) {
          console.log("📚 EVIDENCE MODE: Enhanced contextual search for:", queryText.substring(0, 100))
          
          evidenceContext = await synthesizeEvidenceEnhanced({
            query: queryText,
            maxResults: 8,
            minEvidenceLevel: 5, // Include all evidence levels
            enableReranking: true, // Enable contextual reranking
            minContextualScore: 0.6, // Balanced relevance threshold (was 0.75, too strict)
            apiKey: evidenceApiKey,
          })
          
          if (evidenceContext.shouldUseEvidence) {
            console.log(`📚 EVIDENCE MODE: Found ${evidenceContext.context.citations.length} highly relevant sources in ${evidenceContext.searchTimeMs.toFixed(0)}ms`)
            console.log(`📚 Intent: ${evidenceContext.queryUnderstanding.primaryIntent}, Specificity: ${evidenceContext.queryUnderstanding.specificity}`)
            console.log(`📚 Reranking: ${evidenceContext.rerankingStats.initialCount} → ${evidenceContext.rerankingStats.afterReranking} (avg score: ${evidenceContext.rerankingStats.averageContextualScore.toFixed(2)})`)
            // Enhance system prompt with evidence
            effectiveSystemPrompt = buildEvidenceSystemPrompt(effectiveSystemPrompt, evidenceContext.context)
          } else {
            console.log("📚 EVIDENCE MODE: Query not medical or no evidence found")
          }
        }
      } catch (error) {
        console.error("📚 EVIDENCE MODE: Error synthesizing evidence:", error)
        // Continue without evidence - don't block the chat
      }
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

    // CRITICAL: Anonymize messages before sending to LLM providers
    // This ensures no PII/PHI is sent to third-party LLM services (HIPAA compliance)
    const anonymizedMessages = anonymizeMessages(filteredMessages) as MessageAISDK[]
    console.log("🔒 Messages anonymized before sending to LLM provider")

    // START STREAMING IMMEDIATELY with basic prompt
    const startTime = performance.now()
    
    // Create model with REAL web search settings
    // When enableSearch=true, this passes { web_search: true } to xAI API
    const modelWithSearch = modelConfig.apiSdk(apiKey, { 
      enableSearch: finalEnableSearch // REAL web search flag - passed to xAI API
    })
    
    if (finalEnableSearch) {
      console.log("✅ WEB SEARCH ENABLED - Using real web search from xAI/Grok")
    }
    
    const result = streamText({
      model: modelWithSearch,
      system: effectiveSystemPrompt,
      messages: anonymizedMessages, // Use anonymized messages for LLM
      tools: {} as ToolSet,
      maxSteps: 10,
      onError: (err: unknown) => {
        console.error("Streaming error occurred:", err)
      },
      onFinish: async ({ response }) => {
        // Extract citations from xAI response if available
        const xaiCitations = (response as any).experimental_providerMetadata?.citations || 
                            (response as any).citations || 
                            []
        
        // Check if sources are in message parts
        const allParts = (response as any).messages?.flatMap((m: any) => m.parts || []) || []
        const sourceParts = allParts.filter((p: any) => p.type === 'source')
        const toolInvocationParts = allParts.filter((p: any) => p.type === 'tool-invocation')
        
        // Log full response structure for debugging
        console.log('\n' + '='.repeat(80))
        console.log('[WEB SEARCH DEBUG] Response structure:')
        console.log('  - experimental_providerMetadata:', (response as any).experimental_providerMetadata ? 'EXISTS' : 'undefined')
        console.log('  - citations:', (response as any).citations ? 'EXISTS' : 'undefined')
        console.log('  - messages count:', (response as any).messages?.length || 0)
        console.log('  - total parts:', allParts.length)
        console.log('  - source parts:', sourceParts.length)
        console.log('  - tool invocations:', toolInvocationParts.length)
        
        if (xaiCitations.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${xaiCitations.length} citations:`, xaiCitations.slice(0, 5))
        }
        
        if (sourceParts.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${sourceParts.length} source parts:`, sourceParts.map((p: any) => p.source).slice(0, 3))
        }
        
        if (toolInvocationParts.length > 0) {
          console.log(`[WEB SEARCH] ✅ Found ${toolInvocationParts.length} tool invocations`)
          toolInvocationParts.forEach((p: any, i: number) => {
            console.log(`  Tool ${i + 1}:`, p.toolInvocation?.toolName, 'state:', p.toolInvocation?.state)
            if (p.toolInvocation?.result) {
              console.log(`    Result keys:`, Object.keys(p.toolInvocation.result))
            }
          })
        }
        
        // Check message content for URLs
        const lastMessage = (response as any).messages?.[(response as any).messages.length - 1]
        if (lastMessage?.content) {
          const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content)
          const urlMatches = content.match(/https?:\/\/[^\s\)\]\[]+/g) || []
          if (urlMatches.length > 0) {
            console.log(`[WEB SEARCH] Found ${urlMatches.length} URLs in message content:`, urlMatches.slice(0, 5))
          }
        }
        
        console.log('='.repeat(80) + '\n')
        
        // Handle completion in background - CRITICAL: Ensure this always runs
        Promise.resolve().then(async () => {
          try {
            // Only process completion if we have a real userId and chatId
            // Skip for any user (guest or authenticated) if chatId is temporary
            // Also skip if chatId is literally "temp" (not a valid UUID)
            if (userId === "temp" || 
                chatId === "temp" || 
                chatId.startsWith("temp-chat-")) {
              console.log("Skipping completion processing for temp userId or invalid chatId")
              return
            }

            const supabase = await validateAndTrackUsage({
              userId,
              model: effectiveModel,
              isAuthenticated,
            })

            if (supabase) {
              // Save user message first (if not already saved)
              // Use original (non-anonymized) message for storage - it will be encrypted
              const userMessage = messages[messages.length - 1]
              if (userMessage?.role === "user") {
                try {
                  await logUserMessage({
                    supabase,
                    userId,
                    chatId,
                    content: userMessage.content,
                    attachments: userMessage.experimental_attachments as Attachment[],
                    model: effectiveModel,
                    isAuthenticated,
                    message_group_id,
                  })
                } catch (error) {
                  console.error("Failed to save user message:", error)
                  // Continue even if user message save fails
                }
              }

              // Save assistant message with retry logic
              // Include evidence citations if available
              const assistantMessage = response.messages[response.messages.length - 1]
              const citationsToSave = evidenceContext?.context?.citations || []
              
              try {
                await storeAssistantMessage({
                  supabase,
                  chatId,
                  messages:
                    response.messages as unknown as import("@/app/types/api.types").Message[],
                  message_group_id,
                  model: effectiveModel,
                  evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
                })
              } catch (error) {
                console.error("Failed to save assistant message:", error)
                // Try one more time after a short delay
                await new Promise(resolve => setTimeout(resolve, 1000))
                try {
                  await storeAssistantMessage({
                    supabase,
                    chatId,
                    messages:
                      response.messages as unknown as import("@/app/types/api.types").Message[],
                    message_group_id,
                    model: effectiveModel,
                    evidenceCitations: citationsToSave.length > 0 ? citationsToSave : undefined,
                  })
                } catch (retryError) {
                  console.error("Retry also failed to save assistant message:", retryError)
                }
              }

              // Increment message count after successful save
              try {
                await incrementMessageCount({ supabase, userId })
              } catch (error) {
                console.error("Failed to increment message count:", error)
                // Non-critical, continue
              }
            }
          } catch (error) {
            console.error("Background operations failed:", error)
            // Don't throw - errors are logged but shouldn't break the stream
          }
        }).catch((error) => {
          // Extra safety net for any unhandled errors
          console.error("Unhandled error in onFinish:", error)
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
    
    // Build response headers - include evidence citations if available
    const responseHeaders: Record<string, string> = {
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      // CRITICAL: Expose custom header to JavaScript
      'Access-Control-Expose-Headers': 'X-Evidence-Citations',
    }
    
    // Add evidence citations to headers for frontend rendering
    if (evidenceContext?.context?.citations && evidenceContext.context.citations.length > 0) {
      try {
        // Encode citations as base64 to handle special characters
        const citationsJson = JSON.stringify(evidenceContext.context.citations)
        responseHeaders['X-Evidence-Citations'] = Buffer.from(citationsJson).toString('base64')
        console.log(`📚 EVIDENCE MODE: Sending ${evidenceContext.context.citations.length} citations to client`)
      } catch (e) {
        console.error('Failed to encode evidence citations:', e)
      }
    }
    
    return result.toDataStreamResponse({
      sendReasoning: true,
      sendSources: true,
      // Optimize streaming response
      headers: responseHeaders,
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
