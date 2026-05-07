import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from("practice_payments")
    .select("provider, amount_cents")
    .eq("practice_id", ctx.practiceId)
    .eq("status", "succeeded")
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byProvider = new Map<string, { provider: string; amountCents: number; count: number }>()
  for (const p of data ?? []) {
    const key = p.provider ?? "unknown"
    const row = byProvider.get(key) ?? { provider: key, amountCents: 0, count: 0 }
    row.amountCents += p.amount_cents ?? 0
    row.count += 1
    byProvider.set(key, row)
  }

  return NextResponse.json({ rows: [...byProvider.values()].sort((a, b) => b.amountCents - a.amountCents) })
}
