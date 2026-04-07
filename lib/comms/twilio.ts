import twilio from "twilio"
import type { InteractivePayload } from "./types"

let _client: twilio.Twilio | null = null

export function getTwilioClient(): twilio.Twilio {
  if (_client) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN")
  _client = twilio(sid, token)
  return _client
}

export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return false
  return twilio.validateRequest(token, signature, url, params)
}

export async function sendWhatsAppMessage(opts: {
  to: string
  from: string
  body: string
  mediaUrl?: string
}): Promise<{ messageSid: string }> {
  const client = getTwilioClient()
  const msg = await client.messages.create({
    to: opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`,
    from: opts.from.startsWith("whatsapp:") ? opts.from : `whatsapp:${opts.from}`,
    body: opts.body,
    ...(opts.mediaUrl ? { mediaUrl: [opts.mediaUrl] } : {}),
  })
  return { messageSid: msg.sid }
}

export async function sendWhatsAppTemplate(opts: {
  to: string
  from: string
  contentSid: string
  contentVariables?: Record<string, string>
}): Promise<{ messageSid: string }> {
  const client = getTwilioClient()
  const msg = await client.messages.create({
    to: opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`,
    from: opts.from.startsWith("whatsapp:") ? opts.from : `whatsapp:${opts.from}`,
    contentSid: opts.contentSid,
    ...(opts.contentVariables ? { contentVariables: JSON.stringify(opts.contentVariables) } : {}),
  })
  return { messageSid: msg.sid }
}

export function buildInteractiveBody(payload: InteractivePayload): string {
  if (payload.type === "buttons" && payload.buttons) {
    const options = payload.buttons.map((b, i) => `${i + 1}. ${b.title}`).join("\n")
    return `\n\nReply with a number:\n${options}`
  }
  if (payload.type === "list" && payload.sections) {
    const lines: string[] = []
    for (const section of payload.sections) {
      if (section.title) lines.push(`\n*${section.title}*`)
      for (const row of section.rows) {
        lines.push(`- ${row.title}${row.description ? ` (${row.description})` : ""}`)
      }
    }
    return lines.join("\n")
  }
  return ""
}

/** Public HTTPS base (no trailing slash). Must match TWILIO_WEBHOOK_BASE_URL for signature validation. */
export function commsWebhookUrls(webhookBaseUrl: string) {
  const base = webhookBaseUrl.replace(/\/$/, "")
  return {
    whatsappInbound: `${base}/api/comms/whatsapp/webhook`,
    whatsappStatus: `${base}/api/comms/whatsapp/status`,
    voiceInbound: `${base}/api/comms/voice/webhook`,
  }
}

/**
 * Point a purchased Twilio number at Fleming comms webhooks (SMS/WhatsApp inbound + status + voice).
 * Safe to call repeatedly after changing TWILIO_WEBHOOK_BASE_URL or fixing a misconfigured number.
 */
export async function syncPurchasedNumberWebhooks(
  incomingPhoneNumberSid: string,
  webhookBaseUrl: string
): Promise<{ sid: string; smsUrl: string | null; statusCallback: string | null; voiceUrl: string | null }> {
  const client = getTwilioClient()
  const urls = commsWebhookUrls(webhookBaseUrl)
  const updated = await client.incomingPhoneNumbers(incomingPhoneNumberSid).update({
    smsUrl: urls.whatsappInbound,
    smsMethod: "POST",
    statusCallback: urls.whatsappStatus,
    statusCallbackMethod: "POST",
    voiceUrl: urls.voiceInbound,
    voiceMethod: "POST",
  })
  return {
    sid: updated.sid,
    smsUrl: updated.smsUrl ?? null,
    statusCallback: updated.statusCallback ?? null,
    voiceUrl: updated.voiceUrl ?? null,
  }
}

export async function searchAvailableNumbers(countryCode = "ZA", opts?: {
  areaCode?: string
  limit?: number
}): Promise<{ phoneNumber: string; friendlyName: string; capabilities: Record<string, boolean> }[]> {
  const client = getTwilioClient()
  const numbers = await client.availablePhoneNumbers(countryCode).local.list({
    voiceEnabled: true,
    smsEnabled: true,
    ...(opts?.areaCode ? { areaCode: opts.areaCode } : {}),
    limit: opts?.limit ?? 5,
  })
  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    capabilities: n.capabilities as unknown as Record<string, boolean>,
  }))
}

export async function purchaseNumber(phoneNumber: string, webhookBaseUrl: string): Promise<{
  sid: string
  phoneNumber: string
}> {
  const client = getTwilioClient()
  const urls = commsWebhookUrls(webhookBaseUrl)
  const incoming = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: urls.voiceInbound,
    voiceMethod: "POST",
    smsUrl: urls.whatsappInbound,
    smsMethod: "POST",
    statusCallback: urls.whatsappStatus,
    statusCallbackMethod: "POST",
  })
  return { sid: incoming.sid, phoneNumber: incoming.phoneNumber }
}

export async function downloadTwilioMedia(mediaUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const resp = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
    redirect: "follow",
  })
  if (!resp.ok) throw new Error(`Failed to download Twilio media: ${resp.status}`)
  const buffer = Buffer.from(await resp.arrayBuffer())
  const contentType = resp.headers.get("content-type") || "application/octet-stream"
  return { buffer, contentType }
}
