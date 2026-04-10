import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"

/** High-accuracy vision + structuring for Smart Import (no Azure). */
export const SMART_IMPORT_VISION_MODEL = "gpt-5.2" as const

const TRANSCRIBE_SYSTEM = `You transcribe identity documents, passports, driver's licences, and medical aid cards for clinical data entry.

Output rules:
- Plain text only — no markdown, no JSON, no commentary.
- Preserve reading order (top to bottom, left to right on each page).
- Copy numbers, dates, ID codes, and names EXACTLY as printed. Do not normalize, guess, or "fix" digits.
- If text is illegible, write [illegible] for that fragment only.
- For multiple pages or distinct regions, separate with a blank line; you may prefix with "--- Page N ---" when multiple page images are provided.
- Do not invent headers or labels that are not visible on the document.`

function openAiApiKey(): string | null {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY_PROD?.trim() ||
    null
  )
}

export async function transcribeImagesWithGptVision(opts: {
  /** PNG or JPEG buffers (vision models accept common raster formats). */
  images: Buffer[]
  fileLabel: string
}): Promise<{ text: string }> {
  if (opts.images.length === 0) {
    return { text: "" }
  }

  const model = openproviders(SMART_IMPORT_VISION_MODEL)

  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: Buffer }
  > = [
    {
      type: "text",
      text:
        opts.images.length > 1
          ? `Document: ${opts.fileLabel}\nThese are consecutive page images. Transcribe all visible text in order.`
          : `Document: ${opts.fileLabel}\nTranscribe all visible text from this image.`,
    },
  ]

  for (const img of opts.images) {
    content.push({ type: "image", image: img })
  }

  const result = await generateText({
    model,
    system: TRANSCRIBE_SYSTEM,
    messages: [{ role: "user", content }],
    temperature: 0,
  })

  return { text: (result.text || "").replace(/\u0000/g, "").trim() }
}

/**
 * Scanned PDFs (no text layer): upload PDF to OpenAI and transcribe via Chat Completions.
 * Avoids pdf.js + canvas in Node (HTMLElement / createImageData issues).
 */
export async function transcribePdfBufferWithOpenAi(
  buffer: Buffer,
  fileLabel: string
): Promise<{ text: string; detail?: string }> {
  const apiKey = openAiApiKey()
  if (!apiKey) {
    return {
      text: "",
      detail: "OPENAI_API_KEY is not set; cannot read scanned PDFs. Export pages as images or use a PDF with selectable text.",
    }
  }

  const base = (fileLabel || "document.pdf").replace(/[^\w.-]+/g, "_").slice(0, 180)
  const filename = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" })
  const form = new FormData()
  form.append("file", blob, filename)
  form.append("purpose", "user_data")

  let fileId: string | undefined
  try {
    const up = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!up.ok) {
      const t = await up.text()
      return {
        text: "",
        detail: `OpenAI file upload failed (${up.status}): ${t.slice(0, 280)}`,
      }
    }
    const uploaded = (await up.json()) as { id?: string }
    fileId = uploaded.id
    if (!fileId) {
      return { text: "", detail: "OpenAI file upload returned no file id." }
    }

    const models = [SMART_IMPORT_VISION_MODEL, "gpt-4o"] as const
    let lastErr = ""
    for (const model of models) {
      const chat = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: TRANSCRIBE_SYSTEM },
            {
              role: "user",
              content: [
                { type: "file", file: { file_id: fileId } },
                {
                  type: "text",
                  text: `Document: ${fileLabel}\nTranscribe all visible text from every page of this PDF.`,
                },
              ],
            },
          ],
        }),
      })

      if (chat.ok) {
        const body = (await chat.json()) as {
          choices?: Array<{ message?: { content?: string | null } }>
        }
        const text = (body.choices?.[0]?.message?.content ?? "").replace(/\u0000/g, "").trim()
        return { text }
      }

      lastErr = await chat.text()
      const retry =
        model === SMART_IMPORT_VISION_MODEL &&
        (chat.status === 400 || chat.status === 404 || chat.status === 422)
      if (!retry) {
        break
      }
    }

    return {
      text: "",
      detail: `OpenAI PDF transcription failed: ${lastErr.slice(0, 380)}`,
    }
  } finally {
    if (fileId) {
      await fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => {})
    }
  }
}
