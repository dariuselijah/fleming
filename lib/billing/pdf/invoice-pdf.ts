import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"

export async function buildInvoicePdfBytes(opts: {
  invoiceNumber: string
  issuedAtIso: string
  practice: PracticeSnapshot
  patient: PatientSnapshot
  lines: InvoiceLineSnapshot[]
  subtotalCents: number
  vatCents: number
  totalCents: number
  title?: string
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

  draw(opts.title ?? "TAX INVOICE", 16, true)
  draw(`Invoice: ${opts.invoiceNumber}`, 11, true)
  draw(`Date: ${opts.issuedAtIso.slice(0, 10)}`)
  y -= 8
  draw("Practice", 11, true)
  draw(opts.practice.name || "—")
  if (opts.practice.address) draw(opts.practice.address)
  if (opts.practice.vatNumber) draw(`VAT: ${opts.practice.vatNumber}`)
  if (opts.practice.hpcsaNumber) draw(`HPCSA: ${opts.practice.hpcsaNumber}`)
  if (opts.practice.bhfNumber) draw(`BHF: ${opts.practice.bhfNumber}`)
  y -= 8
  draw("Bill to", 11, true)
  draw(opts.patient.name || "—")
  if (opts.patient.idNumber) draw(`ID: ${opts.patient.idNumber}`)
  y -= 8
  draw("Line items", 11, true)
  for (const l of opts.lines) {
    const qty = l.quantity ?? 1
    const line = `${l.description}  x${qty}  ${formatZar(l.amountCents)}`
    draw(line, 9)
    if (l.tariffCode || l.nappiCode || l.icdCode) {
      draw(
        [l.tariffCode && `Tariff ${l.tariffCode}`, l.nappiCode && `NAPPI ${l.nappiCode}`, l.icdCode && `ICD ${l.icdCode}`]
          .filter(Boolean)
          .join(" · "),
        8
      )
    }
  }
  y -= 6
  draw(`Subtotal: ${formatZar(opts.subtotalCents)}`, 10)
  if (opts.vatCents > 0) draw(`VAT: ${formatZar(opts.vatCents)}`, 10)
  draw(`Total: ${formatZar(opts.totalCents)}`, 12, true)

  return pdf.save()
}
