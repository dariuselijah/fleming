"use client"

import { tierBadgeClass, tierLabel } from "@/lib/admin/automation-tiers"
import { cn } from "@/lib/utils"
import type { WorkQueueItem, WorkQueueItemType } from "@/lib/admin/work-queue-types"
import {
  CalendarCheck,
  CaretRight,
  ChatText,
  CurrencyDollar,
  Flask,
  Hospital,
  Package,
  Receipt,
  FileArrowUp,
  FileText,
  CheckCircle,
  Stack,
} from "@phosphor-icons/react"

const TYPE_LABEL: Record<WorkQueueItemType, string> = {
  clinical_handoff: "Handoff",
  message: "Message",
  lab: "Lab",
  claim: "Claim",
  claim_group: "Claims",
  claim_followup: "Follow-up",
  invoice: "Billing",
  appointment: "Appt",
  inventory: "Stock",
  import: "Import",
  document: "Alert",
}

const TYPE_STYLE: Record<WorkQueueItemType, { badge: string; border: string }> = {
  clinical_handoff: { badge: "bg-indigo-500/15 text-indigo-300", border: "border-l-indigo-400" },
  message: { badge: "bg-blue-500/15 text-blue-300", border: "border-l-blue-400" },
  lab: { badge: "bg-red-500/15 text-red-300", border: "border-l-red-400" },
  claim: { badge: "bg-amber-500/15 text-amber-300", border: "border-l-amber-400" },
  claim_group: { badge: "bg-amber-500/15 text-amber-300", border: "border-l-amber-400" },
  claim_followup: { badge: "bg-orange-500/15 text-orange-300", border: "border-l-orange-400" },
  invoice: { badge: "bg-emerald-500/15 text-emerald-300", border: "border-l-emerald-400" },
  appointment: { badge: "bg-sky-500/15 text-sky-300", border: "border-l-sky-400" },
  inventory: { badge: "bg-violet-500/15 text-violet-300", border: "border-l-violet-400" },
  import: { badge: "bg-emerald-500/15 text-emerald-300", border: "border-l-emerald-400" },
  document: { badge: "bg-violet-500/15 text-violet-300", border: "border-l-violet-400" },
}

const TYPE_ICON: Record<WorkQueueItemType, typeof ChatText> = {
  clinical_handoff: Hospital,
  message: ChatText,
  lab: Flask,
  claim: Receipt,
  claim_group: Stack,
  claim_followup: Receipt,
  invoice: CurrencyDollar,
  appointment: CalendarCheck,
  inventory: Package,
  import: FileArrowUp,
  document: FileText,
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function initials(name?: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function QueueRow({
  item,
  selected,
  onClick,
  onToggleGroup,
  groupExpanded,
}: {
  item: WorkQueueItem
  selected: boolean
  onClick: () => void
  onToggleGroup?: () => void
  groupExpanded?: boolean
}) {
  const style = TYPE_STYLE[item.type]
  const Icon = TYPE_ICON[item.type]
  const isResolved = item.resolved || item.priority === "resolved"
  const isChild = item.summaryLine.startsWith("↳")
  const isGroup = item.isGroup

  return (
    <div className={cn("flex items-stretch", isChild && "pl-4")}>
      {isGroup && onToggleGroup && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleGroup()
          }}
          className="flex w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={groupExpanded ? "Collapse group" : "Expand group"}
        >
          <CaretRight className={cn("size-3.5 transition-transform", groupExpanded && "rotate-90")} weight="bold" />
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex flex-1 items-start gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors",
          style.border,
          selected ? "bg-secondary/80" : "hover:bg-panel-muted/60",
          isResolved && "opacity-60",
          isGroup && !onToggleGroup && "pl-3"
        )}
      >
        {!isChild && (
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              selected ? "bg-foreground/10 text-foreground" : "bg-panel-muted text-muted-foreground"
            )}
          >
            {isGroup ? <Stack className="size-4" weight="fill" /> : initials(item.patientName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-foreground/90">
              {isChild ? item.summaryLine.replace(/^↳\s*/, "") : (item.patientName ?? "Unknown")}
            </span>
            {!isChild && (
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide", style.badge)}>
                {TYPE_LABEL[item.type]}
              </span>
            )}
            {!isChild && item.automationTier != null && item.automationTier <= 2 && !isResolved && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide",
                  tierBadgeClass(item.automationTier)
                )}
              >
                {tierLabel(item.automationTier)}
              </span>
            )}
            {isResolved && (
              <CheckCircle className="size-3 shrink-0 text-emerald-400" weight="fill" />
            )}
          </div>

          {!isChild && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/75">{item.summaryLine}</p>
          )}

          {item.aiActionLine && !isChild && (
            <p
              className={cn(
                "mt-1 line-clamp-1 text-[10px]",
                isResolved ? "text-emerald-400/80" : "text-muted-foreground"
              )}
            >
              {item.aiActionLine}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          <span className="text-[9px] tabular-nums text-muted-foreground">{formatTimeAgo(item.timestamp)}</span>
          <Icon className="size-3.5 text-muted-foreground/50" weight={selected ? "fill" : "regular"} />
        </div>
      </button>
    </div>
  )
}
