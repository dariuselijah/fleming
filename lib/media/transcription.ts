import type { SpeechToTextInput, TranscriptionResult, TranscriptionSegment } from "./types"

const OPENAI_AUDIO_URL = "https://api.openai.com/v1/audio/transcriptions"
const OPENAI_MAX_AUDIO_BYTES = 24 * 1024 * 1024

type OpenAiModelCandidate = {
  model: "gpt-4o-transcribe-diarize" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe" | "whisper-1"
  responseFormat: "diarized_json" | "json" | "verbose_json"
  chunkingStrategy?: "auto"
}

const OPENAI_MODEL_CANDIDATES: OpenAiModelCandidate[] = [
  {
    model: "gpt-4o-transcribe-diarize",
    responseFormat: "diarized_json",
    chunkingStrategy: "auto",
  },
  {
    model: "gpt-4o-transcribe",
    responseFormat: "json",
  },
  {
    model: "gpt-4o-mini-transcribe",
    responseFormat: "json",
  },
  {
    model: "whisper-1",
    responseFormat: "verbose_json",
  },
]

function normalizeExtractedText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ").trim()
}

function toSegmentList(raw: unknown): TranscriptionSegment[] {
  if (!Array.isArray(raw)) return []
  const segments: TranscriptionSegment[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const text = typeof row.text === "string" ? normalizeExtractedText(row.text) : ""
    if (!text) continue
    segments.push({
      speaker: typeof row.speaker === "string" ? row.speaker : null,
      startSec: typeof row.start === "number" ? row.start : null,
      endSec: typeof row.end === "number" ? row.end : null,
      text,
    })
  }
  return segments
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

function splitBufferForOpenAi(buffer: Buffer): Buffer[] {
  if (buffer.byteLength <= OPENAI_MAX_AUDIO_BYTES) {
    return [buffer]
  }

  const chunkSize = Math.max(4 * 1024 * 1024, OPENAI_MAX_AUDIO_BYTES - 1024 * 1024)
  const chunks: Buffer[] = []
  for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, Math.min(buffer.byteLength, offset + chunkSize)))
  }
  return chunks
}

async function transcribeWithModel(
  input: SpeechToTextInput,
  apiKey: string,
  candidate: OpenAiModelCandidate,
  warnings: string[]
): Promise<{ transcript: string; segments: TranscriptionSegment[] } | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)
  try {
    const formData = new FormData()
    formData.append("model", candidate.model)
    formData.append("response_format", candidate.responseFormat)
    formData.append("temperature", "0")
    if (candidate.chunkingStrategy) {
      formData.append("chunking_strategy", candidate.chunkingStrategy)
    }
    formData.append(
      "file",
      new Blob([toArrayBuffer(input.buffer)], { type: input.mimeType || "application/octet-stream" }),
      input.fileName || "media.bin"
    )

    const response = await fetch(OPENAI_AUDIO_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    })
    if (!response.ok) {
      const bodyText = await response.text()
      warnings.push(
        `Transcription with ${candidate.model} failed (${response.status}): ${bodyText.slice(0, 180)}`
      )
      return null
    }

    const payload = (await response.json()) as Record<string, unknown>
    const transcript =
      typeof payload.text === "string"
        ? normalizeExtractedText(payload.text)
        : typeof payload.transcript === "string"
          ? normalizeExtractedText(payload.transcript)
          : ""
    const segments = toSegmentList(payload.segments)
    if (!transcript) {
      warnings.push(`Transcription with ${candidate.model} returned empty text.`)
      return null
    }
    return {
      transcript,
      segments,
    }
  } catch (error) {
    warnings.push(
      `Transcription with ${candidate.model} failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function transcribeMedia(input: SpeechToTextInput): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const warnings: string[] = []
  if (!apiKey) {
    return {
      transcript: "",
      provider: "none",
      model: null,
      warnings: ["OPENAI_API_KEY missing, transcription skipped."],
      segments: [],
      status: "pending",
    }
  }

  const chunks = splitBufferForOpenAi(input.buffer)
  if (chunks.length > 1) {
    warnings.push(
      `Input is larger than ${Math.round(OPENAI_MAX_AUDIO_BYTES / (1024 * 1024))}MB; applying byte-chunk fallback before transcription.`
    )
  }

  for (const candidate of OPENAI_MODEL_CANDIDATES) {
    const chunkTranscripts: string[] = []
    const chunkSegments: TranscriptionSegment[] = []
    let failed = false

    for (let index = 0; index < chunks.length; index += 1) {
      const chunkInput: SpeechToTextInput = {
        ...input,
        buffer: chunks[index],
        fileName:
          chunks.length === 1
            ? input.fileName
            : `${input.fileName.replace(/\.[^.]+$/, "") || "lecture"}-part-${index + 1}.bin`,
      }
      const partial = await transcribeWithModel(chunkInput, apiKey, candidate, warnings)
      if (!partial) {
        failed = true
        break
      }
      chunkTranscripts.push(partial.transcript)
      chunkSegments.push(...partial.segments)
    }

    if (failed || chunkTranscripts.length === 0) {
      continue
    }

    return {
      transcript: normalizeExtractedText(chunkTranscripts.join(" ")),
      provider: "openai",
      model: candidate.model,
      warnings,
      segments: chunkSegments,
      status: "completed",
    }
  }

  return {
    transcript: "",
    provider: "none",
    model: null,
    warnings,
    segments: [],
    status: "failed",
  }
}
