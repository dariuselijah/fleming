import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { writeBillingAudit } from "@/lib/billing/audit"
import type { InvoiceLineSnapshot } from "@/lib/billing/types"

export const runtime = "nodejs"

type LineIn = {
  id?: string
  description?: string
  icdCode?: string
  tariffCode?: string
  nappiCode?: string
  quantity?: number
  amountCents?: number
  lineType?: string
}

function normalizeLines(raw: unknown): InvoiceLineSnapshot[] {
  if (!Array.isArray(raw)) return []
  const out: InvoiceLineSnapshot[] = []
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue
    const l = row as LineIn
    const id = typeof l.id === "string" && l.id ? l.id : crypto.randomUUID()
    const qty = typeof l.quantity === "number" && l.quantity > 0 ? l.quantity : 1
    const cents = typeof l.amountCents === "number" ? Math.round(l.amountCents) : 0
    out.push({
      id,
      description: typeof l.description === "string" ? l.description : "Line",
      icdCode: l.icdCode,
      tariffCode: l.tariffCode,
      nappiCode: l.nappiCode,
      quantity: qty,
      amountCents: cents,
      lineType: l.lineType,
    })
  }
  return out
}

/** Line `amountCents` is the line total (claim lines are stored as totals, not unit × qty). */
function sumLines(lines: InvoiceLineSnapshot[]): number {
  return lines.reduce((s, l) => s + (l.amountCents ?? 0), 0)
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const practiceCtx = await getAuthenticatedPracticeContext()
  if (!practiceCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await ctx.params
  const { data, error } = await practiceCtx.supabase
    .from("practice_invoices")
    .select("*")
    .eq("id", id)
    .eq("practice_id", practiceCtx.practiceId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ invoice: data })
}

export async function PATCH(req: Request, routeCtx: { params: Promise<{ id: string }> }) {
  const practiceCtx = await getAuthenticatedPracticeContext()
  if (!practiceCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await routeCtx.params

  const { data: inv, error: fetchErr } = await practiceCtx.supabase
    .from("practice_invoices")
    .select("id, status, practice_id, amount_paid_cents")
    .eq("id", id)
    .eq("practice_id", practiceCtx.practiceId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (inv.status !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be edited" }, { status: 400 })
  }

  let body: {
    line_items?: unknown
    practice_snapshot?: Record<string, unknown>
    applyVat15?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const lineItems = body.line_items != null ? normalizeLines(body.line_items) : null
  if (lineItems && lineItems.length === 0) {
    return NextResponse.json({ error: "At least one line item required" }, { status: 400 })
  }

  const { data: full } = await practiceCtx.supabase
    .from("practice_invoices")
    .select("line_items, practice_snapshot")
    .eq("id", id)
    .eq("practice_id", practiceCtx.practiceId)
    .maybeSingle()

  const mergedLines = lineItems ?? normalizeLines(full?.line_items)
  if (mergedLines.length === 0) {
    return NextResponse.json({ error: "No line items" }, { status: 400 })
  }

  const subtotalCents = sumLines(mergedLines)
  if (subtotalCents <= 0) {
    return NextResponse.json({ error: "Invoice total must be positive" }, { status: 400 })
  }

  const applyVat = body.applyVat15 === true
  const vatCents = applyVat ? Math.round(subtotalCents * 0.15) : 0
  const totalCents = subtotalCents + vatCents

  const prevSnap = (full?.practice_snapshot as Record<string, unknown>) ?? {}
  const practice_snapshot =
    body.practice_snapshot != null ? { ...prevSnap, ...body.practice_snapshot } : prevSnap

  const now = new Date().toISOString()
  const { data: updated, error: upErr } = await practiceCtx.supabase
    .from("practice_invoices")
    .update({
      line_items: mergedLines as unknown as Record<string, unknown>[],
      subtotal_cents: subtotalCents,
      vat_cents: vatCents,
      total_cents: totalCents,
      practice_snapshot: practice_snapshot as Record<string, unknown>,
      updated_at: now,
    })
    .eq("id", id)
    .eq("practice_id", practiceCtx.practiceId)
    .select("*")
    .maybeSingle()

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await writeBillingAudit(practiceCtx.supabase, {
    practiceId: practiceCtx.practiceId,
    actorUserId: practiceCtx.userId,
    entityType: "invoice",
    entityId: id,
    action: "patch_draft",
    diff: { lineCount: mergedLines.length, applyVat15: applyVat },
  })

  return NextResponse.json({ invoice: updated })
}
