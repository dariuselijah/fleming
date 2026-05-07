import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { allocateBillingNumber } from "./sequences"
import { buildReceiptPdfBytes } from "./pdf/receipt-pdf"
import { uploadBillingPdf } from "./storage"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "./types"
import { writeBillingAudit } from "./audit"

export async function issueReceipt(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    paymentId: string
    methodLabel: string
    amountCents: number
    reference?: string | null
  }
): Promise<{ receiptId: string; pdfPath: string }> {
  const { data: existingRec } = await supabase
    .from("practice_receipts")
    .select("id, pdf_storage_path")
    .eq("payment_id", opts.paymentId)
    .maybeSingle()
  if (existingRec?.id && existingRec.pdf_storage_path) {
    return { receiptId: existingRec.id, pdfPath: existingRec.pdf_storage_path }
  }

  const { data: inv, error: iErr } = await supabase
    .from("practice_invoices")
    .select("invoice_number, patient_snapshot, practice_snapshot, line_items")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (iErr || !inv) throw new Error(iErr?.message ?? "Invoice not found")

  const { data: pay } = await supabase
    .from("practice_payments")
    .select("succeeded_at")
    .eq("id", opts.paymentId)
    .maybeSingle()

  const paidAt = pay?.succeeded_at ?? new Date().toISOString()
  const receiptNumber = await allocateBillingNumber(supabase, opts.practiceId, "receipt")

  const practiceSnap = inv.practice_snapshot as unknown as PracticeSnapshot
  const patientSnap = inv.patient_snapshot as unknown as PatientSnapshot
  const lines = (inv.line_items as unknown as InvoiceLineSnapshot[]) ?? []

  const pdfBytes = await buildReceiptPdfBytes({
    receiptNumber,
    paidAtIso: paidAt,
    invoiceNumber: inv.invoice_number,
    practice: practiceSnap,
    patient: patientSnap,
    lines,
    amountCents: opts.amountCents,
    methodLabel: opts.methodLabel,
    reference: opts.reference,
  })

  const path = `${opts.practiceId}/receipts/${paidAt.slice(0, 7)}/${receiptNumber}.pdf`
  await uploadBillingPdf(path, pdfBytes)

  const snap = {
    invoiceNumber: inv.invoice_number,
    receiptNumber,
    amountCents: opts.amountCents,
    method: opts.methodLabel,
  }

  const { data: rec, error: rErr } = await supabase
    .from("practice_receipts")
    .insert({
      practice_id: opts.practiceId,
      invoice_id: opts.invoiceId,
      payment_id: opts.paymentId,
      receipt_number: receiptNumber,
      pdf_storage_path: path,
      snapshot: snap as unknown as Record<string, unknown>,
    })
    .select("id")
    .single()

  if (rErr || !rec) throw new Error(rErr?.message ?? "Receipt insert failed")

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: null,
    entityType: "receipt",
    entityId: rec.id,
    action: "issue",
    diff: { pdfPath: path },
  })

  return { receiptId: rec.id, pdfPath: path }
}
