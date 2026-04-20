/**
 * Twilio inbound SMS / MMS / RCS (same Messaging API as legacy WhatsApp sandbox).
 * Patient threads use channel `rcs`; replies use SMS.
 */
import { NextRequest, NextResponse } from "next/server"
import {
  validateTwilioSignature,
  resolvePracticeFromPhone,
  getOrCreateThread,
  appendMessage,
  checkMessageIdempotency,
  updateThreadFlow,
  updateThreadStatus,
  getPracticeMessagingNumber,
  runCommsAgent,
  tryHandleReminderKeywordReply,
  getPracticeHours,
  isCurrentlyOpen,
  getAfterHoursMessage,
  hasConsent,
  recordConsent,
  isOptOutKeyword,
  isConsentGrant,
  getConsentPrompt,
  sendSmsMessage,
  downloadAndStoreMedia,
  getServices,
  getFAQs,
  getPracticeName,
  buildInteractiveBody,
} from "@/lib/comms"
import { notifyAdmins, addInboxStripMessage } from "@/lib/comms/notify"
import type { CommsAgentContext } from "@/lib/comms"
import { getThreadMessages } from "@/lib/comms/threads"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    const signature = req.headers.get("X-Twilio-Signature") || ""
    const url = `${process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin}/api/comms/messaging/webhook`
    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const from = params.From || ""
    const to = params.To || ""
    const body = params.Body || ""
    const messageSid = params.MessageSid || ""
    const numMedia = parseInt(params.NumMedia || "0")

    const cleanTo = to.replace("whatsapp:", "")
    const practiceId = await resolvePracticeFromPhone(cleanTo)
    if (!practiceId) {
      return twimlResponse("This number is not configured. Please contact the practice directly.")
    }

    const cleanFrom = from.replace("whatsapp:", "")
    if (messageSid && (await checkMessageIdempotency(messageSid))) {
      return twimlResponse()
    }

    const thread = await getOrCreateThread(practiceId, "rcs", from)

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
          console.error("[messaging-webhook] Media download failed:", err)
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

    const afterFirst = await getThreadMessages(thread.id, 2)
    if (afterFirst.length === 1 && body.trim()) {
      const preview = body.slice(0, 160)
      await notifyAdmins({
        practiceId,
        type: "patient_message",
        title: "New SMS / RCS message",
        detail: preview,
        actionTab: "inbox",
        actionEntityId: thread.id,
      })
      await addInboxStripMessage({
        practiceId,
        channel: "rcs",
        fromLabel: cleanFrom.replace(/^whatsapp:/, "").slice(-12),
        preview,
        patientId: thread.patientId ?? null,
      })
    }

    const processPromise = processInbound(practiceId, thread.id, from, cleanTo, body, mediaStoragePath
      ? { storagePath: mediaStoragePath, mimeType: mediaMimeType || "" }
      : undefined)
    processPromise.catch((err) => console.error("[messaging-webhook] Agent processing failed:", err))

    return twimlResponse()
  } catch (err) {
    console.error("[messaging-webhook] Error:", err)
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

  if (isOptOutKeyword(body)) {
    await recordConsent({
      practiceId,
      externalParty: from,
      channel: "rcs",
      consentType: "ai_communication",
      granted: false,
    })
    await sendReply(practiceNumber, from, practiceId, threadId, "You've been unsubscribed. Reply START to re-subscribe anytime.")
    await updateThreadStatus(threadId, { status: "closed" })
    return
  }

  const recentMessages = await getThreadMessages(threadId, 20)
  const services = await getServices(practiceId)
  const faqs = await getFAQs(practiceId)

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

  const consented = await hasConsent(practiceId, from)
  if (!consented) {
    if (isConsentGrant(body)) {
      await recordConsent({
        practiceId,
        externalParty: from,
        channel: "rcs",
        consentType: "ai_communication",
        granted: true,
      })
      const welcomeMsg = isOpen
        ? `Thank you! How can I help you today at ${practiceName}?`
        : getAfterHoursMessage(practiceName, hours)
      await sendReply(practiceNumber, from, practiceId, threadId, welcomeMsg)
      return
    }

    // Transactional replies (e.g. CONFIRM / RESCHEDULE to a reminder) must work even before POPIA "YES"
    if (thread.currentFlow === "none") {
      const reminder = await tryHandleReminderKeywordReply(ctx, body)
      if (reminder) {
        if (reminder.threadUpdate) {
          await updateThreadStatus(threadId, reminder.threadUpdate)
        }
        if (reminder.flowUpdate) {
          await updateThreadFlow(threadId, reminder.flowUpdate.currentFlow, reminder.flowUpdate.flowState)
        }
        let replyText = reminder.text
        if (reminder.interactive) {
          replyText += buildInteractiveBody(reminder.interactive)
        }
        await sendReply(practiceNumber, from, practiceId, threadId, replyText, reminder.toolCalls)
        return
      }
    }

    await sendReply(practiceNumber, from, practiceId, threadId, getConsentPrompt(practiceName))
    return
  }

  const response = await runCommsAgent(ctx, body, media)

  if (response.threadUpdate) {
    await updateThreadStatus(threadId, response.threadUpdate)
  }
  if (response.flowUpdate) {
    await updateThreadFlow(threadId, response.flowUpdate.currentFlow, response.flowUpdate.flowState)
  }

  if (response.threadUpdate?.status === "handoff" || response.threadUpdate?.priority === "urgent") {
    await notifyAdmins({
      practiceId,
      type: "alert",
      title: "Conversation needs attention",
      detail: (body || "").slice(0, 240) || "SMS thread",
      actionTab: "inbox",
      actionEntityId: threadId,
    })
  }

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
    const fromNum = practiceNumber.replace(/^whatsapp:/, "")
    const toNum = to.replace(/^whatsapp:/, "")
    const { messageSid } = await sendSmsMessage({
      from: fromNum,
      to: toNum,
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
    console.error("[messaging-webhook] Failed to send reply:", err)
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const from = await getPracticeMessagingNumber(practiceId)
    await createAdminClient().from("webhook_events").insert({
      practice_id: practiceId,
      source: "twilio_messaging",
      event_type: "send_failed",
      payload: { to: to.replace(/^whatsapp:/, ""), from: from || "", text, error: (err as Error).message },
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
