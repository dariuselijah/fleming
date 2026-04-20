import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import type { Json } from "@/app/types/database.types"

export type VoiceCallOutcomeIntent =
  | "book_appointment"
  | "reschedule"
  | "cancel"
  | "check_record"
  | "triage"
  | "faq"
  | "registration"
  | "payment"
  | "prescription"
  | "lab_results"
  | "general"

export type RecommendedNextAction =
  | "send_confirmation"
  | "send_onboarding"
  | "send_portal_link"
  | "staff_callback"
  | "none"

export interface VoiceCallOutcome {
  intent: VoiceCallOutcomeIntent
  confidence: number
  appointmentId?: string
  patientId?: string
  recommendedNextAction: RecommendedNextAction
  portalPurpose?: "check_in" | "intake" | "billing" | "lab_results" | "reschedule"
  requiresStaffHandoff: boolean
  extractedData: Record<string, unknown>
}

const FALLBACK: VoiceCallOutcome = {
  intent: "general",
  confidence: 0,
  recommendedNextAction: "none",
  requiresStaffHandoff: false,
  extractedData: {},
}

export async function extractVoiceCallOutcome(opts: {
  transcript?: string | null
  summary?: string | null
}): Promise<VoiceCallOutcome> {
  const text = [opts.summary, opts.transcript].filter(Boolean).join("\n\n").trim()
  if (!text) return FALLBACK

  try {
    const model = openai(process.env.COMMS_AGENT_MODEL || "gpt-4o-mini")
    const { text: raw } = await generateText({
      model,
      temperature: 0.1,
      maxTokens: 500,
      system:
        "You classify healthcare practice phone calls. Reply with JSON only, no markdown. Fields: intent, confidence (0-1), recommendedNextAction, portalPurpose (or null), requiresStaffHandoff, extractedData (object).",
      prompt: `Call notes:\n${text.slice(0, 12000)}`,
    })

    const parsed = JSON.parse(raw.trim()) as VoiceCallOutcome
    if (!parsed.intent) return FALLBACK
    return {
      ...FALLBACK,
      ...parsed,
      extractedData: parsed.extractedData || {},
    }
  } catch {
    return FALLBACK
  }
}

export function outcomeToJson(outcome: VoiceCallOutcome): Json {
  return outcome as unknown as Json
}
