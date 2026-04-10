import { NextRequest, NextResponse } from "next/server"
import { validateVapiSignature } from "@/lib/comms/vapi"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  getOrCreateThread,
  appendMessage,
  getPracticeName,
  getPracticeHours,
  isCurrentlyOpen,
  formatHoursForAgent,
  getServices,
  checkAvailability,
  bookAppointment,
  createStubPatientForVoice,
  findPatientByPracticePhone,
  updateThreadStatus,
  updateThreadFlow,
  getPracticeWhatsAppNumber,
} from "@/lib/comms"
import { sendTemplateMessage } from "@/lib/comms/templates"
import { mergePracticeAppointmentMetadata } from "@/lib/comms/appointment-metadata"
import type { Json } from "@/app/types/database.types"

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    const signature = req.headers.get("x-vapi-signature") || ""
    if (process.env.VAPI_SERVER_SECRET && !validateVapiSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>
    const messageType =
      (payload.message as Record<string, unknown> | undefined)?.type || payload.type

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

function getCallContext(payload: Record<string, unknown>): {
  call: Record<string, unknown>
  practiceId: string
  customerNumber: string
  meta: Record<string, unknown>
} | null {
  const call = (payload.call || (payload.message as Record<string, unknown>)?.call) as
    | Record<string, unknown>
    | undefined
  if (!call) return null
  const customer = call.customer as Record<string, unknown> | undefined
  const customerNumber = (customer?.number as string) || ""
  const meta = (call.metadata as Record<string, unknown>) || {}
  const practiceId = meta.practiceId as string
  if (!practiceId || !customerNumber) return null
  return { call, practiceId, customerNumber, meta }
}

async function handleAssistantRequest(payload: Record<string, unknown>) {
  const call = payload.call as Record<string, unknown> | undefined
  const phoneNumberId = (call?.phoneNumberId as string) || ""

  const db = createAdminClient()

  type VoiceChannelRow = { practice_id: string; phone_number: string }
  // Try matching on Vapi phone number ID first
  let channel: VoiceChannelRow | null = null
  if (phoneNumberId) {
    const { data } = await db
      .from("practice_channels")
      .select("practice_id, phone_number")
      .eq("vapi_phone_number_id", phoneNumberId)
      .eq("channel_type", "voice")
      .limit(1)
      .maybeSingle()
    channel = data as VoiceChannelRow | null
  }

  // Fallback: match on the dialled phone number (E.164)
  if (!channel) {
    const phoneNumber = (call?.phoneNumber as Record<string, unknown>)?.number as string
      || (call?.phoneNumber as string)
      || ""
    const clean = phoneNumber.replace(/\s/g, "")
    if (clean) {
      const { data } = await db
        .from("practice_channels")
        .select("practice_id, phone_number")
        .eq("phone_number", clean)
        .eq("channel_type", "voice")
        .limit(1)
        .maybeSingle()
      channel = data as VoiceChannelRow | null
    }
  }

  const practiceId = channel?.practice_id
  if (!practiceId) {
    return NextResponse.json({
      assistant: { firstMessage: "Thank you for calling. This number is not yet configured." },
    })
  }

  const customer = call?.customer as Record<string, unknown> | undefined
  const customerNumber = (customer?.number as string) || ""
  const meta = (call?.metadata as Record<string, unknown>) || {}
  const purpose = meta.purpose as string | undefined

  const practiceName = await getPracticeName(practiceId)

  if (purpose === "pre_appointment_checkin") {
    return buildCheckinAssistantResponse(practiceId, practiceName, meta, customerNumber)
  }
  if (purpose === "post_visit_followup") {
    return buildFollowupAssistantResponse(practiceId, practiceName, meta, customerNumber)
  }

  return buildInboundReceptionistAssistant(practiceId, practiceName, customerNumber)
}

function buildCheckinAssistantResponse(
  practiceId: string,
  practiceName: string,
  meta: Record<string, unknown>,
  _customerNumber: string
) {
  const patientName = (meta.patientFirstName as string) || "there"
  const apptDate = (meta.apptDate as string) || ""
  const apptTime = (meta.apptTime as string) || ""

  const systemPrompt = `You are calling on behalf of ${practiceName}. This is a brief appointment reminder call.
The patient ${patientName} has an appointment on ${apptDate} at ${apptTime}.
Politely ask if they still plan to attend. If they cannot attend, note that briefly.
Use the recordCheckinAttendance tool with attending true/false and an optional short note.
Do not give medical advice. Keep the call short.`

  return NextResponse.json({
    assistant: {
      firstMessage: `Hi, this is ${practiceName}. I'm just checking whether you're still able to come to your appointment on ${apptDate} at ${apptTime}?`,
      model: {
        provider: "openai",
        model: process.env.COMMS_AGENT_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "recordCheckinAttendance",
              description: "Record whether the patient plans to attend the appointment",
              parameters: {
                type: "object",
                properties: {
                  attending: { type: "boolean", description: "True if they will attend" },
                  note: { type: "string", description: "Short note if they decline or reschedule intent" },
                },
                required: ["attending"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "transferToHuman",
              description: "Transfer to staff if the patient needs complex help",
              parameters: {
                type: "object",
                properties: { reason: { type: "string" } },
              },
            },
          },
        ],
      },
      metadata: { ...meta, practiceId },
    },
  })
}

