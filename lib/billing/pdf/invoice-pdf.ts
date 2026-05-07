import { PDFDocument, StandardFonts } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"
import { drawDocumentHeader, drawFooter, drawLineItems, drawPayQr, embedPracticeLogo, c } from "./layout"

export async function buildInvoicePdfBytes(opts: {
  invoiceNumber: string
  issuedAtIso: string
  practice: PracticeSnapshot
  patient: PatientSnapshot
  lines: InvoiceLineSnapshot[]
  subtotalCents: number
  vatCents: number
  totalCents: number
  amountPaidCents?: number
  payUrl?: string
  title?: string
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ctx = { pdf, page, font, bold: fontBold, y: 0, left: 50, right: 545 }
  const logo = await embedPracticeLogo(pdf, opts.practice)
  drawDocumentHeader(ctx, {
    title: opts.title ?? "Tax invoice",
    number: `Invoice ${opts.invoiceNumber}`,
    dateLabel: `Issued ${opts.issuedAtIso.slice(0, 10)}`,
    practice: opts.practice,
    patient: opts.patient,
    logo,
  })
  drawLineItems(ctx, opts.lines)
  const paid = opts.amountPaidCents ?? 0
  const due = Math.max(0, opts.totalCents - paid)
  const x = 380
  page.drawText("Subtotal", { x, y: ctx.y - 4, size: 9, font, color: c("muted") })
  page.drawText(formatZar(opts.subtotalCents), { x: 475, y: ctx.y - 4, size: 9, font: fontBold, color: c("ink") })
  if (opts.vatCents > 0) {
    page.drawText("VAT", { x, y: ctx.y - 22, size: 9, font, color: c("muted") })
    page.drawText(formatZar(opts.vatCents), { x: 475, y: ctx.y - 22, size: 9, font: fontBold, color: c("ink") })
  }
  page.drawText("Total due", { x, y: ctx.y - 46, size: 11, font: fontBold, color: c("ink") })
  page.drawText(formatZar(due), { x: 475, y: ctx.y - 46, size: 12, font: fontBold, color: c("emerald") })
  await drawPayQr(ctx, opts.payUrl)
  drawFooter(ctx)

  return pdf.save()
}
