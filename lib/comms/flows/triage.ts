import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import type { CommsAgentContext, CommsAgentResponse, FlowState, TriageFlowState } from "../types"

export async function runTriageFlow(
  ctx: CommsAgentContext,
  message: string,
  state: FlowState,
  _media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const ts = state as TriageFlowState
  const step = ts.step || "collect_symptoms"
  const collected = ts.collected || {}

  switch (step) {
    case "collect_symptoms":
      return handleCollectSymptoms(ctx, message, collected)
    case "assess_urgency":
      return handleAssessUrgency(ctx, message, collected)
    default:
      return handleCollectSymptoms(ctx, message, collected)
  }
}

async function handleCollectSymptoms(
  ctx: CommsAgentContext,
  message: string,
  collected: TriageFlowState["collected"]
): Promise<CommsAgentResponse> {
  if (!collected?.symptoms) {
    return {
      text: `I'm sorry to hear you're not feeling well. To help you best, could you tell me:\n\n1. What symptoms are you experiencing?\n2. How long have you had them?\n3. How severe are they on a scale of 1-10?`,
      flowUpdate: {
        currentFlow: "triage",
        flowState: { step: "collect_symptoms", collected: { symptoms: message } },
      },
    }
  }

  // We have symptoms, now assess
  return handleAssessUrgency(ctx, message, {
    ...collected,
    symptoms: collected.symptoms + " " + message,
  })
}

async function handleAssessUrgency(
  ctx: CommsAgentContext,
  message: string,
  collected: TriageFlowState["collected"]
): Promise<CommsAgentResponse> {
  const model = openai(process.env.COMMS_AGENT_MODEL || "gpt-4o-mini")

  const { text: assessment } = await generateText({
    model,
    temperature: 0.1,
    maxTokens: 200,
    system: `You are a medical triage assistant. Based on the patient's symptoms, assess urgency level. Respond with JSON: {"urgency": "low" | "medium" | "high" | "emergency", "recommendation": "brief recommendation", "shouldBookAppointment": true/false}. NEVER diagnose. For anything potentially serious, recommend they see a doctor urgently.`,
    prompt: `Symptoms: ${collected?.symptoms || message}\nDuration: ${collected?.duration || "unknown"}\nSeverity: ${collected?.severity || "unknown"}`,
  })

  let urgency: TriageFlowState["collected"] = collected
  let result = { urgency: "medium" as string, recommendation: "", shouldBookAppointment: true }

  try {
    result = JSON.parse(assessment)
  } catch {
    result = { urgency: "medium", recommendation: "We recommend booking an appointment to be seen.", shouldBookAppointment: true }
  }

  if (result.urgency === "emergency") {
    return {
      text: `⚠️ Based on what you've described, you should seek *immediate medical attention*.\n\nPlease call ER24 at *084 124* or dial *112*, or go to your nearest emergency room.\n\nI've flagged this for the practice team.`,
      threadUpdate: { status: "handoff", priority: "urgent" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  if (result.urgency === "high") {
    return {
      text: `Based on your symptoms, I'd recommend seeing a doctor *as soon as possible*.\n\n${result.recommendation}\n\nWould you like me to find the earliest available appointment?`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: "book_urgent", title: "Yes, earliest slot" },
          { id: "speak_staff", title: "Speak to staff" },
        ],
      },
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "collect_reason", collected: { reason: collected?.symptoms, intent: "urgent" } },
      },
    }
  }

  // Low/medium urgency
  return {
    text: `Thank you for letting me know. ${result.recommendation}\n\nWould you like to book an appointment?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "book_yes", title: "Book appointment" },
        { id: "book_no", title: "Not now" },
      ],
    },
    flowUpdate: {
      currentFlow: result.shouldBookAppointment ? "booking" : "none",
      flowState: result.shouldBookAppointment
        ? { step: "detect_reason", collected: { reason: collected?.symptoms } }
        : {},
    },
  }
}
