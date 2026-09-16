import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import { isSlotBookable, type BookedAppointmentRow } from "@/lib/practice/availability"
import { parseTimeToMinutes, minutesToTimeStr } from "@/lib/practice/appointment-hours"

export type BookAppointmentPaymentType = "cash" | "card" | "medical_aid"

export type BookAppointmentInput = {
  patientId: string
  apptDate: string
  startTime: string
  endTime?: string
  durationMinutes?: number
  providerStaffId?: string | null
  service?: string | null
  reason?: string | null
  paymentType?: BookAppointmentPaymentType
  medicalAid?: string | null
  memberNumber?: string | null
  notes?: string | null
  icdCodes?: string[] | null
  totalFee?: number | null
}

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

export async function bookAppointmentForPractice(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  input: BookAppointmentInput
): Promise<
  | { ok: true; appointment: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const startMin = parseTimeToMinutes(input.startTime)
  const duration =
    input.durationMinutes ??
    (input.endTime ? parseTimeToMinutes(input.endTime) - startMin : 30)
  if (!Number.isFinite(duration) || duration < 5) {
    return { ok: false, error: "invalid_duration" }
  }
  const endMin = startMin + duration
  const startTimeNorm = minutesToTimeStr(startMin)
  const endTimeNorm = minutesToTimeStr(endMin)

  const { data: patient, error: pErr } = await supabase
    .from("practice_patients")
    .select("id, display_name_hint")
    .eq("id", input.patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (pErr || !patient) {
    return { ok: false, error: "Patient not found for this practice" }
  }

  let providerStaffId = input.providerStaffId ?? null
  if (!providerStaffId) {
    const { data: staffRow } = await supabase
      .from("practice_staff")
      .select("id")
      .eq("practice_id", practiceId)
      .limit(1)
      .maybeSingle()
    if (staffRow) providerStaffId = String((staffRow as { id: string }).id)
  }

  const [{ data: hrs }, { data: booked }] = await Promise.all([
    supabase.from("practice_hours").select("*").eq("practice_id", practiceId),
    supabase
      .from("practice_appointments")
      .select("appt_date, start_time, end_time, duration_minutes, provider_staff_id, status")
      .eq("practice_id", practiceId)
      .eq("appt_date", input.apptDate),
  ])

  const check = isSlotBookable({
    hours: mapHoursRows(hrs),
    booked: (booked ?? []) as BookedAppointmentRow[],
    date: input.apptDate,
    startMin,
    endMin,
    providerStaffId,
  })
  if (!check.ok) {
    return { ok: false, error: `slot_invalid:${check.reason}` }
  }

  const pay = input.paymentType ?? "cash"
  const insertRow: Record<string, unknown> = {
    practice_id: practiceId,
    patient_id: input.patientId,
    patient_name_snapshot: (patient as { display_name_hint?: string }).display_name_hint ?? "Patient",
    provider_staff_id: providerStaffId,
    appt_date: input.apptDate,
    start_time: startTimeNorm,
    end_time: endTimeNorm,
    hour_val: Math.floor(startMin / 60),
    minute_val: startMin % 60,
    duration_minutes: duration,
    service: input.service ?? null,
    reason: input.reason ?? null,
    status: "booked",
    payment_type: pay,
    medical_aid: pay === "medical_aid" ? input.medicalAid ?? null : null,
    member_number: pay === "medical_aid" ? input.memberNumber ?? null : null,
    notes: input.notes ?? null,
    icd_codes: input.icdCodes && input.icdCodes.length > 0 ? input.icdCodes : null,
    total_fee: input.totalFee ?? null,
  }

  const { data: inserted, error } = await supabase
    .from("practice_appointments")
    .insert(insertRow as never)
    .select("id, appt_date, start_time, end_time, patient_name_snapshot, status, payment_type")
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, appointment: inserted as Record<string, unknown> }
}
