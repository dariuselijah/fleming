"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"

export function PaneCanvas({
  children,
  scribeSlot,
}: {
  children: React.ReactNode
  scribeSlot?: React.ReactNode
}) {
  const { documentSheet } = useWorkspace()

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Live scribe transcript — fixed height, pushes chat down */}
      {scribeSlot && (
        <div className="shrink-0">{scribeSlot}</div>
      )}

      {/* Chat stream fills remaining space */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[filter] duration-300",
          documentSheet.isOpen && "brightness-[0.98] saturate-[0.95]"
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
