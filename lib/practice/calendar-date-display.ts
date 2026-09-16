/** Calendar copy for practice appointment dates (stored as YYYY-MM-DD, interpreted as UTC calendar day). */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
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
] as const

function utcParts(isoDate: string) {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  return {
    d,
    ok: !Number.isNaN(d.getTime()),
    weekday: DAY_LABELS[d.getUTCDay()] ?? "",
    month: MONTH_LABELS[d.getUTCMonth()] ?? "",
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
  }
}

/** e.g. "Thu, April 23" (matches slot card day headers). */
export function formatDayHeadingLong(isoDate: string): string {
  const { ok, weekday, month, day } = utcParts(isoDate)
  if (!ok) return isoDate
  return `${weekday}, ${month} ${day}`
}

/** e.g. "Thursday, 24 April 2026" for confirmations and lists. */
export function formatDayHeadingWithYear(isoDate: string): string {
  const { ok, weekday, month, day, year } = utcParts(isoDate)
  if (!ok) return isoDate
  return `${weekday}, ${day} ${month} ${year}`
}

/** Range line under the slot card, e.g. "April 22–24, 2026" or "30 April – 2 May 2026". */
export function formatSearchWindowFooter(fromIso: string, toIso: string): string {
  const a = utcParts(fromIso)
  const b = utcParts(toIso)
  if (!a.ok || !b.ok) return `${fromIso} – ${toIso}`

  if (a.year === b.year && a.month === b.month) {
    if (a.day === b.day) return `${a.month} ${a.day}, ${a.year}`
    return `${a.month} ${a.day}–${b.day}, ${a.year}`
  }
  if (a.year === b.year) {
    return `${a.month} ${a.day} – ${b.month} ${b.day}, ${a.year}`
  }
  return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`
}
