import { NextResponse } from "next/server"
import { recordRefund } from "@/lib/billing/payments"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { getBillingPdfSignedUrl } from "@/lib/billing/storage"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  const { data, error } = await ctx.supabase
    .from("practice_credit_notes")
    .select("id, credit_note_number, amount_cents, reason, pdf_storage_path, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("invoice_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notes = await Promise.all(
    (data ?? []).map(async (n) => ({
      ...n,
      pdfUrl: n.pdf_storage_path ? await getBillingPdfSignedUrl(n.pdf_storage_path, 3600) : null,
    }))
  )
  return NextResponse.json({ creditNotes: notes })
}

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  let body: { paymentId?: string; amountCents?: number; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.paymentId || !body.amountCents || body.amountCents <= 0) {
    return NextResponse.json({ error: "paymentId and amountCents required" }, { status: 400 })
  }

  const { data: pay } = await ctx.supabase
    .from("practice_payments")
    .select("invoice_id")
    .eq("id", body.paymentId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (pay?.invoice_id !== id) {
    return NextResponse.json({ error: "Payment does not belong to invoice" }, { status: 400 })
  }

  try {
    const out = await recordRefund(ctx.supabase, {
      practiceId: ctx.practiceId,
      paymentId: body.paymentId,
      amountCents: body.amountCents,
      actorUserId: ctx.userId,
      reason: body.reason,
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
