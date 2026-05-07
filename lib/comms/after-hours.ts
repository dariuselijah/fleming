import { createAdminClient } from "@/lib/supabase/admin"
import type { PracticeHours } from "./types"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export async function getPracticeHours(practiceId: string): Promise<PracticeHours[]> {
  const { data } = await createAdminClient()
    .from("practice_hours")
    .select("*")
    .eq("practice_id", practiceId)
    .order("day_of_week")

  return (data || []).map((r) => ({
    id: r.id,
    practiceId: r.practice_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    isClosed: r.is_closed,
    label: r.label || undefined,
  }))
}

export function isCurrentlyOpen(hours: PracticeHours[]): boolean {
  const now = new Date()
  // SAST is UTC+2
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const day = sast.getUTCDay()
  const timeStr = `${String(sast.getUTCHours()).padStart(2, "0")}:${String(sast.getUTCMinutes()).padStart(2, "0")}`

  const todayHours = hours.find((h) => h.dayOfWeek === day)
  if (!todayHours || todayHours.isClosed) return false

  return timeStr >= todayHours.openTime && timeStr < todayHours.closeTime
}

export function formatHoursForAgent(hours: PracticeHours[]): string {
  if (hours.length === 0) return "Practice hours not configured."

  const lines: string[] = []
  for (let day = 1; day <= 5; day++) {
    const h = hours.find((hr) => hr.dayOfWeek === day)
    if (!h || h.isClosed) {
      lines.push(`${DAY_NAMES[day]}: Closed`)
    } else {
      lines.push(`${DAY_NAMES[day]}: ${h.openTime} - ${h.closeTime}`)
    }
  }
  // Weekend
  for (const day of [6, 0]) {
    const h = hours.find((hr) => hr.dayOfWeek === day)
    if (!h || h.isClosed) {
      lines.push(`${DAY_NAMES[day]}: Closed`)
    } else {
      lines.push(`${DAY_NAMES[day]}: ${h.openTime} - ${h.closeTime}`)
    }
  }
  return lines.join("\n")
}

export function getAfterHoursMessage(practiceName: string, hours: PracticeHours[]): string {
  return `Thank you for contacting ${practiceName}. We are currently closed.\n\n` +
    `Our hours are:\n${formatHoursForAgent(hours)}\n\n` +
    `For emergencies, please call ER24 at 084 124 or 112.\n\n` +
    `You can still book an appointment for when we reopen — just tell me what you need.`
}
