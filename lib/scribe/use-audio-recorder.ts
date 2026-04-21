"use client"

import { useCallback, useRef, useState } from "react"

export interface AudioRecorderState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  error: string | null
}

interface UseAudioRecorderOptions {
  /** Called with each audio chunk (for periodic transcription). Chunk interval controlled by `chunkIntervalMs`. */
  onChunk?: (blob: Blob) => void
  /** Called when recording stops with the complete audio blob */
  onComplete?: (blob: Blob) => void
  /** Interval in ms between chunk emissions. Default 8000 (8s). */
  chunkIntervalMs?: number
}

const PREFERRED_MIME = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
]

function getSupportedMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm"
  for (const mime of PREFERRED_MIME) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ""
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const { onChunk, onComplete, chunkIntervalMs = 8000 } = options

  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null,
  })

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const onChunkRef = useRef(onChunk)
  const onCompleteRef = useRef(onComplete)
  onChunkRef.current = onChunk
  onCompleteRef.current = onComplete

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setState((s) => ({ ...s, error: null }))

      if (!navigator.mediaDevices?.getUserMedia) {
        setState((s) => ({
          ...s,
          error: "Microphone access is not available in this browser.",
        }))
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })

      streamRef.current = stream
      const mimeType = getSupportedMime()
      if (!mimeType) {
        cleanup()
        setState((s) => ({
          ...s,
          error: "No supported audio recording format found.",
        }))
        return false
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          if (onChunkRef.current) {
            onChunkRef.current(new Blob([e.data], { type: mimeType }))
          }
        }
      }

      recorder.onstop = () => {
        const allChunks = chunksRef.current
        if (allChunks.length > 0) {
          const finalBlob = new Blob(allChunks, { type: mimeType })
          onCompleteRef.current?.(finalBlob)
        }
        chunksRef.current = []
        cleanup()
        setState({ isRecording: false, isPaused: false, duration: 0, error: null })
      }

      recorder.onerror = () => {
        setState((s) => ({
          ...s,
          isRecording: false,
          error: "Recording error occurred.",
        }))
        cleanup()
      }

      recorder.start(chunkIntervalMs)
      startTimeRef.current = Date.now()

      timerRef.current = setInterval(() => {
        setState((s) => ({
          ...s,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }))
      }, 1000)

      setState({ isRecording: true, isPaused: false, duration: 0, error: null })
      return true
    } catch (err) {
      cleanup()
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow access in your browser settings."
          : err instanceof Error
            ? err.message
            : "Failed to start recording."
      setState((s) => ({ ...s, isRecording: false, error: message }))
      return false
    }
  }, [chunkIntervalMs, cleanup])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop()
    }
  }, [])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.pause()
      setState((s) => ({ ...s, isPaused: true }))
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current?.state === "paused") {
      recorderRef.current.resume()
      setState((s) => ({ ...s, isPaused: false }))
    }
  }, [])

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  }
}
