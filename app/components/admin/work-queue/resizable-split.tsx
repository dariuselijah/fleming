"use client"

import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"

export function ResizableSplit({
  left,
  right,
  width,
  onWidthChange,
  minWidth = 300,
  maxWidth = 560,
  className,
}: {
  left: React.ReactNode
  right: React.ReactNode
  width: number
  onWidthChange: (w: number) => void
  minWidth?: number
  maxWidth?: number
  className?: string
}) {
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(width)
  const [hovering, setHovering] = useState(false)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      onWidthChange(Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta)))
    },
    [maxWidth, minWidth, onWidthChange]
  )

  const onPointerUp = useCallback(() => {
    dragging.current = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }, [])

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden", className)}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{left}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        onPointerDown={(e) => {
          dragging.current = true
          startX.current = e.clientX
          startWidth.current = width
          document.body.style.cursor = "col-resize"
          document.body.style.userSelect = "none"
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        className={cn(
          "relative z-10 w-1 shrink-0 cursor-col-resize touch-none transition-colors",
          hovering || dragging.current ? "bg-foreground/20" : "bg-border/60 dark:bg-panel-border"
        )}
      />
      <div
        className="flex shrink-0 flex-col overflow-hidden border-l border-border/60 dark:border-panel-border"
        style={{ width }}
      >
        {right}
      </div>
    </div>
  )
}
