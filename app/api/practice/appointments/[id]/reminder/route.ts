import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import {
  normalizePhoneE164Za,
  resolvePatientPhoneE164,
} from "@/lib/comms/patient-phone"
import { getPracticeMessagingNumber } from "@/lib/comms/threads"
import { sendSmsMessage } from "@/lib/comms/twilio"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST /api/practice/appointments/[id]/reminder
 *
 * Sends an SMS appointment reminder. Resolution chain:
 *   1. explicit `phoneE164` in the body (the inline "Add phone" card posts this)
 *   2. `practice_patients.phone_e164` column
 *   3. WhatsApp thread / display_name_hint via `resolvePatientPhoneE164`
 *
 * When the request carries a phone, the `phone_e164` column is backfilled
 * so subsequent reminders skip the fallback chain.
 */
export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  const { id: appointmentId } = await context.params
  if (!appointmentId || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return NextResponse.json({ ok: false, error: "Bad appointment id" }, { status: 400 })
  }

  let body: { phoneE164?: string | null } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body is fine */
  }

  const { data: appt } = await ctx.supabase
    .from("practice_appointments")
    .select("id, patient_id, appt_date, start_time, patient_name_snapshot, service")
    .eq("id", appointmentId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()

  if (!appt) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 })
  }

  const patientId = (appt as { patient_id: string | null }).patient_id
  if (!patientId) {
    return NextResponse.json({ ok: false, error: "Appointment has no patient" }, { status: 400 })
  }

  let resolved: string | null = null
  let shouldBackfill = false

  const bodyPhone = typeof body.phoneE164 === "string" ? body.phoneE164.trim() : ""
  if (bodyPhone) {
    resolved = normalizePhoneE164Za(bodyPhone)
    shouldBackfill = true
  }

  if (!resolved) {
    const { data: pat } = await ctx.supabase
      .from("practice_patients")
      .select("phone_e164")
      .eq("id", patientId)
      .eq("practice_id", ctx.practiceId)
      .maybeSingle()
    const col = (pat as { phone_e164?: string | null } | null)?.phone_e164
    if (col && col.trim()) resolved = col.trim()
  }

  if (!resolved) {
    const viaResolver = await resolvePatientPhoneE164(ctx.supabase, ctx.practiceId, patientId)
    if (viaResolver) {
      resolved = viaResolver
      shouldBackfill = true
    }
  }

  if (!resolved) {
    return NextResponse.json(
      { ok: false, needsPhone: true, error: "No phone on file for this patient." },
      { status: 400 }
    )
  }

  if (shouldBackfill) {
    await ctx.supabase
      .from("practice_patients")
      .update({ phone_e164: resolved } as never)
      .eq("id", patientId)
      .eq("practice_id", ctx.practiceId)
  }

  const from = await getPracticeMessagingNumber(ctx.practiceId)
  if (!from) {
    return NextResponse.json(
      { ok: false, error: "Practice messaging number not configured." },
      { status: 400 }
    )
  }

  const patientName = (appt as { patient_name_snapshot?: string | null }).patient_name_snapshot ?? "You"
  const service = (appt as { service?: string | null }).service ?? null
  const startShort = String((appt as { start_time: string }).start_time ?? "").slice(0, 5)
  const msgBody = `Reminder: ${patientName} — appointment on ${(appt as { appt_date: string }).appt_date} at ${startShort}. ${service ? `(${service})` : ""} Reply if you need to reschedule.`

  try {
    await sendSmsMessage({ to: resolved, from, body: msgBody })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "SMS failed" },
      { status: 502 }
    )
  }

  const maskedDigits = resolved.replace(/\D/g, "")
  const phoneMasked =
    maskedDigits.length >= 4
      ? `+${maskedDigits.slice(0, maskedDigits.length - 4).replace(/\d/g, "•")}${maskedDigits.slice(-4)}`
      : "•••"

  return NextResponse.json({
    ok: true,
    sent: true,
    phoneMasked,
    appointmentId,
    patientId,
    apptDate: (appt as { appt_date: string }).appt_date,
    startTime: (appt as { start_time: string }).start_time,
  })
}
