import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const body = (await req.json().catch(() => ({}))) as { status?: string; paymentId?: string | null }
  const status = body.status === "disputed" ? "disputed" : body.paymentId ? "matched" : "unmatched"
  const db = ctx.supabase as unknown as SupabaseClient
  const { error } = await db
    .from("practice_settlement_lines")
    .update({ status, matched_payment_id: body.paymentId || null })
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
