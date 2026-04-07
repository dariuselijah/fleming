"use client"

import type { MedicalBlock } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Flask, ArrowUp, ArrowDown, Minus, Warning } from "@phosphor-icons/react"

interface LabResult {
  name: string
  value: number | string
  unit: string
  referenceRange: string
  status: "normal" | "high" | "low" | "critical"
}

function parseLabResults(block: MedicalBlock): LabResult[] {
  const results = (block.metadata as any)?.results
  if (!Array.isArray(results)) return []
  return results as LabResult[]
}

const STATUS_CONFIG = {
  normal: { icon: Minus, color: "text-emerald-600 dark:text-emerald-400", bg: "" },
  high: { icon: ArrowUp, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/5" },
  low: { icon: ArrowDown, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/5" },
  critical: { icon: Warning, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/5" },
}

export function LabBlock({ block }: { block: MedicalBlock }) {
  const results = parseLabResults(block)
  const hasCritical = results.some((r) => r.status === "critical")

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-sm",
        hasCritical ? "border-red-500/30" : "border-border/50"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-3">
        <Flask className="size-4 text-purple-500" weight="fill" />
        <h4 className="text-xs font-semibold">{block.title ?? "Lab Results"}</h4>
        <span className="text-[10px] text-muted-foreground">
          {new Date(block.timestamp).toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
        {hasCritical && (
          <span className="ml-auto rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            Critical
          </span>
        )}
      </div>

      <div className="divide-y divide-border/20">
        {results.map((result, i) => {
          const config = STATUS_CONFIG[result.status]
          const StatusIcon = config.icon
          return (
            <div
              key={`${result.name}-${i}`}
              className={cn("flex items-center justify-between px-4 py-2.5", config.bg)}
            >
              <span className="text-xs font-medium">{result.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">{result.referenceRange}</span>
                <div className={cn("flex items-center gap-1", config.color)}>
                  <span className="text-sm font-bold tabular-nums">{result.value}</span>
                  <span className="text-[10px]">{result.unit}</span>
                  <StatusIcon className="size-3" weight="bold" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {results.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">{block.summary ?? "No results parsed"}</p>
        </div>
      )}
    </div>
  )
}
