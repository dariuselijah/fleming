import { createHmac, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

export type WebhookSecretResult =
  | { ok: true; secret: string | null }
  | { ok: false; response: NextResponse }

export function requireWebhookSecret(name: string): WebhookSecretResult {
  const secret = process.env[name]?.trim()
  if (secret) return { ok: true, secret }

  if (process.env.NODE_ENV === "production") {
    console.error(`[security] ${name} is required in production`)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Webhook authentication is not configured" },
        { status: 503 }
      ),
    }
  }

  return { ok: true, secret: null }
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Resend signs inbound webhooks with the Svix scheme:
 * HMAC-SHA256("<id>.<timestamp>.<raw-body>") and a v1 base64 signature.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowMs = Date.now()
): boolean {
  const id = headers.get("svix-id")?.trim()
  const timestamp = headers.get("svix-timestamp")?.trim()
  const signatures = headers.get("svix-signature")?.trim()
  if (!id || !timestamp || !signatures) return false

  const timestampSeconds = Number(timestamp)
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(nowMs - timestampSeconds * 1000) > 5 * 60_000
  ) {
    return false
  }

  try {
    const key = secret.startsWith("whsec_")
      ? Buffer.from(secret.slice(6), "base64")
      : Buffer.from(secret)
    const expected = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest()

    return signatures.split(/\s+/).some((entry) => {
      const [version, encoded] = entry.split(",", 2)
      if (version !== "v1" || !encoded) return false
      return safeEqual(expected, Buffer.from(encoded, "base64"))
    })
  } catch {
    return false
  }
}
