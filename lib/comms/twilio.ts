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

/** Numbers already owned in this Twilio account (Console or API purchases). */
export async function listOwnedIncomingNumbers(opts?: {
  limit?: number
}): Promise<
  {
    sid: string
    phoneNumber: string
    friendlyName: string
    capabilities: Record<string, boolean>
  }[]
> {
  const client = getTwilioClient()
  const numbers = await client.incomingPhoneNumbers.list({ limit: opts?.limit ?? 80 })
  return numbers.map((n) => ({
    sid: n.sid,
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName || n.phoneNumber,
    capabilities: n.capabilities as unknown as Record<string, boolean>,
  }))
}

/** Resolve IncomingPhoneNumber SID by E.164 (must exist in this Twilio account). */
export async function resolveIncomingPhoneNumberSid(phoneNumber: string): Promise<string | null> {
  const client = getTwilioClient()
  const clean = phoneNumber.replace(/\s/g, "")
  const list = await client.incomingPhoneNumbers.list({ phoneNumber: clean, limit: 1 })
  return list[0]?.sid ?? null
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

// ---------------------------------------------------------------------------
// Senders API (messaging.twilio.com/v2/Channels/Senders)
// Not in the Node SDK typed surface — use fetch + Basic auth.
// ---------------------------------------------------------------------------

const SENDERS_BASE = "https://messaging.twilio.com/v2/Channels/Senders"

/** When true, provision skips Senders registration until Meta Embedded Signup completes (see Tech Provider guide). */
export function whatsAppEmbeddedSignupProvisioningEnabled(): boolean {
  return process.env.TWILIO_WHATSAPP_USE_EMBEDDED_SIGNUP === "true"
}

function sendersAuthHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN")
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`
}

/** Exact strings required by Twilio Senders API (error 63100). */
export const TWILIO_WHATSAPP_VERTICAL_MEDICAL = "Medical and Health" as const

export interface SenderProfile {
  name: string
  about?: string
  /** Must match Twilio’s allowed verticals; use {@link TWILIO_WHATSAPP_VERTICAL_MEDICAL} for clinics. */
  vertical?: string
  websites?: string[]
  address?: string
  emails?: string[]
  description?: string
  logoUrl?: string
}

export interface RegisterSenderResult {
  sid: string
  status: string
  senderId: string
  wabaId?: string
}

export interface SenderStatus {
  sid: string
  status: string
  senderId: string
  wabaId?: string
  properties?: {
    messagingLimit?: string
    qualityRating?: string
  }
}

/**
 * Register a WhatsApp sender via Twilio Senders API.
 * For SMS-capable Twilio numbers, OTP verification is automatic.
 *
 * Pass `wabaId` after Meta Embedded Signup (Twilio Tech Provider) so Twilio links the
 * customer WABA to this account/subaccount on first registration.
 */
export async function registerWhatsAppSender(opts: {
  phoneNumber: string
  profile: SenderProfile
  webhookBaseUrl: string
  /** Meta WABA id from Embedded Signup `FINISH` / `FINISH_ONLY_WABA` event. */
  wabaId?: string
}): Promise<RegisterSenderResult> {
  const urls = commsWebhookUrls(opts.webhookBaseUrl)
  const senderId = opts.phoneNumber.startsWith("whatsapp:")
    ? opts.phoneNumber
    : `whatsapp:${opts.phoneNumber}`

  const body: Record<string, unknown> = {
    sender_id: senderId,
    profile: {
      name: opts.profile.name,
      ...(opts.profile.about ? { about: opts.profile.about } : {}),
      ...(opts.profile.vertical ? { vertical: opts.profile.vertical } : {}),
      ...(opts.profile.websites?.length ? { websites: opts.profile.websites } : {}),
      ...(opts.profile.address ? { address: opts.profile.address } : {}),
      ...(opts.profile.emails?.length ? { emails: opts.profile.emails } : {}),
      ...(opts.profile.description ? { description: opts.profile.description } : {}),
      ...(opts.profile.logoUrl ? { logo_url: opts.profile.logoUrl } : {}),
    },
    webhook: {
      callback_method: "POST",
      callback_url: urls.whatsappInbound,
      status_callback_url: urls.whatsappStatus,
      status_callback_method: "POST",
    },
  }

  if (opts.wabaId?.trim()) {
    body.configuration = { waba_id: opts.wabaId.trim() }
  }

  const resp = await fetch(SENDERS_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: sendersAuthHeader(),
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    throw new Error(`Senders API register failed (${resp.status}): ${errBody}`)
  }

  const data = await resp.json() as {
    sid: string
    status: string
    sender_id: string
    configuration?: { waba_id?: string }
  }

  return {
    sid: data.sid,
    status: data.status,
    senderId: data.sender_id,
    wabaId: data.configuration?.waba_id,
  }
}

/** Poll the status of a WhatsApp sender. Transitions: CREATING -> OFFLINE -> ONLINE. */
export async function getWhatsAppSenderStatus(senderSid: string): Promise<SenderStatus> {
  const resp = await fetch(`${SENDERS_BASE}/${senderSid}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: sendersAuthHeader(),
    },
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "")
    throw new Error(`Senders API fetch failed (${resp.status}): ${errBody}`)
  }

  const data = await resp.json() as {
    sid: string
    status: string
    sender_id: string
    configuration?: { waba_id?: string }
    properties?: { messaging_limit?: string; quality_rating?: string }
  }

  return {
    sid: data.sid,
    status: data.status,
    senderId: data.sender_id,
    wabaId: data.configuration?.waba_id,
    properties: data.properties
      ? {
          messagingLimit: data.properties.messaging_limit,
          qualityRating: data.properties.quality_rating,
        }
      : undefined,
  }
}

/** Delete a WhatsApp sender (cleanup / deprovisioning). */
export async function deleteWhatsAppSender(senderSid: string): Promise<void> {
  const resp = await fetch(`${SENDERS_BASE}/${senderSid}`, {
    method: "DELETE",
    headers: {
      Authorization: sendersAuthHeader(),
    },
  })

  if (!resp.ok && resp.status !== 404) {
    const errBody = await resp.text().catch(() => "")
    throw new Error(`Senders API delete failed (${resp.status}): ${errBody}`)
  }
}

// ---------------------------------------------------------------------------

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
