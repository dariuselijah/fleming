import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyStitchWebhookSignature } from "@/lib/billing/providers/stitch"
import { finalizePendingPaymentSuccess } from "@/lib/billing/payments"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get("x-stitch-signature") ?? req.headers.get("stitch-signature")
  const secret = process.env.STITCH_WEBHOOK_SECRET?.trim() ?? ""

  if (secret && !verifyStitchWebhookSignature(raw, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
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
    console.error("[stitch webhook] event log", insErr)
  }

  const success = /success|paid|completed/i.test(type) || (event as { status?: string }).status === "SUCCESS"
  if (!success || !externalId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const { data: pay } = await admin
    .from("practice_payments")
    .select("id, practice_id, status")
    .eq("provider", "stitch")
    .eq("provider_checkout_id", externalId)
    .maybeSingle()

  if (!pay || pay.status === "succeeded") {
    return NextResponse.json({ ok: true })
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
    console.error("[stitch webhook] finalize", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
