"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

export type AssistantOverlayContextValue = {
  suppressedCount: number
  suspend: () => void
  resume: () => void
}

export const AssistantOverlayContext = createContext<AssistantOverlayContextValue | null>(null)

export function AssistantOverlayProvider({ children }: { children: ReactNode }) {
  const [suppressedCount, setSuppressedCount] = useState(0)
  const suspend = useCallback(() => setSuppressedCount((n) => n + 1), [])
  const resume = useCallback(() => setSuppressedCount((n) => Math.max(0, n - 1)), [])
  const value = useMemo(
    () => ({ suppressedCount, suspend, resume }),
    [suppressedCount, suspend, resume]
  )
  return <AssistantOverlayContext.Provider value={value}>{children}</AssistantOverlayContext.Provider>
}

export function useAssistantOverlayOptional() {
  return useContext(AssistantOverlayContext)
}
