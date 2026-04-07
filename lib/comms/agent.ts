import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import type {
  CommsAgentContext,
  CommsAgentResponse,
  FlowType,
  FlowState,
  ThreadMessage,
  InteractivePayload,
} from "./types"
import { runBookingFlow } from "./flows/booking"
import { runOnboardingFlow } from "./flows/onboarding"
import { runTriageFlow } from "./flows/triage"
import { getFAQs } from "./tools"
import { formatHoursForAgent } from "./after-hours"

const EMERGENCY_KEYWORDS = [
  "chest pain", "heart attack", "can't breathe", "cannot breathe",
  "suicide", "kill myself", "want to die", "overdose",
  "severe bleeding", "unconscious", "stroke", "seizure",
];

const HANDOFF_KEYWORDS = [
  "speak to someone", "real person", "human", "talk to a person",
  "manager", "receptionist", "doctor please", "speak to the doctor",
]

export async function runCommsAgent(
  ctx: CommsAgentContext,
  inboundMessage: string,
  inboundMedia?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  // Emergency check (runs before everything)
  if (isEmergency(inboundMessage)) {
    return {
      text: "⚠️ This sounds like a medical emergency. Please call ER24 at *084 124* or dial *112* immediately.\n\nI've flagged your message as urgent for the practice team.",
      threadUpdate: { status: "handoff", priority: "urgent" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  // Human handoff request
  if (isHandoffRequest(inboundMessage)) {
    return {
      text: `I'll connect you with a team member at ${ctx.practiceName}. Someone will respond shortly.\n\nIf this is urgent, please call us directly.`,
      threadUpdate: { status: "handoff", priority: "high" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  // Opt-out / cancellation keywords
  const upper = inboundMessage.trim().toUpperCase()
  if (upper === "STOP" || upper === "OPTOUT") {
    return {
      text: "You've been unsubscribed from automated messages. You can always message us again if you need help.",
      threadUpdate: { status: "closed" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  // Resume active flow
  if (ctx.thread.currentFlow !== "none") {
    return resumeFlow(ctx, inboundMessage, inboundMedia)
  }

  // Intent detection for new conversations
  return detectIntentAndRoute(ctx, inboundMessage, inboundMedia)
}

async function detectIntentAndRoute(
  ctx: CommsAgentContext,
  message: string,
  media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const model = openai(process.env.COMMS_AGENT_MODEL || "gpt-4o-mini")

  const { text: intentJson } = await generateText({
    model,
    temperature: 0.1,
    maxTokens: 150,
    system: `You are an intent classifier for a medical practice's WhatsApp assistant. Classify the patient's message into exactly one intent. Respond with JSON only: {"intent": "booking" | "onboarding" | "triage" | "faq" | "greeting" | "cancel" | "reschedule", "reason": "brief description"}`,
    prompt: `Patient message: "${message}"\n\nContext: ${ctx.thread.patientId ? "Existing patient" : "Unknown patient"}, channel: ${ctx.thread.channel}`,
  })

  let intent = "faq"
  try {
    const parsed = JSON.parse(intentJson)
    intent = parsed.intent || "faq"
  } catch {
    // Fallback keyword detection
    const lower = message.toLowerCase()
    if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) intent = "booking"
    else if (lower.includes("new patient") || lower.includes("register") || lower.includes("sign up")) intent = "onboarding"
    else if (lower.includes("sick") || lower.includes("pain") || lower.includes("symptoms")) intent = "triage"
    else if (lower.includes("cancel")) intent = "cancel"
    else if (lower.includes("reschedule")) intent = "reschedule"
  }

  // First-time unknown patient -> suggest onboarding
  if (!ctx.thread.patientId && intent !== "faq" && intent !== "greeting") {
    const isFirstMessage = ctx.recentMessages.length <= 1
    if (isFirstMessage && intent !== "onboarding") {
      intent = "onboarding"
    }
  }

  switch (intent) {
    case "booking":
    case "reschedule":
      return runBookingFlow(ctx, message, { step: "detect_reason", collected: {} })

    case "onboarding":
      return runOnboardingFlow(ctx, message, { step: "welcome", collected: {} })

    case "triage":
      return runTriageFlow(ctx, message, { step: "collect_symptoms", collected: {} })

    case "cancel": {
      return {
        text: "I can help you cancel your appointment. Let me check your upcoming bookings...\n\nPlease reply with the date of the appointment you'd like to cancel.",
        flowUpdate: { currentFlow: "booking", flowState: { step: "detect_reason", collected: { intent: "cancel" } } },
      }
    }

    case "greeting":
    case "faq":
    default:
      return handleFAQOrChat(ctx, message)
  }
}

async function resumeFlow(
  ctx: CommsAgentContext,
  message: string,
  media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const flow = ctx.thread.currentFlow
  const state = ctx.thread.flowState

  switch (flow) {
    case "booking":
      return runBookingFlow(ctx, message, state, media)
    case "onboarding":
      return runOnboardingFlow(ctx, message, state, media)
    case "triage":
      return runTriageFlow(ctx, message, state, media)
    case "faq":
      return handleFAQOrChat(ctx, message)
    default:
      return detectIntentAndRoute(ctx, message, media)
  }
}

async function handleFAQOrChat(
  ctx: CommsAgentContext,
  message: string
): Promise<CommsAgentResponse> {
  // Check FAQs first
  const matchingFAQs = await getFAQs(ctx.practiceId, message)
  if (matchingFAQs.length > 0) {
    const faq = matchingFAQs[0]
    const extras = matchingFAQs.length > 1
      ? `\n\nI can also help with: ${matchingFAQs.slice(1).map((f) => f.question).join(", ")}`
      : ""
    return {
      text: `${faq.answer}${extras}\n\nIs there anything else I can help you with?`,
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  // General conversational response
  const model = openai(process.env.COMMS_AGENT_MODEL || "gpt-4o-mini")
  const hoursText = formatHoursForAgent(ctx.hours)

  const systemPrompt = buildSystemPrompt(ctx, hoursText)
  const messages = ctx.recentMessages.slice(-10).map((m) => ({
    role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
    content: m.body || "[media]",
  }))
  messages.push({ role: "user" as const, content: message })

  const { text } = await generateText({
    model,
    temperature: 0.4,
    maxTokens: 500,
    system: systemPrompt,
    messages,
  })

  return { text, flowUpdate: { currentFlow: "none", flowState: {} } }
}

function buildSystemPrompt(ctx: CommsAgentContext, hoursText: string): string {
  let prompt = `You are a friendly, professional receptionist assistant for ${ctx.practiceName}. You communicate via WhatsApp.

Keep responses concise (2-4 sentences). Use a warm but professional tone. Never provide medical advice or diagnoses.

Practice hours:
${hoursText}
${ctx.isAfterHours ? "\n⚠️ The practice is currently CLOSED. Inform the patient and offer to help with booking for when they reopen." : ""}

Available services:
${ctx.services.length > 0 ? ctx.services.map((s) => `- ${s.name} (${s.durationMinutes} min${s.fee ? `, R${s.fee}` : ""})`).join("\n") : "No specific services listed."}
`

  if (ctx.patientContext) {
    prompt += `\nPatient context: ${ctx.patientContext.name}`
    if (ctx.patientContext.lastVisit) prompt += `, last visit: ${ctx.patientContext.lastVisit}`
    if (ctx.patientContext.upcomingAppointments?.length) {
      prompt += `\nUpcoming: ${ctx.patientContext.upcomingAppointments.map((a) => `${a.date} at ${a.time}`).join(", ")}`
    }
  }

  prompt += `\n\nIf the patient wants to book, say you can help and ask what they need to be seen for. If they have symptoms, be empathetic but don't diagnose.`

  return prompt
}

function isEmergency(text: string): boolean {
  const lower = text.toLowerCase()
  return EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw))
}

function isHandoffRequest(text: string): boolean {
  const lower = text.toLowerCase()
  return HANDOFF_KEYWORDS.some((kw) => lower.includes(kw))
}
