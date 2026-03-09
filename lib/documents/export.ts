import type { DocumentArtifact } from "@/lib/uploads/artifacts"
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export type DocumentExportFormat = "pdf" | "docx"

export type DocumentExportResult = {
  bytes: Uint8Array
  mimeType: string
  extension: "pdf" | "docx"
}

function slugifyFileName(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "document-artifact"
}

type ParsedExportLine = {
  kind: "subheading" | "bullet" | "number" | "paragraph"
  text: string
}

function sanitizeExportText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function parseSectionLines(content: string): ParsedExportLine[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const normalized = sanitizeExportText(line)
      if (/^#{2,6}\s+/.test(normalized)) {
        return {
          kind: "subheading" as const,
          text: normalized.replace(/^#{2,6}\s+/, ""),
        }
      }
      if (/^Source\s+\d+:/i.test(normalized)) {
        return {
          kind: "subheading" as const,
          text: normalized,
        }
      }
      if (/^[-*]\s+/.test(normalized)) {
        return {
          kind: "bullet" as const,
          text: normalized.replace(/^[-*]\s+/, ""),
        }
      }
      if (/^\d+\.\s+/.test(normalized)) {
        return {
          kind: "number" as const,
          text: normalized,
        }
      }
      return {
        kind: "paragraph" as const,
        text: normalized,
      }
    })
    .filter((line) => line.text.length > 0)
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines.length > 0 ? lines : [""]
}

async function exportDocx(artifact: DocumentArtifact): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 280 },
      children: [new TextRun({ text: artifact.title, bold: true, color: "000000" })],
    }),
  ]

  for (const section of artifact.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 180, after: 120 },
        children: [new TextRun({ text: section.heading, bold: true, color: "000000" })],
      })
    )

    const lines = parseSectionLines(section.content)
    if (lines.length === 0) {
      children.push(new Paragraph({ text: "" }))
      continue
    }

    for (const line of lines) {
      if (line.kind === "subheading") {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 90, after: 60 },
            children: [new TextRun({ text: line.text, bold: true, color: "000000" })],
          })
        )
      } else if (line.kind === "bullet") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line.text, color: "000000" })],
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        )
      } else if (line.kind === "number") {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: line.text, color: "000000" })],
          })
        )
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: line.text, color: "000000" })],
          })
        )
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return new Uint8Array(buffer)
}

async function exportPdf(artifact: DocumentArtifact): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageSize = { width: 595.28, height: 841.89 } // A4
  let page = pdfDoc.addPage([pageSize.width, pageSize.height])
  let y = pageSize.height - 56
  const marginX = 54
  const maxChars = 95

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight >= 44) return
    page = pdfDoc.addPage([pageSize.width, pageSize.height])
    y = pageSize.height - 56
  }

  const drawLine = (line: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = opts?.size ?? 11
    const font = opts?.bold ? fontBold : fontRegular
    const gap = opts?.gap ?? 15
    ensureSpace(gap + 2)
    page.drawText(line, {
      x: marginX,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
    })
    y -= gap
  }

  drawLine(artifact.title, { bold: true, size: 16, gap: 22 })
  drawLine("", { gap: 8 })

  for (const section of artifact.sections) {
    drawLine(section.heading, { bold: true, size: 13, gap: 18 })
    const lines = parseSectionLines(section.content)
    for (const line of lines) {
      if (line.kind === "subheading") {
        drawLine(line.text, { bold: true, size: 11, gap: 15 })
        continue
      }
      const normalized =
        line.kind === "bullet"
          ? `• ${line.text}`
          : line.kind === "number"
            ? line.text
            : line.text
      const wrapped = wrapText(normalized, maxChars)
      for (const wrappedLine of wrapped) {
        drawLine(wrappedLine, { size: 11, gap: 14 })
      }
    }
    drawLine("", { gap: 10 })
  }

  const bytes = await pdfDoc.save()
  return bytes
}

export async function exportDocumentArtifact(
  artifact: DocumentArtifact,
  format: DocumentExportFormat
): Promise<DocumentExportResult> {
  if (format === "docx") {
    return {
      bytes: await exportDocx(artifact),
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    }
  }

  return {
    bytes: await exportPdf(artifact),
    mimeType: "application/pdf",
    extension: "pdf",
  }
}

export function buildExportFileName(
  artifact: DocumentArtifact,
  format: DocumentExportFormat
): string {
  const base = slugifyFileName(artifact.title || "document-artifact")
  return `${base}.${format}`
}
