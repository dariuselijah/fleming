import { NextResponse } from "next/server"
import { recordRefund } from "@/lib/billing/payments"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: paymentId } = await context.params

  let body: { amountCents?: number; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const amountCents = body.amountCents
  if (amountCents == null || amountCents <= 0) {
    return NextResponse.json({ error: "amountCents required" }, { status: 400 })
  }

  try {
    const out = await recordRefund(ctx.supabase, {
      practiceId: ctx.practiceId,
      paymentId,
      amountCents,
      actorUserId: ctx.userId,
      reason: body.reason,
    })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
