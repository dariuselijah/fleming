import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { getOpenCashDrawerSession, sumCashSalesForSession } from "@/lib/billing/cash-drawer"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let countedCashCents = 0
  let notes = ""
  try {
    const j = await req.json()
    countedCashCents = typeof j?.countedCashCents === "number" ? j.countedCashCents : 0
    notes = typeof j?.notes === "string" ? j.notes : ""
  } catch {
    /* empty */
  }

  try {
    const session = await getOpenCashDrawerSession(ctx.supabase, ctx.practiceId)

    if (!session?.id) {
      return NextResponse.json({ error: "No open shift" }, { status: 400 })
    }

    const { totalCents, paymentCount } = await sumCashSalesForSession(
      ctx.supabase,
      ctx.practiceId,
      session.id
    )
    const openingFloatCents = Number(session.opening_float_cents ?? 0)
    const expectedCashCents = openingFloatCents + totalCents
    const varianceCents = countedCashCents - expectedCashCents

    const { error } = await ctx.supabase
      .from("cash_drawer_sessions")
      .update({
        closed_by: ctx.userId,
        closed_at: new Date().toISOString(),
        counted_cash_cents: countedCashCents,
        variance_cents: varianceCents,
        notes: notes || null,
      })
      .eq("id", session.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      summary: {
        openingFloatCents,
        cashSalesCents: totalCents,
        cashPaymentCount: paymentCount,
        expectedCashCents,
        countedCashCents,
        varianceCents,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
