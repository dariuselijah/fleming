import { NextResponse } from "next/server"
import { writeOffInvoice } from "@/lib/billing/invoices-writeoff"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  let body: { reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const reason = body.reason?.trim()
  if (!reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 })
  }

  try {
    await writeOffInvoice(ctx.supabase, {
      practiceId: ctx.practiceId,
      invoiceId: id,
      actorUserId: ctx.userId,
      reason,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
