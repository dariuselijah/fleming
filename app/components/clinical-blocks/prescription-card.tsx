"use client"

import type { PrescriptionItem } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Pill, Check, X, CheckCircle } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useMemo, useState } from "react"

type RowStatus = "pending" | "accepted" | "rejected"

function joinParts(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" · ")
}

export function PrescriptionCard({ items }: { items: PrescriptionItem[] }) {
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})

  const setStatus = useCallback((id: string, next: RowStatus) => {
    setRowStatus((prev) => ({ ...prev, [id]: next }))
  }, [])

  const { visibleCount, acceptedCount } = useMemo(() => {
    let visible = 0
    let accepted = 0
    for (const row of items) {
      const st = rowStatus[row.id] ?? "pending"
      if (st !== "rejected") visible++
      if (st === "accepted") accepted++
    }
    return { visibleCount: visible, acceptedCount: accepted }
  }, [items, rowStatus])

  const allConfirmed = acceptedCount > 0 && acceptedCount === visibleCount

  if (items.length === 0 || visibleCount === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="w-full overflow-hidden rounded-xl border border-sky-500/20 bg-background shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10">
            <Pill className="size-[14px] text-sky-600 dark:text-sky-400" weight="duotone" />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold leading-tight">Prescription</h4>
            <p className="text-[10px] text-muted-foreground">
              {visibleCount} item{visibleCount !== 1 ? "s" : ""}
              {acceptedCount > 0 && <> · <span className="text-emerald-600 dark:text-emerald-400">{acceptedCount} confirmed</span></>}
            </p>
          </div>
        </div>
        <AnimatePresence>
          {allConfirmed && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle className="size-3" weight="fill" />
              All confirmed
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <ul>
        {items.map((row, idx) => {
          const st = rowStatus[row.id] ?? "pending"
          if (st === "rejected") return null
          const detail = joinParts([
            row.strength,
            row.route,
            row.frequency,
            row.duration,
          ])
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-2.5 border-b border-border/10 px-3 py-1.5 last:border-b-0",
                st === "accepted" && "bg-emerald-500/[0.04]"
              )}
            >
              <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-semibold text-foreground">{row.drug}</span>
                  {detail && (
                    <span className="truncate text-[11px] text-muted-foreground">{detail}</span>
                  )}
                </div>
                {row.instructions && (
                  <p className="truncate text-[10px] leading-snug text-muted-foreground/70">
                    — {row.instructions}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setStatus(row.id, st === "accepted" ? "pending" : "accepted")
                  }
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded transition-colors",
                    st === "accepted"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/40 hover:bg-muted hover:text-emerald-600"
                  )}
                  aria-label="Accept line"
                >
                  <Check className="size-3" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(row.id, "rejected")}
                  className="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-600"
                  aria-label="Reject line"
                >
                  <X className="size-3" weight="bold" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </motion.div>
  )
}
