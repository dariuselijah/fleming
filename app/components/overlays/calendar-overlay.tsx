"use client"

import {
  useWorkspace,
  createPatientSession,
} from "@/lib/clinical-workspace"
import type {
  AppointmentStatus,
  ConsultStatus,
  PracticeAppointment,
  PracticePatient,
} from "@/lib/clinical-workspace"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  X,
  Calendar,
  CaretLeft,
  CaretRight,
  Clock,
  UserCircle,
  MagnifyingGlass,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function appointmentTimestamp(a: PracticeAppointment): number {
  const t =
    a.startTime.length >= 5 ? a.startTime.slice(0, 5) : a.startTime
  const ms = Date.parse(`${a.date}T${t}:00`)
  return Number.isNaN(ms) ? 0 : ms
}

function formatClockLabel(startTime: string): string {
  if (startTime.length >= 5) return startTime.slice(0, 5)
  return startTime
}

function mapAppointmentToConsultStatus(
  status: AppointmentStatus
): ConsultStatus {
  switch (status) {
    case "checked_in":
      return "checked_in"
    case "in_progress":
      return "scribing"
    case "completed":
      return "finished"
    case "no_show":
      return "no_show"
    case "cancelled":
      return "waiting"
    default:
      return "waiting"
  }
}

const APPT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  booked: "bg-muted text-muted-foreground",
  confirmed: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  checked_in: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_progress: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  no_show: "bg-red-500/15 text-red-600 dark:text-red-400",
  cancelled: "bg-muted/80 text-muted-foreground line-through",
}

const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  no_show: "No show",
  cancelled: "Cancelled",
}

function sessionFieldsFromPracticePatient(pt: PracticePatient) {
  return {
    age: pt.age,
    sex: pt.sex,
    medicalAidStatus:
      pt.medicalAidStatus === "verified"
        ? ("active" as const)
        : pt.medicalAidStatus === "terminated"
          ? ("inactive" as const)
          : pt.medicalAidStatus,
    medicalAidScheme: pt.medicalAidScheme,
    memberNumber: pt.memberNumber,
    chronicConditions: pt.chronicConditions ?? [],
    criticalAllergies: pt.allergies ?? [],
    activeMedications: pt.currentMedications ?? [],
  }
}

