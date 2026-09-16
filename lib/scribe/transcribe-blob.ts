import type { ScribeSegment } from "@/lib/clinical-workspace/workspace-store"

export type TranscribeBlobResult = {
  transcript: string
  segments: ScribeSegment[]
  status: string
  model: string | null
}

/** Pure transcription — does not touch workspace scribe state. Used by floating assistant and useScribe. */
export async function transcribeBlob(blob: Blob): Promise<TranscribeBlobResult> {
  const form = new FormData()
  form.append("audio", blob, "recording.webm")

  const res = await fetch("/api/transcribe", { method: "POST", body: form })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error("[transcribe-blob]", res.status, body)
    return { transcript: "", segments: [], status: "failed", model: null }
  }
  return res.json()
}
