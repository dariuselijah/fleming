"use client"

import { cn } from "@/lib/utils"
import { Check, Hospital, SpinnerGap } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

type Phase = "idle" | "loading" | "success"

export function SendToFrontDeskButton({
  onSend,
  className,
  size = "md",
  variant = "primary",
  label = "Send to Front Desk",
  successLabel = "Sent",
}: {
  onSend: () => void | Promise<void>
  className?: string
  size?: "sm" | "md"
  variant?: "primary" | "outline"
  label?: string
  successLabel?: string
}) {
  const [phase, setPhase] = useState<Phase>("idle")
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const handleClick = useCallback(async () => {
    if (phase !== "idle") return
    setPhase("loading")
    try {
      await onSend()
      setPhase("success")
      if (resetTimer.current) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setPhase("idle"), 2600)
    } catch {
      setPhase("idle")
    }
  }, [onSend, phase])

  const sizeClass =
    size === "sm"
      ? "h-8 gap-1.5 px-3 text-[11px]"
      : "h-9 gap-1.5 px-4 text-[12px]"

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={phase === "loading"}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold transition-[background-color,box-shadow,transform] duration-300 ease-out",
        sizeClass,
        phase === "success" &&
          "scale-[1.02] bg-emerald-600 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.55)]",
        phase === "loading" && "opacity-90",
        phase === "idle" &&
          variant === "primary" &&
          "bg-slate-900 text-white hover:scale-[1.02] hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
        phase === "idle" &&
          variant === "outline" &&
          "border border-border/50 bg-background text-foreground hover:bg-muted",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === "success" ? (
          <motion.span
            key="success"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-1.5"
          >
            <motion.span
              initial={{ scale: 0, rotate: -48 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 520,
                damping: 26,
                delay: 0.04,
              }}
              className="flex size-[18px] items-center justify-center rounded-full bg-white/25 ring-1 ring-white/30"
            >
              <Check className="size-3" weight="bold" />
            </motion.span>
            {successLabel}
          </motion.span>
        ) : phase === "loading" ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            <SpinnerGap className="size-3.5 animate-spin" />
            Sending…
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1.5"
          >
            <Hospital className="size-3.5" />
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
