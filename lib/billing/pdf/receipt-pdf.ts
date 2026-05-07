import { PDFDocument, StandardFonts } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"
import { c, drawDocumentHeader, drawFooter, drawLineItems, embedPracticeLogo } from "./layout"

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
  const ctx = { pdf, page, font, bold: fontBold, y: 0, left: 50, right: 545 }
  const logo = await embedPracticeLogo(pdf, opts.practice)
  drawDocumentHeader(ctx, {
    title: "Receipt",
    number: `Receipt ${opts.receiptNumber}`,
    dateLabel: `Paid ${opts.paidAtIso.slice(0, 19)} · ${opts.methodLabel}`,
    practice: opts.practice,
    patient: opts.patient,
    logo,
  })
  drawLineItems(ctx, opts.lines)
  if (opts.reference) page.drawText(`Reference ${opts.reference}`, { x: 50, y: ctx.y - 8, size: 9, font, color: c("muted") })
  page.drawText("Amount paid", { x: 380, y: ctx.y - 18, size: 11, font: fontBold, color: c("ink") })
  page.drawText(formatZar(opts.amountCents), { x: 475, y: ctx.y - 18, size: 12, font: fontBold, color: c("emerald") })
  drawFooter(ctx)

  return pdf.save()
}
