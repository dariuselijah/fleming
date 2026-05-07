import { NextResponse } from "next/server"
import { createInvoiceFromClaim } from "@/lib/billing/invoices"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import type { BillingMode } from "@/lib/billing/types"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")?.trim()

  let q = ctx.supabase
    .from("practice_invoices")
    .select(
      "id, invoice_number, patient_id, claim_id, total_cents, amount_paid_cents, status, billing_mode, created_at, due_at, last_reminded_at, patient_snapshot"
    )
    .eq("practice_id", ctx.practiceId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (status) {
    q = q.eq("status", status)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    claimId?: string
    billingMode?: BillingMode
    shortfallCents?: number
    practiceId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim() ?? ctx.practiceId
  if (practiceId !== ctx.practiceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!body.claimId) {
    return NextResponse.json({ error: "claimId required" }, { status: 400 })
  }

  try {
    const { invoiceId } = await createInvoiceFromClaim(ctx.supabase, {
      practiceId,
      claimId: body.claimId,
      billingMode: body.billingMode ?? "cash",
      actorUserId: ctx.userId,
      shortfallCents: body.shortfallCents,
    })
    return NextResponse.json({ invoiceId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
