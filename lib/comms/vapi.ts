const VAPI_BASE = "https://api.vapi.ai"

function getApiKey(): string {
  const key = process.env.VAPI_API_KEY?.trim() || process.env.VAPI_PRIVATE_KEY?.trim()
  if (!key) throw new Error("Missing VAPI_API_KEY (or VAPI_PRIVATE_KEY)")
  return key
}

async function vapiRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const resp = await fetch(`${VAPI_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(opts?.headers || {}),
    },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => "")
    throw new Error(`Vapi ${opts?.method || "GET"} ${path} failed (${resp.status}): ${body}`)
  }
  return resp.json() as Promise<T>
}

export async function createOutboundCall(opts: {
  assistantId: string
  phoneNumberId: string
  customerNumber: string
  metadata?: Record<string, unknown>
}): Promise<{ id: string; status: string }> {
  return vapiRequest("/call", {
    method: "POST",
    body: JSON.stringify({
      assistantId: opts.assistantId,
      phoneNumberId: opts.phoneNumberId,
      customer: { number: opts.customerNumber },
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    }),
  })
}

export async function cloneAssistant(opts: {
  sourceAssistantId: string
  name: string
  serverUrl: string
  firstMessage?: string
  systemPrompt?: string
}): Promise<{ id: string }> {
  const source = await vapiRequest<Record<string, unknown>>(`/assistant/${opts.sourceAssistantId}`)

  const cloned: Record<string, unknown> = {
    ...source,
    name: opts.name,
    serverUrl: opts.serverUrl,
  }
  delete cloned.id
  delete cloned.createdAt
  delete cloned.updatedAt
  delete cloned.orgId

  if (opts.firstMessage) cloned.firstMessage = opts.firstMessage
  if (opts.systemPrompt && typeof cloned.model === "object" && cloned.model) {
    ;(cloned.model as Record<string, unknown>).messages = [
      { role: "system", content: opts.systemPrompt },
    ]
  }

  return vapiRequest("/assistant", { method: "POST", body: JSON.stringify(cloned) })
}

/**
 * Import a Twilio number into Vapi so it gets its own phoneNumberId for
 * inbound routing and outbound calls. smsEnabled=false avoids clobbering
 * the WhatsApp/SMS webhook URLs that Twilio already has.
 */
export async function importTwilioNumber(opts: {
  phoneNumber: string
  name: string
  assistantId: string
  serverUrl: string
}): Promise<{ id: string; number: string; assistantId?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN for Vapi import")

  return vapiRequest("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      number: opts.phoneNumber,
      twilioAccountSid: sid,
      twilioAuthToken: token,
      name: opts.name,
      assistantId: opts.assistantId,
      server: { url: opts.serverUrl },
      smsEnabled: false,
    }),
  })
}

export async function deleteVapiPhoneNumber(phoneNumberId: string): Promise<void> {
  await vapiRequest(`/phone-number/${phoneNumberId}`, { method: "DELETE" })
}

export function validateVapiSignature(body: string, signature: string): boolean {
  const secret = process.env.VAPI_SERVER_SECRET
  if (!secret) return true // skip validation if no secret configured
  // Vapi uses HMAC-SHA256
  const crypto = require("crypto") as typeof import("crypto")
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex")
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}
