"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchClient } from "@/lib/fetch"

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type UseChatDictationOptions = {
  /** Called with each finalized phrase (user may speak in segments). */
  onAppendText: (text: string) => void
  language?: string
}

export function useChatDictation({ onAppendText, language = "en-US" }: UseChatDictationOptions) {
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [fallbackRecording, setFallbackRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const onAppendTextRef = useRef(onAppendText)
  onAppendTextRef.current = onAppendText

  const supported =
    typeof window !== "undefined" &&
    (Boolean(getSpeechRecognitionCtor()) || typeof MediaRecorder !== "undefined")

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* noop */
    }
    recognitionRef.current = null
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        /* noop */
      }
    }
    mediaRecorderRef.current = null
    setIsListening(false)
    setFallbackRecording(false)
    setInterimTranscript("")
  }, [])

  const startFallbackRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined })
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        chunksRef.current = []
        if (blob.size < 256) {
          setIsListening(false)
          return
        }
        try {
          const fd = new FormData()
          fd.append("audio", blob, "dictation.webm")
          const res = await fetchClient("/api/transcribe", { method: "POST", body: fd })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(j.error || "Transcription failed")
          }
          const j = (await res.json()) as { transcript?: string }
          const t = (j.transcript ?? "").trim()
          if (t) onAppendTextRef.current(t + " ")
        } catch (e) {
          setError(e instanceof Error ? e.message : "Dictation failed")
        } finally {
          setIsListening(false)
        }
      }
      mediaRecorderRef.current = rec
      rec.start(250)
      setIsListening(true)
      setFallbackRecording(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access denied")
      setIsListening(false)
    }
  }, [])

  const startListening = useCallback(() => {
    setError(null)
    const Ctor = getSpeechRecognitionCtor()
    if (Ctor) {
      const rec = new Ctor()
      rec.lang = language
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.onresult = (event: {
        resultIndex: number
        results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
      }) => {
        let interim = ""
        let finals = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]
          const piece = r[0]?.transcript ?? ""
          if (r.isFinal) finals += piece
          else interim += piece
        }
        setInterimTranscript(interim.trimEnd())
        if (finals.trim()) {
          onAppendTextRef.current(finals.trim() + " ")
          setInterimTranscript("")
        }
      }
      rec.onerror = (ev: { error: string; message?: string }) => {
        if (ev.error === "aborted" || ev.error === "no-speech") return
        setError(ev.message || ev.error || "Speech recognition error")
      }
      rec.onend = () => {
        setIsListening(false)
        setInterimTranscript("")
        recognitionRef.current = null
      }
      try {
        recognitionRef.current = rec
        rec.start()
        setIsListening(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start dictation")
      }
      return
    }
    void startFallbackRecording()
  }, [language, startFallbackRecording])

  const toggle = useCallback(() => {
    if (isListening) {
      if (fallbackRecording && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        return
      }
      try {
        recognitionRef.current?.stop()
      } catch {
        /* noop */
      }
      return
    }
    startListening()
  }, [isListening, fallbackRecording, startListening])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        /* noop */
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  return {
    isListening,
    interimTranscript,
    error,
    supported,
    /** Web Speech API vs server transcribe */
    isFallbackMode: fallbackRecording,
    startListening,
    stopListening,
    toggle,
  }
}
