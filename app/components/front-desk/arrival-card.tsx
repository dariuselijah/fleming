"use client"

import type { PracticeFlowEntry, ConsultStatus } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  UserCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Hourglass,
  Microphone,
  FileText,
  Receipt,
  XCircle,
} from "@phosphor-icons/react"
import { useState, useCallback } from "react"
import { EligibilityCard } from "./eligibility-card"

const STATUS_CONFIG: Record<
  ConsultStatus,
  { label: string; color: string; icon: React.ComponentType<any>; progress: number }
> = {
  waiting: { label: "Waiting", color: "text-amber-600 bg-amber-500/10", icon: Hourglass, progress: 0 },
  checked_in: { label: "Checked In", color: "text-blue-600 bg-blue-500/10", icon: CheckCircle, progress: 20 },
  scribing: { label: "In Consult", color: "text-indigo-600 bg-indigo-500/10", icon: Microphone, progress: 40 },
  reviewing: { label: "Reviewing", color: "text-purple-600 bg-purple-500/10", icon: FileText, progress: 60 },
  billing: { label: "Billing", color: "text-emerald-600 bg-emerald-500/10", icon: Receipt, progress: 80 },
  finished: { label: "Finished", color: "text-muted-foreground bg-muted", icon: CheckCircle, progress: 100 },
  no_show: { label: "No Show", color: "text-red-600 bg-red-500/10", icon: XCircle, progress: 0 },
}

export function ArrivalCard({
  entry,
  onOpen,
}: {
  entry: PracticeFlowEntry
  onOpen: () => void
}) {
  const [showEligibility, setShowEligibility] = useState(false)
  const config = STATUS_CONFIG[entry.status]
  const StatusIcon = config.icon

  const timeStr = entry.appointmentTime
    ? entry.appointmentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—"

  const handleVerify = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowEligibility(!showEligibility)
  }, [showEligibility])

  return (
    <div className="rounded-2xl border border-border/50 bg-card transition-all hover:border-indigo-500/20 hover:shadow-sm">
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserCircle className="size-7 text-muted-foreground" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{entry.patientName}</h3>
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                config.color
              )}
            >
              <StatusIcon className="size-3" weight="fill" />
              {config.label}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {timeStr}
            </span>
            {entry.roomNumber && (
              <span>Room {entry.roomNumber}</span>
            )}
            {entry.checkInTime && (
              <span>
                Checked in {entry.checkInTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                config.progress === 100
                  ? "bg-emerald-500"
                  : config.progress > 0
                    ? "bg-indigo-500"
                    : "bg-amber-500"
              )}
              style={{ width: `${Math.max(config.progress, 5)}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleVerify}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
              showEligibility
                ? "bg-emerald-500/15 text-emerald-600"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-label="Verify eligibility"
          >
            <ShieldCheck className="size-4" />
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700"
            aria-label="Open patient"
          >
            <ArrowRight className="size-4" weight="bold" />
          </button>
        </div>
      </div>

      {/* Eligibility check */}
      {showEligibility && (
        <div className="border-t border-border/30 px-4 py-3">
          <EligibilityCard patientName={entry.patientName} />
        </div>
      )}
    </div>
  )
}
