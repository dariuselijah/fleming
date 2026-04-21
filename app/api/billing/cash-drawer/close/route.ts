import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

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

  const { data: session } = await ctx.supabase
    .from("cash_drawer_sessions")
    .select("id, opening_float_cents")
    .eq("practice_id", ctx.practiceId)
    .is("closed_at", null)
    .maybeSingle()

  if (!session?.id) {
    return NextResponse.json({ error: "No open shift" }, { status: 400 })
  }

  const expected =
    (session.opening_float_cents ?? 0) +
    0 /* cash sales sum could be added via aggregation in v2 */
  const variance = countedCashCents - expected

  const { error } = await ctx.supabase
    .from("cash_drawer_sessions")
    .update({
      closed_by: ctx.userId,
      closed_at: new Date().toISOString(),
      counted_cash_cents: countedCashCents,
      variance_cents: variance,
      notes: notes || null,
    })
    .eq("id", session.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, varianceCents: variance })
}
