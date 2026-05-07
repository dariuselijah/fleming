import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { allocateBillingNumber } from "@/lib/billing/sequences"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import type { InvoiceLineSnapshot, InvoiceStatus } from "@/lib/billing/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    patientId?: string | null
    patientName?: string
    description?: string
    amountCents?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const amountCents = body.amountCents
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "amountCents required" }, { status: 400 })
  }
  const patientId = body.patientId?.trim()
  if (!patientId) {
    return NextResponse.json({ error: "Choose a patient profile before creating an invoice." }, { status: 400 })
  }

  try {
    const { data: patient, error: patientError } = await ctx.supabase
      .from("practice_patients")
      .select("id, display_name_hint")
      .eq("id", patientId)
      .eq("practice_id", ctx.practiceId)
      .maybeSingle()
    if (patientError) throw new Error(patientError.message)
    if (!patient) {
      return NextResponse.json({ error: "Patient profile not found for this practice." }, { status: 400 })
    }
    const invoiceNumber = await allocateBillingNumber(ctx.supabase, ctx.practiceId, "invoice")
    const line: InvoiceLineSnapshot = {
      id: randomUUID(),
      description: body.description?.trim() || "Walk-in checkout",
      amountCents,
      quantity: 1,
      lineType: "cash",
    }
    const { data, error } = await ctx.supabase
      .from("practice_invoices")
      .insert({
        practice_id: ctx.practiceId,
        patient_id: patientId,
        invoice_number: invoiceNumber,
        subtotal_cents: amountCents,
        vat_cents: 0,
        total_cents: amountCents,
        amount_paid_cents: 0,
        billing_mode: "cash",
        status: "draft" as InvoiceStatus,
        practice_snapshot: { name: "Practice" },
        patient_snapshot: { name: body.patientName?.trim() || (patient as { display_name_hint?: string }).display_name_hint || "Patient" },
        line_items: [line] as unknown as Record<string, unknown>[],
      })
      .select("id")
      .single()
    if (error || !data) throw new Error(error?.message ?? "Invoice failed")

    return NextResponse.json({ invoiceId: data.id, invoiceNumber })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 })
  }
}
