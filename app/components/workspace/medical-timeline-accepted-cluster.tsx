"use client"

import type { MedicalBlock } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { CaretDown, CheckCircle } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { MedicalTimelinePip } from "./medical-timeline-pip"

export function MedicalTimelineAcceptedCluster({
  category,
  blocks,
  onPin,
}: {
  category: string
  blocks: MedicalBlock[]
  onPin: (blockId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const count = blocks.length

  return (
    <div className="group/cluster relative flex gap-3 pl-4">
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-emerald-500/10 text-emerald-600 transition-all hover:bg-emerald-500/15 dark:text-emerald-400",
            open && "ring-2 ring-emerald-500/25"
          )}
          aria-expanded={open}
        >
          <CheckCircle className="size-3.5" weight="fill" />
        </button>
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-foreground">Accepted</span>
              <span className="rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                {category}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {count} update{count === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {open ? "Hide details" : "Show individual entries"}
            </p>
          </div>
          <CaretDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-0 border-l-2 border-border/50 pl-3">
                {blocks.map((block, idx) => (
                  <MedicalTimelinePip
                    key={block.id}
                    block={block}
                    isLast={idx === blocks.length - 1}
                    onPin={onPin}
                    variant="nested"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
