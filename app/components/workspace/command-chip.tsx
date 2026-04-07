"use client"

import type { SlashCommand, CommandCategory } from "@/lib/command-bar/command-registry"
import { cn } from "@/lib/utils"
import { X } from "@phosphor-icons/react"
import { motion } from "motion/react"

const CHIP_COLORS: Record<CommandCategory, string> = {
  clinical: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  search: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  admin: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  files: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  navigation: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
}

export function CommandChip({ command, onRemove }: { command: SlashCommand; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, x: -8 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.85, x: -8 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1",
        CHIP_COLORS[command.category]
      )}
    >
      <span className="text-[11px] font-semibold">{command.trigger}</span>
      <span className="text-[10px] opacity-60">{command.label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="ml-0.5 rounded-sm opacity-50 transition-opacity hover:opacity-100"
        aria-label={`Remove ${command.trigger}`}
      >
        <X className="size-2.5" />
      </button>
    </motion.div>
  )
}
