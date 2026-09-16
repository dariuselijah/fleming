"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { CalendarBlank, Clock, CheckCircle } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { formatSearchWindowFooter } from "@/lib/practice/calendar-date-display"

export type SlotOption = {
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  providerStaffId?: string | null
}

type Props = {
  slots: SlotOption[]
  durationMinutes?: number
  windowFrom?: string
  windowTo?: string
  onPick: (slot: SlotOption) => void
  /** Optional — when provided, shows "for <patient>" so the card stands on its own. */
  patientName?: string
  /** Pending slot key while the follow-up request is streaming so we can render the selected state. */
  pendingKey?: string | null
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

function formatDayHeading(iso: string): { weekday: string; long: string; short: string } {
  const d = new Date(`${iso}T00:00:00Z`)
  const weekday = DAY_LABELS[d.getUTCDay()] ?? ""
  const month = MONTH_LABELS[d.getUTCMonth()] ?? ""
  const day = d.getUTCDate()
  return {
    weekday,
    long: `${weekday}, ${month} ${day}`,
    short: `${weekday}, ${month.slice(0, 3)} ${day}`,
  }
}

function formatTimeDisplay(hhmm: string): string {
  const [h, m] = hhmm.split(":")
  return `${h}:${m}`
}

function slotKey(s: SlotOption): string {
  return `${s.date}T${s.startTime}`
}

export function AvailableSlotsCard({
  slots,
  durationMinutes,
  windowFrom,
  windowTo,
  onPick,
  patientName,
  pendingKey,
}: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, SlotOption[]>()
    for (const s of slots) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  }, [slots])

  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingKey) return
    const hit = slots.find((s) => slotKey(s) === pendingKey)
    if (hit) setExpandedDate(hit.date)
  }, [pendingKey, slots])

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-panel-border bg-panel px-4 py-3 text-[12.5px] text-muted-foreground">
        No open slots in this window.
      </div>
    )
  }

  const dur = durationMinutes ?? slots[0]?.durationMinutes ?? 30

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn("overflow-hidden rounded-2xl", panelSurface)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-panel-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CalendarBlank className="size-3.5" weight="regular" />
          <span className="font-medium text-foreground/80">
            Available times
            {patientName ? <span className="text-muted-foreground"> · {patientName}</span> : null}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Clock className="size-3" />
          {dur} min
        </span>
      </div>

      <div className="divide-y divide-panel-border">
        {grouped.map(([date, daySlots]) => {
          const heading = formatDayHeading(date)
          const isExpanded = expandedDate === date
          const visible = isExpanded ? daySlots : daySlots.slice(0, 6)
          const hiddenCount = daySlots.length - visible.length
          return (
            <div key={date} className="px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-medium tracking-[0.02em] text-foreground/75">
                  {heading.long}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {daySlots.length} open
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((slot) => {
                  const key = slotKey(slot)
                  const isPending = pendingKey === key
                  return (
                    <motion.button
                      key={key}
                      type="button"
                      disabled={isPending}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setExpandedDate(date)
                        onPick(slot)
                      }}
                      className={cn(
                        "group relative flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium tracking-tight transition-all",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        isPending
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-panel-border bg-panel text-foreground/80 hover:bg-panel-muted hover:text-foreground"
                      )}
                    >
                      <span className="tabular-nums">{formatTimeDisplay(slot.startTime)}</span>
                      <span className={cn("text-[10px]", isPending ? "text-primary-foreground/65" : "text-muted-foreground group-hover:text-foreground/65")}>
                        {formatTimeDisplay(slot.endTime)}
                      </span>
                      {isPending ? <CheckCircle className="size-3" weight="fill" /> : null}
                    </motion.button>
                  )
                })}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedDate(date)}
                    className="h-7 rounded-full px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    +{hiddenCount} more
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {windowFrom && windowTo ? (
        <div className="border-t border-panel-border bg-panel-muted/60 px-4 py-1.5 text-[10px] tracking-wide text-muted-foreground">
          {formatSearchWindowFooter(windowFrom, windowTo)}
        </div>
      ) : null}
    </motion.div>
  )
}
