import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type SettlementLine = {
  id: string
  importId?: string
  source: string
  externalRef: string
  amountCents: number
  feesCents: number
  status: string
}

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { lines?: SettlementLine[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { data: payments } = await ctx.supabase
    .from("practice_payments")
    .select("id, amount_cents, reference, provider_checkout_id, provider_order_id, succeeded_at, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("status", "succeeded")
    .limit(1000)
  const db = ctx.supabase as unknown as SupabaseClient

  const out = await Promise.all((body.lines ?? []).map(async (line) => {
    const candidates = (payments ?? []).filter((p) => {
      const refs = [p.reference, p.provider_checkout_id, p.provider_order_id].filter(Boolean)
      const exactRef = refs.some((r) => String(r).toLowerCase().includes(line.externalRef.toLowerCase()))
      const amountNet = Math.abs((p.amount_cents ?? 0) - (line.amountCents + line.feesCents)) <= 1
      const amountGross = Math.abs((p.amount_cents ?? 0) - line.amountCents) <= 1
      return exactRef || amountNet || amountGross
    })
    const status = candidates.length === 1 ? "matched" : candidates.length > 1 ? "needs_review" : "unmatched"
    const matchedPaymentId = candidates.length === 1 ? candidates[0].id : null
    if (line.id && !line.id.startsWith("00000000")) {
      await db
        .from("practice_settlement_lines")
        .update({ status, matched_payment_id: matchedPaymentId })
        .eq("id", line.id)
    }
    return { ...line, status, matchedPaymentId: matchedPaymentId ?? undefined }
  }))

  const importIds = [...new Set(out.map((line) => line.importId).filter(Boolean))]
  for (const importId of importIds) {
    const importLines = out.filter((line) => line.importId === importId)
    await db
      .from("practice_settlement_imports")
      .update({
        totals: {
          imported: importLines.length,
          matched: importLines.filter((line) => line.status === "matched").length,
          needsReview: importLines.filter((line) => line.status === "needs_review").length,
        },
        status: importLines.every((line) => line.status === "matched") ? "matched" : "needs_review",
      })
      .eq("id", importId as string)
  }

  return NextResponse.json({ lines: out })
}
