import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { createPatientAccessToken } from "@/lib/portal/tokens"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/** Returns a patient portal URL for paying/viewing the invoice (no SMS). */
export async function POST(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: invoiceId } = await context.params

  const { data: inv, error } = await ctx.supabase
    .from("practice_invoices")
    .select("id, patient_id, status")
    .eq("id", invoiceId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (error || !inv?.patient_id) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  if (inv.status === "draft") {
    return NextResponse.json({ error: "Issue the invoice before generating a pay link" }, { status: 400 })
  }

  const { portalUrl } = await createPatientAccessToken({
    practiceId: ctx.practiceId,
    patientId: inv.patient_id,
    purpose: "billing_invoice",
    invoiceId,
    expiresInHours: 72,
  })

  return NextResponse.json({ portalUrl })
}
