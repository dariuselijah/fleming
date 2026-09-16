"use client"

import {
  useWorkspace,
  createPatientSession,
  useWorkspaceStore,
  fetchPracticeClaimsForWorkspace,
} from "@/lib/clinical-workspace"
import type {
  PracticeAppointment,
  PracticePatient,
  AppointmentStatus,
  PaymentType,
  AppointmentClaimDraftLine,
  ClaimLine,
  ClaimLineType,
} from "@/lib/clinical-workspace"
import { fetchClient } from "@/lib/fetch"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { cn } from "@/lib/utils"
import {
  UserCircle,
  ShieldCheck,
  Plus,
  X,
  Stethoscope,
  Tag,
  CaretLeft,
  CaretRight,
  CalendarBlank,
  Trash,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useMemo, useState, useRef, useEffect } from "react"
import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import {
  clampStartTime,
  dayViewSlotStarts,
  resolveDayBounds,
  validHourValues,
  validMinuteValues,
} from "@/lib/practice/appointment-hours"
import { SERVICE_CATALOG } from "@/lib/practice/service-catalog"
import { AssistantModalSuppressor } from "@/app/components/assistant/assistant-modal-suppressor"
import { requestAppointmentsRefresh } from "@/lib/clinical-workspace/appointments-refresh-bus"
import { toast } from "sonner"

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  booked: "border-l-white/20",
  confirmed: "border-l-cyan-500",
  checked_in: "border-l-blue-500",
  in_progress: "border-l-indigo-500",
  completed: "border-l-[status-success]",
  no_show: "border-l-[status-danger]",
  cancelled: "border-l-white/10",
}

const STATUS_DOT: Record<AppointmentStatus, string> = {
  booked: "bg-secondary",
  confirmed: "bg-cyan-500",
  checked_in: "bg-blue-500",
  in_progress: "bg-indigo-500",
  completed: "bg-status-success",
  no_show: "bg-status-danger",
  cancelled: "bg-secondary",
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  in_progress: "In Progress",
  completed: "Completed",
  no_show: "No Show",
  cancelled: "Cancelled",
}

type ViewMode = "day" | "week"

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - ((day + 6) % 7))
  return r
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const rows: (Date | null)[][] = []
  let current = 1 - offset
  for (let w = 0; w < 6; w++) {
    const row: (Date | null)[] = []
    for (let d = 0; d < 7; d++) {
      if (current >= 1 && current <= daysInMonth) {
        row.push(new Date(year, month, current))
      } else {
        row.push(null)
      }
      current++
    }
    if (row.every((c) => c === null)) break
    rows.push(row)
  }
  return rows
}

