"use client"

import { useCashDrawer } from "@/lib/billing/use-cash-drawer"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { cn } from "@/lib/utils"
import { CashRegister } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { CashDrawerPopover } from "./cash-drawer-popover"

export function CashDrawerRailButton() {
  const { practiceId } = usePracticeCrypto()
  const { open, lastClosedVarianceFlagged } = useCashDrawer()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPopoverOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  if (!practiceId) return null

  const dotClass = open
    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
    : lastClosedVarianceFlagged
      ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
      : "bg-muted-foreground/40"

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        title="Cash drawer"
        onClick={() => setPopoverOpen((o) => !o)}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-xl transition-all",
          popoverOpen ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-panel-muted hover:text-accent-foreground/70"
        )}
      >
        <CashRegister className="size-[18px]" weight={popoverOpen || open ? "fill" : "regular"} />
        <span className={cn("absolute -right-0.5 -top-0.5 size-2 rounded-full", dotClass)} />
      </button>

      <AnimatePresence>
        {popoverOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-1/2 z-[100] mb-2 -translate-x-1/2"
          >
            <CashDrawerPopover />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
