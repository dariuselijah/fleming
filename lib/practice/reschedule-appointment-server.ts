import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import { isSlotBookable, type BookedAppointmentRow } from "@/lib/practice/availability"
import { minutesToTimeStr, parseTimeToMinutes } from "@/lib/practice/appointment-hours"

function mapHoursRows(rows: unknown): PracticeBusinessHour[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      dayOfWeek: Number(r.day_of_week ?? 0),
      openTime: String(r.open_time ?? "08:00"),
      closeTime: String(r.close_time ?? "17:00"),
      isClosed: Boolean(r.is_closed),
    }
  })
}

export async function rescheduleAppointmentForPractice(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  params: {
    appointmentId: string
    startTime: string
    endTime: string
    apptDate?: string
    providerStaffId?: string | null
  }
): Promise<
  | { ok: true; appointmentId: string; apptDate: string; startTime: string; endTime: string }
  | { ok: false; error: string }
> {
  const { appointmentId, startTime, endTime, apptDate } = params

  const { data: existing, error: exErr } = await supabase
    .from("practice_appointments")
    .select("id, appt_date, provider_staff_id")
    .eq("id", appointmentId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (exErr || !existing) {
    return { ok: false, error: "Appointment not found for this practice" }
  }

  const targetDate = apptDate ?? String((existing as { appt_date: string }).appt_date)
  const startMin = parseTimeToMinutes(startTime)
  const endMin = parseTimeToMinutes(endTime)
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return { ok: false, error: "invalid_time_range" }
  }
  const normalizedStart = minutesToTimeStr(startMin)
  const normalizedEnd = minutesToTimeStr(endMin)
  const providerStaffId =
    params.providerStaffId !== undefined
      ? params.providerStaffId
      : (existing as { provider_staff_id?: string | null }).provider_staff_id ?? null

  const [{ data: hrs }, { data: booked }] = await Promise.all([
    supabase.from("practice_hours").select("*").eq("practice_id", practiceId),
    supabase
      .from("practice_appointments")
      .select("appt_date, start_time, end_time, duration_minutes, provider_staff_id, status")
      .eq("practice_id", practiceId)
      .eq("appt_date", targetDate)
      .neq("id", appointmentId),
  ])

  const check = isSlotBookable({
    hours: mapHoursRows(hrs),
    booked: (booked ?? []) as BookedAppointmentRow[],
    date: targetDate,
    startMin,
    endMin,
    providerStaffId,
  })
  if (!check.ok) {
    return { ok: false, error: `slot_invalid:${check.reason}` }
  }

  const patch: Record<string, unknown> = {
    start_time: normalizedStart,
    end_time: normalizedEnd,
    hour_val: Math.floor(startMin / 60),
    minute_val: startMin % 60,
    duration_minutes: endMin - startMin,
    updated_at: new Date().toISOString(),
  }
  if (apptDate) patch.appt_date = apptDate
  if (params.providerStaffId !== undefined) patch.provider_staff_id = params.providerStaffId

  const { data, error } = await supabase
    .from("practice_appointments")
    .update(patch as never)
    .eq("id", appointmentId)
    .eq("practice_id", practiceId)
    .select("id")

  const updated = (data ?? []) as Array<Record<string, unknown>>
  if (error) {
    return { ok: false, error: error.message }
  }
  if (updated.length === 0) {
    return { ok: false, error: "Appointment not found for this practice" }
  }

  return {
    ok: true,
    appointmentId,
    apptDate: targetDate,
    startTime: normalizedStart,
    endTime: normalizedEnd,
  }
}
