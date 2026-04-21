import { NextResponse } from "next/server"
import { createPatientAccessToken } from "@/lib/portal/tokens"
import { sendPatientTemplatedMessage } from "@/lib/comms/communication-service"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { issueInvoice } from "@/lib/billing/invoices"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: invoiceId } = await context.params

  let body: { channels?: string[]; issueFirst?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { data: inv, error } = await ctx.supabase
    .from("practice_invoices")
    .select("id, patient_id, status, total_cents, invoice_number, patient_snapshot")
    .eq("id", invoiceId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (error || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

  if (body.issueFirst && inv.status === "draft") {
    await issueInvoice(ctx.supabase, {
      practiceId: ctx.practiceId,
      invoiceId,
      actorUserId: ctx.userId,
    })
  }

  const patient = inv.patient_snapshot as { phone?: string; name?: string } | undefined
  const channels = body.channels ?? ["sms"]

  const { portalUrl } = await createPatientAccessToken({
    practiceId: ctx.practiceId,
    patientId: inv.patient_id as string,
    purpose: "billing_invoice",
    invoiceId,
    expiresInHours: 72,
  })

  const { data: practiceRow } = await ctx.supabase
    .from("practices")
    .select("name")
    .eq("id", ctx.practiceId)
    .maybeSingle()
  const practiceName = practiceRow?.name?.trim() || "Your practice"
  const amountStr = ((inv.total_cents ?? 0) / 100).toFixed(2)

  if (channels.includes("sms") && patient?.phone) {
    await sendPatientTemplatedMessage({
      practiceId: ctx.practiceId,
      toE164: patient.phone,
      templateKey: "invoice_issued",
      variables: {
        "1": amountStr,
        "2": practiceName,
        "3": portalUrl,
      },
      patientId: inv.patient_id as string,
    })
  }

  await ctx.supabase
    .from("practice_invoices")
    .update({ status: "sent", last_reminded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", invoiceId)

  return NextResponse.json({ ok: true, portalUrl })
}
