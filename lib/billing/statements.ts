import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { formatZar } from "./money"

export async function buildMonthlyStatementPdf(
  supabase: SupabaseClient<Database>,
  opts: { practiceId: string; patientId: string; yearMonth: string }
): Promise<Uint8Array> {
  const [yearNum, monthNum] = opts.yearMonth.split("-").map(Number)
  const start = new Date(yearNum, monthNum - 1, 1).toISOString()
  const end = new Date(yearNum, monthNum, 0, 23, 59, 59).toISOString()

  const { data: rows } = await supabase
    .from("practice_invoices")
    .select("invoice_number, total_cents, amount_paid_cents, status, issued_at, created_at")
    .eq("practice_id", opts.practiceId)
    .eq("patient_id", opts.patientId)
    .in("status", ["issued", "sent", "viewed", "partially_paid", "paid"])
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true })

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let y = 800
  const left = 50
  const lineH = 14
  const draw = (text: string, size = 10, bold = false) => {
    page.drawText(text, { x: left, y, size, font: bold ? fontBold : font, color: rgb(0.1, 0.1, 0.1) })
    y -= lineH
  }

  draw(`Account statement — ${opts.yearMonth}`, 14, true)
  y -= 8
  let totalDue = 0
  for (const r of rows ?? []) {
    const due = (r.total_cents ?? 0) - (r.amount_paid_cents ?? 0)
    totalDue += due
    draw(`${r.invoice_number}  ${r.status}  ${formatZar(due)}`, 9)
  }
  y -= 8
  draw(`Total outstanding: ${formatZar(totalDue)}`, 11, true)

  return pdf.save()
}
