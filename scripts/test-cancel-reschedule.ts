/**
 * Smoke test for appointment cancel/reschedule helpers (DB must be reachable).
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-cancel-reschedule.ts
 *
 * Requires: TEST_PRACTICE_ID, TEST_PATIENT_ID, Supabase env vars (see lib/supabase/admin.ts)
 */
import { createAdminClient } from "../lib/supabase/admin"
import {
  cancelAppointment,
  getUpcomingAppointments,
  rescheduleAppointment,
} from "../lib/comms/appointment-actions"

async function main() {
  const practiceId = process.env.TEST_PRACTICE_ID
  const patientId = process.env.TEST_PATIENT_ID
  if (!practiceId || !patientId) {
    console.error("Set TEST_PRACTICE_ID and TEST_PATIENT_ID to run this script.")
    process.exit(1)
  }

  const db = createAdminClient()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]

  const { data: created, error: insErr } = await db
    .from("practice_appointments")
    .insert({
      practice_id: practiceId,
      patient_id: patientId,
      patient_name_snapshot: "Test Patient",
      appt_date: tomorrow,
      start_time: "10:00",
      end_time: "10:30",
      duration_minutes: 30,
      status: "booked",
      hour_val: 10,
      minute_val: 0,
      metadata: {},
    })
    .select("id")
    .single()

  if (insErr || !created) {
    console.error("Insert fixture failed:", insErr?.message)
    process.exit(1)
  }

  const apptId = created.id as string

  const list = await getUpcomingAppointments(practiceId, patientId, 5)
  console.log("getUpcomingAppointments count:", list.length)

  const cancelRes = await cancelAppointment({
    practiceId,
    patientId,
    appointmentId: apptId,
    cancellationChannel: "sms",
    cancellationReason: "test script",
  })
  console.log("cancel:", cancelRes.ok, cancelRes.message)

  const { data: created2 } = await db
    .from("practice_appointments")
    .insert({
      practice_id: practiceId,
      patient_id: patientId,
      patient_name_snapshot: "Test Patient",
      appt_date: tomorrow,
      start_time: "11:00",
      end_time: "11:30",
      duration_minutes: 30,
      status: "booked",
      hour_val: 11,
      minute_val: 0,
      metadata: {},
    })
    .select("id")
    .single()

  if (!created2) {
    console.error("Second insert failed")
    process.exit(1)
  }

  const appt2 = created2.id as string
  const nextDay = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0]
  const resched = await rescheduleAppointment({
    practiceId,
    patientId,
    appointmentId: appt2,
    newDate: nextDay,
    newStartTime: "14:00",
    channel: "sms",
  })
  console.log("reschedule:", resched.ok, resched.message)

  await db.from("practice_appointments").delete().eq("id", appt2)
  console.log("OK — cleaned up test rows")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
