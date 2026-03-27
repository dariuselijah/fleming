import type { OcrInput, OcrPage, OcrResult } from "./types"

const DEFAULT_DOC_INTELLIGENCE_API_VERSION = "2024-11-30"

function normalizeExtractedText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ").trim()
}

function normalizeEndpoint(value: string): string {
  return value.replace(/\/+$/, "")
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function toOcrPages(payload: Record<string, unknown>): { pages: OcrPage[]; confidence: number | null } {
  const analyzeResult = isObjectRecord(payload.analyzeResult) ? payload.analyzeResult : payload
  const pagesRaw = Array.isArray(analyzeResult.pages) ? analyzeResult.pages : []
  const pages: OcrPage[] = []
  const confidences: number[] = []

  for (const pageRaw of pagesRaw) {
    if (!isObjectRecord(pageRaw)) continue
    const pageNumber = toNumberOrNull(pageRaw.pageNumber) ?? pages.length + 1
    const linesRaw = Array.isArray(pageRaw.lines) ? pageRaw.lines : []
    const lines = linesRaw
      .map((lineRaw) => {
        if (!isObjectRecord(lineRaw)) return null
        const text = typeof lineRaw.content === "string" ? normalizeExtractedText(lineRaw.content) : ""
        if (!text) return null
        const confidence = toNumberOrNull(lineRaw.confidence)
        if (typeof confidence === "number") {
          confidences.push(confidence)
        }
        return {
          text,
          confidence,
        }
      })
      .filter((line): line is { text: string; confidence: number | null } => Boolean(line))
    pages.push({
      pageNumber,
      lines,
    })
  }

  const confidence =
    confidences.length > 0
      ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4))
      : null

  return { pages, confidence }
}

async function pollOperationResult(
  operationUrl: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  let attempt = 0
  while (attempt < 30) {
    attempt += 1
    const response = await fetch(operationUrl, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
      },
      cache: "no-store",
    })
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as Record<string, unknown>
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : ""
    if (status === "succeeded") {
      return payload
    }
    if (status === "failed" || status === "partiallysucceeded") {
      return payload
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(1600, 400 + attempt * 80)))
  }
  return null
}

export async function extractDocumentTextWithOcr(input: OcrInput): Promise<OcrResult> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim()
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY?.trim()
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim()

  if (!endpoint || !apiKey) {
    return {
      text: "",
      status: "pending",
      provider: "none",
      model: null,
      warnings: [
        "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCUMENT_INTELLIGENCE_API_KEY missing; OCR skipped.",
      ],
      pages: [],
      averageConfidence: null,
    }
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const analyzeUrl = `${normalizedEndpoint}/documentintelligence/documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=${encodeURIComponent(
    apiVersion || DEFAULT_DOC_INTELLIGENCE_API_VERSION
  )}`

  try {
    const analyzeResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": apiKey,
      },
      body: JSON.stringify({
        base64Source: input.buffer.toString("base64"),
      }),
      cache: "no-store",
    })

    if (!analyzeResponse.ok) {
      const message = await analyzeResponse.text()
      return {
        text: "",
        status: "failed",
        provider: "azure_document_intelligence",
        model: "prebuilt-read",
        warnings: [
          `Azure OCR request failed (${analyzeResponse.status}) for ${input.fileName}: ${message.slice(
            0,
            220
          )}`,
        ],
        pages: [],
        averageConfidence: null,
      }
    }

    const operationLocation = analyzeResponse.headers.get("operation-location")
    if (!operationLocation) {
      return {
        text: "",
        status: "failed",
        provider: "azure_document_intelligence",
        model: "prebuilt-read",
        warnings: ["Azure OCR did not return operation-location header."],
        pages: [],
        averageConfidence: null,
      }
    }

    const resultPayload = await pollOperationResult(operationLocation, apiKey)
    if (!resultPayload) {
      return {
        text: "",
        status: "failed",
        provider: "azure_document_intelligence",
        model: "prebuilt-read",
        warnings: ["Azure OCR operation polling timed out."],
        pages: [],
        averageConfidence: null,
      }
    }

    const status =
      typeof resultPayload.status === "string" ? resultPayload.status.toLowerCase() : "unknown"
    if (status !== "succeeded") {
      return {
        text: "",
        status: "failed",
        provider: "azure_document_intelligence",
        model: "prebuilt-read",
        warnings: [`Azure OCR operation finished with status "${status}".`],
        pages: [],
        averageConfidence: null,
      }
    }

    const analyzeResult = isObjectRecord(resultPayload.analyzeResult)
      ? resultPayload.analyzeResult
      : resultPayload
    const text =
      typeof analyzeResult.content === "string" ? normalizeExtractedText(analyzeResult.content) : ""
    const { pages, confidence } = toOcrPages(resultPayload)
    const fallbackText =
      text ||
      pages
        .flatMap((page) => page.lines.map((line) => line.text))
        .join("\n")
        .trim()

    return {
      text: fallbackText,
      status: fallbackText ? "completed" : "failed",
      provider: "azure_document_intelligence",
      model: "prebuilt-read",
      warnings: fallbackText ? [] : ["Azure OCR returned no extracted text."],
      pages,
      averageConfidence: confidence,
    }
  } catch (error) {
    return {
      text: "",
      status: "failed",
      provider: "azure_document_intelligence",
      model: "prebuilt-read",
      warnings: [error instanceof Error ? error.message : "Azure OCR request failed."],
      pages: [],
      averageConfidence: null,
    }
  }
}
