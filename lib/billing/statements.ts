import { PDFDocument, StandardFonts } from "pdf-lib"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { formatZar } from "./money"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "./types"
import { drawDocumentHeader, drawFooter, drawLineItems, drawPayQr, embedPracticeLogo, c } from "./pdf/layout"
import { createPatientAccessToken } from "@/lib/portal/tokens"

export async function buildMonthlyStatementPdf(
  supabase: SupabaseClient<Database>,
  opts: { practiceId: string; patientId: string; yearMonth: string }
): Promise<Uint8Array> {
  const [yearNum, monthNum] = opts.yearMonth.split("-").map(Number)
  const start = new Date(yearNum, monthNum - 1, 1).toISOString()
  const end = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString()

  const { data: rows } = await supabase
    .from("practice_invoices")
    .select("id, invoice_number, total_cents, amount_paid_cents, status, billing_mode, issued_at, created_at")
    .eq("practice_id", opts.practiceId)
    .eq("patient_id", opts.patientId)
    .in("status", ["issued", "sent", "viewed", "partially_paid", "paid"])
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true })

  const [{ data: practice }, { data: patient }] = await Promise.all([
    (supabase as unknown as SupabaseClient)
      .from("practices")
      .select("name, logo_storage_path, vat_number, hpcsa_number, bhf_number, address, phone, email, website")
      .eq("id", opts.practiceId)
      .maybeSingle(),
    supabase.from("practice_patients").select("display_name_hint").eq("id", opts.patientId).maybeSingle(),
  ])
  const practiceSnap: PracticeSnapshot = {
    name: practice?.name ?? "Practice",
    logoStoragePath: (practice as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? undefined,
    vatNumber: (practice as { vat_number?: string | null } | null)?.vat_number ?? undefined,
    hpcsaNumber: (practice as { hpcsa_number?: string | null } | null)?.hpcsa_number ?? undefined,
    bhfNumber: (practice as { bhf_number?: string | null } | null)?.bhf_number ?? undefined,
    address: (practice as { address?: string | null } | null)?.address ?? undefined,
    phone: (practice as { phone?: string | null } | null)?.phone ?? undefined,
    email: (practice as { email?: string | null } | null)?.email ?? undefined,
    website: (practice as { website?: string | null } | null)?.website ?? undefined,
  }
  const patientSnap: PatientSnapshot = { name: patient?.display_name_hint ?? "Patient" }
  let totalDue = 0
  const statementLines: InvoiceLineSnapshot[] = []
  for (const r of rows ?? []) {
    const due = Math.max(0, (r.total_cents ?? 0) - (r.amount_paid_cents ?? 0))
    totalDue += due
    statementLines.push({
      id: String(r.id),
      description: `${r.invoice_number} · ${r.status}`,
      quantity: 1,
      amountCents: due,
      lineType: r.billing_mode,
    })
  }

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx = { pdf, page, font, bold: fontBold, y: 0, left: 50, right: 545 }
  const logo = await embedPracticeLogo(pdf, practiceSnap)
  drawDocumentHeader(ctx, {
    title: "Account statement",
    number: `Statement ${opts.yearMonth}`,
    dateLabel: `${start.slice(0, 10)} to ${end.slice(0, 10)}`,
    practice: practiceSnap,
    patient: patientSnap,
    logo,
  })
  drawLineItems(ctx, statementLines)
  page.drawText("Total outstanding", { x: 360, y: ctx.y - 18, size: 11, font: fontBold, color: c("ink") })
  page.drawText(formatZar(totalDue), { x: 475, y: ctx.y - 18, size: 12, font: fontBold, color: c("emerald") })
  const payable = (rows ?? []).find((r) => r.billing_mode !== "scheme_only" && Math.max(0, (r.total_cents ?? 0) - (r.amount_paid_cents ?? 0)) > 0)
  if (payable && totalDue > 0) {
    const token = await createPatientAccessToken({
      practiceId: opts.practiceId,
      patientId: opts.patientId,
      purpose: "billing_invoice",
      invoiceId: String(payable.id),
      expiresInHours: 168,
    })
    await drawPayQr(ctx, token.portalUrl)
  }
  drawFooter(ctx)

  return pdf.save()
}
