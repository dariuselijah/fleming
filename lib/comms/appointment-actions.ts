import { createAdminClient } from "@/lib/supabase/admin"
import { findPatientByPracticePhone } from "./patient-phone"

/**
 * Resolve patient id from thread link or phone match (WhatsApp external_party).
 */
export async function resolvePatientIdForThread(
  practiceId: string,
  threadPatientId: string | undefined,
  externalParty: string
): Promise<string | null> {
  if (threadPatientId) return threadPatientId
  const row = await findPatientByPracticePhone(practiceId, externalParty)
  return row?.id ?? null
}

export async function getNextUpcomingAppointment(
  practiceId: string,
  patientId: string
): Promise<{
  id: string
  appt_date: string
  start_time: string
  status: string
  metadata: Record<string, unknown>
} | null> {
  const db = createAdminClient()
  const today = new Date().toISOString().split("T")[0]

  const { data } = await db
    .from("practice_appointments")
    .select("id, appt_date, start_time, status, metadata")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .in("status", ["booked", "confirmed"])
    .gte("appt_date", today)
    .order("appt_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle()

  return data as {
    id: string
    appt_date: string
    start_time: string
    status: string
    metadata: Record<string, unknown>
  } | null
}

/**
 * Patient replied CONFIRM to a reminder — mark next upcoming slot as confirmed in DB.
 */
export async function confirmUpcomingAppointmentFromReminder(opts: {
  practiceId: string
  patientId: string
}): Promise<{ ok: boolean; appointmentId?: string; message: string }> {
  const appt = await getNextUpcomingAppointment(opts.practiceId, opts.patientId)
  if (!appt) {
    return { ok: false, message: "No upcoming appointment found to confirm." }
  }

  const db = createAdminClient()
  const meta = { ...(appt.metadata || {}), reminder_confirmed_at: new Date().toISOString() }

  const { error } = await db
    .from("practice_appointments")
    .update({
      status: appt.status === "booked" ? "confirmed" : appt.status,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appt.id)

  if (error) {
    return { ok: false, message: `Could not update appointment: ${error.message}` }
  }

  return {
    ok: true,
    appointmentId: appt.id,
    message: `Thanks — we've recorded your confirmation for ${appt.appt_date} at ${appt.start_time}.`,
  }
}

export type UpcomingAppointmentRow = {
  id: string
  appt_date: string
  start_time: string
  end_time: string
  service: string | null
  status: string
}

/** Full row shape for cancel/reschedule DB updates */
type AppointmentMutationRow = {
  id: string
  appt_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  patient_id: string | null
  provider_staff_id: string | null
  metadata: Record<string, unknown>
  status: string
}

export async function getUpcomingAppointments(
  practiceId: string,
  patientId: string,
  limit = 5
): Promise<UpcomingAppointmentRow[]> {
  const db = createAdminClient()
  const today = new Date().toISOString().split("T")[0]

  const { data, error } = await db
    .from("practice_appointments")
    .select("id, appt_date, start_time, end_time, service, status")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .in("status", ["booked", "confirmed"])
    .gte("appt_date", today)
    .order("appt_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit)

  if (error) {
    console.error("[getUpcomingAppointments]", error.message)
    return []
  }
  return (data || []) as UpcomingAppointmentRow[]
}

export async function cancelAppointment(opts: {
  practiceId: string
  patientId: string
  appointmentId?: string
  cancellationChannel: "voice" | "sms"
  cancellationReason?: string
}): Promise<{ ok: boolean; message: string; appointmentId?: string }> {
  const db = createAdminClient()
  let row:
    | {
        id: string
        appt_date: string
        start_time: string
        metadata: Record<string, unknown>
      }
    | null
    | undefined

  if (opts.appointmentId) {
    const { data } = await db
      .from("practice_appointments")
      .select("id, appt_date, start_time, metadata, patient_id, status")
      .eq("id", opts.appointmentId)
      .eq("practice_id", opts.practiceId)
      .maybeSingle()
    if (!data || data.patient_id !== opts.patientId) {
      return { ok: false, message: "That appointment was not found for this patient." }
    }
    if (!["booked", "confirmed"].includes(data.status)) {
      return { ok: false, message: "This appointment is not active and cannot be cancelled here." }
    }
    row = data
  } else {
    const next = await getNextUpcomingAppointment(opts.practiceId, opts.patientId)
    if (!next) {
      return { ok: false, message: "No upcoming appointment on file to cancel." }
    }
    row = next
  }

  const now = new Date().toISOString()
  const meta = {
    ...(row.metadata || {}),
    cancelled_at: now,
    cancelled_by: "patient_agent",
    cancellation_channel: opts.cancellationChannel,
    ...(opts.cancellationReason ? { cancellation_reason: opts.cancellationReason } : {}),
  }

  const { error } = await db
    .from("practice_appointments")
    .update({
      status: "cancelled",
      metadata: meta,
      updated_at: now,
    })
    .eq("id", row.id)

  if (error) {
    return { ok: false, message: `Could not cancel: ${error.message}` }
  }

  return {
    ok: true,
    appointmentId: row.id,
    message: `Cancelled appointment on ${row.appt_date} at ${row.start_time}.`,
  }
}

export async function rescheduleAppointment(opts: {
  practiceId: string
  patientId: string
  appointmentId?: string
  newDate: string
  newStartTime: string
  newEndTime?: string
  providerStaffId?: string
  channel: "voice" | "sms"
}): Promise<{ ok: boolean; message: string; appointmentId?: string }> {
  const db = createAdminClient()

  let row: AppointmentMutationRow | null = null

  if (opts.appointmentId) {
    const { data } = await db
      .from("practice_appointments")
      .select(
        "id, appt_date, start_time, end_time, duration_minutes, patient_id, provider_staff_id, metadata, status"
      )
      .eq("id", opts.appointmentId)
      .eq("practice_id", opts.practiceId)
      .maybeSingle()
    if (!data || data.patient_id !== opts.patientId) {
      return { ok: false, message: "That appointment was not found for this patient." }
    }
    if (!["booked", "confirmed"].includes(data.status)) {
      return { ok: false, message: "This appointment is not active and cannot be rescheduled here." }
    }
    row = data as AppointmentMutationRow
  } else {
    const next = await getNextUpcomingAppointment(opts.practiceId, opts.patientId)
    if (!next) {
      return { ok: false, message: "No upcoming appointment on file to reschedule." }
    }
    const { data: full } = await db
      .from("practice_appointments")
      .select(
        "id, appt_date, start_time, end_time, duration_minutes, patient_id, provider_staff_id, metadata, status"
      )
      .eq("id", next.id)
      .single()
    if (!full) {
      return { ok: false, message: "Appointment not found." }
    }
    row = full as AppointmentMutationRow
  }

  if (!row) return { ok: false, message: "Appointment not found." }

  const duration =
    row.duration_minutes ||
    Math.max(
      15,
      timeToMinutes(row.end_time) - timeToMinutes(row.start_time) || 30
    )
  const endTime =
    opts.newEndTime ||
    minutesToTime(timeToMinutes(opts.newStartTime) + duration)

  const providerId = opts.providerStaffId ?? row.provider_staff_id

  const { data: conflicts } = await db
    .from("practice_appointments")
    .select("id")
    .eq("practice_id", opts.practiceId)
    .eq("appt_date", opts.newDate)
    .eq("start_time", opts.newStartTime)
    .in("status", ["booked", "confirmed", "checked_in", "in_progress"])
    .neq("id", row.id)
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    return {
      ok: false,
      message: "That time slot is no longer available. Please choose another.",
    }
  }

  const hourVal = parseInt(opts.newStartTime.split(":")[0], 10)
  const minuteVal = parseInt(opts.newStartTime.split(":")[1], 10)
  const now = new Date().toISOString()
  const meta = {
    ...(row.metadata || {}),
    rescheduled_at: now,
    rescheduled_channel: opts.channel,
    previous: { date: row.appt_date, startTime: row.start_time, endTime: row.end_time },
  }

  const { error } = await db
    .from("practice_appointments")
    .update({
      appt_date: opts.newDate,
      start_time: opts.newStartTime,
      end_time: endTime,
      hour_val: hourVal,
      minute_val: minuteVal,
      provider_staff_id: providerId ?? null,
      metadata: meta,
      updated_at: now,
    })
    .eq("id", row.id)

  if (error) {
    return { ok: false, message: `Could not reschedule: ${error.message}` }
  }

  return {
    ok: true,
    appointmentId: row.id,
    message: `Rescheduled to ${opts.newDate} at ${opts.newStartTime}.`,
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10))
  return (h || 0) * 60 + (m || 0)
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
