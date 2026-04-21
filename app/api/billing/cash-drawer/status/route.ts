import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await ctx.supabase
    .from("cash_drawer_sessions")
    .select("id, opened_at, opening_float_cents")
    .eq("practice_id", ctx.practiceId)
    .is("closed_at", null)
    .maybeSingle()

  return NextResponse.json({ open: data ?? null })
}
