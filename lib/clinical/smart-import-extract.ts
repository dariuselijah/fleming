import { generateText } from "ai"
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { openproviders } from "@/lib/openproviders"
import {
  SMART_IMPORT_VISION_MODEL,
  transcribeImagesWithGptVision,
  transcribePdfBufferWithOpenAi,
} from "@/lib/clinical/smart-import-vision-transcribe"

export type SmartImportClientMode = "auto" | "patient_file" | "attach"

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TEXT_FOR_LLM = 24_000

const STRUCTURE_MODEL = SMART_IMPORT_VISION_MODEL

const STRUCTURE_SYSTEM = `You extract structured fields from document text for a South African medical practice (IDs, passports, medical aid cards, letters).

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "detectedLabel": "One short human-readable line describing what the document is",
  "fields": { "Label": "value" }
}

Rules:
- Registration / demographics (omit if absent): "Title", "Full Name", "ID Number" (13-digit SA ID only when clearly visible), "Date of Birth", "Sex", "Phone", "Email", "Medical Aid", "Plan", "Member No.", "Dependent Code", "Main Member"
- Document-only context (not used for registration forms): "Passport No.", "Nationality", "Document Expiry", "Pages", "Summary"
- For South African ID numbers: 13 digits. Only output if clearly visible in the source text.
- For attach / general documents: prefer "Title", "Summary", and "Pages" if you can infer page count; otherwise omit "Pages".
- Do NOT invent names, numbers, or schemes. If uncertain, omit the field or use an empty string only when the key is required for UI — prefer omission.
- "Summary" should be one or two factual sentences based only on the document.
- If the text is garbled or empty of patient data, set detectedLabel to describe the limitation and include only "Summary" with what is reliable.`

const VISION_STRUCTURE_SYSTEM = `You are reading a photo or scan of an ID card, passport, driver's licence, or medical aid membership card for a South African clinic.

Return ONLY valid JSON (no markdown fences):
{
  "detectedLabel": "Short description of document type",
  "fields": { "Label": "value" }
}

Use keys only when clearly legible. Registration: "Title", "Full Name", "ID Number", "Date of Birth", "Sex", "Phone", "Email", "Medical Aid", "Plan", "Member No.", "Dependent Code", "Main Member". Document context: "Passport No.", "Nationality", "Document Expiry", "Summary".

Never guess digits or names you cannot read. Omit uncertain fields.`

