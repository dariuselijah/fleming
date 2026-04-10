import type { CommsAgentContext, CommsAgentResponse, FlowState, BookingFlowState, InteractivePayload } from "../types"
import { checkAvailability, bookAppointment, getServices, createPatientRecord } from "../tools"
import { findPatientByPracticePhone } from "../patient-phone"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export async function runBookingFlow(
  ctx: CommsAgentContext,
  message: string,
  state: FlowState,
  _media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const bs = state as BookingFlowState
  const step = bs.step || "detect_reason"
  const collected = bs.collected || {}

  switch (step) {
    case "detect_reason":
      return handleDetectReason(ctx, message, collected)
    case "collect_reason":
      return handleCollectReason(ctx, message, collected)
    case "offer_slots":
      return handleOfferSlots(ctx, message, collected)
    case "confirm":
      return handleConfirm(ctx, message, collected)
    default:
      return handleDetectReason(ctx, message, collected)
  }
}

async function handleDetectReason(
  ctx: CommsAgentContext,
  message: string,
  collected: BookingFlowState["collected"]
): Promise<CommsAgentResponse> {
  const services = ctx.services

  if (services.length > 0) {
    const sections: InteractivePayload["sections"] = [{
      title: "Our Services",
      rows: services.slice(0, 10).map((s) => ({
        id: s.id,
        title: s.name,
        description: `${s.durationMinutes} min${s.fee ? ` · R${s.fee}` : ""}`,
      })),
    }]

    return {
      text: `I'd be happy to help you book an appointment at ${ctx.practiceName}! What would you like to be seen for?`,
      interactive: { type: "list", sections },
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "collect_reason", collected: { ...collected } },
      },
    }
  }

  return {
    text: `I'd be happy to help you book an appointment at ${ctx.practiceName}! What would you like to be seen for?`,
    flowUpdate: {
      currentFlow: "booking",
      flowState: { step: "collect_reason", collected: { ...collected } },
    },
  }
}

async function handleCollectReason(
  ctx: CommsAgentContext,
  message: string,
  collected: BookingFlowState["collected"]
): Promise<CommsAgentResponse> {
  const matchedService = ctx.services.find(
    (s) => s.id === message || s.name.toLowerCase() === message.toLowerCase()
  )

  const updatedCollected = {
    ...collected,
    reason: matchedService?.name || message,
    serviceId: matchedService?.id,
    serviceName: matchedService?.name || message,
  }

  // Fetch availability
  const availability = await checkAvailability({
    practiceId: ctx.practiceId,
    serviceId: matchedService?.id,
    daysAhead: 5,
  })

  if (availability.length === 0) {
    return {
      text: "I'm sorry, there are no available slots in the next 5 days. Would you like me to check further ahead, or would you prefer to speak with reception?",
      interactive: {
        type: "buttons",
        buttons: [
          { id: "check_more", title: "Check next week" },
          { id: "speak_reception", title: "Speak to reception" },
        ],
      },
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "collect_reason", collected: updatedCollected },
      },
    }
  }

  // Build slot list
  const rows: { id: string; title: string; description: string }[] = []
  for (const day of availability.slice(0, 3)) {
    const date = new Date(day.date)
    const dayName = DAY_NAMES[date.getDay()]
    const dateLabel = `${dayName} ${date.getDate()}/${date.getMonth() + 1}`

    for (const slot of day.slots.slice(0, 3)) {
      rows.push({
        id: JSON.stringify({ date: day.date, startTime: slot.startTime, endTime: slot.endTime, providerId: slot.providerId }),
        title: `${dateLabel} at ${slot.startTime}`,
        description: slot.providerName ? `with ${slot.providerName}` : "",
      })
    }
  }

  return {
    text: `Great! Here are the available slots for *${updatedCollected.serviceName || "your appointment"}*. Please pick a time:`,
    interactive: {
      type: "list",
      sections: [{ title: "Available Times", rows: rows.slice(0, 10) }],
    },
    flowUpdate: {
      currentFlow: "booking",
      flowState: { step: "offer_slots", collected: updatedCollected },
    },
  }
}

