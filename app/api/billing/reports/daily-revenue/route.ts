import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await ctx.supabase
    .from("practice_payments")
    .select("amount_cents, succeeded_at, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("status", "succeeded")
    .gte("created_at", since.toISOString())
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byDay = new Map<string, { day: string; amountCents: number; count: number }>()
  for (const p of data ?? []) {
    const day = (p.succeeded_at ?? p.created_at).slice(0, 10)
    const row = byDay.get(day) ?? { day, amountCents: 0, count: 0 }
    row.amountCents += p.amount_cents ?? 0
    row.count += 1
    byDay.set(day, row)
  }

  return NextResponse.json({ rows: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)) })
}
