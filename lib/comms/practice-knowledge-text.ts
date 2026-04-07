import mammoth from "mammoth"
import pdfParse from "pdf-parse/lib/pdf-parse.js"

const MAX_EXTRACT_CHARS = 120_000

export async function extractTextFromUpload(
  buffer: Buffer,
  mime: string,
  filename: string
): Promise<string> {
  const name = filename.toLowerCase()
  const m = mime.toLowerCase().split(";")[0]?.trim() || ""

  if (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/csv" ||
    name.endsWith(".csv") ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    return truncateUtf8(buffer.toString("utf-8"))
  }

  if (m === "application/pdf" || name.endsWith(".pdf")) {
    const data = await pdfParse(buffer)
    return truncateUtf8((data.text || "").trim())
  }

  if (
    m ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const r = await mammoth.extractRawText({ buffer })
    return truncateUtf8((r.value || "").trim())
  }

  if (name.endsWith(".html") || name.endsWith(".htm") || m === "text/html") {
    return truncateUtf8(stripHtml(buffer.toString("utf-8")))
  }

  throw new Error(
    `Unsupported file type (${m || "unknown"}). Use PDF, Word (.docx), or plain text.`
  )
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function truncateUtf8(s: string): string {
  if (s.length <= MAX_EXTRACT_CHARS) return s
  return `${s.slice(0, MAX_EXTRACT_CHARS)}\n\n[…truncated]`
}
