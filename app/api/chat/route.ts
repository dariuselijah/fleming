import { getSystemPromptByRole } from "@/lib/config"
import { getAllModels, getModelInfo } from "@/lib/models"
import { getProviderForModel } from "@/lib/openproviders/provider-map"
import type { SupportedModel } from "@/lib/openproviders/types"
import type { ProviderWithoutOllama } from "@/lib/user-keys"
import { searchPubMed, fetchPubMedArticle } from "@/lib/pubmed"
import {
  searchGuidelines,
  searchClinicalTrials,
  lookupDrugSafety,
  detectEvidenceConflicts,
} from "@/lib/evidence/live-tools"
import {
  buildProvenance,
  provenanceToEvidenceCitation,
  type SourceProvenance,
} from "@/lib/evidence/provenance"
import { Attachment } from "@ai-sdk/ui-utils"
import { Message as MessageAISDK, streamText, ToolSet, tool } from "ai"
import { z } from "zod"
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
import { synthesizeEvidence, buildEvidenceSystemPrompt, extractReferencedCitations } from "@/lib/evidence"

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

/**
 * Remove citation instructions from system prompt when evidence mode is off
 * This ensures normal conversations without citations when evidence mode is disabled
 */
function removeCitationInstructions(prompt: string): string {
  // Remove citation-related sections more reliably
  let cleaned = prompt
  
  // Remove "Mandatory Citations" section and related content
  cleaned = cleaned.replace(/\*\*Mandatory Citations?\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/\*\*Citation Format\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  
  // Remove citation examples and instructions (including web search citations)
  cleaned = cleaned.replace(/Every factual claim.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/must be followed by.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/MUST be followed by.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/Use.*?\[CITATION:.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/Use web search results to find and cite sources.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/with citations for every factual claim.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/properly cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/well-cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/with citations.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/cite sources.*?(?=\n|$)/gi, '')
  
  // Remove citation format examples
  cleaned = cleaned.replace(/\[CITATION:\d+\]/gi, '')
  cleaned = cleaned.replace(/\[CITATION:\d+,\d+\]/gi, '')
  cleaned = cleaned.replace(/\[CITATION:\d+-\d+\]/gi, '')
  
  // Remove "Response Structure" sections that mention citations
  cleaned = cleaned.replace(/\*\*Response Structure\*\*:.*?with citations.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/with immediate citations.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/all cited.*?(?=\n|$)/gi, '')
  
  // Remove "Your Mission" lines that mention citations
  cleaned = cleaned.replace(/Every response must be.*?cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/properly cited.*?(?=\n|$)/gi, '')
  cleaned = cleaned.replace(/evidence-based.*?cited.*?(?=\n|$)/gi, '')
  
  // Remove entire sections about citations
  cleaned = cleaned.replace(/\*\*Citations?\*\*:.*?(?=\n\n|\*\*|$)/gis, '')
  cleaned = cleaned.replace(/Citations?:.*?(?=\n\n|\*\*|$)/gis, '')
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.replace(/^\s+|\s+$/g, '')
  
  return cleaned
}

/**
 * Strip citation markers from response text when evidence mode is off
 * This prevents citation markers from appearing in the UI when evidence mode is disabled
 */
function stripCitationMarkers(text: string): string {
  if (!text) return text
  
  // Remove [CITATION:X] markers
  let cleaned = text
    .replace(/\[CITATION:\d+(?:,\d+)*\]/gi, '')
    .replace(/\[CITATION:\d+-\d+\]/gi, '')
    // Also remove simple numbered citations [1], [2] if they appear
    .replace(/\[\d+\]/g, '')
    .replace(/\[\d+,\d+\]/g, '')
    .replace(/\[\d+-\d+\]/g, '')
  
  // Remove "Citations:" section at the end if present
  cleaned = cleaned.replace(/\n\*\*Citations?\*\*:.*$/gis, '')
  cleaned = cleaned.replace(/\nCitations?:.*$/gis, '')
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  return cleaned.trim()
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

function needsFreshEvidence(query: string): boolean {
  const q = query.toLowerCase()
  return (
    /\b(latest|recent|new|updated|current)\b/.test(q) ||
    /\b(guideline|consensus|position statement)\b/.test(q) ||
    /\btrial|rct|meta-analysis|systematic review\b/.test(q) ||
    /\b202[4-9]\b/.test(q)
  )
}

function extractToolProvenance(toolInvocationParts: any[]): SourceProvenance[] {
  const flattened = toolInvocationParts.flatMap((part: any) => {
    const result = part?.toolInvocation?.result
    if (!result) return []
    if (Array.isArray(result?.provenance)) return result.provenance
    if (result?.article && typeof result.article === "object") {
      const article = result.article
      return [
        buildProvenance({
          id: `pubmed_${article.pmid || "lookup"}`,
          sourceType: "pubmed",
          sourceName: "PubMed",
          title: article.title || "PubMed article",
          url: article.url || null,
          publishedAt: article.year ? String(article.year) : null,
          region: null,
          journal: article.journal || "PubMed",
          doi: article.doi || null,
          pmid: article.pmid || null,
          evidenceLevel: 2,
          studyType: "Literature record",
          snippet: article.abstract || "",
        }),
      ]
    }
    if (Array.isArray(result?.articles)) {
      return result.articles.map((article: any, idx: number) =>
        buildProvenance({
          id: `pubmed_${article.pmid || idx + 1}`,
          sourceType: "pubmed",
          sourceName: "PubMed",
          title: article.title || "PubMed article",
          url: article.url || null,
          publishedAt: article.year ? String(article.year) : null,
          region: null,
          journal: article.journal || "PubMed",
          doi: article.doi || null,
          pmid: article.pmid || null,
          evidenceLevel: 2,
          studyType: "Literature record",
          snippet: "",
        })
      )
    }
    return []
  })

  const deduped = new Map<string, SourceProvenance>()
  flattened.forEach((item: SourceProvenance) => {
    const key = item.pmid || item.doi || item.url || `${item.sourceName}:${item.title}`
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  })
  return Array.from(deduped.values())
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

    // CRITICAL: Fetch userRole from database if not provided (needed for evidence mode)
    // This must happen BEFORE evidence mode check
    let effectiveUserRole = userRole
    console.log(`📚 [EVIDENCE] Initial userRole check: userRole=${userRole}, isAuthenticated=${isAuthenticated}, userId=${userId}`)
    
    if (!effectiveUserRole && isAuthenticated && userId !== "temp") {
      console.log(`📚 [EVIDENCE] Attempting to fetch userRole from DB for userId: ${userId}`)
      try {
        const { createClient } = await import("@/lib/supabase/server")
        const supabase = await createClient()
        
        if (supabase) {
          const { data: prefs, error: fetchError } = await supabase
            .from("user_preferences")
            .select("user_role")
            .eq("user_id", userId)
            .single()
          
          console.log(`📚 [EVIDENCE] DB fetch result: prefs=${JSON.stringify(prefs)}, error=${fetchError?.message || 'none'}`)
          
          if (prefs?.user_role) {
            const validRoles = ["doctor", "general", "medical_student"] as const
            type ValidRole = typeof validRoles[number]
            if (validRoles.includes(prefs.user_role as ValidRole)) {
              effectiveUserRole = prefs.user_role as ValidRole
              console.log(`📚 [EVIDENCE] ✅ Fetched userRole from DB: ${effectiveUserRole}`)
            } else {
              console.log(`📚 [EVIDENCE] ⚠️ Invalid user_role value from DB: ${prefs.user_role}`)
            }
          } else {
            console.log(`📚 [EVIDENCE] ⚠️ No user_role found in preferences for userId: ${userId}`)
          }
        } else {
          console.warn("📚 [EVIDENCE] ⚠️ Supabase client not available")
        }
      } catch (e) {
        // Non-critical - continue with undefined userRole
        console.warn("📚 [EVIDENCE] ❌ Failed to fetch userRole from DB:", e)
      }
    } else {
      console.log(`📚 [EVIDENCE] Skipping DB fetch: effectiveUserRole=${effectiveUserRole}, isAuthenticated=${isAuthenticated}, userId=${userId}`)
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
    // Use role-based web system prompts for all models
    let effectiveModel = model
    let effectiveSystemPrompt: string
    effectiveSystemPrompt = getCachedSystemPrompt(
      effectiveUserRole || "general",
      medicalSpecialty,
      systemPrompt
    )
    
    // INSTANT MODEL LOADING - no async operations, no delays
    console.log(`🔍 Looking for model: "${effectiveModel}"${effectiveModel !== model ? ` (switched from ${model})` : ''}`)
    const modelConfig = getModelInfo(effectiveModel)
    console.log(`📋 Model config found:`, modelConfig ? `${modelConfig.id} (${modelConfig.name})` : 'null')
    
    // Auto-enable web search for healthcare professionals using Fleming 4
    // Use effectiveUserRole (from request or DB fallback)
    const isHealthcareMode = effectiveUserRole === "doctor" || effectiveUserRole === "medical_student"
    const isFleming4 = effectiveModel === "fleming-4"
    const hasWebSearchSupport = Boolean(modelConfig?.webSearch)
    const finalEnableSearch = enableSearchFromClient || (isHealthcareMode && isFleming4 && hasWebSearchSupport)
    
    // EVIDENCE MODE: Only enable if explicitly requested
    // Disabled by default for all users including healthcare professionals
    const finalEnableEvidence = enableEvidenceFromClient === true
    
    console.log(`📚 [EVIDENCE] Mode check: userRole=${effectiveUserRole} (from request: ${userRole}), enableEvidenceFromClient=${enableEvidenceFromClient}, isHealthcareMode=${isHealthcareMode}, medicalLiteratureAccess=${medicalLiteratureAccess}, finalEnableEvidence=${finalEnableEvidence}`)
    
    // CRITICAL: If evidence mode is OFF, remove citation instructions from system prompt
    // This ensures normal conversations without citations when evidence mode is disabled
    if (!finalEnableEvidence) {
      console.log("📚 [EVIDENCE] Evidence mode is OFF - removing citation instructions from system prompt")
      effectiveSystemPrompt = removeCitationInstructions(effectiveSystemPrompt)
      // Add explicit instruction to NOT include citations
      effectiveSystemPrompt += `\n\n**IMPORTANT: Do NOT include citations, citation markers, or reference numbers in your response. Respond naturally without any [CITATION:X] or [X] markers. Do not include a "Citations" section at the end.`
    }
    
    // Get last user message once and reuse in evidence + tool gating
    const lastUserMessage = messages.filter(m => m.role === "user").pop()
    const queryText = typeof lastUserMessage?.content === "string"
      ? lastUserMessage.content
      : ""

    // If evidence mode is enabled, synthesize evidence from medical_evidence table
    let evidenceContext: Awaited<ReturnType<typeof synthesizeEvidence>> | null = null
    if (finalEnableEvidence) {
      try {
        if (queryText.length > 0) {
          console.log("📚 EVIDENCE MODE: Searching medical evidence for:", queryText.substring(0, 100))
          evidenceContext = await synthesizeEvidence({
            query: queryText,
            maxResults: 8,
            minEvidenceLevel: 5, // Include all evidence levels
            candidateMultiplier: 5,
            enableRerank: true,
            queryExpansion: true,
            minMedicalConfidence: 0.25,
            forceEvidence: queryText.trim().length >= 8,
          })
          
          if (evidenceContext.shouldUseEvidence) {
            console.log(`📚 EVIDENCE MODE: Found ${evidenceContext.context.citations.length} sources in ${evidenceContext.searchTimeMs.toFixed(0)}ms`)
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

    if (!modelConfig || !modelConfig.apiSdk) {
      console.error(`❌ Model "${model}" not found or missing apiSdk`)
      throw new Error(`Model ${model} not found`)
    }

    // Get API key if needed (this is fast) - only for real users
    let apiKey: string | undefined
    if (isAuthenticated && userId && userId !== "temp") {
      const { getEffectiveApiKey } = await import("@/lib/user-keys")
      const provider = getProviderForModel(effectiveModel)
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
    
    // CRITICAL: Capture evidenceContext in a const to ensure it's available in closure
    const capturedEvidenceContext = evidenceContext
    if (capturedEvidenceContext) {
      console.log(`📚 [CAPTURE] Captured evidence context with ${capturedEvidenceContext.context.citations.length} citations for onFinish callback`)
    } else {
      console.log(`📚 [CAPTURE] No evidence context to capture`)
    }
    
    // Optional live PubMed tools for freshness and sparse-corpus gaps
    const supportsTools = Boolean(modelConfig?.tools)
    const shouldEnablePubMedTools =
      finalEnableEvidence &&
      supportsTools &&
      queryText.length > 0 &&
      (
        needsFreshEvidence(queryText) ||
        (capturedEvidenceContext?.context?.citations?.length ?? 0) < 4
      )
    const shouldEnableEvidenceTools = finalEnableEvidence && supportsTools && queryText.length > 0

    const runtimeTools: ToolSet = shouldEnableEvidenceTools
      ? {
          pubmedSearch: tool({
            description: "Search PubMed for recent or guideline-related medical literature.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical query for PubMed"),
              maxResults: z.number().int().min(1).max(10).default(5),
            }),
            execute: async ({ query, maxResults }) => {
              const result = await searchPubMed(query, maxResults)
              const provenance: SourceProvenance[] = result.articles.map((a, idx) =>
                buildProvenance({
                  id: `pubmed_${a.pmid || idx + 1}`,
                  sourceType: "pubmed",
                  sourceName: "PubMed",
                  title: a.title,
                  url: a.url || null,
                  publishedAt: a.year ? String(a.year) : null,
                  region: null,
                  journal: a.journal || "PubMed",
                  doi: a.doi || null,
                  pmid: a.pmid || null,
                  evidenceLevel: 2,
                  studyType: "Literature record",
                  snippet: "",
                })
              )
              return {
                totalResults: result.totalResults,
                articles: result.articles.map(a => ({
                  pmid: a.pmid,
                  title: a.title,
                  journal: a.journal,
                  year: a.year,
                  doi: a.doi,
                  url: a.url,
                })),
                provenance,
              }
            },
          }),
          pubmedLookup: tool({
            description: "Get details for a PubMed article by PMID.",
            parameters: z.object({
              pmid: z.string().min(4).describe("PubMed ID"),
            }),
            execute: async ({ pmid }) => {
              const article = await fetchPubMedArticle(pmid)
              if (!article) return { found: false }
              const provenance = [
                buildProvenance({
                  id: `pubmed_${article.pmid || "lookup"}`,
                  sourceType: "pubmed",
                  sourceName: "PubMed",
                  title: article.title,
                  url: article.url || null,
                  publishedAt: article.year ? String(article.year) : null,
                  region: null,
                  journal: article.journal || "PubMed",
                  doi: article.doi || null,
                  pmid: article.pmid || null,
                  evidenceLevel: 2,
                  studyType: "Literature record",
                  snippet: article.abstract || "",
                }),
              ]
              return {
                found: true,
                article: {
                  pmid: article.pmid,
                  title: article.title,
                  abstract: article.abstract,
                  journal: article.journal,
                  year: article.year,
                  doi: article.doi,
                  url: article.url,
                },
                provenance,
              }
            },
          }),
          guidelineSearch: tool({
            description: "Search guideline-like sources (NICE if configured, plus Europe PMC guideline records).",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical guideline query"),
              maxResults: z.number().int().min(1).max(10).default(6),
            }),
            execute: async ({ query, maxResults }) => {
              const result = await searchGuidelines(query, maxResults)
              return result
            },
          }),
          clinicalTrialsSearch: tool({
            description: "Search ClinicalTrials.gov v2 for recent or ongoing trials relevant to a clinical question.",
            parameters: z.object({
              query: z.string().min(3).describe("Clinical trial search query"),
              maxResults: z.number().int().min(1).max(10).default(5),
            }),
            execute: async ({ query, maxResults }) => {
              return searchClinicalTrials(query, maxResults)
            },
          }),
          drugSafetyLookup: tool({
            description: "Lookup drug contraindications, interactions, and renal considerations.",
            parameters: z.object({
              drugName: z.string().min(2).describe("Generic or brand drug name"),
            }),
            execute: async ({ drugName }) => {
              const result = await lookupDrugSafety(drugName)
              return result
            },
          }),
          evidenceConflictCheck: tool({
            description: "Detect potential contradictions across provided evidence statements.",
            parameters: z.object({
              statements: z.array(z.string().min(10)).min(2).max(20),
            }),
            execute: async ({ statements }) => {
              return detectEvidenceConflicts(statements)
            },
          }),
        }
      : ({} as ToolSet)

    if (shouldEnableEvidenceTools) {
      effectiveSystemPrompt += `\n\nYou may use live evidence tools when needed:\n- Use pubmedSearch/pubmedLookup for latest literature and PMID-grounded facts.\n- Use guidelineSearch for formal recommendations and regional guidance.\n- Use clinicalTrialsSearch for ongoing/new evidence.\n- Use drugSafetyLookup for contraindications/interactions/renal dosing checks.\n- Use evidenceConflictCheck when sources disagree.`
    } else if (shouldEnablePubMedTools) {
      effectiveSystemPrompt += `\n\nYou may use PubMed tools when the question requests latest evidence, guideline updates, or when provided evidence is sparse. Prefer retrieved PubMed records for recency-sensitive claims and cite them explicitly.`
    }

    const result = streamText({
      model: modelWithSearch,
      system: effectiveSystemPrompt,
      messages: anonymizedMessages, // Use anonymized messages for LLM
      tools: runtimeTools,
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
            // CRITICAL: Still extract citations even for temp chats, but don't save to DB
            // This ensures citations are available in the UI even during streaming
            const isTempChat = userId === "temp" || 
                              chatId === "temp" || 
                              chatId.startsWith("temp-chat-")
            
            if (isTempChat) {
              console.log("📚 [CITATION] Temp chat detected - extracting citations but skipping DB save")
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

              // CRITICAL: Extract citations from response (even for temp chats)
              // This ensures citations are available in the UI
              const assistantMessage = response.messages[response.messages.length - 1]
              
              // Extract text content from message (handles both string and array formats)
              let responseText = ''
              if (assistantMessage?.content) {
                if (typeof assistantMessage.content === 'string') {
                  responseText = assistantMessage.content
                } else if (Array.isArray(assistantMessage.content)) {
                  // Extract text from content parts
                  const textParts = assistantMessage.content
                    .filter((part: any) => part?.type === 'text' && part?.text)
                    .map((part: any) => part.text)
                  responseText = textParts.join('\n\n')
                }
              }
              
              // Extract referenced citations from the response
              // CRITICAL: Only extract citations if evidence mode is enabled
              // CRITICAL: Use capturedEvidenceContext to ensure we have the right context
              let citationsToSave: any[] = []
              
              // Only extract citations if evidence mode was enabled
              if (finalEnableEvidence) {
                const contextToUse = capturedEvidenceContext || evidenceContext
                
                if (contextToUse?.context?.citations) {
                console.log(`📚 [CITATION EXTRACTION] Using evidence context with ${contextToUse.context.citations.length} citations`)
                if (responseText) {
                  const extractionResult = extractReferencedCitations(
                    responseText,
                    contextToUse.context.citations
                  )
                  
                  citationsToSave = extractionResult.referencedCitations
                  
                  // Log extraction results for debugging
                  if (extractionResult.hasCitations) {
                    console.log(`📚 [CITATION EXTRACTION] Found ${citationsToSave.length} referenced citations (indices: [${extractionResult.citationIndices.join(', ')}])`)
                    if (extractionResult.verificationStats.missingCitations.length > 0) {
                      console.warn(`📚 [CITATION EXTRACTION] ${extractionResult.verificationStats.missingCitations.length} retrieved citations were not referenced`)
                    }
                  } else if (contextToUse.context.citations.length > 0) {
                    console.warn(`📚 [CITATION EXTRACTION] ⚠️ No citation markers found in response despite ${contextToUse.context.citations.length} citations being provided`)
                    console.warn(`📚 [CITATION EXTRACTION] Response preview: ${responseText.substring(0, 300)}...`)
                    // Fallback: if no citations found but we have evidence, include all retrieved citations
                    // This helps debug why citations aren't being generated
                    citationsToSave = contextToUse.context.citations
                    console.warn(`📚 [CITATION EXTRACTION] Fallback: Including all ${citationsToSave.length} retrieved citations for debugging`)
                  }
                } else {
                  console.warn(`📚 [CITATION EXTRACTION] ⚠️ Could not extract response text for citation parsing`)
                  // Fallback: include all citations if we can't parse the response
                  if (contextToUse.context.citations.length > 0) {
                    citationsToSave = contextToUse.context.citations
                    console.warn(`📚 [CITATION EXTRACTION] Fallback: Including all ${citationsToSave.length} retrieved citations`)
                  }
                }
                } else {
                  console.log(`📚 [CITATION EXTRACTION] No evidence context available (capturedEvidenceContext: ${!!capturedEvidenceContext}, evidenceContext: ${!!evidenceContext})`)
                }

                // Add normalized provenance from tool results to feed citation UX
                const toolProvenance = extractToolProvenance(toolInvocationParts)
                if (toolProvenance.length > 0) {
                  const provenanceCitations = toolProvenance.map((item, idx) =>
                    provenanceToEvidenceCitation(item, citationsToSave.length + idx + 1)
                  )
                  citationsToSave = [...citationsToSave, ...provenanceCitations]
                  console.log(`📚 [PROVENANCE] Added ${provenanceCitations.length} normalized tool citations`)
                }
              } else {
                console.log(`📚 [CITATION EXTRACTION] Evidence mode is OFF - skipping citation extraction`)
              }
              
              // Only save to database if not a temp chat
              if (!isTempChat && supabase) {
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
                  if (citationsToSave.length > 0) {
                    console.log(`📚 [CITATION SAVE] ✅ Saved ${citationsToSave.length} citations to database`)
                  }
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
              } else if (isTempChat && citationsToSave.length > 0) {
                console.log(`📚 [CITATION] Temp chat - ${citationsToSave.length} citations extracted but not saved to DB`)
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
    if (effectiveUserRole === "doctor" || effectiveUserRole === "medical_student") {
      // Don't await - let this run in background
      Promise.resolve().then(async () => {
        try {
          console.log("Enhancing system prompt in background for role:", effectiveUserRole)
          
          const healthcarePrompt = getHealthcareSystemPromptServer(
            effectiveUserRole,
            medicalSpecialty,
            clinicalDecisionSupport,
            medicalLiteratureAccess,
            medicalComplianceMode
          )
          
          if (healthcarePrompt) {
            console.log("Healthcare system prompt generated in background")
            
            // Analyze medical query complexity
            const medicalContext: MedicalContext = {
              userRole: effectiveUserRole as "doctor" | "medical_student",
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
          // CRITICAL: Only send citations if evidence mode is enabled
          // Send all retrieved citations initially - frontend will filter to referenced ones after parsing response
          // CRITICAL: Use capturedEvidenceContext to ensure we have the right context
          if (finalEnableEvidence) {
            const contextForHeaders = capturedEvidenceContext || evidenceContext
            if (contextForHeaders?.context?.citations && contextForHeaders.context.citations.length > 0) {
              try {
                console.log(`📚 [HEADERS] Adding ${contextForHeaders.context.citations.length} retrieved citations to response headers`)
                // Encode citations as base64 to handle special characters
                const citationsJson = JSON.stringify(contextForHeaders.context.citations)
                responseHeaders['X-Evidence-Citations'] = Buffer.from(citationsJson).toString('base64')
                console.log(`📚 EVIDENCE MODE: Sending ${contextForHeaders.context.citations.length} citations to client`)
              } catch (e) {
                console.error('Failed to encode evidence citations:', e)
              }
            } else {
              console.log(`📚 [HEADERS] No citations to add to headers (contextForHeaders: ${!!contextForHeaders})`)
            }
          } else {
            console.log(`📚 [HEADERS] Evidence mode is OFF - not sending citations in headers`)
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
