import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { hashPortalToken } from "@/lib/portal/tokens"
import { initStitchEft } from "@/lib/billing/payments"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get("token")?.trim()
  if (!raw) return NextResponse.json({ error: "token required" }, { status: 400 })

  const hash = hashPortalToken(decodeURIComponent(raw))
  const admin = createAdminClient()
  const { data: access, error } = await admin
    .from("patient_access_tokens")
    .select("id, practice_id, patient_id, purpose, invoice_id, expires_at")
    .eq("token_hash", hash)
    .maybeSingle()

  if (error || !access || new Date(access.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 })
  }
  if (access.purpose !== "billing_invoice" || !access.invoice_id) {
    return NextResponse.json({ error: "Not a billing link" }, { status: 400 })
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin
  const redirectUrl = `${base}/portal/${encodeURIComponent(raw)}/success?invoice=${encodeURIComponent(access.invoice_id)}&status=success`

  try {
    const { paymentUrl } = await initStitchEft(admin, {
      practiceId: access.practice_id,
      invoiceId: access.invoice_id,
      actorUserId: null,
      idempotencyKey: `portal-eft-${access.id}-${access.invoice_id}`,
      redirectUrl,
    })
    return NextResponse.redirect(paymentUrl)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "EFT start failed" }, { status: 502 })
  }
}
