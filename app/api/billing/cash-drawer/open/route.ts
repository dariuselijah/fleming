import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let openingFloatCents = 0
  try {
    const j = await req.json()
    openingFloatCents = typeof j?.openingFloatCents === "number" ? j.openingFloatCents : 0
  } catch {
    /* empty */
  }

  const { data: open } = await ctx.supabase
    .from("cash_drawer_sessions")
    .select("id")
    .eq("practice_id", ctx.practiceId)
    .is("closed_at", null)
    .maybeSingle()

  if (open?.id) {
    return NextResponse.json({ error: "A shift is already open", sessionId: open.id }, { status: 409 })
  }

  const { data: row, error } = await ctx.supabase
    .from("cash_drawer_sessions")
    .insert({
      practice_id: ctx.practiceId,
      opened_by: ctx.userId,
      opening_float_cents: openingFloatCents,
    })
    .select("id, opened_at")
    .single()

  if (error || !row) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 })
  return NextResponse.json({ sessionId: row.id, openedAt: row.opened_at })
}
