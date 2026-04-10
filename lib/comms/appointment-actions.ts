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
