"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export function RevenueBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "green" | "amber" | "red" | "blue" | "neutral"
}) {
  const cls = {
    green: "bg-emerald-500/15 text-emerald-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-red-500/15 text-red-400",
    blue: "bg-blue-500/15 text-blue-400",
    neutral: "bg-muted text-muted-foreground dark:bg-white/[0.06] dark:text-white/45",
  }[tone]

  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", cls)}>
      {children}
    </span>
  )
}

export function RevenueTable({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border dark:border-white/[0.07]", className)}>
      <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        <table className="w-full text-left text-[11px]">{children}</table>
      </div>
    </div>
  )
}

export function EmptyRevenueState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-5 py-8 text-center dark:border-white/[0.08] dark:bg-white/[0.02]">
      <p className="text-sm font-semibold text-foreground dark:text-white/85">{title}</p>
      <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground dark:text-white/35">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
