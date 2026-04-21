import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"

export async function buildReceiptPdfBytes(opts: {
  receiptNumber: string
  paidAtIso: string
  invoiceNumber: string
  practice: PracticeSnapshot
  patient: PatientSnapshot
  lines: InvoiceLineSnapshot[]
  amountCents: number
  methodLabel: string
  reference?: string | null
}): Promise<Uint8Array> {
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

  draw("RECEIPT", 16, true)
  draw(`Receipt: ${opts.receiptNumber}`, 11, true)
  draw(`Invoice: ${opts.invoiceNumber}`)
  draw(`Paid: ${opts.paidAtIso.slice(0, 19)}`)
  draw(`Method: ${opts.methodLabel}`)
  if (opts.reference) draw(`Ref: ${opts.reference}`)
  y -= 8
  draw(opts.practice.name || "Practice", 11, true)
  if (opts.practice.vatNumber) draw(`VAT: ${opts.practice.vatNumber}`)
  y -= 8
  draw(`Patient: ${opts.patient.name || "—"}`)
  y -= 8
  for (const l of opts.lines) {
    draw(`${l.description}  ${formatZar(l.amountCents)}`, 9)
  }
  y -= 6
  draw(`Amount paid: ${formatZar(opts.amountCents)}`, 12, true)

  return pdf.save()
}
