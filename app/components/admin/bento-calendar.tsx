"use client"

import { useWorkspace, createPatientSession, useWorkspaceStore } from "@/lib/clinical-workspace"
import type { PracticeAppointment, PracticePatient, AppointmentStatus, PaymentType } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  UserCircle,
  ShieldCheck,
  ArrowRight,
  Plus,
  X,
  Stethoscope,
  CurrencyDollar,
  Receipt,
  Tag,
  CaretLeft,
  CaretRight,
  CalendarBlank,
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

const SERVICE_CATALOG: { name: string; cpt: string; price: number }[] = [
  { name: "Consultation", cpt: "0191", price: 580 },
  { name: "Follow-up", cpt: "0190", price: 420 },
  { name: "Extended Consultation", cpt: "0192", price: 780 },
  { name: "Procedure", cpt: "0193", price: 950 },
  { name: "ECG", cpt: "3744", price: 180 },
  { name: "Blood Draw", cpt: "3739", price: 120 },
]

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  booked: "border-l-white/20",
  confirmed: "border-l-cyan-500",
  checked_in: "border-l-blue-500",
  in_progress: "border-l-indigo-500",
  completed: "border-l-[#00E676]",
  no_show: "border-l-[#EF5350]",
  cancelled: "border-l-white/10",
}

