import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "pdf-lib"
import type { InvoiceLineSnapshot, PatientSnapshot, PracticeSnapshot } from "../types"
import { formatZar } from "../money"
import { BRAND_COLORS, loadPracticeLogoBytes } from "./branding"
import { qrPngForUrl } from "./qr"

export type BillingPdfContext = {
  pdf: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  left: number
  right: number
}

export function c(color: keyof typeof BRAND_COLORS) {
  const v = BRAND_COLORS[color]
  return rgb(v.r, v.g, v.b)
}

export async function embedPracticeLogo(pdf: PDFDocument, practice: PracticeSnapshot): Promise<PDFImage | null> {
  const bytes = await loadPracticeLogoBytes(practice.logoStoragePath)
  if (!bytes) return null
  try {
    return await pdf.embedPng(bytes)
  } catch {
    try {
      return await pdf.embedJpg(bytes)
    } catch {
      return null
    }
  }
}

export function drawDocumentHeader(
  ctx: BillingPdfContext,
  opts: {
    title: string
    number: string
    dateLabel: string
    practice: PracticeSnapshot
    patient: PatientSnapshot
    logo?: PDFImage | null
  }
) {
  const { page, bold, font, left, right } = ctx
  if (opts.logo) {
    page.drawImage(opts.logo, { x: left, y: 760, width: 58, height: 58 })
  } else {
    page.drawText("Fleming", { x: left, y: 790, size: 18, font: bold, color: c("emerald") })
  }
  page.drawText(opts.title, { x: left, y: 735, size: 22, font: bold, color: c("ink") })
  page.drawText(opts.number, { x: left, y: 716, size: 10, font, color: c("muted") })
  page.drawText(opts.dateLabel, { x: left, y: 701, size: 10, font, color: c("muted") })

  const practiceLines = [
    opts.practice.name,
    opts.practice.address,
    opts.practice.phone,
    opts.practice.email,
    opts.practice.website,
    opts.practice.vatNumber && `VAT ${opts.practice.vatNumber}`,
    opts.practice.hpcsaNumber && `HPCSA ${opts.practice.hpcsaNumber}`,
    opts.practice.bhfNumber && `BHF ${opts.practice.bhfNumber}`,
  ].filter(Boolean) as string[]
  let y = 795
  for (const line of practiceLines.slice(0, 7)) {
    page.drawText(line.slice(0, 48), { x: 365, y, size: 8.5, font, color: y === 795 ? c("ink") : c("muted") })
    y -= 12
  }

  page.drawRectangle({ x: left, y: 650, width: right - left, height: 1, color: c("line") })
  page.drawText("Bill to", { x: left, y: 625, size: 8, font: bold, color: c("muted") })
  page.drawText(opts.patient.name || "Patient", { x: left, y: 609, size: 12, font: bold, color: c("ink") })
  if (opts.patient.idNumber) page.drawText(`ID ${opts.patient.idNumber}`, { x: left, y: 594, size: 9, font, color: c("muted") })
  ctx.y = 560
}

export function drawLineItems(ctx: BillingPdfContext, lines: InvoiceLineSnapshot[]) {
  const { page, font, bold, left, right } = ctx
  page.drawRectangle({ x: left, y: ctx.y, width: right - left, height: 24, color: c("ink") })
  page.drawText("Description", { x: left + 12, y: ctx.y + 8, size: 8, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Codes", { x: 320, y: ctx.y + 8, size: 8, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Qty", { x: 425, y: ctx.y + 8, size: 8, font: bold, color: rgb(1, 1, 1) })
  page.drawText("Amount", { x: 475, y: ctx.y + 8, size: 8, font: bold, color: rgb(1, 1, 1) })
  ctx.y -= 26
  lines.forEach((line, index) => {
    const h = 30
    if (index % 2 === 0) page.drawRectangle({ x: left, y: ctx.y - 8, width: right - left, height: h, color: c("wash") })
    page.drawText(line.description.slice(0, 52), { x: left + 12, y: ctx.y + 7, size: 9, font, color: c("ink") })
    page.drawText([line.tariffCode, line.nappiCode, line.icdCode].filter(Boolean).join(" / ").slice(0, 28) || "-", {
      x: 320,
      y: ctx.y + 7,
      size: 8,
      font,
      color: c("muted"),
    })
    page.drawText(String(line.quantity ?? 1), { x: 425, y: ctx.y + 7, size: 9, font, color: c("ink") })
    page.drawText(formatZar(line.amountCents), { x: 475, y: ctx.y + 7, size: 9, font: bold, color: c("ink") })
    ctx.y -= h
  })
}

export async function drawPayQr(ctx: BillingPdfContext, payUrl?: string) {
  if (!payUrl) return
  const png = await qrPngForUrl(payUrl)
  const image = await ctx.pdf.embedPng(png)
  ctx.page.drawImage(image, { x: ctx.right - 94, y: 88, width: 86, height: 86 })
  ctx.page.drawText("Scan to pay securely", { x: ctx.right - 105, y: 72, size: 8, font: ctx.bold, color: c("emerald") })
}

export function drawFooter(ctx: BillingPdfContext) {
  ctx.page.drawRectangle({ x: ctx.left, y: 50, width: ctx.right - ctx.left, height: 1, color: c("line") })
  ctx.page.drawText("Powered by Fleming", { x: ctx.left, y: 32, size: 8, font: ctx.font, color: c("muted") })
  ctx.page.drawText("Page 1", { x: ctx.right - 32, y: 32, size: 8, font: ctx.font, color: c("muted") })
}
