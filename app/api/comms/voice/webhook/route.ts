import { NextRequest, NextResponse } from "next/server"
import { validateVapiSignature } from "@/lib/comms/vapi"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getOrCreateThread,
  appendMessage,
  resolvePracticeFromPhone,
  getPracticeName,
  getPracticeHours,
  isCurrentlyOpen,
  formatHoursForAgent,
  getServices,
  getFAQs,
  checkAvailability,
  bookAppointment,
} from "@/lib/comms"

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // Validate signature
    const signature = req.headers.get("x-vapi-signature") || ""
    if (process.env.VAPI_SERVER_SECRET && !validateVapiSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    const payload = JSON.parse(rawBody)
    const messageType = payload.message?.type || payload.type

    switch (messageType) {
      case "assistant-request":
        return handleAssistantRequest(payload)
      case "function-call":
        return handleFunctionCall(payload)
      case "end-of-call-report":
        return handleEndOfCall(payload)
      case "status-update":
        return handleStatusUpdate(payload)
      default:
        return NextResponse.json({ ok: true })
    }
  } catch (err) {
    console.error("[voice-webhook] Error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

async function handleAssistantRequest(payload: Record<string, unknown>) {
  const call = payload.call as Record<string, unknown> | undefined
  const customerNumber = (call?.customer as Record<string, unknown>)?.number as string | undefined
  const phoneNumberId = (call?.phoneNumberId as string) || ""

  // Resolve practice from Vapi phone number
  const db = createAdminClient()
  const { data: channel } = await db
    .from("practice_channels")
    .select("practice_id, phone_number")
    .eq("vapi_phone_number_id", phoneNumberId)
    .eq("channel_type", "voice")
    .limit(1)
    .maybeSingle()

  const practiceId = channel?.practice_id
  if (!practiceId) {
    return NextResponse.json({
      assistant: { firstMessage: "Thank you for calling. This number is not yet configured." },
    })
  }

  const practiceName = await getPracticeName(practiceId)
  const hours = await getPracticeHours(practiceId)
  const isOpen = isCurrentlyOpen(hours)
  const hoursText = formatHoursForAgent(hours)
  const services = await getServices(practiceId)

  const serviceList = services.length > 0
    ? services.map((s) => `- ${s.name} (${s.durationMinutes} min${s.fee ? `, R${s.fee}` : ""})`).join("\n")
    : "General consultations available."

  const systemPrompt = `You are a friendly, professional receptionist for ${practiceName}. You answer phone calls from patients.

${isOpen ? "The practice is currently OPEN." : "The practice is currently CLOSED."}

Practice hours:
${hoursText}

Services offered:
${serviceList}

Key rules:
- Be warm, concise, and helpful
- NEVER provide medical advice or diagnoses
- For emergencies, tell the patient to call ER24 at 084 124 or 112
- You can check appointment availability and book appointments using your tools
- If you can't help, offer to transfer to a staff member
- Keep responses brief for natural phone conversation`

  const firstMessage = isOpen
    ? `Good ${getTimeOfDay()}, thank you for calling ${practiceName}. How can I help you today?`
    : `Thank you for calling ${practiceName}. We are currently closed. Our hours are ${hours.length > 0 ? "Monday to Friday" : "not set up yet"}. I can still help you book an appointment. How can I help?`

  return NextResponse.json({
    assistant: {
      firstMessage,
      model: {
        provider: "openai",
        model: process.env.COMMS_AGENT_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "checkAvailability",
              description: "Check available appointment slots",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "Date to check (YYYY-MM-DD). If not specified, checks next 3 days." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "bookAppointment",
              description: "Book an appointment for the patient",
              parameters: {
                type: "object",
                properties: {
                  patientName: { type: "string", description: "Patient's full name" },
                  date: { type: "string", description: "Appointment date (YYYY-MM-DD)" },
                  startTime: { type: "string", description: "Start time (HH:MM)" },
                  reason: { type: "string", description: "Reason for visit" },
                },
                required: ["patientName", "date", "startTime"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "getHours",
              description: "Get practice operating hours",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "transferToHuman",
              description: "Transfer the call to a staff member",
              parameters: {
                type: "object",
                properties: {
                  reason: { type: "string", description: "Reason for transfer" },
                },
              },
            },
          },
        ],
      },
      metadata: { practiceId },
    },
  })
}

async function handleFunctionCall(payload: Record<string, unknown>) {
  const msg = payload.message as Record<string, unknown>
  const functionCall = msg?.functionCall as Record<string, unknown>
  const name = functionCall?.name as string
  const args = (functionCall?.parameters as Record<string, unknown>) || {}
  const metadata = ((payload.call as Record<string, unknown>)?.metadata as Record<string, unknown>) || {}
  const practiceId = metadata.practiceId as string

  if (!practiceId) {
    return NextResponse.json({ result: "Error: practice not configured" })
  }

  switch (name) {
    case "checkAvailability": {
      const availability = await checkAvailability({
        practiceId,
        date: args.date as string | undefined,
        daysAhead: 5,
      })
      if (availability.length === 0) {
        return NextResponse.json({ result: "No available slots in the next 5 days." })
      }
      const summary = availability.flatMap((d) =>
        d.slots.slice(0, 3).map((s) => `${d.date} at ${s.startTime}${s.providerName ? ` with ${s.providerName}` : ""}`)
      ).join(", ")
      return NextResponse.json({ result: `Available slots: ${summary}` })
    }

    case "bookAppointment": {
      const result = await bookAppointment({
        practiceId,
        patientName: args.patientName as string || "Phone Patient",
        date: args.date as string,
        startTime: args.startTime as string,
        reason: args.reason as string | undefined,
      })
      return NextResponse.json({ result: result.message })
    }

    case "getHours": {
      const hours = await getPracticeHours(practiceId)
      return NextResponse.json({ result: formatHoursForAgent(hours) })
    }

    case "transferToHuman": {
      return NextResponse.json({
        result: "Transferring to a staff member now.",
      })
    }

    default:
      return NextResponse.json({ result: "Unknown function" })
  }
}

async function handleEndOfCall(payload: Record<string, unknown>) {
  const msg = payload.message as Record<string, unknown> || payload
  const call = (payload.call || msg.call) as Record<string, unknown> | undefined
  const metadata = (call?.metadata as Record<string, unknown>) || {}
  const practiceId = metadata.practiceId as string
  const customerNumber = (call?.customer as Record<string, unknown>)?.number as string | undefined
  const callId = (call?.id as string) || ""

  if (!practiceId || !customerNumber) {
    return NextResponse.json({ ok: true })
  }

  const thread = await getOrCreateThread(practiceId, "voice", customerNumber)
  const db = createAdminClient()

  // Store voice call record
  await db.from("voice_calls").insert({
    thread_id: thread.id,
    practice_id: practiceId,
    direction: (call?.direction as string) || "inbound",
    vapi_call_id: callId,
    duration_seconds: msg.durationSeconds as number || undefined,
    recording_url: msg.recordingUrl as string || undefined,
    transcript: msg.transcript as string || undefined,
    summary: msg.summary as string || undefined,
    tool_calls_log: msg.toolCalls || undefined,
    ended_reason: msg.endedReason as string || undefined,
    cost_cents: msg.cost ? Math.round((msg.cost as number) * 100) : undefined,
  })

  // Store summary as thread message
  await appendMessage({
    threadId: thread.id,
    practiceId,
    direction: "inbound",
    senderType: "patient",
    contentType: "audio",
    body: (msg.summary as string) || (msg.transcript as string) || "[Voice call]",
    providerMessageId: callId,
  })

  return NextResponse.json({ ok: true })
}

async function handleStatusUpdate(payload: Record<string, unknown>) {
  // Log status updates for monitoring
  return NextResponse.json({ ok: true })
}

function getTimeOfDay(): string {
  const hour = new Date().getUTCHours() + 2 // SAST
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}
