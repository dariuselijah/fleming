"use client"

import { cn } from "@/lib/utils"

type ActivityStatusTone =
  | "neutral"
  | "info"
  | "running"
  | "success"
  | "error"

const toneClassName: Record<ActivityStatusTone, string> = {
  neutral: "border-border/70 bg-background text-muted-foreground",
  info: "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  running: "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  error: "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300",
}

type ActivityStatusChipProps = {
  label: string
  tone?: ActivityStatusTone
  className?: string
}

export function ActivityStatusChip({
  label,
  tone = "neutral",
  className,
}: ActivityStatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        toneClassName[tone],
        className
      )}
    >
      {label}
    </span>
  )
}

