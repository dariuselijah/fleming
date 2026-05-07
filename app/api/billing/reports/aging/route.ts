import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents, issued_at, created_at, status")
    .eq("practice_id", ctx.practiceId)
    .in("status", ["issued", "sent", "viewed", "partially_paid"])
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const buckets = [
    { bucket: "0-30", amountCents: 0, count: 0 },
    { bucket: "31-60", amountCents: 0, count: 0 },
    { bucket: "61-90", amountCents: 0, count: 0 },
    { bucket: "90+", amountCents: 0, count: 0 },
  ]
  const now = Date.now()

  for (const inv of data ?? []) {
    const due = Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0))
    if (due <= 0) continue
    const age = Math.floor((now - new Date(inv.issued_at ?? inv.created_at).getTime()) / 86400000)
    const idx = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3
    buckets[idx].amountCents += due
    buckets[idx].count += 1
  }

  return NextResponse.json({ buckets })
}
