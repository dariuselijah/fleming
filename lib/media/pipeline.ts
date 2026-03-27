import type { ParsedUploadDocument } from "@/lib/rag/types"
import { transcribeMedia } from "./transcription"
import { extractDocumentTextWithOcr } from "./ocr"

function normalizeExtractedText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ").trim()
}

export type LectureInsights = {
  summary: string
  actionables: string[]
  keyTopics: string[]
}

export function summarizeTextForNotes(value: string): LectureInsights {
  const normalized = normalizeExtractedText(value)
  if (!normalized) {
    return {
      summary: "",
      actionables: [],
      keyTopics: [],
    }
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/g)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20)

  if (sentences.length === 0) {
    return {
      summary: normalized.slice(0, 500),
      actionables: [],
      keyTopics: [],
    }
  }

  const signalRegex =
    /\b(key|important|remember|high-yield|exam|clinical|diagnosis|management|treatment|algorithm|takeaway)\b/i
  const actionRegex =
    /\b(should|must|need to|remember to|next step|action item|revise|review|practice|prepare|read|complete|submit|watch)\b/i

  const prioritized = sentences.filter((sentence) => signalRegex.test(sentence))
  const summarySource = prioritized.length >= 3 ? prioritized : sentences
  const summary = summarySource.slice(0, 6).join(" ")

  const actionables = Array.from(
    new Set(
      sentences
        .filter((sentence) => actionRegex.test(sentence))
        .map((sentence) => sentence.replace(/\s+/g, " ").trim())
        .filter((sentence) => sentence.length >= 16 && sentence.length <= 220)
    )
  ).slice(0, 12)

  const tokenCounts = new Map<string, number>()
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "their",
    "there",
    "about",
    "your",
    "have",
    "will",
    "were",
    "when",
    "what",
    "where",
    "while",
    "also",
    "than",
    "then",
  ])
  for (const sentence of sentences) {
    for (const token of sentence.toLowerCase().split(/[^a-z0-9]+/g)) {
      const normalizedToken = token.trim()
      if (normalizedToken.length < 4 || stopwords.has(normalizedToken)) continue
      tokenCounts.set(normalizedToken, (tokenCounts.get(normalizedToken) || 0) + 1)
    }
  }
  const keyTopics = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([token]) => token)

  return {
    summary,
    actionables,
    keyTopics,
  }
}

export async function buildImageDocumentFromMediaPipeline(input: {
  buffer: Buffer
  title: string
  fileName: string
  mimeType: string
  dimensions?: {
    width?: number
    height?: number
  }
}): Promise<ParsedUploadDocument> {
  const ocr = await extractDocumentTextWithOcr({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
  })

  return {
    kind: "image",
    title: input.title,
    metadata: {
      ocrStatus: ocr.status,
      ocrProvider: ocr.provider,
      ocrModel: ocr.model,
      ocrWarnings: ocr.warnings,
      ocrAverageConfidence: ocr.averageConfidence,
      ocrPageCount: ocr.pages.length,
    },
    sourceUnits: [
      {
        unitType: "image",
        unitNumber: 1,
        title: "Image",
        extractedText: ocr.text,
        figures: [],
        width: input.dimensions?.width,
        height: input.dimensions?.height,
        ocrStatus: ocr.status,
        metadata: {
          ocrProvider: ocr.provider,
          ocrModel: ocr.model,
          ocrWarnings: ocr.warnings,
          ocrAverageConfidence: ocr.averageConfidence,
        },
      },
    ],
  }
}

export async function buildVideoDocumentFromMediaPipeline(input: {
  buffer: Buffer
  title: string
  fileName: string
  mimeType: string
}): Promise<ParsedUploadDocument> {
  const transcription = await transcribeMedia({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
  })
  const insights = summarizeTextForNotes(transcription.transcript)
  const fallbackText =
    "Lecture media uploaded. Automatic transcript could not be extracted right now. You can still ask chat to summarize this upload after transcript sync."
  const extractedText = transcription.transcript || fallbackText

  return {
    kind: "video",
    title: input.title,
    metadata: {
      transcriptStatus: transcription.status,
      transcriptProvider: transcription.provider,
      transcriptModel: transcription.model,
      transcriptWarnings: transcription.warnings,
      transcriptCharCount: transcription.transcript.length,
      transcriptSegmentCount: transcription.segments.length,
      summary: insights.summary,
      actionables: insights.actionables,
      keyTopics: insights.keyTopics,
    },
    sourceUnits: [
      {
        unitType: "section",
        unitNumber: 1,
        title: "Lecture transcript",
        extractedText,
        figures: [],
        ocrStatus: transcription.transcript ? "completed" : "pending",
        metadata: {
          mediaType: input.mimeType,
          fileName: input.fileName,
          transcriptProvider: transcription.provider,
          transcriptModel: transcription.model,
          transcriptSegments: transcription.segments,
          transcriptWarnings: transcription.warnings,
          actionables: insights.actionables,
          keyTopics: insights.keyTopics,
          summary: insights.summary,
        },
      },
    ],
  }
}
