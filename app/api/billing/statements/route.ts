import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { buildMonthlyStatementPdf } from "@/lib/billing/statements"
import { getBillingPdfSignedUrl, uploadBillingPdf } from "@/lib/billing/storage"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get("patientId")?.trim()
  const yearMonth = searchParams.get("month")?.trim() ?? new Date().toISOString().slice(0, 7)
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 })

  try {
    const bytes = await buildMonthlyStatementPdf(ctx.supabase, {
      practiceId: ctx.practiceId,
      patientId,
      yearMonth,
    })
    const path = `${ctx.practiceId}/statements/${yearMonth}/${patientId}.pdf`
    await uploadBillingPdf(path, bytes)
    const url = await getBillingPdfSignedUrl(path, 300)
    return NextResponse.redirect(url)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const yearMonth = searchParams.get("month")?.trim() ?? new Date().toISOString().slice(0, 7)
  const body = (await req.json().catch(() => ({}))) as { patientId?: string }
  let patientId = body.patientId?.trim()
  if (!patientId) {
    const { data } = await ctx.supabase
      .from("practice_invoices")
      .select("patient_id")
      .eq("practice_id", ctx.practiceId)
      .not("patient_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    patientId = data?.patient_id as string | undefined
  }
  if (!patientId) return NextResponse.json({ error: "No statement-ready patient found." }, { status: 400 })
  const bytes = await buildMonthlyStatementPdf(ctx.supabase, { practiceId: ctx.practiceId, patientId, yearMonth })
  const path = `${ctx.practiceId}/statements/${yearMonth}/${patientId}.pdf`
  await uploadBillingPdf(path, bytes)
  const url = await getBillingPdfSignedUrl(path, 300)
  return NextResponse.json({ url })
}
