import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { getOpenCashDrawerSession, sumCashSalesForSession } from "@/lib/billing/cash-drawer"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data: lastClosed } = await ctx.supabase
      .from("cash_drawer_sessions")
      .select("variance_cents")
      .eq("practice_id", ctx.practiceId)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastClosedVarianceFlagged =
      lastClosed?.variance_cents != null && Math.abs(Number(lastClosed.variance_cents)) > 10000

    const open = await getOpenCashDrawerSession(ctx.supabase, ctx.practiceId)
    if (!open) {
      return NextResponse.json({
        open: null,
        totals: {
          cashSalesCents: 0,
          expectedCashCents: 0,
        },
        lastClosedVarianceFlagged,
      })
    }

    const { totalCents, paymentCount } = await sumCashSalesForSession(
      ctx.supabase,
      ctx.practiceId,
      open.id
    )
    const openingFloatCents = Number(open.opening_float_cents ?? 0)
    const expectedCashCents = openingFloatCents + totalCents

    return NextResponse.json({
      open: {
        id: open.id,
        opened_at: open.opened_at,
        openedAt: open.opened_at,
        opening_float_cents: openingFloatCents,
        openingFloatCents,
        cashSalesCents: totalCents,
        cashPaymentCount: paymentCount,
        expectedCashCents,
      },
      totals: {
        cashSalesCents: totalCents,
        expectedCashCents,
      },
      lastClosedVarianceFlagged,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
