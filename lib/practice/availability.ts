import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import { parseTimeToMinutes, minutesToTimeStr, resolveDayBounds } from "@/lib/practice/appointment-hours"

export type BookedInterval = {
  startMin: number
  endMin: number
  providerStaffId?: string | null
}

export type BookedAppointmentRow = {
  appt_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes?: number | null
  provider_staff_id?: string | null
  status?: string | null
}

export type AvailableSlot = {
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  providerStaffId?: string | null
}

const SLOT_GRID_MINUTES = 15
const DEFAULT_DURATION = 30
const ACTIVE_STATUSES = new Set(["booked", "confirmed", "checked_in", "in_progress", "completed"])

function toDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}

/** Group booked rows by date + optional provider so diff is O(n). */
function intervalsByDate(
  rows: BookedAppointmentRow[],
  providerStaffId?: string | null
): Map<string, BookedInterval[]> {
  const out = new Map<string, BookedInterval[]>()
  for (const row of rows) {
    if (row.status && !ACTIVE_STATUSES.has(row.status)) continue
    if (providerStaffId && row.provider_staff_id && row.provider_staff_id !== providerStaffId) continue
    const date = toDateOnly(String(row.appt_date))
    const startMin = row.start_time ? parseTimeToMinutes(row.start_time) : null
    let endMin = row.end_time ? parseTimeToMinutes(row.end_time) : null
    if (startMin == null) continue
    if (endMin == null || endMin <= startMin) {
      endMin = startMin + (row.duration_minutes && row.duration_minutes > 0 ? row.duration_minutes : DEFAULT_DURATION)
    }
    const list = out.get(date) ?? []
    list.push({ startMin, endMin, providerStaffId: row.provider_staff_id ?? null })
    out.set(date, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.startMin - b.startMin)
  return out
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Return free slot starts for a single day on the 15-minute grid. */
function freeSlotsForDay(
  date: string,
  hours: PracticeBusinessHour[],
  booked: BookedInterval[],
  durationMinutes: number,
  limit: number
): AvailableSlot[] {
  const bounds = resolveDayBounds(hours, dayOfWeek(date))
  if (bounds.closed) return []
  const maxStart = bounds.closeMin - durationMinutes
  if (maxStart < bounds.openMin) return []
  const out: AvailableSlot[] = []
  for (let start = bounds.openMin; start <= maxStart; start += SLOT_GRID_MINUTES) {
    const end = start + durationMinutes
    const clash = booked.some((b) => overlaps(start, end, b.startMin, b.endMin))
    if (clash) continue
    out.push({
      date,
      startTime: minutesToTimeStr(start),
      endTime: minutesToTimeStr(end),
      durationMinutes,
    })
    if (out.length >= limit) break
  }
  return out
}

export function computeAvailableSlots(params: {
  hours: PracticeBusinessHour[]
  booked: BookedAppointmentRow[]
  fromDate: string
  toDate: string
  durationMinutes?: number
  providerStaffId?: string | null
  /** Hard cap across the whole window — default 40 to keep payloads small. */
  limit?: number
  /** Max slots per day — useful so a fully-open day doesn't drown out later days. */
  perDayLimit?: number
  /** Optional minimum ISO datetime (e.g. "now") to filter out past slots today. */
  notBefore?: string
}): AvailableSlot[] {
  const from = toDateOnly(params.fromDate)
  const to = toDateOnly(params.toDate)
  if (to < from) return []
  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : DEFAULT_DURATION
  const limit = params.limit ?? 40
  const perDay = params.perDayLimit ?? 8
  const grouped = intervalsByDate(params.booked, params.providerStaffId)

  let notBeforeDate = ""
  let notBeforeMin = -1
  if (params.notBefore) {
    const d = new Date(params.notBefore)
    if (!Number.isNaN(d.getTime())) {
      notBeforeDate = d.toISOString().slice(0, 10)
      notBeforeMin = d.getUTCHours() * 60 + d.getUTCMinutes()
    }
  }

  const out: AvailableSlot[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const daily = freeSlotsForDay(d, params.hours, grouped.get(d) ?? [], duration, perDay)
    for (const slot of daily) {
      if (notBeforeDate && d === notBeforeDate) {
        const startMin = parseTimeToMinutes(slot.startTime)
        if (startMin < notBeforeMin) continue
      }
      if (params.providerStaffId) slot.providerStaffId = params.providerStaffId
      out.push(slot)
      if (out.length >= limit) return out
    }
  }
  return out
}

/** True iff [startMin, endMin) fits entirely inside the given day's hours and has no clash. */
export function isSlotBookable(params: {
  hours: PracticeBusinessHour[]
  booked: BookedAppointmentRow[]
  date: string
  startMin: number
  endMin: number
  providerStaffId?: string | null
}): { ok: true } | { ok: false; reason: string } {
  if (params.endMin <= params.startMin) return { ok: false, reason: "end_before_start" }
  const bounds = resolveDayBounds(params.hours, dayOfWeek(params.date))
  if (bounds.closed) return { ok: false, reason: "closed" }
  if (params.startMin < bounds.openMin) return { ok: false, reason: "before_open" }
  if (params.endMin > bounds.closeMin) return { ok: false, reason: "after_close" }
  const grouped = intervalsByDate(params.booked, params.providerStaffId)
  const list = grouped.get(params.date) ?? []
  for (const b of list) {
    if (overlaps(params.startMin, params.endMin, b.startMin, b.endMin)) {
      return { ok: false, reason: "overlap" }
    }
  }
  return { ok: true }
}
