import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import type {
  AppointmentChangeFlowState,
  CommsAgentContext,
  CommsAgentResponse,
  FlowState,
  ThreadMessage,
} from "./types"
import { runBookingFlow } from "./flows/booking"
import { runOnboardingFlow } from "./flows/onboarding"
import { runTriageFlow } from "./flows/triage"
import { runPatientLookupFlow } from "./flows/patient-lookup"
import {
  resolvePatientIdForThread,
  confirmUpcomingAppointmentFromReminder,
  getUpcomingAppointments,
  cancelAppointment,
  rescheduleAppointment,
} from "./appointment-actions"
import { notifyAdmins } from "./notify"
import { getFAQs } from "./tools"
import { formatHoursForAgent } from "./after-hours"

const EMERGENCY_KEYWORDS = [
  "chest pain",
  "heart attack",
  "can't breathe",
  "cannot breathe",
  "suicide",
  "kill myself",
  "want to die",
  "overdose",
  "severe bleeding",
  "unconscious",
  "stroke",
  "seizure",
]

const HANDOFF_KEYWORDS = [
  "speak to someone",
  "real person",
  "human",
  "talk to a person",
  "manager",
  "receptionist",
  "doctor please",
  "speak to the doctor",
]

export async function runCommsAgent(
  ctx: CommsAgentContext,
  inboundMessage: string,
  inboundMedia?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  if (isEmergency(inboundMessage)) {
    return {
      text: "⚠️ This sounds like a medical emergency. Please call ER24 at *084 124* or dial *112* immediately.\n\nI've flagged your message as urgent for the practice team.",
      threadUpdate: { status: "handoff", priority: "urgent" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  if (isHandoffRequest(inboundMessage)) {
    return {
      text: `I'll connect you with a team member at ${ctx.practiceName}. Someone will respond shortly.\n\nIf this is urgent, please call us directly.`,
      threadUpdate: { status: "handoff", priority: "high" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  const upper = inboundMessage.trim().toUpperCase()
  if (upper === "STOP" || upper === "OPTOUT") {
    return {
      text: "You've been unsubscribed from automated messages. You can always message us again if you need help.",
      threadUpdate: { status: "closed" },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  if (inboundMessage === "register_yes") {
    return runOnboardingFlow(ctx, inboundMessage, { step: "welcome", collected: {} })
  }
  if (inboundMessage === "register_no" || inboundMessage === "action_done" || inboundMessage === "book_no") {
    return {
      text: "No problem! Feel free to message us anytime you need help.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  if (inboundMessage === "book_yes" || inboundMessage === "action_book") {
    return runBookingFlow(ctx, inboundMessage, { step: "detect_reason", collected: {} })
  }

  if (inboundMessage.startsWith("cancel_confirm:") || inboundMessage.startsWith("cancel_pick:")) {
    const id = inboundMessage.includes("cancel_confirm:")
      ? inboundMessage.slice("cancel_confirm:".length).trim()
      : inboundMessage.slice("cancel_pick:".length).trim()
    return handleCancelConfirm(ctx, id)
  }
  if (inboundMessage.startsWith("resched_pick:")) {
    const id = inboundMessage.slice("resched_pick:".length).trim()
    return handleReschedPick(ctx, id)
  }

  if (ctx.thread.currentFlow === "none") {
    const reminder = await tryHandleReminderKeywordReply(ctx, inboundMessage)
    if (reminder) return reminder
  }

  if (ctx.thread.currentFlow !== "none") {
    return resumeFlow(ctx, inboundMessage, inboundMedia)
  }

  return detectIntentAndRoute(ctx, inboundMessage, inboundMedia)
}

async function handleCancelIntent(ctx: CommsAgentContext): Promise<CommsAgentResponse> {
  const patientId = await resolvePatientIdForThread(
    ctx.practiceId,
    ctx.thread.patientId,
    ctx.thread.externalParty
  )
  if (!patientId) {
    return {
      text: "I need to link your profile first. Reply *REGISTER* or call the practice.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  const appts = await getUpcomingAppointments(ctx.practiceId, patientId, 8)
  if (appts.length === 0) {
    return {
      text: "I'm not seeing an upcoming booking on file for this number. Say *book* if you'd like to schedule.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  if (appts.length === 1) {
    const a = appts[0]
    return {
      text: `I found one upcoming visit: *${a.appt_date}* at *${a.start_time}*. Cancel this appointment?`,
      interactive: {
        type: "buttons",
        buttons: [
          { id: `cancel_confirm:${a.id}`, title: "Yes, cancel" },
          { id: "action_done", title: "No" },
        ],
      },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  return {
    text: "Which appointment would you like to cancel?",
    interactive: {
      type: "list",
      sections: [
        {
          title: "Upcoming appointments",
          rows: appts.map((a) => ({
            id: `cancel_pick:${a.id}`,
            title: `${a.appt_date} ${a.start_time}`,
            description: a.service || "Appointment",
          })),
        },
      ],
    },
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}

async function handleRescheduleIntent(ctx: CommsAgentContext): Promise<CommsAgentResponse> {
  const patientId = await resolvePatientIdForThread(
    ctx.practiceId,
    ctx.thread.patientId,
    ctx.thread.externalParty
  )
  if (!patientId) {
    return {
      text: "I need to link your profile first. Reply *REGISTER* or call the practice.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  const appts = await getUpcomingAppointments(ctx.practiceId, patientId, 8)
  if (appts.length === 0) {
    return {
      text: "I'm not seeing an upcoming booking on file. Say *book* to schedule a new visit.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  if (appts.length === 1) {
    const a = appts[0]
    return {
      text: `Reschedule your visit on *${a.appt_date}* at *${a.start_time}*? I'll ask for a new date and time next.`,
      interactive: {
        type: "buttons",
        buttons: [{ id: `resched_pick:${a.id}`, title: "Choose new time" }],
      },
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }
  return {
    text: "Which appointment should we move?",
    interactive: {
      type: "list",
      sections: [
        {
          title: "Upcoming appointments",
          rows: appts.map((a) => ({
            id: `resched_pick:${a.id}`,
            title: `${a.appt_date} ${a.start_time}`,
            description: a.service || "Appointment",
          })),
        },
      ],
    },
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}

async function handleCancelConfirm(
  ctx: CommsAgentContext,
  appointmentId: string
): Promise<CommsAgentResponse> {
  const patientId = await resolvePatientIdForThread(
    ctx.practiceId,
    ctx.thread.patientId,
    ctx.thread.externalParty
  )
  if (!patientId) {
    return { text: "Could not verify your profile.", flowUpdate: { currentFlow: "none", flowState: {} } }
  }
  const res = await cancelAppointment({
    practiceId: ctx.practiceId,
    patientId,
    appointmentId,
    cancellationChannel: "sms",
  })
  if (res.ok && res.appointmentId) {
    await notifyAdmins({
      practiceId: ctx.practiceId,
      type: "appointment_reminder",
      title: "Appointment cancelled (SMS)",
      detail: res.message,
      actionTab: "calendar",
      actionEntityId: res.appointmentId,
    })
  }
  return {
    text: res.ok ? `✅ ${res.message}` : res.message,
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}

async function handleReschedPick(
  ctx: CommsAgentContext,
  appointmentId: string
): Promise<CommsAgentResponse> {
  return {
    text: "What *new date* would you like? Reply with YYYY-MM-DD (e.g. 2026-04-22).",
    flowUpdate: {
      currentFlow: "appointment_change",
      flowState: { step: "reschedule_date", collected: { appointmentId } },
    },
  }
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
    system: `You are an intent classifier for a medical practice's patient messaging assistant (SMS/RCS). Classify the patient's message into exactly one intent. Respond with JSON only: {"intent": "booking" | "onboarding" | "triage" | "faq" | "greeting" | "cancel" | "reschedule" | "check_record", "reason": "brief description"}`,
    prompt: `Patient message: "${message}"\n\nContext: ${ctx.thread.patientId ? "Existing patient" : "Unknown patient"}, channel: ${ctx.thread.channel}`,
  })

  let intent = "faq"
  try {
    const parsed = JSON.parse(intentJson)
    intent = parsed.intent || "faq"
  } catch {
    const lower = message.toLowerCase()
    if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) intent = "booking"
    else if (lower.includes("new patient") || lower.includes("register") || lower.includes("sign up")) intent = "onboarding"
    else if (lower.includes("check") && (lower.includes("record") || lower.includes("file") || lower.includes("registered"))) intent = "check_record"
    else if (
      lower.includes("my record") ||
      lower.includes("am i registered") ||
      lower.includes("my id") ||
      lower.includes("patient file")
    )
      intent = "check_record"
    else if (lower.includes("sick") || lower.includes("pain") || lower.includes("symptoms")) intent = "triage"
    else if (lower.includes("cancel")) intent = "cancel"
    else if (lower.includes("reschedule")) intent = "reschedule"
  }

  if (!ctx.thread.patientId && intent !== "faq" && intent !== "greeting") {
    const isFirstMessage = ctx.recentMessages.length <= 1
    if (isFirstMessage && intent !== "onboarding") {
      intent = "onboarding"
    }
  }

  switch (intent) {
    case "booking":
      return runBookingFlow(ctx, message, { step: "detect_reason", collected: {} })

    case "reschedule":
      return handleRescheduleIntent(ctx)

    case "onboarding":
      return runOnboardingFlow(ctx, message, { step: "welcome", collected: {} })

    case "check_record":
      return runPatientLookupFlow(ctx, message, { step: "ask_method", collected: {} })

    case "triage":
      return runTriageFlow(ctx, message, { step: "collect_symptoms", collected: {} })

    case "cancel":
      return handleCancelIntent(ctx)

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
    case "patient_lookup":
      return runPatientLookupFlow(ctx, message, state, media)
    case "appointment_change":
      return runAppointmentChangeFlow(ctx, message, state)
    case "faq":
      return handleFAQOrChat(ctx, message)
    default:
      return detectIntentAndRoute(ctx, message, media)
  }
}

function normalizeHHMM(raw: string): string {
  const t = raw.trim()
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return t
  const h = m[1]!.padStart(2, "0")
  return `${h}:${m[2]!}`
}

async function runAppointmentChangeFlow(
  ctx: CommsAgentContext,
  message: string,
  state: FlowState
): Promise<CommsAgentResponse> {
  const st = state as AppointmentChangeFlowState
  const step = st.step || "reschedule_date"
  const collected = st.collected || {}

  if (step === "reschedule_date") {
    const raw = message.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return {
        text: "Please send the date as YYYY-MM-DD (e.g. 2026-04-22).",
        flowUpdate: { currentFlow: "appointment_change", flowState: { step: "reschedule_date", collected } },
      }
    }
    return {
      text: "Thanks — what *start time* would you like? Reply with HH:MM (24h, e.g. 09:30).",
      flowUpdate: {
        currentFlow: "appointment_change",
        flowState: { step: "reschedule_time", collected: { ...collected, newDate: raw } },
      },
    }
  }

  if (step === "reschedule_time" && collected.appointmentId && collected.newDate) {
    const patientId = await resolvePatientIdForThread(
      ctx.practiceId,
      ctx.thread.patientId,
      ctx.thread.externalParty
    )
    if (!patientId) {
      return { text: "Could not link your patient profile.", flowUpdate: { currentFlow: "none", flowState: {} } }
    }
    const timeNorm = normalizeHHMM(message)
    if (!/^\d{2}:\d{2}$/.test(timeNorm)) {
      return {
        text: "Please send the time as HH:MM (e.g. 09:30).",
        flowUpdate: { currentFlow: "appointment_change", flowState: { step: "reschedule_time", collected } },
      }
    }
    const res = await rescheduleAppointment({
      practiceId: ctx.practiceId,
      patientId,
      appointmentId: collected.appointmentId,
      newDate: collected.newDate,
      newStartTime: timeNorm,
      channel: "sms",
    })
    if (res.ok && res.appointmentId) {
      await notifyAdmins({
        practiceId: ctx.practiceId,
        type: "appointment_reminder",
        title: "Appointment rescheduled (SMS)",
        detail: res.message,
        actionTab: "calendar",
        actionEntityId: res.appointmentId,
      })
    }
    return {
      text: res.ok ? `✅ ${res.message}` : res.message,
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  return { text: "Please call the practice for help with this change.", flowUpdate: { currentFlow: "none", flowState: {} } }
}

async function handleFAQOrChat(
  ctx: CommsAgentContext,
  message: string
): Promise<CommsAgentResponse> {
  const matchingFAQs = await getFAQs(ctx.practiceId, message)
  if (matchingFAQs.length > 0) {
    const faq = matchingFAQs[0]
    const extras =
      matchingFAQs.length > 1
        ? `\n\nI can also help with: ${matchingFAQs.slice(1).map((f) => f.question).join(", ")}`
        : ""
    return {
      text: `${faq.answer}${extras}\n\nIs there anything else I can help you with?`,
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

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
  let prompt = `You are a friendly, professional receptionist assistant for ${ctx.practiceName}. You communicate via SMS or RCS chat.

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

/** CONFIRM / RESCHEDULE from 24h reminder templates (handled only when currentFlow is none). */
export async function tryHandleReminderKeywordReply(
  ctx: CommsAgentContext,
  message: string
): Promise<CommsAgentResponse | null> {
  const t = message.trim().toUpperCase()
  const words = t.split(/\s+/).filter(Boolean)
  const first = words[0] || ""

  const isConfirm =
    t === "CONFIRM" || (words.length === 1 && (first === "YES" || first === "OK"))
  const isReschedule = first === "RESCHEDULE" || (words.length === 1 && first === "CHANGE")

  if (!isConfirm && !isReschedule) return null

  const patientId = await resolvePatientIdForThread(
    ctx.practiceId,
    ctx.thread.patientId,
    ctx.thread.externalParty
  )

  if (!patientId) {
    return {
      text:
        "I couldn't match this number to a patient profile yet. Reply *REGISTER* to sign up, or call the practice so we can link your file.",
      flowUpdate: { currentFlow: "none", flowState: {} },
    }
  }

  if (isReschedule) {
    return handleRescheduleIntent(ctx)
  }

  const result = await confirmUpcomingAppointmentFromReminder({
    practiceId: ctx.practiceId,
    patientId,
  })

  return {
    text: result.ok
      ? `✅ ${result.message}`
      : `We couldn't find an upcoming appointment to confirm. ${result.message}\n\nSay *book* to schedule, or *reschedule* to pick a new time.`,
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}
