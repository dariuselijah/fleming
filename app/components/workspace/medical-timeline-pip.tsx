"use client"

import type { MedicalBlock } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { FileText } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"
import { BLOCK_COLORS, BLOCK_ICONS } from "./medical-block-timeline-styles"

export function MedicalTimelinePip({
  block,
  isLast,
  onPin,
  variant = "default",
}: {
  block: MedicalBlock
  isLast: boolean
  onPin: (blockId: string) => void
  /** Nested rows sit under an accepted cluster — hide duplicate date, tighter layout */
  variant?: "default" | "nested"
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = BLOCK_ICONS[block.type] ?? FileText
  const colorClass = BLOCK_COLORS[block.type] ?? "text-muted-foreground bg-muted"

  const time = new Date(block.timestamp)
  const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const dateStr = time.toLocaleDateString([], { month: "short", day: "numeric" })
  const nested = variant === "nested"

  return (
    <div className={cn("group relative flex gap-3", nested ? "pl-0" : "pl-4")}>
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "z-10 flex shrink-0 items-center justify-center rounded-full border border-border/50 transition-all",
            nested ? "size-6" : "size-7",
            colorClass,
            expanded && "ring-2 ring-indigo-500/30"
          )}
        >
          <Icon className={nested ? "size-3" : "size-3.5"} weight="fill" />
        </button>
        {!isLast && <div className="w-px flex-1 bg-border/40" />}
      </div>

      <div className={cn("min-w-0 flex-1", nested ? "pb-2" : "pb-3")}>
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", nested ? "text-[10px]" : "text-[11px]")}>{timeStr}</span>
          {!nested && <span className="text-[10px] text-muted-foreground">{dateStr}</span>}
        </div>

        <AnimatePresence>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="mt-1.5 rounded-lg border border-border/50 bg-card p-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">{block.title ?? block.type}</h4>
                  <button
                    type="button"
                    onClick={() => onPin(block.id)}
                    className="text-[10px] font-medium text-indigo-500 hover:text-indigo-600"
                  >
                    Pin
                  </button>
                </div>
                {block.summary && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{block.summary}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                      block.status === "active" && "bg-emerald-500/15 text-emerald-600",
                      block.status === "archived" && "bg-muted text-muted-foreground",
                      block.status === "pending_verification" && "bg-amber-500/15 text-amber-600",
                      block.status === "draft" && "bg-blue-500/15 text-blue-600"
                    )}
                  >
                    {block.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-0.5 truncate text-[11px] text-muted-foreground group-hover:text-foreground"
            >
              {block.title ?? block.type}
              {block.summary ? ` — ${block.summary}` : ""}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
