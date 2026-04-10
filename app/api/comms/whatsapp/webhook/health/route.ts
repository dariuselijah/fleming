/**
 * Public health check for the WhatsApp webhook.
 * Twilio and uptime monitors can GET this to verify the webhook is alive.
 * No auth required — returns minimal info.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const hasSid = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim())
  const hasToken = Boolean(process.env.TWILIO_AUTH_TOKEN?.trim())
  const hasWebhookUrl = Boolean(process.env.TWILIO_WEBHOOK_BASE_URL?.trim())

  return NextResponse.json({
    status: hasSid && hasToken ? "ok" : "misconfigured",
    webhook: "/api/comms/whatsapp/webhook",
    configured: { sid: hasSid, token: hasToken, webhookUrl: hasWebhookUrl },
    timestamp: new Date().toISOString(),
  })
}
