import type { OCRStatus } from "@/lib/rag/types"

export type SpeechProvider = "openai" | "none"

export type OcrProvider = "azure_document_intelligence" | "none"

export interface TranscriptionSegment {
  speaker?: string | null
  startSec?: number | null
  endSec?: number | null
  text: string
}

export interface TranscriptionResult {
  transcript: string
  provider: SpeechProvider
  model: string | null
  warnings: string[]
  segments: TranscriptionSegment[]
  status: "completed" | "pending" | "failed"
}

export interface SpeechToTextInput {
  buffer: Buffer
  fileName: string
  mimeType: string
}

export interface OcrLine {
  text: string
  confidence: number | null
}

export interface OcrPage {
  pageNumber: number
  lines: OcrLine[]
}

export interface OcrResult {
  text: string
  status: OCRStatus
  provider: OcrProvider
  model: string | null
  warnings: string[]
  pages: OcrPage[]
  averageConfidence: number | null
}

export interface OcrInput {
  buffer: Buffer
  fileName: string
  mimeType: string
}
