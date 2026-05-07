import { createAdminClient } from "@/lib/supabase/admin"
import { downloadTwilioMedia } from "./twilio"

const STORAGE_BUCKET = "comms-media"

export async function downloadAndStoreMedia(opts: {
  mediaUrl: string
  practiceId: string
  threadId: string
  filename?: string
}): Promise<{ storagePath: string; mimeType: string }> {
  const { buffer, contentType } = await downloadTwilioMedia(opts.mediaUrl)

  const ext = mimeToExtension(contentType)
  const filename = opts.filename || `${Date.now()}.${ext}`
  const storagePath = `${opts.practiceId}/${opts.threadId}/${filename}`

  const db = createAdminClient()
  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  return { storagePath, mimeType: contentType }
}

export async function processMediaOCR(opts: {
  storagePath: string
  mimeType: string
  documentType?: "medical_aid_card" | "id_document" | "prescription" | "lab_result"
}): Promise<{ text: string; structured?: Record<string, unknown> }> {
  // Use Azure Document Intelligence if available, otherwise basic extraction
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY

  if (!endpoint || !apiKey) {
    return { text: "[OCR not configured — Azure Document Intelligence credentials required]" }
  }

  const db = createAdminClient()
  const { data: fileData } = await db.storage
    .from(STORAGE_BUCKET)
    .download(opts.storagePath)

  if (!fileData) return { text: "[File not found in storage]" }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION || "2024-11-30"

  const analyzeResp = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": opts.mimeType,
        "Ocp-Apim-Subscription-Key": apiKey,
      },
      body: buffer,
    }
  )

  if (!analyzeResp.ok) {
    return { text: `[OCR failed: ${analyzeResp.status}]` }
  }

  const operationUrl = analyzeResp.headers.get("Operation-Location")
  if (!operationUrl) return { text: "[OCR: no operation URL returned]" }

  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const pollResp = await fetch(operationUrl, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    })
    const pollData = await pollResp.json() as { status: string; analyzeResult?: { content?: string } }
    if (pollData.status === "succeeded") {
      const text = pollData.analyzeResult?.content || ""
      return { text, structured: extractStructuredData(text, opts.documentType) }
    }
    if (pollData.status === "failed") {
      return { text: "[OCR analysis failed]" }
    }
  }

  return { text: "[OCR timed out]" }
}

function extractStructuredData(
  text: string,
  documentType?: string
): Record<string, unknown> | undefined {
  if (documentType === "medical_aid_card") {
    return {
      rawText: text,
      possibleScheme: extractPattern(text, /(?:discovery|bonitas|gems|momentum|medshield|bestmed)/i),
      possibleMemberNumber: extractPattern(text, /\b\d{8,12}\b/),
      possibleDependentCode: extractPattern(text, /\b0[0-9]\b/),
    }
  }
  if (documentType === "id_document") {
    const idMatch = text.match(/\b\d{13}\b/)
    if (idMatch) {
      const id = idMatch[0]
      return {
        idNumber: id,
        dateOfBirth: parseSAIdDOB(id),
        sex: parseSAIdSex(id),
      }
    }
  }
  return undefined
}

function extractPattern(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern)
  return match?.[0]
}

function parseSAIdDOB(id: string): string | undefined {
  if (id.length !== 13) return undefined
  const yy = parseInt(id.slice(0, 2))
  const mm = id.slice(2, 4)
  const dd = id.slice(4, 6)
  const year = yy >= 0 && yy <= 26 ? 2000 + yy : 1900 + yy
  return `${year}-${mm}-${dd}`
}

function parseSAIdSex(id: string): string | undefined {
  if (id.length !== 13) return undefined
  const genderDigit = parseInt(id.charAt(6))
  return genderDigit >= 5 ? "M" : "F"
}

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
  }
  return map[mime] || "bin"
}