function timeStr(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

/** Match appointment to a day-view cell (per-provider column). Unassigned visits show in the first column only. */
function appointmentForDayCell(
  dayAppointments: PracticeAppointment[],
  colId: string,
  columns: { id: string }[],
  hour: number,
  minute: number
): PracticeAppointment | undefined {
  return dayAppointments.find((a) => {
    if (a.hour !== hour || a.minute !== minute) return false
    if (a.providerId === colId) return true
    if (!a.providerId && columns[0]?.id === colId) return true
    return false
  })
}

export function BentoCalendar() {
  const {
    openPatient,
    setMode,
    setAdminTab,
    patients,
    appointments,
    addAppointment,
    updateAppointment,
    practiceProviders,
    practiceHours,
    selectedDate,
    setSelectedDate,
  } = useWorkspace()

  const [viewMode, setViewMode] = useState<ViewMode>("day")
  const [selected, setSelected] = useState<PracticeAppointment | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const { practiceId } = usePracticeCrypto()

  const calendarFocusRequest = useWorkspaceStore((s) => s.calendarFocusRequest)
  const calendarHiddenProviderIds = useWorkspaceStore((s) => s.calendarHiddenProviderIds)
  const lastCalendarFocusNonce = useRef(0)

  const currentDate = parseDate(selectedDate)

  useEffect(() => {
    if (calendarFocusRequest.nonce <= lastCalendarFocusNonce.current) return
    if (!calendarFocusRequest.appointmentId) return
    lastCalendarFocusNonce.current = calendarFocusRequest.nonce
    const appt = appointments.find((a) => a.id === calendarFocusRequest.appointmentId)
    if (!appt) return
    setSelectedDate(appt.date)
    setSelected(appt)
  }, [calendarFocusRequest, appointments, setSelectedDate])

  const visibleProviders = useMemo(
    () => practiceProviders.filter((p) => !calendarHiddenProviderIds.includes(p.id)),
    [practiceProviders, calendarHiddenProviderIds]
  )

  const dayAppointmentsAll = useMemo(
    () => appointments.filter((a) => a.date === selectedDate),
    [appointments, selectedDate]
  )

  const dayAppointments = useMemo(() => {
    if (practiceProviders.length === 0) return dayAppointmentsAll
    if (visibleProviders.length === 0) return []
    if (visibleProviders.length === practiceProviders.length) return dayAppointmentsAll
    return dayAppointmentsAll.filter(
      (a) => !a.providerId || visibleProviders.some((p) => p.id === a.providerId)
    )
  }, [dayAppointmentsAll, practiceProviders, visibleProviders])

  const dayColumns = useMemo(
    () => visibleProviders.map((p) => ({ id: p.id, name: p.name })),
    [visibleProviders]
  )

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate])
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const weekAppointments = useMemo(() => {
    const dateStrs = new Set(weekDates.map(fmtDate))
    const list = appointments.filter((a) => dateStrs.has(a.date))
    if (practiceProviders.length === 0) return list
    if (visibleProviders.length === 0) return []
    if (visibleProviders.length === practiceProviders.length) return list
    return list.filter(
      (a) => !a.providerId || visibleProviders.some((p) => p.id === a.providerId)
    )
  }, [appointments, weekDates, practiceProviders, visibleProviders])

  const booked = dayAppointments.filter((a) => a.status !== "cancelled").length
  const completed = dayAppointments.filter((a) => a.status === "completed").length
  const checkedIn = dayAppointments.filter((a) => a.status === "checked_in" || a.status === "in_progress").length

  const dayOfWeek = currentDate.getDay()
  const { closed: dayClosed, openMin, closeMin } = useMemo(
    () => resolveDayBounds(practiceHours, dayOfWeek),
    [practiceHours, dayOfWeek]
  )
  const daySlots = useMemo(
    () => (dayClosed ? [] : dayViewSlotStarts(openMin, closeMin)),
    [dayClosed, openMin, closeMin]
  )

  const handleOpenPatient = useCallback(
    (a: PracticeAppointment) => {
      if (!a.patientId || !a.patientName) return
      const pat = patients.find((p) => p.id === a.patientId)
      openPatient(
        createPatientSession({
          patientId: a.patientId,
          name: a.patientName,
          appointmentId: a.id,
          appointmentReason: a.reason,
          status: a.status === "checked_in" ? "checked_in" : "waiting",
          medicalAidScheme: pat?.medicalAidScheme ?? a.medicalAid,
          memberNumber: pat?.memberNumber ?? a.memberNumber,
          chronicConditions: pat?.chronicConditions ?? [],
          criticalAllergies: pat?.allergies ?? [],
          activeMedications: pat?.currentMedications ?? [],
        })
      )
      setMode("clinical")
    },
    [openPatient, setMode, patients]
  )

  const navigateDay = useCallback(
    (dir: -1 | 1) => {
      setSelectedDate(fmtDate(addDays(currentDate, dir)))
    },
    [currentDate, setSelectedDate]
  )

  const navigateWeek = useCallback(
    (dir: -1 | 1) => {
      setSelectedDate(fmtDate(addDays(currentDate, dir * 7)))
    },
    [currentDate, setSelectedDate]
  )

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showDatePicker])

  const dateLabel = currentDate.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex h-full gap-3">
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (viewMode === "day" ? navigateDay(-1) : navigateWeek(-1))}
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-secondary dark:hover:text-accent-foreground/70"
            >
              <CaretLeft className="size-4" weight="bold" />
            </button>

            <div className="relative" ref={datePickerRef}>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted dark:hover:bg-secondary"
              >
                <CalendarBlank className="size-3.5 text-muted-foreground dark:text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{dateLabel}</span>
              </button>

              <AnimatePresence>
                {showDatePicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full z-40 mt-1"
                  >
                    <MiniCalendar
                      selectedDate={currentDate}
                      onSelect={(d) => {
                        setSelectedDate(fmtDate(d))
                        setShowDatePicker(false)
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => (viewMode === "day" ? navigateDay(1) : navigateWeek(1))}
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-secondary dark:hover:text-accent-foreground/70"
            >
              <CaretRight className="size-4" weight="bold" />
            </button>

            <div className="ml-2 flex rounded-lg border border-border p-0.5 dark:border-panel-border">
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  viewMode === "day"
                    ? "bg-muted text-foreground dark:bg-secondary"
                    : "text-muted-foreground hover:text-foreground dark:text-foreground/30 dark:hover:text-accent-foreground"
                )}
              >
                Day
              </button>
              <button
                type="button"
                onClick={() => setViewMode("week")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  viewMode === "week"
                    ? "bg-muted text-foreground dark:bg-secondary"
                    : "text-muted-foreground hover:text-foreground dark:text-foreground/30 dark:hover:text-accent-foreground"
                )}
              >
                Week
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-3 text-[10px]">
              <span className="text-muted-foreground">
                Booked: <span className="font-bold text-foreground">{booked}</span>
              </span>
              <span className="text-muted-foreground">
                Done: <span className="font-bold text-status-success">{completed}</span>
              </span>
              <span className="text-muted-foreground">
                Waiting: <span className="font-bold text-blue-400">{checkedIn}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/80 dark:bg-secondary dark:hover:bg-secondary"
            >
              <Plus className="size-3.5" />
              New Appointment
            </button>
          </div>
        </div>

        {/* View */}
        {viewMode === "day" ? (
          <DayView slots={daySlots} dayClosed={dayClosed} columns={dayColumns} dayAppointments={dayAppointments} onSelect={setSelected} />
        ) : (
          <WeekView
            weekDates={weekDates}
            appointments={weekAppointments}
            selectedDate={selectedDate}
            onSelect={setSelected}
            onDateClick={(d) => {
              setSelectedDate(fmtDate(d))
              setViewMode("day")
            }}
          />
        )}
      </div>

      {/* Detail Pane */}
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key="detail"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="shrink-0 overflow-hidden"
          >
            <DetailPane
              appointment={selected}
              practiceId={practiceId}
              practiceProviders={practiceProviders}
              onClose={() => setSelected(null)}
              onUpdateAppointment={updateAppointment}
              onOpenBilling={() => setAdminTab("billing")}
              onStartScribe={() => {
                handleOpenPatient(selected)
                setSelected(null)
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Create Appointment Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateAppointmentModal
            practiceId={practiceId}
            patients={patients}
            appointments={appointments}
            practiceProviders={practiceProviders}
            practiceHours={practiceHours}
            initialDate={selectedDate}
            onClose={() => setShowCreate(false)}
            onCreate={(appt) => {
              addAppointment(appt)
              setShowCreate(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Day View ──────────────────────────────────────────── */

function DayView({
  slots,
  dayClosed,
  columns,
  dayAppointments,
  onSelect,
}: {
  slots: { hour: number; minute: number }[]
  dayClosed: boolean
  columns: { id: string; name: string }[]
  dayAppointments: PracticeAppointment[]
  onSelect: (a: PracticeAppointment) => void
}) {
  if (dayClosed || slots.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-6 py-16 dark:border-panel-border dark:bg-panel-muted/40">
        <CalendarBlank className="mb-3 size-10 text-muted-foreground/40 dark:text-muted-foreground/40" />
        <p className="max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
          {dayClosed
            ? "This practice is closed on this day. Change operating hours in Settings → Practice."
            : "No time slots — check open and close times in Practice settings."}
        </p>
      </div>
    )
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-panel-border bg-panel-muted/40 px-6 py-16">
        <CalendarBlank className="mb-3 size-10 text-muted-foreground" />
        <p className="max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
          No providers visible. Turn on at least one provider under <strong className="text-muted-foreground/70">Practice Management</strong> → Providers.
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/70 dark:border-panel-border dark:bg-panel-muted/40"
      style={{ scrollbarWidth: "none" }}
    >
      {columns.length > 1 ? (
        <div className="sticky top-0 z-[1] flex border-b border-panel-border bg-panel/92 backdrop-blur-md">
          <div className="w-14 shrink-0" />
          {columns.map((col) => (
            <div key={col.id} className="min-w-0 flex-1 border-l border-panel-border px-2 py-1.5 text-center">
              <span className="block truncate text-[10px] font-semibold text-muted-foreground/75">{col.name}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="relative">
        {slots.map(({ hour, minute }) => {
          const key = `${hour}:${minute}`
          const ts = timeStr(hour, minute)
          const isHalfHour = minute === 30

          return (
            <div
              key={key}
              className={cn(
                "flex min-h-[44px] items-stretch",
                isHalfHour ? "border-t border-border/50 dark:border-panel-border" : "border-t border-border dark:border-panel-border"
              )}
            >
              <div className="flex w-14 shrink-0 items-start justify-end pr-3 pt-1.5">
                {!isHalfHour && <span className="text-[10px] tabular-nums text-muted-foreground dark:text-foreground/25">{ts}</span>}
              </div>
              {columns.map((col) => {
                const appt = appointmentForDayCell(dayAppointments, col.id, columns, hour, minute)
                return (
                  <div
                    key={`${col.id}-${key}`}
                    className={cn(
                      "min-w-0 flex-1 py-0.5 pr-1",
                      columns.length > 1 && "border-l border-panel-border"
                    )}
                  >
                    {appt ? (
                      <button
                        type="button"
                        onClick={() => onSelect(appt)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-lg border-l-2 bg-panel-muted px-2 py-1.5 text-left transition-all hover:bg-secondary",
                          STATUS_COLOR[appt.status],
                          appt.status === "cancelled" &&
                            "opacity-45 line-through decoration-rose-400/70 [text-decoration-thickness:1px]"
                        )}
                      >
                        <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[appt.status])} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[11px] font-medium text-foreground">{appt.patientName}</span>
                            {appt.status === "cancelled" ? (
                              <span className="rounded-full bg-rose-500/20 px-1.5 py-px text-[7px] font-bold uppercase tracking-wide text-rose-200/95">
                                Cancelled
                              </span>
                            ) : null}
                          </div>
                          <span className="block truncate text-[9px] text-muted-foreground">{appt.reason}</span>
                        </div>
                        <PaymentBadge paymentType={appt.paymentType} medicalAid={appt.medicalAid} />
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Week View ─────────────────────────────────────────── */

function WeekView({
  weekDates,
  appointments,
  selectedDate,
  onSelect,
  onDateClick,
}: {
  weekDates: Date[]
  appointments: PracticeAppointment[]
  selectedDate: string
  onSelect: (a: PracticeAppointment) => void
  onDateClick: (d: Date) => void
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, PracticeAppointment[]>()
    for (const a of appointments) {
      const list = m.get(a.date) ?? []
      list.push(a)
      m.set(a.date, list)
    }
    for (const [k, v] of m) m.set(k, v.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)))
    return m
  }, [appointments])

  const today = fmtDate(new Date())

  return (
    <div
      className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/70 dark:border-panel-border dark:bg-panel-muted/40"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="grid h-full grid-cols-7 divide-x divide-white/[0.04]">
        {weekDates.map((d) => {
          const ds = fmtDate(d)
          const dayAppts = byDate.get(ds) ?? []
          const isToday = ds === today
          const isSelected = ds === selectedDate

          return (
            <div key={ds} className="flex flex-col">
              <button
                type="button"
                onClick={() => onDateClick(d)}
                className={cn(
                  "border-b border-border px-2 py-2 text-center transition-colors hover:bg-muted/50 dark:border-panel-border dark:hover:bg-panel-muted",
                  isSelected && "bg-muted/60 dark:bg-panel-muted"
                )}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-foreground/30">
                  {WEEKDAYS[(d.getDay() + 6) % 7]}
                </div>
                <div
                  className={cn(
                    "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                    isToday ? "bg-foreground text-background" : "text-foreground"
                  )}
                >
                  {d.getDate()}
                </div>
              </button>

              <div className="flex-1 space-y-0.5 overflow-y-auto p-1" style={{ scrollbarWidth: "none" }}>
                {dayAppts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a)}
                    className={cn(
                      "w-full rounded-md border-l-2 bg-panel-muted px-1.5 py-1 text-left transition-all hover:bg-secondary",
                      STATUS_COLOR[a.status],
                      a.status === "cancelled" &&
                        "opacity-45 line-through decoration-rose-400/70 [text-decoration-thickness:1px]"
                    )}
                  >
                    <div className="truncate text-[10px] font-medium text-foreground">{a.patientName}</div>
                    <div className="text-[9px] tabular-nums text-muted-foreground dark:text-foreground/30">{a.startTime}</div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Detail Pane ───────────────────────────────────────── */

function DetailPane({
  appointment,
  practiceId,
  practiceProviders,
  onClose,
  onStartScribe,
  onUpdateAppointment,
  onOpenBilling,
}: {
  appointment: PracticeAppointment
  practiceId: string | null
  practiceProviders: { id: string; name: string }[]
  onClose: () => void
  onStartScribe: () => void
  onUpdateAppointment: (id: string, update: Partial<PracticeAppointment>) => void
  onOpenBilling: () => void
}) {
  const [reason, setReason] = useState(appointment.reason ?? "")
  const [service, setService] = useState(appointment.service ?? "Consultation")
  const [duration, setDuration] = useState(appointment.duration)
  const [providerId, setProviderId] = useState(appointment.providerId)
  const [notes, setNotes] = useState(appointment.notes ?? "")
  const [icdInput, setIcdInput] = useState((appointment.icdCodes ?? []).join(", "))
  const [totalFee, setTotalFee] = useState(appointment.totalFee ?? 0)
  const [draftLines, setDraftLines] = useState<AppointmentClaimDraftLine[]>(appointment.claimLineDrafts ?? [])
  const [saving, setSaving] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [encCtx, setEncCtx] = useState<{ chiefComplaint?: string; summary?: string } | null>(null)
  const [ctxOpen, setCtxOpen] = useState(true)

  useEffect(() => {
    setReason(appointment.reason ?? "")
    setService(appointment.service ?? "Consultation")
    setDuration(appointment.duration)
    setProviderId(appointment.providerId)
    setNotes(appointment.notes ?? "")
    setIcdInput((appointment.icdCodes ?? []).join(", "))
    setTotalFee(appointment.totalFee ?? 0)
    setDraftLines(appointment.claimLineDrafts ?? [])
  }, [appointment.id])

  useEffect(() => {
    if (!appointment.patientId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchClient(`/api/patients/${appointment.patientId}/ai-summary`)
        if (!res.ok || cancelled) return
        const j = (await res.json()) as { latestChiefComplaint?: string; rollup?: string; latestSummaryText?: string }
        if (!cancelled) {
          setEncCtx({
            chiefComplaint: j.latestChiefComplaint ?? undefined,
            summary: j.rollup ?? j.latestSummaryText ?? undefined,
          })
        }
      } catch {
        /* optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appointment.patientId])

  const buildMetadataPayload = useCallback(
    (linkedOverride?: string) => {
      const meta: Record<string, unknown> = {
        claim_line_drafts: draftLines.map((d) => ({
          id: d.id,
          description: d.description,
          amount: d.amount,
          line_type: d.lineType,
        })),
      }
      const link = linkedOverride ?? appointment.linkedClaimId
      if (link) meta.linked_claim_id = link
      return meta
    },
    [draftLines, appointment.linkedClaimId]
  )

  const persist = useCallback(async () => {
    if (!practiceId) return
    setSaving(true)
    try {
      const codes = icdInput
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
      const res = await fetchClient(`/api/practice/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim() || null,
          service: service.trim() || null,
          duration_minutes: duration,
          provider_staff_id: providerId || null,
          notes: notes.trim() || null,
          icd_codes: codes.length ? codes : null,
          total_fee: totalFee > 0 ? totalFee : null,
          metadata: buildMetadataPayload(),
        }),
      })
      if (!res.ok) throw new Error("Could not save appointment")
      onUpdateAppointment(appointment.id, {
        reason: reason.trim() || undefined,
        service,
        duration,
        providerId,
        notes: notes.trim() || undefined,
        icdCodes: codes.length ? codes : undefined,
        totalFee: totalFee > 0 ? totalFee : undefined,
        claimLineDrafts: draftLines,
      })
      requestAppointmentsRefresh()
    } catch (e) {
      console.warn(e)
    } finally {
      setSaving(false)
    }
  }, [
    practiceId,
    appointment.id,
    reason,
    service,
    duration,
    providerId,
    notes,
    icdInput,
    totalFee,
    draftLines,
    buildMetadataPayload,
    onUpdateAppointment,
  ])

  const attachClaim = async () => {
    if (!practiceId) return
    setClaimBusy(true)
    try {
      await persist()
      const icdFirst = icdInput.split(",")[0]?.trim()
      const lines: ClaimLine[] = []
      const mainType: ClaimLineType = appointment.paymentType === "medical_aid" ? "medical_aid" : "cash"
      if (totalFee > 0 || service.trim()) {
        lines.push({
          id: `appt-${appointment.id}-main`,
          description: service.trim() || "Consultation",
          amount: totalFee > 0 ? totalFee : 0,
          lineType: mainType,
          status: "draft",
          icdCode: icdFirst || undefined,
        })
      }
      for (const d of draftLines) {
        lines.push({
          id: d.id,
          description: d.description,
          amount: d.amount,
          lineType: d.lineType,
          status: "draft",
        })
      }
      if (lines.length === 0 || lines.every((l) => l.amount <= 0 && !l.description.trim())) {
        throw new Error("Add a service fee or at least one billable line")
      }

      const res = await fetchClient("/api/clinical/practice-claims/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          patientId: appointment.patientId,
          clinicalEncounterId: appointment.linkedConsultId ?? null,
          claimId: appointment.linkedClaimId ?? null,
          appointmentId: appointment.id,
          lines,
        }),
      })
      const j = (await res.json()) as { claimId?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Could not create claim")

      const claimId = j.claimId!
      await fetchClient(`/api/practice/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: buildMetadataPayload(claimId),
        }),
      })
      onUpdateAppointment(appointment.id, {
        linkedClaimId: claimId,
        claimLineDrafts: draftLines,
      })
      const rows = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(rows)
      onOpenBilling()
    } catch (e) {
      console.warn(e)
      toast.error(e instanceof Error ? e.message : "Attach claim failed")
    } finally {
      setClaimBusy(false)
    }
  }

  const addDraftLine = () => {
    setDraftLines((prev) => [
      ...prev,
      {
        id: `dl-${crypto.randomUUID()}`,
        description: "",
        amount: 0,
        lineType: "cash",
      },
    ])
  }

  return (
    <div className="flex h-full w-[320px] flex-col rounded-2xl border border-panel-border bg-panel-muted/50">
      <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold">{appointment.patientName}</h3>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {appointment.startTime}–{appointment.endTime} (24h) · {service || "Consultation"}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-accent-foreground/60">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-[max(4rem,env(safe-area-inset-bottom))]" style={{ scrollbarWidth: "none" }}>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                appointment.status === "completed"
                  ? "bg-status-success/10 text-status-success"
                  : appointment.status === "in_progress"
                    ? "bg-indigo-500/10 text-indigo-400"
                    : appointment.status === "checked_in"
                      ? "bg-blue-500/10 text-blue-400"
                      : appointment.status === "no_show"
                        ? "bg-status-danger/10 text-status-danger"
                        : appointment.status === "cancelled"
                          ? "bg-panel-muted text-muted-foreground"
                          : "bg-secondary text-muted-foreground/70"
              )}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[appointment.status])} />
              {STATUS_LABEL[appointment.status]}
            </span>
            <PaymentBadge paymentType={appointment.paymentType} medicalAid={appointment.medicalAid} />
            {appointment.linkedClaimId ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[8px] font-semibold text-amber-300">
                Claim linked
              </span>
            ) : null}
          </div>

          {encCtx?.chiefComplaint || encCtx?.summary ? (
            <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] p-3">
              <button
                type="button"
                onClick={() => setCtxOpen(!ctxOpen)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-[10px] font-semibold text-cyan-200/90">AI context · last visit</span>
                <span className="text-[9px] text-muted-foreground">{ctxOpen ? "Hide" : "Show"}</span>
              </button>
              {ctxOpen ? (
                <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground/75">
                  {encCtx.chiefComplaint ? (
                    <p>
                      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        Chief complaint
                      </span>
                      <br />
                      {encCtx.chiefComplaint}
                    </p>
                  ) : null}
                  {encCtx.summary ? (
                    <p className="line-clamp-6 text-[10px] text-muted-foreground/65">{encCtx.summary}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => void persist()}
              className="w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none focus:border-panel-border"
              placeholder="Visit reason…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Service</label>
              <select
                value={service}
                onChange={(e) => {
                  setService(e.target.value)
                  const svc = SERVICE_CATALOG.find((s) => s.name === e.target.value)
                  if (svc?.price != null) setTotalFee(svc.price)
                  if (svc?.defaultDurationMinutes != null) setDuration(svc.defaultDurationMinutes)
                }}
                onBlur={() => void persist()}
                className="mt-1 w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none"
              >
                {SERVICE_CATALOG.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} — R{s.price}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Duration (min)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                onBlur={() => void persist()}
                className="mt-1 w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none"
              >
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Provider</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              onBlur={() => void persist()}
              className="mt-1 w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none"
            >
              {practiceProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">ICD-10 (comma-separated)</label>
            <input
              value={icdInput}
              onChange={(e) => setIcdInput(e.target.value)}
              onBlur={() => void persist()}
              placeholder="e.g. I10, E11.9"
              className="mt-1 w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none"
            />
          </div>

          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void persist()}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] outline-none"
              placeholder="Optional notes…"
            />
          </div>

          <div>
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Total fee (ZAR)</label>
            <input
              type="number"
              step="0.01"
              value={totalFee || ""}
              onChange={(e) => setTotalFee(parseFloat(e.target.value) || 0)}
              onBlur={() => void persist()}
              className="mt-1 w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] tabular-nums outline-none"
            />
          </div>

          {appointment.medicalAid && (
            <>
              <DetailRow icon={<ShieldCheck className="size-3.5" />} label="Medical Aid" value={appointment.medicalAid} />
              {appointment.memberNumber && (
                <DetailRow icon={<Tag className="size-3.5" />} label="Member #" value={appointment.memberNumber} />
              )}
            </>
          )}

          <div className="rounded-xl border border-panel-border bg-panel-muted p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground/70">Items & fees (claim)</p>
              <button
                type="button"
                onClick={addDraftLine}
                className="text-[9px] font-medium text-cyan-400 hover:text-cyan-300"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {draftLines.map((d) => (
                <div key={d.id} className="flex flex-col gap-1 rounded-lg border border-panel-border bg-panel-muted/50 p-2">
                  <input
                    value={d.description}
                    onChange={(e) =>
                      setDraftLines((prev) => prev.map((x) => (x.id === d.id ? { ...x, description: e.target.value } : x)))
                    }
                    onBlur={() => void persist()}
                    placeholder="Item"
                    className="w-full rounded border border-panel-border bg-transparent px-1.5 py-1 text-[10px] outline-none"
                  />
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={d.amount || ""}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))
                        )
                      }
                      onBlur={() => void persist()}
                      className="w-20 rounded border border-panel-border bg-transparent px-1.5 py-1 text-[10px] tabular-nums"
                    />
                    <select
                      value={d.lineType}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, lineType: e.target.value as ClaimLineType } : x
                          )
                        )
                      }
                      onBlur={() => void persist()}
                      className="flex-1 rounded border border-panel-border bg-transparent px-1 py-1 text-[9px]"
                    >
                      <option value="cash">Cash</option>
                      <option value="medical_aid">Medical aid</option>
                      <option value="patient_liability">Patient liability</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setDraftLines((prev) => prev.filter((x) => x.id !== d.id))}
                      className="text-muted-foreground hover:text-rose-400"
                    >
                      <Trash className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={!practiceId || claimBusy || !appointment.patientId}
              onClick={() => void attachClaim()}
              className="mt-3 w-full rounded-lg bg-gradient-to-r from-violet-500/20 to-cyan-500/20 py-2 text-[10px] font-semibold text-foreground/85 ring-1 ring-white/10 hover:from-violet-500/30 hover:to-cyan-500/30 disabled:opacity-40"
            >
              {claimBusy ? "Attaching…" : appointment.linkedClaimId ? "Update draft claim" : "Attach claim to billing"}
            </button>
          </div>

          <DetailRow icon={<CalendarBlank className="size-3.5" />} label="Date" value={appointment.date} />
          <DetailRow icon={<UserCircle className="size-3.5" />} label="Patient" value={appointment.patientName} />

          {saving ? <p className="text-[9px] text-muted-foreground">Saving…</p> : null}
        </div>
      </div>

      <div className="border-t border-panel-border p-4 pb-[max(5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onStartScribe}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-[11px] font-bold text-background transition-opacity hover:opacity-90"
        >
          <Stethoscope className="size-4" />
          Start Scribe
        </button>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-[12px] text-foreground">{value}</p>
    </div>
  )
}

function PaymentBadge({ paymentType, medicalAid }: { paymentType: PaymentType; medicalAid?: string }) {
  if (paymentType === "medical_aid") {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-status-success/10 px-1.5 py-0.5 text-[8px] font-semibold text-status-success">
        <ShieldCheck className="size-2.5" weight="fill" />
        {medicalAid ?? "MA"}
      </span>
    )
  }
  if (paymentType === "card") {
    return (
      <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-sky-300">
        Card
      </span>
    )
  }
  if (paymentType === "split") {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-purple-400">
        <ShieldCheck className="size-2.5" weight="fill" />
        Shortfall
      </span>
    )
  }
  return <span className="rounded-full bg-status-warning/10 px-1.5 py-0.5 text-[8px] font-semibold text-status-warning">Cash</span>
}

/* ─── Mini Calendar ──────────────────────────────────────── */

function MiniCalendar({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  const grid = useMemo(() => getCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const today = new Date()

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  return (
    <div className="w-[240px] rounded-xl border border-panel-border bg-popover p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground/70">
          <CaretLeft className="size-3.5" weight="bold" />
        </button>
        <span className="text-[11px] font-semibold text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground/70">
          <CaretRight className="size-3.5" weight="bold" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1 text-[8px] font-semibold uppercase text-muted-foreground">
            {wd.charAt(0)}
          </div>
        ))}
        {grid.flat().map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />
          const isToday = isSameDay(d, today)
          const isSel = isSameDay(d, selectedDate)
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-[10px] transition-colors",
                isSel
                  ? "bg-foreground font-bold text-background"
                  : isToday
                    ? "bg-secondary font-bold text-foreground"
                    : "text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Create Appointment Modal ──────────────────────────── */

function CreateAppointmentModal({
  practiceId,
  patients,
  appointments,
  practiceProviders,
  practiceHours,
  initialDate,
  onClose,
  onCreate,
}: {
  practiceId: string | null
  patients: PracticePatient[]
  appointments: PracticeAppointment[]
  practiceProviders: { id: string; name: string; specialty?: string }[]
  practiceHours: PracticeBusinessHour[]
  initialDate: string
  onClose: () => void
  onCreate: (a: PracticeAppointment) => void
}) {
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<PracticePatient | null>(null)
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [date, setDate] = useState(initialDate)
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedHour, setSelectedHour] = useState(10)
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [duration, setDuration] = useState(30)
  const [service, setService] = useState("Consultation")
  const [paymentType, setPaymentType] = useState<PaymentType>("cash")
  const [cashCardMode, setCashCardMode] = useState<"cash" | "card">("cash")
  const [medicalAid, setMedicalAid] = useState("")
  const [memberNumber, setMemberNumber] = useState("")
  const [providerId, setProviderId] = useState("")
  const [icdCodes, setIcdCodes] = useState("")
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
  const [reasonFromLastVisit, setReasonFromLastVisit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const patientInputRef = useRef<HTMLInputElement>(null)
  const calendarRef = useRef<HTMLDivElement>(null)

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return []
    return patients.filter((p) => fuzzyMatch(patientSearch, p.name)).slice(0, 8)
  }, [patientSearch, patients])

  const selectedSvc = SERVICE_CATALOG.find((s) => s.name === service)

  const dow = useMemo(() => new Date(date + "T12:00:00").getDay(), [date])
  const { closed: modalDayClosed, openMin, closeMin } = useMemo(
    () => resolveDayBounds(practiceHours, dow),
    [practiceHours, dow]
  )

  const hourOptions = useMemo(
    () =>
      modalDayClosed
        ? [9]
        : validHourValues(openMin, closeMin, duration),
    [modalDayClosed, openMin, closeMin, duration]
  )

  const minuteOptions = useMemo(
    () =>
      modalDayClosed
        ? [0]
        : validMinuteValues(selectedHour, openMin, closeMin, duration),
    [modalDayClosed, selectedHour, openMin, closeMin, duration]
  )

  useEffect(() => {
    if (practiceProviders.length === 0) return
    setProviderId((prev) =>
      prev && practiceProviders.some((p) => p.id === prev) ? prev : practiceProviders[0]!.id
    )
  }, [practiceProviders])

  useEffect(() => {
    if (!selectedPatient?.id) {
      setReasonFromLastVisit(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchClient(`/api/patients/${selectedPatient.id}/ai-summary`)
        if (!res.ok || cancelled) return
        const j = (await res.json()) as { latestChiefComplaint?: string | null }
        const cc = j.latestChiefComplaint?.trim()
        if (cancelled || !cc) return
        setReason(cc)
        setReasonFromLastVisit(true)
      } catch {
        /* optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPatient?.id])

  useEffect(() => {
    if (modalDayClosed) return
    const c = clampStartTime(selectedHour, selectedMinute, openMin, closeMin, duration)
    const ho = validHourValues(openMin, closeMin, duration)
    const h = ho.includes(c.hour) ? c.hour : ho[0] ?? c.hour
    const mo = validMinuteValues(h, openMin, closeMin, duration)
    const m = mo.includes(c.minute) ? c.minute : mo[0] ?? c.minute
    if (h !== selectedHour) setSelectedHour(h)
    if (m !== selectedMinute) setSelectedMinute(m)
  }, [modalDayClosed, openMin, closeMin, duration, date, selectedHour, selectedMinute])

  const endHour = useMemo(() => {
    const totalMinutes = selectedHour * 60 + selectedMinute + duration
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60,
    }
  }, [selectedHour, selectedMinute, duration])

  const conflict = useMemo(() => {
    const startMin = selectedHour * 60 + selectedMinute
    const endMin = startMin + duration
    return appointments.some((a) => {
      if (a.status === "cancelled") return false
      if (a.date !== date) return false
      if (a.providerId && a.providerId !== providerId) return false
      const aStart = a.hour * 60 + a.minute
      const aEnd = aStart + a.duration
      return startMin < aEnd && endMin > aStart
    })
  }, [appointments, date, selectedHour, selectedMinute, duration, providerId])

  useEffect(() => {
    if (selectedPatient && paymentType === "medical_aid") {
      if (selectedPatient.medicalAidScheme) setMedicalAid(selectedPatient.medicalAidScheme)
      if (selectedPatient.memberNumber) setMemberNumber(selectedPatient.memberNumber)
    }
  }, [selectedPatient, paymentType])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false)
      }
    }
    if (showCalendar) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showCalendar])

  const handleCreate = useCallback(async () => {
    if (!selectedPatient || modalDayClosed || !providerId) return
    const st = timeStr(selectedHour, selectedMinute)
    const et = timeStr(endHour.hour, endHour.minute)
    const codes = icdCodes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
    const finalPaymentType: PaymentType = paymentType === "medical_aid" ? "medical_aid" : cashCardMode
    const nextAppointment: PracticeAppointment = {
      id: `appt-${Date.now()}`,
      patientId: selectedPatient.id,
      patientName: selectedPatient.name,
      providerId,
      date,
      startTime: st,
      endTime: et,
      hour: selectedHour,
      minute: selectedMinute,
      duration,
      reason: reason || service,
      service,
      status: "booked",
      paymentType: finalPaymentType,
      medicalAid: finalPaymentType === "medical_aid" ? medicalAid : undefined,
      memberNumber: finalPaymentType === "medical_aid" ? memberNumber : undefined,
      notes: notes || undefined,
      icdCodes: codes.length > 0 ? codes : undefined,
      totalFee: selectedSvc?.price ?? 0,
    }

    setSaving(true)
    setError(null)
    try {
      if (!practiceId) {
        throw new Error("Open a practice workspace before booking an appointment.")
      }
      if (practiceId) {
        const response = await fetch("/api/appointments/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: selectedPatient.id,
            providerStaffId: providerId,
            apptDate: date,
            startTime: st,
            endTime: et,
            durationMinutes: duration,
            reason: reason || service,
            service,
            paymentType: finalPaymentType,
            medicalAid: finalPaymentType === "medical_aid" ? medicalAid || null : null,
            memberNumber: finalPaymentType === "medical_aid" ? memberNumber || null : null,
            notes: notes || null,
            icdCodes: codes.length > 0 ? codes : null,
            totalFee: selectedSvc?.price ?? 0,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          appointment?: { id?: string }
          error?: string
        }
        if (!response.ok || !payload.appointment?.id) {
          const unavailable = payload.error?.startsWith("slot_invalid:")
          throw new Error(
            unavailable
              ? "That slot is no longer available. Refresh the calendar and choose another time."
              : payload.error || "Could not create appointment"
          )
        }
        nextAppointment.id = String(payload.appointment.id)
      }

      onCreate(nextAppointment)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create appointment")
    } finally {
      setSaving(false)
    }
  }, [
    selectedPatient, selectedHour, selectedMinute, endHour, duration,
    service, paymentType, cashCardMode, medicalAid, memberNumber, providerId,
    date, icdCodes, notes, reason, selectedSvc, onCreate, modalDayClosed, practiceId,
  ])

  return (
    <>
      <AssistantModalSuppressor />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="fixed inset-x-0 top-[8%] z-[131] mx-auto w-full max-w-lg"
      >
        <div
          className="max-h-[84vh] overflow-y-auto rounded-2xl border border-panel-border bg-popover p-5 pb-[max(5rem,env(safe-area-inset-bottom))] shadow-2xl"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">New Appointment</h3>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-accent-foreground/60">
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Patient search */}
            <Field label="Patient">
              <div className="relative">
                <input
                  ref={patientInputRef}
                  value={selectedPatient ? selectedPatient.name : patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value)
                    setSelectedPatient(null)
                    setShowPatientDropdown(true)
                  }}
                  onFocus={() => patientSearch.trim() && setShowPatientDropdown(true)}
                  placeholder="Search patient name..."
                  className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                />
                {selectedPatient && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setPatientSearch("")
                      patientInputRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-accent-foreground/60"
                  >
                    <X className="size-3" />
                  </button>
                )}
                <AnimatePresence>
                  {showPatientDropdown && filteredPatients.length > 0 && !selectedPatient && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-panel-border bg-popover shadow-xl"
                      style={{ scrollbarWidth: "none" }}
                    >
                      {filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p)
                            setPatientSearch("")
                            setShowPatientDropdown(false)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary"
                        >
                          <UserCircle className="size-4 text-muted-foreground" />
                          <div>
                            <div className="text-[11px] font-medium text-foreground">{p.name}</div>
                            {p.medicalAidScheme && (
                              <div className="text-[9px] text-muted-foreground">
                                {p.medicalAidScheme} · {p.memberNumber}
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Field>

            {/* Date */}
            <Field label="Date">
              <div className="relative" ref={calendarRef}>
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="flex w-full items-center gap-2 rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] text-foreground transition-colors hover:border-ring"
                >
                  <CalendarBlank className="size-3.5 text-muted-foreground" />
                  {parseDate(date).toLocaleDateString("en-ZA", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </button>
                <AnimatePresence>
                  {showCalendar && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 top-full z-10 mt-1"
                    >
                      <MiniCalendar
                        selectedDate={parseDate(date)}
                        onSelect={(d) => {
                          setDate(fmtDate(d))
                          setShowCalendar(false)
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Field>

            {/* Time picker */}
            <Field label="Time">
              {modalDayClosed ? (
                <p className="rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
                  Practice is closed this day — pick another date or update hours in Settings → Practice.
                </p>
              ) : (
                <div className="flex gap-2">
                  <ScrollTimePicker
                    label="Hour"
                    values={hourOptions}
                    selected={selectedHour}
                    onSelect={setSelectedHour}
                    format={(v) => String(v).padStart(2, "0")}
                  />
                  <ScrollTimePicker
                    label="Min"
                    values={minuteOptions.length > 0 ? minuteOptions : [0, 15, 30, 45]}
                    selected={minuteOptions.includes(selectedMinute) ? selectedMinute : minuteOptions[0] ?? 0}
                    onSelect={setSelectedMinute}
                    format={(v) => String(v).padStart(2, "0")}
                  />
                  <div className="flex items-end pb-1 pl-1 text-[11px] text-muted-foreground">
                    → {timeStr(endHour.hour, endHour.minute)}
                  </div>
                </div>
              )}
            </Field>

            {/* Duration + Service */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration">
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none focus:border-ring"
                >
                  {[15, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service">
                <select
                  value={service}
                  onChange={(e) => {
                    const v = e.target.value
                    setService(v)
                    const svc = SERVICE_CATALOG.find((s) => s.name === v)
                    if (svc?.defaultDurationMinutes != null) setDuration(svc.defaultDurationMinutes)
                  }}
                  className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none focus:border-ring"
                >
                  {SERVICE_CATALOG.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} — R{s.price}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Payment type */}
            <Field label="Payment">
              <div className="grid gap-2 sm:grid-cols-2">
                {(["medical_aid", "cash"] as const).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => {
                      setPaymentType(pt === "medical_aid" ? "medical_aid" : cashCardMode)
                    }}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-all",
                      (pt === "medical_aid" ? paymentType === "medical_aid" : paymentType !== "medical_aid")
                        ? pt === "medical_aid"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                          : "border-amber-300/25 bg-amber-300/10 text-amber-200"
                        : "bg-panel-muted text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    <div className="text-[11px] font-semibold">{pt === "medical_aid" ? "Medical Aid" : "Cash / Card"}</div>
                    <div className="mt-1 text-[10px] text-current/70">
                      {pt === "medical_aid" ? "Scheme billed first" : "Patient settles at the desk or via link"}
                    </div>
                  </button>
                ))}
              </div>
            </Field>

            {/* MA fields */}
            <AnimatePresence>
              {paymentType === "medical_aid" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Scheme">
                        <input
                          value={medicalAid}
                          onChange={(e) => setMedicalAid(e.target.value)}
                          placeholder="e.g. Discovery"
                          className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                        />
                      </Field>
                      <Field label="Member #">
                        <input
                          value={memberNumber}
                          onChange={(e) => setMemberNumber(e.target.value)}
                          placeholder="Member number"
                          className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                        />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {paymentType !== "medical_aid" && (
              <Field label="Preferred Tender">
                <div className="flex gap-2">
                  {(["cash", "card"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setCashCardMode(mode)
                        setPaymentType(mode)
                      }}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-center text-[11px] font-semibold transition-all",
                        cashCardMode === mode
                          ? mode === "cash"
                            ? "bg-status-warning/15 text-status-warning ring-1 ring-[status-warning]/30"
                            : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30"
                          : "bg-panel-muted text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {mode === "cash" ? "Cash" : "Card"}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* Provider */}
            <Field label="Provider">
              {practiceProviders.length === 0 ? (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/90">
                  No providers in this practice yet. A default profile is created when you load the workspace; refresh the
                  page or add staff in Settings → Practice.
                </p>
              ) : (
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="relative z-[60] w-full cursor-pointer rounded-lg border border-panel-border bg-popover px-3 py-2 text-[12px] text-foreground outline-none focus:border-ring"
                >
                  {practiceProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.specialty ? ` · ${p.specialty}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {/* Reason + ICD-10 */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reason">
                {reasonFromLastVisit ? (
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[9px] font-medium text-cyan-200/90">
                      Prefilled from last visit
                    </span>
                    <button
                      type="button"
                      className="text-[9px] text-muted-foreground hover:text-accent-foreground/60"
                      onClick={() => {
                        setReason("")
                        setReasonFromLastVisit(false)
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                <input
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value)
                    setReasonFromLastVisit(false)
                  }}
                  placeholder="Visit reason..."
                  className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                />
              </Field>
              <Field label="ICD-10 Codes">
                <input
                  value={icdCodes}
                  onChange={(e) => setIcdCodes(e.target.value.toUpperCase())}
                  placeholder="e.g. I10, E11.9"
                  className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                />
              </Field>
            </div>

            {/* Notes */}
            <Field label="Notes">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-ring"
              />
            </Field>

            {/* Price + conflict */}
            {selectedSvc && (
              <div className="flex items-center justify-between rounded-lg bg-panel-muted px-3 py-2">
                <span className="text-[10px] text-muted-foreground">CPT {selectedSvc.cpt}</span>
                <span className="text-xs font-bold tabular-nums text-foreground">R{selectedSvc.price}</span>
              </div>
            )}

            {conflict && (
              <div className="rounded-lg border border-status-warning/20 bg-status-warning/5 px-3 py-2 text-[11px] font-medium text-status-warning">
                ⚠ Time slot conflict — another appointment overlaps this window
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-status-danger/20 bg-status-danger/5 px-3 py-2 text-[11px] font-medium text-status-danger">
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground hover:text-accent-foreground/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!selectedPatient || modalDayClosed || !providerId || saving}
              className={cn(
                "rounded-lg px-4 py-1.5 text-[11px] font-bold transition-opacity",
                selectedPatient && !modalDayClosed && providerId && !saving
                  ? "bg-foreground text-background hover:opacity-90"
                  : "cursor-not-allowed bg-secondary text-muted-foreground"
              )}
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

/* ─── Scroll Time Picker ─────────────────────────────────── */

function ScrollTimePicker({
  label,
  values,
  selected,
  onSelect,
  format,
}: {
  label: string
  values: number[]
  selected: number
  onSelect: (v: number) => void
  format: (v: number) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const ITEM_H = 32

  useEffect(() => {
    const idx = values.indexOf(selected)
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" })
    }
  }, [selected, values])

  return (
    <div className="flex flex-col">
      <span className="mb-1 text-[9px] font-medium uppercase text-muted-foreground">{label}</span>
      <div
        ref={containerRef}
        className="h-[128px] w-14 overflow-y-auto rounded-lg border border-panel-border bg-panel-muted/50"
        style={{ scrollbarWidth: "none", scrollSnapType: "y mandatory" }}
      >
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            style={{ height: ITEM_H, scrollSnapAlign: "start" }}
            className={cn(
              "flex w-full items-center justify-center text-[13px] font-semibold tabular-nums transition-colors",
              v === selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-panel-muted hover:text-accent-foreground"
            )}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Field Helper ───────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
