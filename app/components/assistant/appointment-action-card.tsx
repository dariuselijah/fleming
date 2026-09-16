"use client"

import { motion } from "motion/react"
import { CalendarCheck, XCircle, WarningCircle } from "@phosphor-icons/react"

type Kind = "booked" | "cancelled" | "rescheduled"

type Props = {
  kind: Kind
  title: string
  date?: string
  startTime?: string
  endTime?: string
  patientName?: string
  ok?: boolean
  error?: string
}

const KIND_CHROME: Record<Kind, { icon: React.ReactNode; tint: string; border: string; label: string }> = {
  booked: {
    icon: <CalendarCheck className="size-3.5" weight="fill" />,
    tint: "text-status-success-foreground dark:text-status-success",
    border: "border-status-success/20 bg-status-success/[0.08]",
    label: "Booked",
  },
  cancelled: {
    icon: <XCircle className="size-3.5" weight="fill" />,
    tint: "text-status-danger-foreground dark:text-status-danger",
    border: "border-status-danger/20 bg-status-danger/[0.08]",
    label: "Cancelled",
  },
  rescheduled: {
    icon: <CalendarCheck className="size-3.5" weight="fill" />,
    tint: "text-status-info-foreground dark:text-status-info",
    border: "border-status-info/20 bg-status-info/[0.08]",
    label: "Rescheduled",
  },
}

export function AppointmentActionCard({
  kind,
  title,
  date,
  startTime,
  endTime,
  patientName,
  ok = true,
  error,
}: Props) {
  const chrome = KIND_CHROME[kind]
  if (!ok) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex items-start gap-2 rounded-2xl border border-status-warning/20 bg-status-warning/[0.08] px-3.5 py-2.5"
      >
        <WarningCircle className="mt-0.5 size-3.5 shrink-0 text-status-warning-foreground dark:text-status-warning" weight="fill" />
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-status-warning-foreground dark:text-status-warning">{title}</p>
          {error ? <p className="mt-0.5 text-[11px] text-muted-foreground">{error}</p> : null}
        </div>
      </motion.div>
    )
  }

  const timeLine = [date, startTime && endTime ? `${startTime}–${endTime}` : startTime].filter(Boolean).join(" · ")

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 ${chrome.border}`}
    >
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-background/60 ${chrome.tint}`}>
        {chrome.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${chrome.tint}`}>{chrome.label}</span>
          {patientName ? <span className="truncate text-[12px] font-medium text-foreground/85">{patientName}</span> : null}
        </div>
        {timeLine ? <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{timeLine}</p> : null}
      </div>
    </motion.div>
  )
}
