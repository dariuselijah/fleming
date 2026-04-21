"use client"

import { createContext, useContext, type ReactNode } from "react"

interface ScribeContextValue {
  transcribeAudioFile: (file: File) => Promise<void>
  triggerExtraction: () => Promise<void>
  isTranscribing: boolean
  transcriptionError: string | null
  recorderError: string | null
  recorderDuration: number
  isRecording: boolean
  isPaused: boolean
  pauseRecording: () => void
  resumeRecording: () => void
}

const ScribeContext = createContext<ScribeContextValue | null>(null)

export function ScribeProvider({
  value,
  children,
}: {
  value: ScribeContextValue
  children: ReactNode
}) {
  return (
    <ScribeContext.Provider value={value}>{children}</ScribeContext.Provider>
  )
}

export function useScribeContext(): ScribeContextValue | null {
  return useContext(ScribeContext)
}
