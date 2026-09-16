import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyStitchWebhookSignature } from "@/lib/billing/providers/stitch"
import { finalizePendingPaymentSuccess } from "@/lib/billing/payments"
import { requireWebhookSecret } from "@/lib/auth/webhook"
import { createRequestLogger } from "@/lib/observability/server"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const log = createRequestLogger(req, "/api/billing/stitch/webhook")
  const respond = log.withRequestId
  const raw = await req.text()
  const sig = req.headers.get("x-stitch-signature") ?? req.headers.get("stitch-signature")
  const auth = requireWebhookSecret("STITCH_WEBHOOK_SECRET")
  if (!auth.ok) {
    log.warn("stitch_webhook_configuration_rejected")
    return respond(auth.response)
  }
  const secret = auth.secret

  if (secret && !verifyStitchWebhookSignature(raw, sig, secret)) {
    log.warn("stitch_webhook_invalid_signature")
    return respond(NextResponse.json({ error: "Invalid signature" }, { status: 401 }))
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return respond(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }))
  }

  const type = String(event.type ?? "")
  const externalId = String(
    (event as { paymentInitiationRequestId?: string }).paymentInitiationRequestId ??
      (event as { id?: string }).id ??
      ""
  )
  const eventId = String(event.eventId ?? `${type}:${externalId}`)

  const admin = createAdminClient()
  const { error: insErr } = await admin.from("payment_provider_events").insert({
    provider: "stitch",
    provider_event_id: eventId,
    event_type: type || "unknown",
    signature_valid: true,
    payload: event as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  })

  if (insErr && !insErr.message?.includes("duplicate") && insErr.code !== "23505") {
    log.error("stitch_webhook_event_persist_failed", { error: insErr })
  }

  const success = /success|paid|completed/i.test(type) || (event as { status?: string }).status === "SUCCESS"
  if (!success || !externalId) {
    log.info("stitch_webhook_ignored", { eventType: type || "unknown" })
    return respond(NextResponse.json({ ok: true, ignored: true }))
  }

  const { data: pay } = await admin
    .from("practice_payments")
    .select("id, practice_id, status")
    .eq("provider", "stitch")
    .eq("provider_checkout_id", externalId)
    .maybeSingle()

  if (!pay || pay.status === "succeeded") {
    log.info("stitch_webhook_idempotent")
    return respond(NextResponse.json({ ok: true }))
  }

  try {
    await finalizePendingPaymentSuccess(admin, {
      practiceId: pay.practice_id as string,
      paymentId: pay.id as string,
      providerOrderId: externalId,
      methodLabel: "Instant EFT (Stitch)",
      paymentMethod: "payshap",
    })
  } catch (e) {
    log.error("stitch_webhook_finalize_failed", { error: e })
    return respond(NextResponse.json({ error: "Payment finalization failed" }, { status: 500 }))
  }

  log.info("stitch_webhook_processed")
  return respond(NextResponse.json({ ok: true }))
}
