"use client"

import { useCallback, useMemo, useState } from "react"
import { motion } from "motion/react"
import { ArrowRight, CalendarBlank, Check } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { fetchClient } from "@/lib/fetch"
import { minutesToTimeStr, parseTimeToMinutes } from "@/lib/practice/appointment-hours"
import type { SlotOption } from "./available-slots-card"

export type RescheduleFlowState = {
  appointmentId: string
  patientId: string | null
  patientName: string
  apptDate: string
  startTime: string
  endTime: string
  durationMinutes: number
  providerStaffId: string | null
  service: string | null
}

type RescheduleResponse = { ok?: boolean; error?: string; apptDate?: string; startTime?: string; endTime?: string }

export function RescheduleFlowCard({
  flow,
  newSlot,
  onDismiss,
  onRescheduled,
}: {
  flow: RescheduleFlowState
  newSlot: SlotOption | null
  onDismiss: () => void
  onRescheduled: (res: {
    ok: boolean
    error?: string
    apptDate?: string
    startTime?: string
    endTime?: string
  }) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newEndTime = useMemo(() => {
    if (!newSlot) return ""
    const startMin = parseTimeToMinutes(newSlot.startTime)
    return minutesToTimeStr(startMin + flow.durationMinutes)
  }, [newSlot, flow.durationMinutes])

  const submit = useCallback(async () => {
    if (!newSlot) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetchClient(`/api/practice/appointments/${flow.appointmentId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apptDate: newSlot.date,
          startTime: newSlot.startTime,
          endTime: newEndTime,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as RescheduleResponse
      if (!res.ok || !j.ok) {
        const err = j.error ?? "Could not reschedule"
        setError(err)
        onRescheduled({ ok: false, error: err })
        return
      }
      onRescheduled({
        ok: true,
        apptDate: newSlot.date,
        startTime: newSlot.startTime,
        endTime: newEndTime,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : "Network error"
      setError(err)
      onRescheduled({ ok: false, error: err })
    } finally {
      setSubmitting(false)
    }
  }, [flow.appointmentId, newSlot, newEndTime, onRescheduled])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn("overflow-hidden rounded-2xl", panelSurface)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-panel-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-info/15 text-status-info-foreground dark:text-status-info">
            <CalendarBlank className="size-4" weight="bold" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Reschedule</p>
            <p className="truncate text-[13px] font-semibold tracking-tight text-panel-foreground">{flow.patientName}</p>
            {flow.service ? (
              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{flow.service}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums text-foreground/75">
            {flow.apptDate} {flow.startTime}–{flow.endTime}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/70" />
          {newSlot ? (
            <span className="tabular-nums font-medium text-foreground">
              {newSlot.date} {newSlot.startTime}–{newEndTime}
            </span>
          ) : (
            <span className="text-muted-foreground">Pick a new time in the list above</span>
          )}
        </div>

        {error ? (
          <p className="rounded-xl border border-status-danger/25 bg-status-danger/[0.08] px-3 py-2 text-[11px] text-status-danger-foreground dark:text-status-danger">{error}</p>
        ) : null}

        <button
          type="button"
          disabled={!newSlot || submitting}
          onClick={() => void submit()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[12px] font-semibold transition-all",
            newSlot && !submitting
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground"
          )}
        >
          <Check className="size-4" weight="bold" />
          {submitting ? "Saving…" : "Confirm reschedule"}
        </button>
      </div>
    </motion.div>
  )
}
