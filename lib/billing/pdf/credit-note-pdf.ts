import { PDFDocument, StandardFonts } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"
import { c, drawDocumentHeader, drawFooter, drawLineItems, embedPracticeLogo } from "./layout"

export async function buildCreditNotePdfBytes(opts: {
  creditNoteNumber: string
  issuedAtIso: string
  invoiceNumber?: string | null
  practice: PracticeSnapshot
  patient: PatientSnapshot
  lines: InvoiceLineSnapshot[]
  amountCents: number
  reason?: string | null
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx = { pdf, page, font, bold: fontBold, y: 0, left: 50, right: 545 }
  const logo = await embedPracticeLogo(pdf, opts.practice)
  drawDocumentHeader(ctx, {
    title: "Credit note",
    number: `Credit note ${opts.creditNoteNumber}${opts.invoiceNumber ? ` · Invoice ${opts.invoiceNumber}` : ""}`,
    dateLabel: `Issued ${opts.issuedAtIso.slice(0, 19)}`,
    practice: opts.practice,
    patient: opts.patient,
    logo,
  })
  drawLineItems(ctx, opts.lines)
  if (opts.reason) page.drawText(`Reason ${opts.reason}`, { x: 50, y: ctx.y - 8, size: 9, font, color: c("muted") })
  page.drawText("Credit amount", { x: 380, y: ctx.y - 18, size: 11, font: fontBold, color: c("ink") })
  page.drawText(formatZar(opts.amountCents), { x: 475, y: ctx.y - 18, size: 12, font: fontBold, color: c("emerald") })
  drawFooter(ctx)

  return pdf.save()
}