export function assertSmartImportFileSize(size: number): void {
  if (size > MAX_FILE_BYTES) {
    throw new Error(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`)
  }
}

export type SmartImportReadProgress = "pdf_text" | "vision"

export async function readSmartImportDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  onProgress?: (stage: SmartImportReadProgress) => void
) {
  const warnings: string[] = []
  const normalizedMime = mimeType.toLowerCase().split(";")[0]?.trim() || "application/octet-stream"
  let text = ""
  let pageCount: number | undefined

  if (normalizedMime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    onProgress?.("pdf_text")
    const parsed = await pdfParse(buffer)
    text = (parsed.text || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
    pageCount = typeof parsed.numpages === "number" ? parsed.numpages : undefined

    if (text.length < 80) {
      onProgress?.("vision")
      try {
        const { text: pdfVisionText, detail } = await transcribePdfBufferWithOpenAi(buffer, fileName)
        if (detail) {
          warnings.push(detail)
        }
        if (pdfVisionText.length > text.length) {
          text = pdfVisionText
        } else if (pdfVisionText.length > 0 && text.length === 0) {
          text = pdfVisionText
        }
      } catch (e) {
        warnings.push(
          e instanceof Error ? `PDF vision pass failed: ${e.message}` : "PDF vision pass failed."
        )
      }
    }
  } else if (normalizedMime.startsWith("image/")) {
    onProgress?.("vision")
    try {
      const { text: visionText } = await transcribeImagesWithGptVision({
        images: [buffer],
        fileLabel: fileName,
      })
      text = visionText.trim()
      if (!text) {
        warnings.push("GPT vision returned no text — try a sharper photo or better lighting.")
      }
    } catch (e) {
      warnings.push(
        e instanceof Error ? `Vision transcription failed: ${e.message}` : "Vision transcription failed."
      )
    }
  } else {
    throw new Error("Unsupported type. Use PDF or an image (JPEG, PNG, WebP).")
  }

  return { text, pageCount, warnings, mimeType: normalizedMime }
}

function heuristicFieldsFromText(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const idMatch = text.match(/\b\d{13}\b/)
  if (idMatch) {
    fields["ID Number"] = idMatch[0]
    const dob = parseSAIdDOB(idMatch[0])
    if (dob) fields["Date of Birth"] = dob
  }
  const scheme = text.match(
    /\b(Discovery\s+Health|Bonitas|GEMS|Momentum\s+Health|Medshield|Bestmed|Fedhealth|Profmed)\b/i
  )
  if (scheme) fields["Medical Aid"] = scheme[0]
  const member = text.match(/\b(?:member|policy|dep)\s*[#:]?\s*([A-Z0-9]{6,14})\b/i)
  if (member?.[1]) fields["Member No."] = member[1]
  return fields
}

function parseSAIdDOB(id: string): string | undefined {
  if (id.length !== 13) return undefined
  const yy = parseInt(id.slice(0, 2), 10)
  const mm = id.slice(2, 4)
  const dd = id.slice(4, 6)
  if (Number.isNaN(yy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return undefined
  const year = yy >= 0 && yy <= 29 ? 2000 + yy : 1900 + yy
  return `${year}-${mm}-${dd}`
}

function parseStructureJson(raw: string): { detectedLabel: string; fields: Record<string, string> } {
  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned) as { detectedLabel?: string; fields?: Record<string, string> }
    const detectedLabel = typeof parsed.detectedLabel === "string" ? parsed.detectedLabel : "Document"
    const fields =
      parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
        ? Object.fromEntries(
            Object.entries(parsed.fields).filter(
              ([k, v]) => typeof k === "string" && typeof v === "string" && v.trim().length > 0
            )
          )
        : {}
    return { detectedLabel, fields }
  } catch {
    return {
      detectedLabel: "Could not parse extraction",
      fields: { Summary: raw.slice(0, 500).trim() || "No structured fields returned." },
    }
  }
}

async function structureFromTextPrompt(system: string, userPrompt: string) {
  const model = openproviders(STRUCTURE_MODEL)
  const result = await generateText({
    model,
    system,
    prompt: userPrompt,
    temperature: 0,
  })
  return parseStructureJson(result.text)
}

export async function structureSmartImport(opts: {
  mode: SmartImportClientMode
  text: string
  fileName: string
  pageCount?: number
  imageBuffer?: Buffer
  imageMime?: string
}): Promise<{ detectedLabel: string; fields: Record<string, string> }> {
  if (opts.mode === "attach") {
    const baseName = opts.fileName.replace(/\.[^.]+$/, "") || "Document"
    if (!opts.text.trim()) {
      return {
        detectedLabel: "General document (no extractable text)",
        fields: {
          Title: baseName,
          Pages: opts.pageCount != null ? String(opts.pageCount) : "—",
          Summary: "No text could be extracted. You can still attach the file to a patient record.",
        },
      }
    }
    const prompt = `Filename: ${opts.fileName}
Page count (if from PDF parser): ${opts.pageCount ?? "unknown"}

Document text:
${opts.text.slice(0, MAX_TEXT_FOR_LLM)}`

    try {
      return await structureFromTextPrompt(
        `${STRUCTURE_SYSTEM}

For this request the mode is ATTACH: focus on Title (use filename only if the document has no better title), Pages if known, and a short Summary.`,
        prompt
      )
    } catch {
      return {
        detectedLabel: "General document",
        fields: {
          Title: baseName,
          Pages: opts.pageCount != null ? String(opts.pageCount) : "—",
          Summary: opts.text.slice(0, 600),
        },
      }
    }
  }

  const canVisionStructure =
    Boolean(opts.imageBuffer?.length && opts.imageMime?.startsWith("image/")) &&
    opts.text.trim().length < 40

  if (canVisionStructure && opts.imageBuffer && opts.imageMime) {
    try {
      const model = openproviders(SMART_IMPORT_VISION_MODEL)
      const result = await generateText({
        model,
        system: VISION_STRUCTURE_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  opts.mode === "patient_file"
                    ? "Extract patient and scheme fields from this card or ID image."
                    : "Identify the document type and extract any patient, ID, or medical aid details you can read clearly.",
              },
              {
                type: "image",
                image: opts.imageBuffer,
              },
            ],
          },
        ],
        temperature: 0,
      })
      return parseStructureJson(result.text)
    } catch {
      const heuristics = heuristicFieldsFromText(opts.text)
      return {
        detectedLabel: "Image (structured vision failed — check API keys)",
        fields:
          Object.keys(heuristics).length > 0
            ? heuristics
            : {
                Summary:
                  "Could not complete structured vision extraction. Verify OpenAI credentials and model access for gpt-5.2.",
              },
      }
    }
  }

  if (!opts.text.trim()) {
    const heuristics = heuristicFieldsFromText("")
    return {
      detectedLabel: "Could not read document text",
      fields:
        Object.keys(heuristics).length > 0
          ? heuristics
          : {
              Summary:
                "No text was produced. Try a clearer scan, or ensure the file is a supported PDF or image.",
            },
    }
  }

  try {
    return await structureFromTextPrompt(
      STRUCTURE_SYSTEM,
      `Filename: ${opts.fileName}
Mode: ${opts.mode}

Document text:
${opts.text.slice(0, MAX_TEXT_FOR_LLM)}`
    )
  } catch {
    const heuristics = heuristicFieldsFromText(opts.text)
    return {
      detectedLabel: "Partial extract (AI unavailable)",
      fields:
        Object.keys(heuristics).length > 0
          ? heuristics
          : { Summary: opts.text.slice(0, 500) },
    }
  }
}
