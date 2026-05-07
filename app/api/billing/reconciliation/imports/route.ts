import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = ctx.supabase as unknown as SupabaseClient
  const { data: imports, error } = await db
    .from("practice_settlement_imports")
    .select("id, source, period, totals, status, created_at")
    .eq("practice_id", ctx.practiceId)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const selectedId = imports?.[0]?.id
  const { data: lines } = selectedId
    ? await db
        .from("practice_settlement_lines")
        .select("id, import_id, external_ref, amount_cents, fees_cents, status, matched_payment_id")
        .eq("import_id", selectedId)
        .order("created_at", { ascending: false })
    : { data: [] }

  return NextResponse.json({
    imports: imports ?? [],
    lines: (lines ?? []).map((line) => ({
      id: String(line.id),
      importId: String(line.import_id),
      externalRef: String(line.external_ref ?? ""),
      amountCents: Number(line.amount_cents ?? 0),
      feesCents: Number(line.fees_cents ?? 0),
      status: String(line.status ?? "unmatched"),
      matchedPaymentId: line.matched_payment_id ? String(line.matched_payment_id) : undefined,
    })),
  })
}
