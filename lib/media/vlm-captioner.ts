/**
 * VLM (Vision Language Model) Figure Captioner
 *
 * Generates clinical descriptions for extracted figures that lack captions.
 * Uses OpenAI GPT-4o-mini vision to produce structured, searchable captions
 * that improve RAG retrieval for visual clinical content.
 */

import type { ParsedUploadAsset } from "@/lib/rag/types"

const CAPTION_MODEL = "gpt-4o-mini"
const CAPTION_MAX_TOKENS = 200
const CAPTION_TIMEOUT_MS = 12_000
const MAX_CONCURRENT_CAPTIONS = 3
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024

const CLINICAL_CAPTION_PROMPT = `You are a medical image analysis assistant. Describe this figure from a clinical document in 1-3 concise sentences. Focus on:
- What type of figure it is (chart, medical image, flowchart, table, diagram, etc.)
- Key clinical findings or data shown
- Any notable patterns, trends, or abnormalities visible

Be factual and specific. Do not speculate beyond what is clearly visible.`

let activeRequests = 0
const queue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_CAPTIONS) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    queue.push(() => {
      activeRequests++
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeRequests--
  const next = queue.shift()
  if (next) next()
}

/**
 * Generate a VLM caption for a single figure.
 * Returns the caption string or null if captioning fails/is skipped.
 */
export async function captionFigure(
  asset: ParsedUploadAsset,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  if (!asset.buffer || asset.buffer.length === 0) return null
  if (asset.buffer.length > MAX_IMAGE_SIZE_BYTES) return null

  // Skip if already has a meaningful caption
  if (asset.caption && asset.caption.length > 20) return asset.caption

  const mimeType = asset.mimeType || "image/png"
  const dataUri = `data:${mimeType};base64,${asset.buffer.toString("base64")}`

  await acquireSlot()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CAPTION_TIMEOUT_MS)

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CAPTION_MODEL,
        max_tokens: CAPTION_MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: CLINICAL_CAPTION_PROMPT },
              {
                type: "image_url",
                image_url: { url: dataUri, detail: "low" },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) return null

    const data = await response.json()
    const caption = data?.choices?.[0]?.message?.content?.trim()
    return caption && caption.length > 5 ? caption : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    releaseSlot()
  }
}

/**
 * Batch-caption uncaptioned figures in a set of source units.
 * Mutates the assets in place, adding VLM-generated captions.
 * Skips figures that already have captions.
 */
export async function captionUncaptionedFigures(
  sourceUnits: Array<{ figures: ParsedUploadAsset[] }>,
  options?: { maxTotal?: number },
): Promise<number> {
  const maxTotal = options?.maxTotal ?? 12
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return 0

  const uncaptioned: ParsedUploadAsset[] = []
  for (const unit of sourceUnits) {
    for (const figure of unit.figures) {
      if (uncaptioned.length >= maxTotal) break
      if (!figure.caption || figure.caption.length < 20) {
        uncaptioned.push(figure)
      }
    }
  }

  if (uncaptioned.length === 0) return 0

  let captionedCount = 0
  const results = await Promise.allSettled(
    uncaptioned.map(async (figure) => {
      const caption = await captionFigure(figure)
      if (caption) {
        figure.caption = caption
        if (figure.metadata && typeof figure.metadata === "object") {
          ;(figure.metadata as Record<string, unknown>).vlmCaptioned = true
          ;(figure.metadata as Record<string, unknown>).vlmModel = CAPTION_MODEL
        }
        captionedCount++
      }
    }),
  )

  return captionedCount
}
