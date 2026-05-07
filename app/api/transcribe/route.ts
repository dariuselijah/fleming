import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { transcribeMedia } from "@/lib/media/transcription"

const MAX_AUDIO_SIZE = 25 * 1024 * 1024 // 25 MB

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "video/webm", // MediaRecorder often produces video/webm even for audio-only
])

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("audio") as File | null

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }

    if (!ALLOWED_AUDIO_TYPES.has(file.type) && !file.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${file.type}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum ${Math.round(MAX_AUDIO_SIZE / (1024 * 1024))}MB.` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = await transcribeMedia({
      buffer,
      fileName: file.name || "recording.webm",
      mimeType: file.type || "audio/webm",
    })

    return NextResponse.json({
      transcript: result.transcript,
      segments: result.segments,
      status: result.status,
      model: result.model,
      provider: result.provider,
      warnings: result.warnings,
    })
  } catch (error) {
    console.error("[transcribe] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    )
  }
}
