"use client"

import { useEffect } from "react"
import { useAssistantOverlayOptional } from "./assistant-overlay-context"

/** Mount at the top of a full-screen modal so the floating assistant minimizes and does not cover modal footers. */
export function AssistantModalSuppressor() {
  const ctx = useAssistantOverlayOptional()
  useEffect(() => {
    if (!ctx) return
    ctx.suspend()
    return () => ctx.resume()
  }, [ctx])
  return null
}
