import { NextRequest, NextResponse } from "next/server"
import {
  validateTwilioSignature,
  resolvePracticeFromPhone,
  getOrCreateThread,
  appendMessage,
  checkMessageIdempotency,
  updateThreadFlow,
  updateThreadStatus,
  getPracticeWhatsAppNumber,
  runCommsAgent,
  getPracticeHours,
  isCurrentlyOpen,
  getAfterHoursMessage,
  hasConsent,
  recordConsent,
  isOptOutKeyword,
  isConsentGrant,
  getConsentPrompt,
  sendWhatsAppMessage,
  downloadAndStoreMedia,
  getServices,
  getFAQs,
  getPracticeName,
  buildInteractiveBody,
} from "@/lib/comms"
import type { CommsAgentContext } from "@/lib/comms"
import { getThreadMessages } from "@/lib/comms/threads"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => { params[key] = value.toString() })

    // Validate Twilio signature
    const signature = req.headers.get("X-Twilio-Signature") || ""
    const url = `${process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin}/api/comms/whatsapp/webhook`
    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const from = params.From || ""
    const to = params.To || ""
    const body = params.Body || ""
    const messageSid = params.MessageSid || ""
    const numMedia = parseInt(params.NumMedia || "0")

    // Resolve practice
    const cleanTo = to.replace("whatsapp:", "")
    const practiceId = await resolvePracticeFromPhone(cleanTo)
    if (!practiceId) {
      return twimlResponse("This number is not configured. Please contact the practice directly.")
    }

    // Idempotency
    if (messageSid && await checkMessageIdempotency(messageSid)) {
      return twimlResponse()
    }

    // Get or create thread
    const thread = await getOrCreateThread(practiceId, "whatsapp", from)

    // Store inbound message
    let mediaStoragePath: string | undefined
    let mediaMimeType: string | undefined

    if (numMedia > 0) {
      const mediaUrl = params.MediaUrl0
      const mediaType = params.MediaContentType0
      if (mediaUrl) {
        try {
          const stored = await downloadAndStoreMedia({
            mediaUrl,
            practiceId,
            threadId: thread.id,
          })
          mediaStoragePath = stored.storagePath
          mediaMimeType = stored.mimeType
        } catch (err) {
          console.error("[whatsapp-webhook] Media download failed:", err)
        }
      }
      mediaMimeType = mediaMimeType || mediaType
    }

    await appendMessage({
      threadId: thread.id,
      practiceId,
      direction: "inbound",
      senderType: "patient",
      contentType: mediaStoragePath ? (mediaMimeType?.startsWith("image/") ? "image" : "document") : "text",
      body: body || undefined,
      mediaUrl: params.MediaUrl0,
      mediaMimeType,
      mediaStoragePath,
      providerMessageId: messageSid,
    })

    // Respond immediately, process async
    // Using waitUntil-style pattern (fire and forget)
    const processPromise = processInbound(practiceId, thread.id, from, cleanTo, body, mediaStoragePath ? { storagePath: mediaStoragePath, mimeType: mediaMimeType || "" } : undefined)
    processPromise.catch((err) => console.error("[whatsapp-webhook] Agent processing failed:", err))

    return twimlResponse()
  } catch (err) {
    console.error("[whatsapp-webhook] Error:", err)
    return twimlResponse()
  }
}

async function processInbound(
  practiceId: string,
  threadId: string,
  from: string,
  practiceNumber: string,
  body: string,
  media?: { storagePath: string; mimeType: string }
) {
  const practiceName = await getPracticeName(practiceId)
  const hours = await getPracticeHours(practiceId)
  const isOpen = isCurrentlyOpen(hours)

  // Check opt-out
  if (isOptOutKeyword(body)) {
    await recordConsent({
      practiceId,
      externalParty: from,
      channel: "whatsapp",
      consentType: "ai_communication",
      granted: false,
    })
    await sendReply(practiceNumber, from, practiceId, threadId, "You've been unsubscribed. Reply START to re-subscribe anytime.")
    await updateThreadStatus(threadId, { status: "closed" })
    return
  }

  // Check consent
  const consented = await hasConsent(practiceId, from)
  if (!consented) {
    if (isConsentGrant(body)) {
      await recordConsent({
        practiceId,
        externalParty: from,
        channel: "whatsapp",
        consentType: "ai_communication",
        granted: true,
      })
      const welcomeMsg = isOpen
        ? `Thank you! How can I help you today at ${practiceName}?`
        : getAfterHoursMessage(practiceName, hours)
      await sendReply(practiceNumber, from, practiceId, threadId, welcomeMsg)
      return
    }

    await sendReply(practiceNumber, from, practiceId, threadId, getConsentPrompt(practiceName))
    return
  }

  // Build agent context
  const recentMessages = await getThreadMessages(threadId, 20)
  const services = await getServices(practiceId)
  const faqs = await getFAQs(practiceId)

  // Re-fetch thread to get latest flow state
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { data: threadRow } = await createAdminClient()
    .from("conversation_threads")
    .select("*")
    .eq("id", threadId)
    .single()

  if (!threadRow) return

  const { threadFromRow } = await import("@/lib/comms/types")
  const thread = threadFromRow(threadRow as Record<string, unknown>)

  const ctx: CommsAgentContext = {
    practiceId,
    practiceName,
    thread,
    recentMessages,
    hours,
    services,
    faqs,
    isAfterHours: !isOpen,
    hasConsent: true,
  }

  // Run agent
  const response = await runCommsAgent(ctx, body, media)

  // Apply thread updates
  if (response.threadUpdate) {
    await updateThreadStatus(threadId, response.threadUpdate)
  }
  if (response.flowUpdate) {
    await updateThreadFlow(threadId, response.flowUpdate.currentFlow, response.flowUpdate.flowState)
  }

  // Send reply
  let replyText = response.text
  if (response.interactive) {
    replyText += buildInteractiveBody(response.interactive)
  }

  await sendReply(practiceNumber, from, practiceId, threadId, replyText, response.toolCalls)
}

async function sendReply(
  practiceNumber: string,
  to: string,
  practiceId: string,
  threadId: string,
  text: string,
  toolCalls?: unknown[]
) {
  try {
    const { messageSid } = await sendWhatsAppMessage({
      from: practiceNumber,
      to: to.replace("whatsapp:", ""),
      body: text,
    })

    await appendMessage({
      threadId,
      practiceId,
      direction: "outbound",
      senderType: "agent",
      body: text,
      providerMessageId: messageSid,
      deliveryStatus: "sent",
      agentToolCalls: toolCalls,
    })
  } catch (err) {
    console.error("[whatsapp-webhook] Failed to send reply:", err)
    // Store in DLQ
    const { createAdminClient } = await import("@/lib/supabase/admin")
    await createAdminClient().from("webhook_events").insert({
      practice_id: practiceId,
      source: "twilio_whatsapp",
      event_type: "send_failed",
      payload: { to, text, error: (err as Error).message },
      status: "pending",
      next_retry_at: new Date(Date.now() + 60000).toISOString(),
    })
  }
}

function twimlResponse(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
  return new NextResponse(body, {
    headers: { "Content-Type": "text/xml" },
  })
}