function buildFollowupAssistantResponse(
  practiceId: string,
  practiceName: string,
  meta: Record<string, unknown>,
  _customerNumber: string
) {
  const patientName = (meta.patientFirstName as string) || "there"

  const systemPrompt = `You are calling from ${practiceName} for a short wellness check after a recent visit.
The patient's first name is ${patientName}. Ask how they are doing after their appointment.
Do not diagnose or give medical advice. If they report an emergency, tell them to call ER24 at 084 124 or 112.
Use recordFollowUpNote with a brief summary and whether staff should call them back.`

  return NextResponse.json({
    assistant: {
      firstMessage: `Hi ${patientName}, this is ${practiceName}. I'm just following up after your recent visit — how are you feeling?`,
      model: {
        provider: "openai",
        model: process.env.COMMS_AGENT_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "recordFollowUpNote",
              description: "Save a short summary of the follow-up conversation",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Brief neutral summary" },
                  needsCallback: {
                    type: "boolean",
                    description: "True if a staff member should call the patient back",
                  },
                },
                required: ["summary", "needsCallback"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "transferToHuman",
              description: "Transfer to staff",
              parameters: {
                type: "object",
                properties: { reason: { type: "string" } },
              },
            },
          },
        ],
      },
      metadata: { ...meta, practiceId },
    },
  })
}

async function buildInboundReceptionistAssistant(
  practiceId: string,
  practiceName: string,
  customerNumber: string
) {
  const hours = await getPracticeHours(practiceId)
  const isOpen = isCurrentlyOpen(hours)
  const hoursText = formatHoursForAgent(hours)
  const services = await getServices(practiceId)

  const serviceList =
    services.length > 0
      ? services.map((s) => `- ${s.name} (${s.durationMinutes} min${s.fee ? `, R${s.fee}` : ""})`).join("\n")
      : "General consultations available."

  const systemPrompt = `You are a friendly, professional receptionist for ${practiceName}. You answer phone calls from patients.

${isOpen ? "The practice is currently OPEN." : "The practice is currently CLOSED."}

Practice hours:
${hoursText}

Services offered:
${serviceList}

Before booking an appointment:
1. Call resolveCallerPatient (no arguments) to see if we already know this caller.
2. If not registered, ask for their full name and call registerCallerStub with that name.
3. Then use checkAvailability and bookAppointment. Pass patientId from resolveCallerPatient or registerCallerStub into bookAppointment when available.

Key rules:
- Be warm, concise, and helpful
- NEVER provide medical advice or diagnoses
- For emergencies, tell the patient to call ER24 at 084 124 or 112
- Keep responses brief for natural phone conversation`

  const firstMessage = isOpen
    ? `Good ${getTimeOfDay()}, thank you for calling ${practiceName}. How can I help you today?`
    : `Thank you for calling ${practiceName}. We are currently closed. Our hours are ${hours.length > 0 ? "listed in our schedule" : "not set up yet"}. I can still help you book an appointment. How can I help?`

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
              name: "resolveCallerPatient",
              description:
                "Look up the patient record for this caller's phone number. Call this before booking.",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "registerCallerStub",
              description:
                "Register a new patient with their full name when resolveCallerPatient found no record. Required before booking for new patients.",
              parameters: {
                type: "object",
                properties: {
                  fullName: { type: "string", description: "Patient full name" },
                },
                required: ["fullName"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "checkAvailability",
              description: "Check available appointment slots",
              parameters: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    description: "Date to check (YYYY-MM-DD). If not specified, checks next few days.",
                  },
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
                  patientId: { type: "string", description: "UUID from resolveCallerPatient or registerCallerStub" },
                  patientName: { type: "string", description: "Patient full name" },
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
      metadata: { practiceId, callerPhone: customerNumber },
    },
  })
}

