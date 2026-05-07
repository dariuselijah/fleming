"use client"

import { cn } from "@/lib/utils"

type ActivityStatusTone =
  | "neutral"
  | "info"
  | "running"
  | "success"
  | "error"

const toneClassName: Record<ActivityStatusTone, string> = {
  neutral: "border-border/70 bg-transparent text-muted-foreground",
  info: "border-blue-400/30 bg-transparent text-blue-700 dark:text-blue-300",
  running: "border-amber-400/35 bg-transparent text-amber-700 dark:text-amber-300",
  success: "border-emerald-500/30 bg-transparent text-emerald-700 dark:text-emerald-300",
  error: "border-red-400/30 bg-transparent text-red-700 dark:text-red-300",
}

type ActivityStatusChipProps = {
  label: string
  tone?: ActivityStatusTone
  iconOnly?: boolean
  className?: string
}

export function ActivityStatusChip({
  label,
  tone = "neutral",
  iconOnly = false,
  className,
}: ActivityStatusChipProps) {
  if (iconOnly) {
    return (
      <span
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full border",
          toneClassName[tone],
          className
        )}
        aria-label={label}
        title={label}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full bg-current",
            tone === "running" && "animate-pulse"
          )}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
        toneClassName[tone],
        className
      )}
    >
      {tone === "running" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {label}
    </span>
  )
}

