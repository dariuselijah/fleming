import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"

const FALLBACK_OPEN = 8 * 60
const FALLBACK_CLOSE = 18 * 60

export function parseTimeToMinutes(t: string): number {
  const parts = t.split(":")
  const h = Number(parts[0])
  const m = Number(parts[1] ?? 0)
  if (Number.isNaN(h)) return 0
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

export function minutesToTimeStr(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Half-hour grid rows for the day view (each row is a slot start time). */
export function dayViewSlotStarts(openMin: number, closeMin: number): { hour: number; minute: number }[] {
  const out: { hour: number; minute: number }[] = []
  for (let m = openMin; m < closeMin; m += 30) {
    out.push({ hour: Math.floor(m / 60), minute: m % 60 })
  }
  return out
}

export function resolveDayBounds(
  hours: PracticeBusinessHour[],
  dayOfWeek: number
): { closed: boolean; openMin: number; closeMin: number } {
  const row = hours.find((h) => h.dayOfWeek === dayOfWeek)
  if (!row) {
    return { closed: false, openMin: FALLBACK_OPEN, closeMin: FALLBACK_CLOSE }
  }
  if (row.isClosed) {
    return { closed: true, openMin: FALLBACK_OPEN, closeMin: FALLBACK_CLOSE }
  }
  const openMin = parseTimeToMinutes(row.openTime)
  let closeMin = parseTimeToMinutes(row.closeTime)
  if (closeMin <= openMin) closeMin = openMin + 60
  return { closed: false, openMin, closeMin }
}

/** Latest minute a visit can *start* so it ends by close (same rule as comms booking). */
export function maxStartMinuteForDuration(closeMin: number, durationMinutes: number): number {
  return Math.max(0, closeMin - durationMinutes)
}

const MINUTE_STEPS = [0, 15, 30, 45] as const

export function validHourValues(openMin: number, closeMin: number, durationMinutes: number): number[] {
  const maxStart = maxStartMinuteForDuration(closeMin, durationMinutes)
  const minH = Math.floor(openMin / 60)
  const maxH = Math.floor(maxStart / 60)
  const hours: number[] = []
  for (let h = minH; h <= maxH; h++) hours.push(h)
  return hours
}

export function validMinuteValues(
  hour: number,
  openMin: number,
  closeMin: number,
  durationMinutes: number
): number[] {
  const maxStart = maxStartMinuteForDuration(closeMin, durationMinutes)
  return MINUTE_STEPS.filter((minute) => {
    const t = hour * 60 + minute
    return t >= openMin && t <= maxStart
  })
}

export function clampStartTime(
  hour: number,
  minute: number,
  openMin: number,
  closeMin: number,
  durationMinutes: number
): { hour: number; minute: number } {
  const maxStart = maxStartMinuteForDuration(closeMin, durationMinutes)
  let t = hour * 60 + minute
  t = Math.max(openMin, Math.min(t, maxStart))
  const aligned = Math.round(t / 15) * 15
  t = Math.max(openMin, Math.min(aligned, maxStart))
  return { hour: Math.floor(t / 60), minute: t % 60 }
}