async function handleFunctionCall(payload: Record<string, unknown>) {
  const ctx = getCallContext(payload)
  if (!ctx) {
    return NextResponse.json({ result: "Error: missing call context" })
  }

  const msg = payload.message as Record<string, unknown>
  const functionCall = msg?.functionCall as Record<string, unknown>
  const name = functionCall?.name as string
  const args = (functionCall?.parameters as Record<string, unknown>) || {}
  const { practiceId, customerNumber, meta } = ctx

  switch (name) {
    case "resolveCallerPatient": {
      const row = await findPatientByPracticePhone(practiceId, customerNumber)
      if (!row) {
        return NextResponse.json({
          result: JSON.stringify({
            found: false,
            message: "No patient record for this number. Ask for their full name and call registerCallerStub.",
          }),
        })
      }
      return NextResponse.json({
        result: JSON.stringify({
          found: true,
          patientId: row.id,
          profileComplete: row.profile_status === "complete",
          displayName: (row.display_name_hint || "").split("|")[0]?.trim() || "Patient",
        }),
      })
    }

    case "registerCallerStub": {
      const fullName = (args.fullName as string) || "Unknown caller"
      const { patientId } = await createStubPatientForVoice({
        practiceId,
        rawPhone: customerNumber,
        fullName,
      })
      const thread = await getOrCreateThread(practiceId, "voice", customerNumber)
      await updateThreadStatus(thread.id, { patientId })
      return NextResponse.json({
        result: JSON.stringify({
          patientId,
          message: "Patient registered. You can book an appointment using this patientId.",
        }),
      })
    }

    case "checkAvailability": {
      const availability = await checkAvailability({
        practiceId,
        date: args.date as string | undefined,
        daysAhead: 5,
      })
      if (availability.length === 0) {
        return NextResponse.json({ result: "No available slots in the next 5 days." })
      }
      const summary = availability
        .flatMap((d) =>
          d.slots
            .slice(0, 3)
            .map((s) => `${d.date} at ${s.startTime}${s.providerName ? ` with ${s.providerName}` : ""}`)
        )
        .join(", ")
      return NextResponse.json({ result: `Available slots: ${summary}` })
    }

    case "bookAppointment": {
      let patientId = args.patientId as string | undefined
      if (!patientId) {
        const row = await findPatientByPracticePhone(practiceId, customerNumber)
        patientId = row?.id
      }
      const result = await bookAppointment({
        practiceId,
        patientId,
        patientName: (args.patientName as string) || "Phone Patient",
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

    case "recordCheckinAttendance": {
      const appointmentId = meta.appointmentId as string | undefined
      if (!appointmentId) {
        return NextResponse.json({ result: "Error: no appointment on this call" })
      }
      await mergePracticeAppointmentMetadata(appointmentId, {
        voice_checkin_at: new Date().toISOString(),
        voice_checkin_attending: args.attending,
        voice_checkin_note: args.note || null,
      })
      return NextResponse.json({ result: "Check-in recorded. Thank the patient and end the call politely." })
    }

    case "recordFollowUpNote": {
      const appointmentId = meta.appointmentId as string | undefined
      const patch = {
        post_visit_voice_summary: args.summary,
        post_visit_needs_callback: args.needsCallback,
        post_visit_voice_at: new Date().toISOString(),
      }
      if (appointmentId) {
        await mergePracticeAppointmentMetadata(appointmentId, patch)
      }
      return NextResponse.json({ result: "Follow-up note saved. Thank the patient and end politely." })
    }

    default:
      return NextResponse.json({ result: "Unknown function" })
  }
}

async function handleEndOfCall(payload: Record<string, unknown>) {
  const msg = (payload.message as Record<string, unknown>) || payload
  const call = (payload.call || msg.call) as Record<string, unknown> | undefined
  const meta = (call?.metadata as Record<string, unknown>) || {}
  const practiceId = meta.practiceId as string
  const customer = call?.customer as Record<string, unknown> | undefined
  const customerNumber = (customer?.number as string) || ""
  const callId = (call?.id as string) || ""

  if (!practiceId || !customerNumber) {
    return NextResponse.json({ ok: true })
  }

  const thread = await getOrCreateThread(practiceId, "voice", customerNumber)
  const db = createAdminClient()

  await db.from("voice_calls").insert({
    thread_id: thread.id,
    practice_id: practiceId,
    direction: (call?.direction as string) || "inbound",
    vapi_call_id: callId,
    duration_seconds: (msg.durationSeconds as number) || undefined,
    recording_url: (msg.recordingUrl as string) || undefined,
    transcript: (msg.transcript as string) || undefined,
    summary: (msg.summary as string) || undefined,
    tool_calls_log: (msg.toolCalls as Json) ?? undefined,
    ended_reason: (msg.endedReason as string) || undefined,
    cost_cents: msg.cost ? Math.round((msg.cost as number) * 100) : undefined,
  })

  await appendMessage({
    threadId: thread.id,
    practiceId,
    direction: "inbound",
    senderType: "patient",
    contentType: "audio",
    body: (msg.summary as string) || (msg.transcript as string) || "[Voice call]",
    providerMessageId: callId,
  })

  const patientRow = await findPatientByPracticePhone(practiceId, customerNumber)
  const voiceMeta = (thread.metadata as Record<string, unknown>) || {}
  const alreadySent = Boolean(voiceMeta.profile_completion_wa_sent_at)

  if (patientRow?.profile_status === "incomplete" && !alreadySent) {
    const practiceNumber = await getPracticeWhatsAppNumber(practiceId)
    if (practiceNumber) {
      const namePart = (patientRow.display_name_hint || "").split("|")[0]?.trim() || "there"
      const practiceName = await getPracticeName(practiceId)
      try {
        const messageSid = await sendTemplateMessage({
          practiceId,
          from: practiceNumber,
          to: customerNumber,
          templateKey: "welcome_onboarding",
          variables: { "1": namePart, "2": practiceName },
        })
        const waThread = await getOrCreateThread(practiceId, "whatsapp", customerNumber)
        if (!waThread.patientId && patientRow.id) {
          await updateThreadStatus(waThread.id, { patientId: patientRow.id })
        }
        await updateThreadFlow(waThread.id, "onboarding", { step: "collect_name", collected: {} })
        await appendMessage({
          threadId: waThread.id,
          practiceId,
          direction: "outbound",
          senderType: "system",
          contentType: "text",
          body: `We sent a WhatsApp message to complete your profile. Message ID: ${messageSid}`,
          providerMessageId: messageSid,
          deliveryStatus: "sent",
        })
        await updateThreadStatus(thread.id, {
          metadataPatch: { profile_completion_wa_sent_at: new Date().toISOString() },
        })
      } catch (err) {
        console.error("[voice-webhook] WhatsApp profile prompt failed:", err)
      }
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleStatusUpdate(_payload: Record<string, unknown>) {
  return NextResponse.json({ ok: true })
}

function getTimeOfDay(): string {
  const hour = new Date().getUTCHours() + 2
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}
