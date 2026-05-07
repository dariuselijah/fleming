import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { getOpenCashDrawerSession, sumCashSalesForSession } from "@/lib/billing/cash-drawer"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const open = await getOpenCashDrawerSession(ctx.supabase, ctx.practiceId)
    if (!open) {
      return NextResponse.json({ open: null })
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
        openedAt: open.opened_at,
        openingFloatCents,
        cashSalesCents: totalCents,
        cashPaymentCount: paymentCount,
        expectedCashCents,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
