import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { verifyPolarWebhookSignatureLoose } from "@/lib/billing/providers/polar"
import { finalizePendingPaymentSuccess } from "@/lib/billing/payments"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const raw = await req.text()
  const sig =
    req.headers.get("webhook-signature") ??
    req.headers.get("polar-signature") ??
    req.headers.get("x-polar-signature")

  if (!verifyPolarWebhookSignatureLoose(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const type = String(event.type ?? event.event ?? "")
  const data = (event.data ?? event) as Record<string, unknown>
  const checkout =
    (data.checkout as Record<string, unknown> | undefined) ??
    (data as { id?: string; status?: string; metadata?: Record<string, string> })
  const checkoutId = String(
    (checkout as { id?: string }).id ??
      (data as { checkout_id?: string }).checkout_id ??
      ""
  )

  const eventId = String(event.id ?? `${type}:${checkoutId}:${Date.now()}`)

  const admin = createAdminClient()
  const { error: insErr } = await admin.from("payment_provider_events").insert({
    provider: "polar",
    provider_event_id: eventId,
    event_type: type || "unknown",
    signature_valid: true,
    payload: event as unknown as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  })

  if (insErr) {
    const dup = insErr.message?.includes("duplicate") || insErr.code === "23505"
    if (dup) return NextResponse.json({ ok: true, duplicate: true })
    console.error("[polar webhook] event log", insErr)
  }

  const paid =
    /paid|succeeded|completed/i.test(type) ||
    String((checkout as { status?: string }).status ?? "").toLowerCase() === "succeeded"

  if (!paid || !checkoutId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const { data: pay, error: payErr } = await admin
    .from("practice_payments")
    .select("id, practice_id, status")
    .eq("provider", "polar")
    .eq("provider_checkout_id", checkoutId)
    .maybeSingle()

  if (payErr || !pay) {
    return NextResponse.json({ ok: true, no_payment: true })
  }

  if (pay.status === "succeeded") {
    return NextResponse.json({ ok: true, already_done: true })
  }

  try {
    await finalizePendingPaymentSuccess(admin, {
      practiceId: pay.practice_id as string,
      paymentId: pay.id as string,
      providerOrderId: String((data as { order_id?: string }).order_id ?? ""),
      methodLabel: "Card (Polar)",
      paymentMethod: "card",
    })
  } catch (e) {
    console.error("[polar webhook] finalize", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
