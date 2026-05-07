import { NextResponse } from "next/server"
import { voidInvoice } from "@/lib/billing/invoices"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  let reason = ""
  try {
    const j = await req.json()
    reason = typeof j?.reason === "string" ? j.reason : ""
  } catch {
    /* empty */
  }
  try {
    await voidInvoice(ctx.supabase, {
      practiceId: ctx.practiceId,
      invoiceId: id,
      actorUserId: ctx.userId,
      reason: reason || undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