const STATUS_DOT: Record<AppointmentStatus, string> = {
  booked: "bg-white/20",
  confirmed: "bg-cyan-500",
  checked_in: "bg-blue-500",
  in_progress: "bg-indigo-500",
  completed: "bg-[#00E676]",
  no_show: "bg-[#EF5350]",
  cancelled: "bg-white/10",
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

export function BentoCalendar() {
  const {
    openPatient,
    setMode,
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

  const calendarFocusRequest = useWorkspaceStore((s) => s.calendarFocusRequest)
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

  const dayAppointments = useMemo(
    () => appointments.filter((a) => a.date === selectedDate),
    [appointments, selectedDate]
  )

  const weekStart = useMemo(() => startOfWeek(currentDate), [selectedDate])
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const weekAppointments = useMemo(() => {
    const dateStrs = new Set(weekDates.map(fmtDate))
    return appointments.filter((a) => dateStrs.has(a.date))
  }, [appointments, weekDates])

  const booked = dayAppointments.length
  const completed = dayAppointments.filter((a) => a.status === "completed").length
  const checkedIn = dayAppointments.filter((a) => a.status === "checked_in" || a.status === "in_progress").length

  const apptMap = useMemo(() => {
    const m = new Map<string, PracticeAppointment>()
    for (const a of dayAppointments) m.set(`${a.hour}:${a.minute}`, a)
    return m
  }, [dayAppointments])

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
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
            >
              <CaretLeft className="size-4" weight="bold" />
            </button>

            <div className="relative" ref={datePickerRef}>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted dark:hover:bg-white/[0.06]"
              >
                <CalendarBlank className="size-3.5 text-muted-foreground dark:text-white/40" />
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
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
            >
              <CaretRight className="size-4" weight="bold" />
            </button>

            <div className="ml-2 flex rounded-lg border border-border p-0.5 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setViewMode("day")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  viewMode === "day"
                    ? "bg-muted text-foreground dark:bg-white/[0.1]"
                    : "text-muted-foreground hover:text-foreground dark:text-white/30 dark:hover:text-white/50"
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
                    ? "bg-muted text-foreground dark:bg-white/[0.1]"
                    : "text-muted-foreground hover:text-foreground dark:text-white/30 dark:hover:text-white/50"
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
                Done: <span className="font-bold text-[#00E676]">{completed}</span>
              </span>
              <span className="text-muted-foreground">
                Waiting: <span className="font-bold text-blue-400">{checkedIn}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
            >
              <Plus className="size-3.5" />
              New Appointment
            </button>
          </div>
        </div>

        {/* View */}
        {viewMode === "day" ? (
          <DayView slots={daySlots} dayClosed={dayClosed} apptMap={apptMap} onSelect={setSelected} />
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
              onClose={() => setSelected(null)}
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
  apptMap,
  onSelect,
}: {
  slots: { hour: number; minute: number }[]
  dayClosed: boolean
  apptMap: Map<string, PracticeAppointment>
  onSelect: (a: PracticeAppointment) => void
}) {
  if (dayClosed || slots.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-6 py-16 dark:border-white/[0.05] dark:bg-white/[0.015]">
        <CalendarBlank className="mb-3 size-10 text-muted-foreground/40 dark:text-white/15" />
        <p className="max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground">
          {dayClosed
            ? "This practice is closed on this day. Change operating hours in Settings → Practice."
            : "No time slots — check open and close times in Practice settings."}
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/70 dark:border-white/[0.05] dark:bg-white/[0.015]"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="relative">
        {slots.map(({ hour, minute }) => {
          const key = `${hour}:${minute}`
          const appt = apptMap.get(key)
          const ts = timeStr(hour, minute)
          const isHalfHour = minute === 30

          return (
            <div
              key={key}
              className={cn(
                "flex min-h-[44px] items-stretch",
                isHalfHour ? "border-t border-border/50 dark:border-white/[0.03]" : "border-t border-border dark:border-white/[0.06]"
              )}
            >
              <div className="flex w-14 shrink-0 items-start justify-end pr-3 pt-1.5">
                {!isHalfHour && <span className="text-[10px] tabular-nums text-muted-foreground dark:text-white/25">{ts}</span>}
              </div>
              <div className="flex-1 py-0.5 pr-2">
                {appt && (
                  <button
                    type="button"
                    onClick={() => onSelect(appt)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border-l-2 bg-muted/40 px-3 py-2 text-left transition-all hover:bg-muted dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
                      STATUS_COLOR[appt.status]
                    )}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[appt.status])} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-medium text-foreground">{appt.patientName}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground dark:text-white/30">{appt.reason}</span>
                    </div>
                    <PaymentBadge paymentType={appt.paymentType} medicalAid={appt.medicalAid} />
                  </button>
                )}
              </div>
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
      className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card/70 dark:border-white/[0.05] dark:bg-white/[0.015]"
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
                  "border-b border-border px-2 py-2 text-center transition-colors hover:bg-muted/50 dark:border-white/[0.05] dark:hover:bg-white/[0.04]",
                  isSelected && "bg-muted/60 dark:bg-white/[0.04]"
                )}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-white/30">
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
                      "w-full rounded-md border-l-2 bg-muted/40 px-1.5 py-1 text-left transition-all hover:bg-muted dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
                      STATUS_COLOR[a.status]
                    )}
                  >
                    <div className="truncate text-[10px] font-medium text-foreground">{a.patientName}</div>
                    <div className="text-[9px] tabular-nums text-muted-foreground dark:text-white/30">{a.startTime}</div>
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
  onClose,
  onStartScribe,
}: {
  appointment: PracticeAppointment
  onClose: () => void
  onStartScribe: () => void
}) {
  return (
    <div className="flex h-full w-[320px] flex-col rounded-2xl border border-white/[0.05] bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold">{appointment.patientName}</h3>
          <p className="text-[10px] text-white/30">
            {appointment.startTime}–{appointment.endTime} · {appointment.service ?? "Consultation"}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-white/30 hover:text-white/60">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="space-y-4 p-4">
          {/* Status chip */}
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                appointment.status === "completed"
                  ? "bg-[#00E676]/10 text-[#00E676]"
                  : appointment.status === "in_progress"
                    ? "bg-indigo-500/10 text-indigo-400"
                    : appointment.status === "checked_in"
                      ? "bg-blue-500/10 text-blue-400"
                      : appointment.status === "no_show"
                        ? "bg-[#EF5350]/10 text-[#EF5350]"
                        : appointment.status === "cancelled"
                          ? "bg-white/[0.04] text-white/30"
                          : "bg-white/[0.06] text-white/50"
              )}
            >
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[appointment.status])} />
              {STATUS_LABEL[appointment.status]}
            </span>
            <PaymentBadge paymentType={appointment.paymentType} medicalAid={appointment.medicalAid} />
          </div>

          <DetailRow icon={<UserCircle className="size-3.5" />} label="Patient" value={appointment.patientName} />
          <DetailRow icon={<Stethoscope className="size-3.5" />} label="Reason" value={appointment.reason ?? "—"} />
          <DetailRow icon={<CalendarBlank className="size-3.5" />} label="Date" value={appointment.date} />
          <DetailRow
            icon={<Receipt className="size-3.5" />}
            label="Duration"
            value={`${appointment.duration} min`}
          />

          {appointment.medicalAid && (
            <>
              <DetailRow icon={<ShieldCheck className="size-3.5" />} label="Medical Aid" value={appointment.medicalAid} />
              {appointment.memberNumber && (
                <DetailRow icon={<Tag className="size-3.5" />} label="Member #" value={appointment.memberNumber} />
              )}
            </>
          )}

          {appointment.icdCodes && appointment.icdCodes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-white/20">ICD-10 Codes</p>
              <div className="flex flex-wrap gap-1">
                {appointment.icdCodes.map((c) => (
                  <span key={c} className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {appointment.notes && (
            <div>
              <p className="mb-1 text-[9px] font-medium uppercase tracking-wider text-white/20">Notes</p>
              <p className="text-[11px] leading-relaxed text-white/50">{appointment.notes}</p>
            </div>
          )}

          {appointment.totalFee != null && (
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] text-white/40">
                  <CurrencyDollar className="size-3" /> Total Fee
                </span>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  R{appointment.totalFee.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/[0.05] p-4">
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
      <p className="mb-0.5 flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-white/20">
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
      <span className="flex items-center gap-0.5 rounded-full bg-[#00E676]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#00E676]">
        <ShieldCheck className="size-2.5" weight="fill" />
        {medicalAid ?? "MA"}
      </span>
    )
  }
  if (paymentType === "split") {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-purple-400">
        <ShieldCheck className="size-2.5" weight="fill" />
        Split
      </span>
    )
  }
  return <span className="rounded-full bg-[#FFC107]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#FFC107]">Cash</span>
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
    <div className="w-[240px] rounded-xl border border-white/[0.08] bg-[#0c0c0c] p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded p-0.5 text-white/40 hover:text-white/70">
          <CaretLeft className="size-3.5" weight="bold" />
        </button>
        <span className="text-[11px] font-semibold text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="rounded p-0.5 text-white/40 hover:text-white/70">
          <CaretRight className="size-3.5" weight="bold" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-1 text-[8px] font-semibold uppercase text-white/20">
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
                    ? "bg-white/[0.08] font-bold text-foreground"
                    : "text-white/50 hover:bg-white/[0.06] hover:text-foreground"
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
  patients,
  appointments,
  practiceProviders,
  practiceHours,
  initialDate,
  onClose,
  onCreate,
}: {
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
  const [medicalAid, setMedicalAid] = useState("")
  const [memberNumber, setMemberNumber] = useState("")
  const [coPay, setCoPay] = useState("")
  const [maAmount, setMaAmount] = useState("")
  const [providerId, setProviderId] = useState("")
  const [icdCodes, setIcdCodes] = useState("")
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
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
      if (a.date !== date) return false
      const aStart = a.hour * 60 + a.minute
      const aEnd = aStart + a.duration
      return startMin < aEnd && endMin > aStart
    })
  }, [appointments, date, selectedHour, selectedMinute, duration])

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

  const handleCreate = useCallback(() => {
    if (!selectedPatient || modalDayClosed || !providerId) return
    const st = timeStr(selectedHour, selectedMinute)
    const et = timeStr(endHour.hour, endHour.minute)
    const codes = icdCodes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)

    onCreate({
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
      paymentType,
      medicalAid: paymentType !== "cash" ? medicalAid : undefined,
      memberNumber: paymentType !== "cash" ? memberNumber : undefined,
      notes: notes || undefined,
      icdCodes: codes.length > 0 ? codes : undefined,
      totalFee: selectedSvc?.price ?? 0,
    })
  }, [
    selectedPatient, selectedHour, selectedMinute, endHour, duration,
    service, paymentType, medicalAid, memberNumber, providerId,
    date, icdCodes, notes, reason, selectedSvc, onCreate, modalDayClosed,
  ])

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="fixed inset-x-0 top-[8%] z-[51] mx-auto w-full max-w-lg"
      >
        <div className="max-h-[84vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-5 shadow-2xl" style={{ scrollbarWidth: "none" }}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">New Appointment</h3>
            <button type="button" onClick={onClose} className="text-white/30 hover:text-white/60">
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
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                />
                {selectedPatient && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null)
                      setPatientSearch("")
                      patientInputRef.current?.focus()
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
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
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#111] shadow-xl"
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
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                        >
                          <UserCircle className="size-4 text-white/30" />
                          <div>
                            <div className="text-[11px] font-medium text-foreground">{p.name}</div>
                            {p.medicalAidScheme && (
                              <div className="text-[9px] text-white/30">
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
                  className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-foreground transition-colors hover:border-white/[0.15]"
                >
                  <CalendarBlank className="size-3.5 text-white/40" />
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
                <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/35">
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
                  <div className="flex items-end pb-1 pl-1 text-[11px] text-white/30">
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
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none focus:border-white/[0.15]"
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
                  onChange={(e) => setService(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none focus:border-white/[0.15]"
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
            <Field label="Payment Type">
              <div className="flex gap-1.5">
                {(["cash", "medical_aid", "split"] as PaymentType[]).map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPaymentType(pt)}
                    className={cn(
                      "flex-1 rounded-lg py-2 text-center text-[11px] font-semibold transition-all",
                      paymentType === pt
                        ? pt === "cash"
                          ? "bg-[#FFC107]/15 text-[#FFC107] ring-1 ring-[#FFC107]/30"
                          : pt === "medical_aid"
                            ? "bg-[#00E676]/15 text-[#00E676] ring-1 ring-[#00E676]/30"
                            : "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30"
                        : "bg-white/[0.04] text-white/30 hover:bg-white/[0.06]"
                    )}
                  >
                    {pt === "cash" ? "Cash" : pt === "medical_aid" ? "Medical Aid" : "Split"}
                  </button>
                ))}
              </div>
            </Field>

            {/* MA fields */}
            <AnimatePresence>
              {paymentType !== "cash" && (
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
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                        />
                      </Field>
                      <Field label="Member #">
                        <input
                          value={memberNumber}
                          onChange={(e) => setMemberNumber(e.target.value)}
                          placeholder="Member number"
                          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                        />
                      </Field>
                    </div>
                    {paymentType === "split" && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="MA Amount">
                          <input
                            value={maAmount}
                            onChange={(e) => setMaAmount(e.target.value)}
                            placeholder="R0.00"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                          />
                        </Field>
                        <Field label="Patient Co-pay">
                          <input
                            value={coPay}
                            onChange={(e) => setCoPay(e.target.value)}
                            placeholder="R0.00"
                            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                  className="relative z-[60] w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-2 text-[12px] text-foreground outline-none focus:border-white/[0.15]"
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
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Visit reason..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                />
              </Field>
              <Field label="ICD-10 Codes">
                <input
                  value={icdCodes}
                  onChange={(e) => setIcdCodes(e.target.value.toUpperCase())}
                  placeholder="e.g. I10, E11.9"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
                />
              </Field>
            </div>

            {/* Notes */}
            <Field label="Notes">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] outline-none placeholder:text-white/20 focus:border-white/[0.15]"
              />
            </Field>

            {/* Price + conflict */}
            {selectedSvc && (
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="text-[10px] text-white/40">CPT {selectedSvc.cpt}</span>
                <span className="text-xs font-bold tabular-nums text-foreground">R{selectedSvc.price}</span>
              </div>
            )}

            {conflict && (
              <div className="rounded-lg border border-[#FFC107]/20 bg-[#FFC107]/5 px-3 py-2 text-[11px] font-medium text-[#FFC107]">
                ⚠ Time slot conflict — another appointment overlaps this window
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!selectedPatient || modalDayClosed || !providerId}
              className={cn(
                "rounded-lg px-4 py-1.5 text-[11px] font-bold transition-opacity",
                selectedPatient && !modalDayClosed && providerId
                  ? "bg-foreground text-background hover:opacity-90"
                  : "cursor-not-allowed bg-white/[0.06] text-white/20"
              )}
            >
              Create
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
      <span className="mb-1 text-[9px] font-medium uppercase text-white/20">{label}</span>
      <div
        ref={containerRef}
        className="h-[128px] w-14 overflow-y-auto rounded-lg border border-white/[0.08] bg-white/[0.02]"
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
              v === selected ? "bg-white/[0.1] text-foreground" : "text-white/25 hover:bg-white/[0.04] hover:text-white/50"
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
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/25">{label}</label>
      {children}
    </div>
  )
}
