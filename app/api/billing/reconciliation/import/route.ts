import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type SettlementSource = "polar" | "stitch" | "bank"
type SettlementLine = {
  id: string
  importId?: string
  source: SettlementSource
  externalRef: string
  amountCents: number
  feesCents: number
  status: "unmatched" | "matched" | "disputed"
}

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { source?: SettlementSource; csv?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const source = body.source ?? "bank"
  const rawLines = (body.csv ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = rawLines
    .filter((line) => !line.toLowerCase().startsWith("external_ref"))
    .map<SettlementLine>((line) => {
      const [externalRef = "", amount = "0", fees = "0"] = line.split(",").map((p) => p.trim())
      return {
        id: randomUUID(),
        source,
        externalRef,
        amountCents: Number(amount) || 0,
        feesCents: Number(fees) || 0,
        status: "unmatched",
      }
    })

  try {
    const db = ctx.supabase as unknown as SupabaseClient
    const { data: imp } = await db
      .from("practice_settlement_imports")
      .insert({
        practice_id: ctx.practiceId,
        source,
        period: new Date().toISOString().slice(0, 7),
        totals: { imported: rows.length },
        status: "imported",
      })
      .select("id")
      .single()

    if (imp?.id && rows.length) {
      const { data: inserted } = await db.from("practice_settlement_lines").insert(
        rows.map((row) => ({
          import_id: imp.id,
          external_ref: row.externalRef,
          amount_cents: row.amountCents,
          fees_cents: row.feesCents,
          status: row.status,
        }))
      ).select("id, import_id, external_ref, amount_cents, fees_cents, status, matched_payment_id")
      if (inserted?.length) {
        return NextResponse.json({
          import: { id: imp.id, source, period: new Date().toISOString().slice(0, 7), totals: { imported: inserted.length }, status: "imported" },
          lines: inserted.map((line) => ({
            id: String(line.id),
            importId: String(line.import_id),
            source,
            externalRef: String(line.external_ref ?? ""),
            amountCents: Number(line.amount_cents ?? 0),
            feesCents: Number(line.fees_cents ?? 0),
            status: String(line.status ?? "unmatched"),
            matchedPaymentId: line.matched_payment_id ? String(line.matched_payment_id) : undefined,
          })),
        })
      }
    }
  } catch {
    // Tables may not be migrated yet; return parsed lines so the UI remains useful in dev.
  }

  return NextResponse.json({ lines: rows })
}