async function handleOfferSlots(
  ctx: CommsAgentContext,
  message: string,
  collected: BookingFlowState["collected"]
): Promise<CommsAgentResponse> {
  let selectedSlot: BookingFlowState["collected"] extends { selectedSlot?: infer T } ? T : never

  try {
    selectedSlot = JSON.parse(message)
  } catch {
    // User typed a response instead of tapping
    return {
      text: "Please select a time slot from the list above, or reply with a preferred date and time (e.g. 'Monday at 10am').",
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "offer_slots", collected },
      },
    }
  }

  const updatedCollected = { ...collected, selectedSlot }

  const date = new Date((selectedSlot as { date: string }).date)
  const dayName = DAY_NAMES[date.getDay()]
  const dateLabel = `${dayName} ${date.getDate()}/${date.getMonth() + 1}`

  return {
    text: `Please confirm your booking:\n\n📋 *${collected?.serviceName || collected?.reason || "Appointment"}*\n📅 ${dateLabel} at ${(selectedSlot as { startTime: string }).startTime}\n\nShall I confirm this?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "confirm_yes", title: "Yes, book it" },
        { id: "confirm_change", title: "Pick another time" },
      ],
    },
    flowUpdate: {
      currentFlow: "booking",
      flowState: { step: "confirm", collected: updatedCollected },
    },
  }
}

async function handleConfirm(
  ctx: CommsAgentContext,
  message: string,
  collected: BookingFlowState["collected"]
): Promise<CommsAgentResponse> {
  const lower = message.toLowerCase().trim()
  if (lower.includes("change") || lower.includes("another") || message === "confirm_change") {
    return handleDetectReason(ctx, collected?.reason || "", collected)
  }

  if (!collected?.selectedSlot) {
    return handleDetectReason(ctx, "", collected)
  }

  const affirmative =
    message === "confirm_yes" ||
    lower === "yes" ||
    lower === "y" ||
    lower === "ok" ||
    lower === "confirm" ||
    lower === "book it"
  if (!affirmative) {
    return {
      text: "Please tap *Yes, book it* above, or reply *yes* or *confirm* to finalize this time.",
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "confirm", collected },
      },
    }
  }

  const slot = collected.selectedSlot as { date: string; startTime: string; endTime: string; providerId?: string }
  const patientName = ctx.patientContext?.name || collected?.patientName || "Patient"

  let patientId = ctx.thread.patientId ?? null
  if (!patientId) {
    const found = await findPatientByPracticePhone(ctx.practiceId, ctx.thread.externalParty)
    if (found) {
      patientId = found.id
    } else {
      patientId = await createPatientRecord({
        practiceId: ctx.practiceId,
        displayNameHint: patientName,
        phone: ctx.thread.externalParty,
        profileStatus: "complete",
      })
    }
  }

  const result = await bookAppointment({
    practiceId: ctx.practiceId,
    patientId: patientId || undefined,
    patientName,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    service: collected?.serviceName,
    reason: collected?.reason,
    providerStaffId: slot.providerId,
  })

  if (!result.success) {
    return {
      text: `${result.message}\n\nWould you like to pick a different time?`,
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "collect_reason", collected },
      },
    }
  }

  const date = new Date(slot.date)
  const dayName = DAY_NAMES[date.getDay()]

  const linkedPatient = patientId && patientId !== ctx.thread.patientId

  return {
    text: `✅ *Appointment Confirmed!*\n\n📋 ${collected?.serviceName || "Appointment"}\n📅 ${dayName} ${date.getDate()}/${date.getMonth() + 1} at ${slot.startTime}\n\nWe'll send you a reminder 24 hours before. Reply *CANCEL* anytime to cancel or *RESCHEDULE* to change.\n\nIs there anything else I can help with?`,
    toolCalls: [{
      tool: "bookAppointment",
      args: { date: slot.date, startTime: slot.startTime, service: collected?.serviceName },
      result: { appointmentId: result.id },
      timestamp: new Date().toISOString(),
    }],
    flowUpdate: { currentFlow: "none", flowState: {} },
    ...(linkedPatient && patientId ? { threadUpdate: { patientId } } : {}),
  }
}
