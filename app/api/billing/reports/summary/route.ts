import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: payments }, { data: invoices }] = await Promise.all([
    ctx.supabase
      .from("practice_payments")
      .select("amount_cents, provider, succeeded_at, created_at")
      .eq("practice_id", ctx.practiceId)
      .eq("status", "succeeded")
      .gte("created_at", lastStart)
      .limit(3000),
    ctx.supabase
      .from("practice_invoices")
      .select("total_cents, amount_paid_cents, issued_at, created_at")
      .eq("practice_id", ctx.practiceId)
      .in("status", ["issued", "sent", "viewed", "partially_paid"])
      .limit(2000),
  ])

  const monthRevenueCents = (payments ?? [])
    .filter((p) => new Date(p.succeeded_at ?? p.created_at) >= new Date(start))
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0)
  const monthLastCents = (payments ?? [])
    .filter((p) => {
      const d = new Date(p.succeeded_at ?? p.created_at)
      return d >= new Date(lastStart) && d < new Date(lastEnd)
    })
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0)
  const arBalanceCents = (invoices ?? []).reduce((sum, i) => sum + Math.max(0, (i.total_cents ?? 0) - (i.amount_paid_cents ?? 0)), 0)
  const paid = payments ?? []
  const topPayer = Object.entries(
    paid.reduce<Record<string, number>>((acc, p) => {
      const key = p.provider ?? "unknown"
      acc[key] = (acc[key] ?? 0) + (p.amount_cents ?? 0)
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none"

  return NextResponse.json({
    monthRevenueCents,
    monthLastCents,
    arBalanceCents,
    avgCollectionDays: 0,
    topPayer,
  })
}
