"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { ArrowRight, CheckCircle, ChatDots, Phone, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { fetchClient } from "@/lib/fetch"
import { formatDayHeadingLong } from "@/lib/practice/calendar-date-display"

type Sent = {
  ok: true
  sent: true
  phoneMasked?: string
  patientName?: string | null
  apptDate?: string
  startTime?: string
}

type NeedsPhone = {
  ok: false
  needsPhone: true
  appointmentId: string
  patientId: string
  patientName: string
  apptDate: string
  startTime: string
  service?: string | null
  error?: string
}

type Failed = {
  ok: false
  needsPhone?: false
  error?: string
}

export type ReminderResult = Sent | NeedsPhone | Failed

type RetryResponse = {
  ok?: boolean
  needsPhone?: boolean
  phoneMasked?: string
  error?: string
  apptDate?: string
  startTime?: string
  patientId?: string
}

const PHONE_PATTERN = /^\+?[\d\s()-]{7,}$/

function timeShort(t: string | undefined): string {
  if (!t) return ""
  return t.slice(0, 5)
}

/** Single Anthropic-style card that renders either the sent confirmation,
 *  the "needs phone" prompt with inline input, or a generic failure. */
export function ReminderResultCard({
  result,
  patientName: fallbackPatientName,
}: {
  result: ReminderResult
  patientName?: string | null
}) {
  const [sent, setSent] = useState<Sent | null>(
    result.ok ? (result as Sent) : null
  )
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const needsPhone = !sent && !result.ok && "needsPhone" in result && result.needsPhone

  const appointmentId = needsPhone ? (result as NeedsPhone).appointmentId : undefined
  const patientName = sent?.patientName ?? (needsPhone ? (result as NeedsPhone).patientName : null) ?? fallbackPatientName ?? null
  const apptDate = sent?.apptDate ?? (needsPhone ? (result as NeedsPhone).apptDate : undefined)
  const startTime = sent?.startTime ?? (needsPhone ? (result as NeedsPhone).startTime : undefined)

  const timeLine = useMemo(() => {
    if (!apptDate) return ""
    const d = formatDayHeadingLong(apptDate)
    const t = timeShort(startTime)
    return t ? `${d} · ${t}` : d
  }, [apptDate, startTime])

  const canSubmit = PHONE_PATTERN.test(phone.trim())

  const onSend = useCallback(async () => {
    if (!appointmentId) return
    if (!canSubmit) {
      setErr("Enter a valid phone number.")
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetchClient(
        `/api/practice/appointments/${appointmentId}/reminder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneE164: phone.trim() }),
        }
      )
      const j = (await res.json().catch(() => ({}))) as RetryResponse
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "Couldn't send the reminder.")
        return
      }
      setSent({
        ok: true,
        sent: true,
        phoneMasked: j.phoneMasked,
        patientName: patientName ?? undefined,
        apptDate: j.apptDate ?? apptDate,
        startTime: j.startTime ?? startTime,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error")
    } finally {
      setSaving(false)
    }
  }, [appointmentId, canSubmit, phone, patientName, apptDate, startTime])

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3 rounded-2xl border border-status-success/20 bg-status-success/[0.08] px-3.5 py-2.5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background/60 text-status-success-foreground dark:text-status-success">
          <CheckCircle className="size-3.5" weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-success-foreground dark:text-status-success">
              Reminder sent
            </span>
            {patientName ? (
              <span className="truncate text-[12px] font-medium text-foreground/85">
                {patientName}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {[timeLine, sent.phoneMasked].filter(Boolean).join(" · ")}
          </p>
        </div>
      </motion.div>
    )
  }

  if (needsPhone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn("overflow-hidden rounded-2xl", panelSurface)}
      >
        <div className="flex items-start gap-3 px-3.5 pt-3 pb-1.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-status-warning/15 text-status-warning-foreground dark:text-status-warning">
            <Phone className="size-3.5" weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-warning-foreground dark:text-status-warning">
                Phone needed
              </span>
              {patientName ? (
                <span className="truncate text-[12px] font-medium text-foreground/85">
                  {patientName}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              No phone on file{timeLine ? ` for ${timeLine}` : ""}. Add a mobile number to send the SMS reminder.
            </p>
          </div>
        </div>

        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            void onSend()
          }}
          className="flex items-stretch gap-1.5 px-3.5 pb-3 pt-2"
        >
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:border-ring">
            <ChatDots className="size-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              autoFocus
              type="tel"
              value={phone}
              onChange={(ev) => {
                setPhone(ev.target.value)
                if (err) setErr(null)
              }}
              placeholder="e.g. 082 123 4567"
              className="h-8 w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11.5px] font-medium transition-colors",
              canSubmit && !saving
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            )}
          >
            {saving ? "Sending…" : "Send"}
            {!saving ? <ArrowRight className="size-3.5" weight="bold" /> : null}
          </button>
        </form>

        {err ? (
          <p className="flex items-center gap-1.5 border-t border-panel-border bg-status-danger/[0.08] px-3.5 py-1.5 text-[11px] text-status-danger-foreground dark:text-status-danger">
            <X className="size-3" weight="bold" />
            {err}
          </p>
        ) : null}
      </motion.div>
    )
  }

  const failed = result as Failed
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-2 rounded-2xl border border-status-warning/20 bg-status-warning/[0.08] px-3.5 py-2.5"
    >
      <Phone className="mt-0.5 size-3.5 shrink-0 text-status-warning-foreground dark:text-status-warning" weight="fill" />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-status-warning-foreground dark:text-status-warning">Couldn&apos;t send reminder</p>
        {failed.error ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{failed.error}</p>
        ) : null}
      </div>
    </motion.div>
  )
}
