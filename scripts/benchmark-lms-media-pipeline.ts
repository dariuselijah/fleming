import { existsSync, readFileSync } from "node:fs"
import { extname, basename } from "node:path"
import { summarizeTextForNotes } from "../lib/media/pipeline"
import { transcribeMedia } from "../lib/media/transcription"
import { extractDocumentTextWithOcr } from "../lib/media/ocr"

function nowMs() {
  return Date.now()
}

function inferMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === ".wav") return "audio/wav"
  if (ext === ".mp3") return "audio/mpeg"
  if (ext === ".m4a") return "audio/m4a"
  if (ext === ".mp4") return "video/mp4"
  if (ext === ".webm") return "video/webm"
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".pdf") return "application/pdf"
  return "application/octet-stream"
}

async function benchmarkSummarizer() {
  const sample = Array.from({ length: 220 })
    .map(
      (_, idx) =>
        `Lecture sentence ${idx + 1}. This topic explains renal physiology, fluid balance, and acid-base strategy. Students should revise high-yield concepts and practice exam-style questions.`
    )
    .join(" ")
  const started = nowMs()
  const output = summarizeTextForNotes(sample)
  const elapsedMs = nowMs() - started
  return {
    elapsedMs,
    summaryChars: output.summary.length,
    actionables: output.actionables.length,
    keyTopics: output.keyTopics.length,
  }
}

async function benchmarkTranscription(audioPath: string) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { skipped: true, reason: "OPENAI_API_KEY missing" }
  }
  if (!existsSync(audioPath)) {
    return { skipped: true, reason: `Audio file not found: ${audioPath}` }
  }
  const buffer = readFileSync(audioPath)
  const started = nowMs()
  const output = await transcribeMedia({
    buffer,
    fileName: basename(audioPath),
    mimeType: inferMimeType(audioPath),
  })
  const elapsedMs = nowMs() - started
  return {
    skipped: false,
    elapsedMs,
    status: output.status,
    provider: output.provider,
    model: output.model,
    transcriptChars: output.transcript.length,
    segmentCount: output.segments.length,
    warnings: output.warnings,
  }
}

async function benchmarkOcr(imagePath: string) {
  if (
    !process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY?.trim() ||
    !process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim()
  ) {
    return { skipped: true, reason: "Azure Document Intelligence credentials missing" }
  }
  if (!existsSync(imagePath)) {
    return { skipped: true, reason: `OCR file not found: ${imagePath}` }
  }
  const buffer = readFileSync(imagePath)
  const started = nowMs()
  const output = await extractDocumentTextWithOcr({
    buffer,
    fileName: basename(imagePath),
    mimeType: inferMimeType(imagePath),
  })
  const elapsedMs = nowMs() - started
  return {
    skipped: false,
    elapsedMs,
    status: output.status,
    provider: output.provider,
    model: output.model,
    textChars: output.text.length,
    pageCount: output.pages.length,
    averageConfidence: output.averageConfidence,
    warnings: output.warnings,
  }
}

async function run() {
  const audioPath = process.env.MEDIA_BENCHMARK_AUDIO?.trim() || ""
  const ocrPath = process.env.MEDIA_BENCHMARK_OCR?.trim() || ""

  const summarizer = await benchmarkSummarizer()
  const transcription = audioPath
    ? await benchmarkTranscription(audioPath)
    : { skipped: true, reason: "Set MEDIA_BENCHMARK_AUDIO to benchmark transcription" }
  const ocr = ocrPath
    ? await benchmarkOcr(ocrPath)
    : { skipped: true, reason: "Set MEDIA_BENCHMARK_OCR to benchmark OCR" }

  const payload = {
    generatedAt: new Date().toISOString(),
    summarizer,
    transcription,
    ocr,
  }
  console.log(JSON.stringify(payload, null, 2))
}

run().catch((error) => {
  console.error("benchmark failed", error)
  process.exitCode = 1
})