function patientMatchesQuery(p: PracticePatient, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return false
  const parts = [
    p.name,
    p.idNumber,
    p.memberNumber,
    p.phone,
    p.email,
    p.medicalAidScheme,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return parts.includes(s) || parts.split(/\s+/).some((w) => w.startsWith(s))
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

export function CalendarOverlay({ onClose }: { onClose: () => void }) {
  const { openPatient, patients, appointments } = useWorkspace()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const ymd = useMemo(() => localYmd(selectedDate), [selectedDate])

  const dateStr = selectedDate.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  const dayAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.date === ymd && a.status !== "cancelled")
      .slice()
      .sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b))
  }, [appointments, ymd])

  const recentAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.status !== "cancelled")
      .slice()
      .sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a))
      .slice(0, 14)
  }, [appointments])

  const searchResults = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    return patients
      .filter((p) => patientMatchesQuery(p, q))
      .slice(0, 24)
  }, [patients, search])

  const openFromPracticePatient = useCallback(
    (pt: PracticePatient) => {
      openPatient(
        createPatientSession({
          patientId: pt.id,
          name: pt.name,
          ...sessionFieldsFromPracticePatient(pt),
          status: "waiting",
        })
      )
      onClose()
    },
    [openPatient, onClose]
  )

  const openFromAppointment = useCallback(
    (apt: PracticeAppointment) => {
      const pt = patients.find((p) => p.id === apt.patientId)
      if (pt) {
        openPatient(
          createPatientSession({
            patientId: pt.id,
            name: pt.name,
            ...sessionFieldsFromPracticePatient(pt),
            appointmentReason: apt.reason ?? apt.service,
            status: mapAppointmentToConsultStatus(apt.status),
          })
        )
      } else {
        openPatient(
          createPatientSession({
            patientId: apt.patientId,
            name: apt.patientName,
            appointmentReason: apt.reason ?? apt.service,
            status: mapAppointmentToConsultStatus(apt.status),
          })
        )
      }
      onClose()
    },
    [openPatient, onClose, patients]
  )

  const prevDay = () =>
    setSelectedDate((d) => {
      const next = new Date(d)
      next.setDate(next.getDate() - 1)
      return next
    })

  const nextDay = () =>
    setSelectedDate((d) => {
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      return next
    })

  const shortDate = (dateIso: string) => {
    const [y, m, d] = dateIso.split("-").map(Number)
    if (!y || !m || !d) return dateIso
    return new Date(y, m - 1, d).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
  }

  return (
    <motion.div
      initial={{ y: "-100%" }}
      animate={{ y: 0 }}
      exit={{ y: "-100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <Calendar className="size-5 text-indigo-500" weight="fill" />
          <div>
            <h2 className="text-lg font-semibold leading-tight">Open patient</h2>
            <p className="text-xs text-muted-foreground">
              Search your directory or open from the schedule
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="shrink-0 border-b border-border/30 px-6 py-3">
        <div className="relative mx-auto max-w-2xl">
          <MagnifyingGlass
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            weight="bold"
          />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients by name, ID, member number, phone…"
            className="h-10 border-border/60 bg-muted/30 pl-9 pr-3 text-sm"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-6 py-3">
        <button
          type="button"
          onClick={prevDay}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CaretLeft className="size-4" />
        </button>
        <h3 className="text-sm font-medium">{dateStr}</h3>
        <button
          type="button"
          onClick={nextDay}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CaretRight className="size-4" />
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="mx-auto max-w-2xl space-y-8">
          {search.trim() ? (
            <section>
              <SectionTitle>Matching patients</SectionTitle>
              {searchResults.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  No patients match “{search.trim()}”. Add patients in Admin →
                  Patients, or fix the spelling.
                </p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((pt) => (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => openFromPracticePatient(pt)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-indigo-500/30 hover:shadow-sm"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserCircle className="size-6 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold">{pt.name}</span>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[pt.medicalAidScheme, pt.memberNumber, pt.phone]
                            .filter(Boolean)
                            .join(" · ") || "Practice patient"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section>
            <SectionTitle>Schedule for this day</SectionTitle>
            {dayAppointments.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No appointments on this day. Use Admin → Calendar to book, or
                search for a patient above.
              </p>
            ) : (
              <div className="space-y-2">
                {dayAppointments.map((apt) => (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => openFromAppointment(apt)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-indigo-500/30 hover:shadow-sm"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserCircle className="size-6 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {apt.patientName}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            APPT_STATUS_BADGE[apt.status]
                          )}
                        >
                          {APPT_STATUS_LABEL[apt.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {apt.reason || apt.service || "Visit"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" />
                      <span className="text-xs font-medium">
                        {formatClockLabel(apt.startTime)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle>Recent & upcoming</SectionTitle>
            {recentAppointments.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                No appointments in your practice yet. Create them in Admin →
                Calendar.
              </p>
            ) : (
              <div className="space-y-2">
                {recentAppointments.map((apt) => (
                  <button
                    key={`recent-${apt.id}`}
                    type="button"
                    onClick={() => openFromAppointment(apt)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-indigo-500/30 hover:shadow-sm"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserCircle className="size-6 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {apt.patientName}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                            APPT_STATUS_BADGE[apt.status]
                          )}
                        >
                          {APPT_STATUS_LABEL[apt.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {apt.reason || apt.service || "Visit"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-muted-foreground">
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {shortDate(apt.date)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        <span className="text-xs font-medium">
                          {formatClockLabel(apt.startTime)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </motion.div>
  )
}
