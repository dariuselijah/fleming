import { NextResponse } from "next/server"
import {
  recordCashPayment,
  recordSucceededManualPayment,
  initCardCheckout,
  initStitchEft,
} from "@/lib/billing/payments"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { sendReceiptEmail } from "@/lib/billing/deliver-receipt"
import { getBillingPdfSignedUrl } from "@/lib/billing/storage"
import { sendSmsMessage } from "@/lib/comms/twilio"
import { getPracticeMessagingNumber } from "@/lib/comms/threads"
import { normalizePhoneE164Za } from "@/lib/comms/patient-phone"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: invoiceId } = await context.params

  const idempotencyKey = req.headers.get("x-idempotency-key")?.trim()
  if (!idempotencyKey) {
    return NextResponse.json({ error: "X-Idempotency-Key header required" }, { status: 400 })
  }

  let body: {
    provider?: string
    amountCents?: number
    reference?: string
    reason?: string
    cashDrawerSessionId?: string | null
    deliverEmail?: boolean
    deliverSms?: boolean
    successUrl?: string
    cancelUrl?: string
    stitchRedirectUrl?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const provider = body.provider?.trim() ?? "cash"

  try {
    if (provider === "cash") {
      const amount = body.amountCents
      if (amount == null || amount <= 0) {
        return NextResponse.json({ error: "amountCents required" }, { status: 400 })
      }

      const { data: openDrawer } = await ctx.supabase
        .from("cash_drawer_sessions")
        .select("id")
        .eq("practice_id", ctx.practiceId)
        .is("closed_at", null)
        .maybeSingle()

      if (!openDrawer?.id) {
        return NextResponse.json(
          { error: "Open a cash drawer shift before recording cash payments." },
          { status: 400 }
        )
      }

      const requestedSession = body.cashDrawerSessionId?.trim() || null
      if (requestedSession && requestedSession !== openDrawer.id) {
        return NextResponse.json(
          { error: "Cash drawer session does not match the open shift." },
          { status: 400 }
        )
      }

      const result = await recordCashPayment(ctx.supabase, {
        practiceId: ctx.practiceId,
        invoiceId,
        amountCents: amount,
        actorUserId: ctx.userId,
        idempotencyKey,
        cashDrawerSessionId: openDrawer.id,
        reference: body.reference ?? null,
      })

      const { data: inv } = await ctx.supabase
        .from("practice_invoices")
        .select("patient_snapshot, practice_id")
        .eq("id", invoiceId)
        .maybeSingle()
      const patient = inv?.patient_snapshot as { email?: string; phone?: string } | undefined
      const { data: rec } = await ctx.supabase
        .from("practice_receipts")
        .select("pdf_storage_path")
        .eq("id", result.receiptId)
        .maybeSingle()

      const from = process.env.BILLING_EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim() || "billing@fleming.health"
      if (body.deliverEmail && patient?.email && rec?.pdf_storage_path) {
        await sendReceiptEmail({
          to: patient.email,
          from,
          subject: "Your receipt",
          textBody: "Thank you for your payment. Your receipt is linked below.",
          pdfPath: rec.pdf_storage_path,
          pdfFilename: "receipt.pdf",
        })
        await ctx.supabase
          .from("practice_receipts")
          .update({ delivered_email_at: new Date().toISOString() })
          .eq("id", result.receiptId)
      }
      if (body.deliverSms && patient?.phone && rec?.pdf_storage_path) {
        const num = await getPracticeMessagingNumber(ctx.practiceId)
        if (num) {
          const link = await getBillingPdfSignedUrl(rec.pdf_storage_path, 3600)
          const to = normalizePhoneE164Za(patient.phone)
          await sendSmsMessage({
            from: num,
            to,
            body: `Payment received. Receipt: ${link}`,
          })
          await ctx.supabase
            .from("practice_receipts")
            .update({ delivered_sms_at: new Date().toISOString() })
            .eq("id", result.receiptId)
        }
      }

      return NextResponse.json({
        paymentId: result.paymentId,
        receiptId: result.receiptId,
        invoiceStatus: result.invoiceStatus,
      })
    }

    if (provider === "polar") {
      const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || ""
      const successUrl =
        body.successUrl?.trim() ||
        `${base}/portal/success?invoice=${encodeURIComponent(invoiceId)}`
      const card = await initCardCheckout(ctx.supabase, {
        practiceId: ctx.practiceId,
        invoiceId,
        actorUserId: ctx.userId,
        idempotencyKey,
        successUrl,
        cancelUrl: body.cancelUrl,
      })
      return NextResponse.json({ checkoutUrl: card.checkoutUrl, paymentId: card.paymentId })
    }

    if (provider === "stitch") {
      const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || ""
      const redirectUrl =
        body.stitchRedirectUrl?.trim() ||
        `${base}/portal/success?invoice=${encodeURIComponent(invoiceId)}`
      const eft = await initStitchEft(ctx.supabase, {
        practiceId: ctx.practiceId,
        invoiceId,
        actorUserId: ctx.userId,
        idempotencyKey,
        redirectUrl,
      })
      return NextResponse.json({ paymentUrl: eft.paymentUrl, paymentId: eft.paymentId })
    }

    if (provider === "medical_aid" || provider === "eft_manual" || provider === "write_off") {
      const amount = body.amountCents
      if (amount == null || amount <= 0) {
        return NextResponse.json({ error: "amountCents required" }, { status: 400 })
      }
      const manual = await recordSucceededManualPayment(ctx.supabase, {
        practiceId: ctx.practiceId,
        invoiceId,
        amountCents: amount,
        actorUserId: ctx.userId,
        idempotencyKey,
        provider,
        reference: body.reference ?? null,
        reason: body.reason ?? body.reference ?? null,
      })
      return NextResponse.json({
        paymentId: manual.paymentId,
        receiptId: manual.receiptId,
        invoiceStatus: manual.invoiceStatus,
      })
    }

    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
