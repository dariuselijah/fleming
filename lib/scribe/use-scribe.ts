"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { SOAPBodySection } from "@/lib/clinical-workspace/types"
import { useWorkspaceStore, type ScribeSegment } from "@/lib/clinical-workspace/workspace-store"
import { generateSOAPGhostText } from "./soap-mapper"
import { EMPTY_EXTRACTED, type ExtractedEntities, type HighlightSpan } from "./entity-highlighter"
import { useAudioRecorder } from "./use-audio-recorder"

interface UseScribeOptions {
  enabled: boolean
  patientId: string | null
}

interface TranscribeResponse {
  transcript: string
  segments: ScribeSegment[]
  status: string
  model: string | null
}

async function transcribeBlob(blob: Blob): Promise<TranscribeResponse> {
  const form = new FormData()
  form.append("audio", blob, "recording.webm")

  const res = await fetch("/api/transcribe", { method: "POST", body: form })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error("[scribe] Transcription failed:", res.status, body)
    return { transcript: "", segments: [], status: "failed", model: null }
  }
  return res.json()
}

async function runExtraction(transcript: string): Promise<{
  entities: ExtractedEntities
  highlights: HighlightSpan[]
} | null> {
  try {
    const res = await fetch("/api/extract-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.entities) return null

    const entities: ExtractedEntities = { ...EMPTY_EXTRACTED }
    for (const key of Object.keys(entities) as (keyof ExtractedEntities)[]) {
      if (Array.isArray(data.entities[key])) {
        entities[key] = data.entities[key]
      }
    }

    const highlights: HighlightSpan[] = Array.isArray(data.highlights)
      ? data.highlights.filter((h: any) => h?.text && h?.type)
      : []

    return { entities, highlights }
  } catch (err) {
    console.error("[scribe] Entity extraction failed:", err)
    return null
  }
}

export function useScribe({ enabled, patientId }: UseScribeOptions) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const pendingChunks = useRef<Blob[]>([])
  const processingRef = useRef(false)
  const extractionInFlightRef = useRef(false)
  const extractionQueuedRef = useRef(false)

  const triggerExtraction = useCallback(async () => {
    const transcript = useWorkspaceStore.getState().scribeTranscript
    if (!transcript || transcript.length < 30) return

    if (extractionInFlightRef.current) {
      extractionQueuedRef.current = true
      return
    }

    extractionInFlightRef.current = true
    try {
      const result = await runExtraction(transcript)
      if (result) {
        const store = useWorkspaceStore.getState()
        store.setScribeEntities(result.entities)
        store.setScribeHighlights(result.highlights)
      }
    } finally {
      extractionInFlightRef.current = false
      if (extractionQueuedRef.current) {
        extractionQueuedRef.current = false
        triggerExtraction()
      }
    }
  }, [])

  const processNextChunk = useCallback(async () => {
    if (processingRef.current || pendingChunks.current.length === 0) return
    processingRef.current = true
    setIsTranscribing(true)
    setTranscriptionError(null)

    try {
      const chunk = pendingChunks.current.shift()!
      const result = await transcribeBlob(chunk)
      if (result.transcript) {
        const store = useWorkspaceStore.getState()
        store.appendScribeTranscript(result.transcript + " ")
        if (result.segments.length > 0) {
          store.appendScribeSegments(result.segments)
        }
        triggerExtraction()
      }
    } catch (err) {
      setTranscriptionError(err instanceof Error ? err.message : "Transcription failed")
    } finally {
      processingRef.current = false
      setIsTranscribing(pendingChunks.current.length > 0)
      if (pendingChunks.current.length > 0) {
        processNextChunk()
      }
    }
  }, [triggerExtraction])

  const handleChunk = useCallback(
    (blob: Blob) => {
      if (blob.size < 1000) return
      pendingChunks.current.push(blob)
      processNextChunk()
    },
    [processNextChunk]
  )

  const handleComplete = useCallback(
    (blob: Blob) => {
      if (blob.size < 1000) return
      pendingChunks.current.push(blob)
      processNextChunk()
    },
    [processNextChunk]
  )

  const recorder = useAudioRecorder({
    onChunk: handleChunk,
    onComplete: handleComplete,
    chunkIntervalMs: 10000,
  })

  const scribeActive = useWorkspaceStore((s) => s.scribeActive)

  useEffect(() => {
    if (!enabled || !patientId) return

    if (scribeActive && !recorder.isRecording) {
      recorder.startRecording()
    } else if (!scribeActive && recorder.isRecording) {
      recorder.stopRecording()
    }
  }, [scribeActive, enabled, patientId, recorder.isRecording, recorder.startRecording, recorder.stopRecording])

  const processTranscript = useCallback(() => {
    const state = useWorkspaceStore.getState()
    const patient = state.openPatients.find((p) => p.patientId === patientId)
    if (!patient || !state.scribeTranscript) return

    const ghost = generateSOAPGhostText(state.scribeTranscript, patient.soapNote)
    for (const [section, text] of Object.entries(ghost)) {
      if (text) {
        state.setSOAPGhostText(patient.patientId, section as SOAPBodySection, text)
      }
    }
  }, [patientId])

  useEffect(() => {
    if (!enabled || !patientId) return

    const unsubscribe = useWorkspaceStore.subscribe(
      (state) => state.scribeTranscript,
      () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(processTranscript, 1000)
      }
    )

    return () => {
      unsubscribe()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [enabled, patientId, processTranscript])

  const transcribeAudioFile = useCallback(async (file: File) => {
    setIsTranscribing(true)
    setTranscriptionError(null)
    const store = useWorkspaceStore.getState()

    try {
      if (!store.scribeActive) {
        store.setScribeActive(true)
      }

      const result = await transcribeBlob(file)
      if (result.transcript) {
        store.appendScribeTranscript(result.transcript + " ")
        if (result.segments.length > 0) {
          store.appendScribeSegments(result.segments)
        }
        triggerExtraction()
      } else {
        setTranscriptionError("No speech detected in the audio file.")
      }
    } catch (err) {
      setTranscriptionError(err instanceof Error ? err.message : "Transcription failed")
    } finally {
      setIsTranscribing(false)
    }
  }, [triggerExtraction])

  const simulateScribe = useCallback(
    (text: string, intervalMs = 50) => {
      const store = useWorkspaceStore.getState()
      if (!store.scribeActive) {
        store.setScribeActive(true)
      }

      let i = 0
      const words = text.split(" ")

      const timer = setInterval(() => {
        if (i >= words.length) {
          clearInterval(timer)
          return
        }
        const word = words[i] + (i < words.length - 1 ? " " : "")
        useWorkspaceStore.getState().appendScribeTranscript(word)
        i++
      }, intervalMs)

      return () => clearInterval(timer)
    },
    []
  )

  return {
    simulateScribe,
    transcribeAudioFile,
    triggerExtraction,
    isTranscribing,
    transcriptionError,
    recorderError: recorder.error,
    recorderDuration: recorder.duration,
    isRecording: recorder.isRecording,
    isPaused: recorder.isPaused,
    pauseRecording: recorder.pauseRecording,
    resumeRecording: recorder.resumeRecording,
  }
}
