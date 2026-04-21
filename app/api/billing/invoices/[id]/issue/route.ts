import { NextResponse } from "next/server"
import { issueInvoice } from "@/lib/billing/invoices"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  let dueAt: string | null = null
  try {
    const j = await req.json().catch(() => ({}))
    dueAt = typeof j?.dueAt === "string" ? j.dueAt : null
  } catch {
    /* empty */
  }
  try {
    const { pdfPath } = await issueInvoice(ctx.supabase, {
      practiceId: ctx.practiceId,
      invoiceId: id,
      actorUserId: ctx.userId,
      dueAt,
    })
    return NextResponse.json({ ok: true, pdfPath })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
