import { NextResponse } from "next/server"
import { getBillingPdfSignedUrl } from "@/lib/billing/storage"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { issueInvoice } from "@/lib/billing/invoices"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  const { data: inv, error } = await ctx.supabase
    .from("practice_invoices")
    .select("pdf_storage_path, status")
    .eq("id", id)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (error || !inv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  let pdfPath = inv.pdf_storage_path
  if (!pdfPath && inv.status === "draft") {
    const issued = await issueInvoice(ctx.supabase, {
      practiceId: ctx.practiceId,
      invoiceId: id,
      actorUserId: ctx.userId,
    })
    pdfPath = issued.pdfPath
  }

  if (!pdfPath) {
    return NextResponse.json({ error: "PDF not available" }, { status: 404 })
  }

  try {
    const url = await getBillingPdfSignedUrl(pdfPath, 300)
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
