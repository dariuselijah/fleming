/**
 * Appointment reminders (24h and 1h before) via SMS/RCS (Twilio Messaging).
 * Schedule: vercel.json every 15 minutes. Requires patient mobile on file and status booked|confirmed.
 * Appointment times are interpreted in SAST (UTC+2) — align with practice_appointments storage.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPatientTemplatedMessage } from "@/lib/comms/communication-service"
import { mergePracticeAppointmentMetadata } from "@/lib/comms/appointment-metadata"
import { normalizePhoneE164Za } from "@/lib/comms/patient-phone"

export const maxDuration = 120
export const dynamic = "force-dynamic"

/** Build local appointment instant (practice data is SAST for ZA deployments). */
function appointmentStartSast(apptDate: string, startTime: string | null | undefined): Date {
  let t = (startTime || "09:00:00").trim()
  if (t.length === 5) t = `${t}:00`
  const parts = t.split(":")
  const h = (parts[0] || "9").padStart(2, "0")
  const m = (parts[1] || "00").padStart(2, "0")
  const s = (parts[2] || "00").padStart(2, "0")
  return new Date(`${apptDate}T${h}:${m}:${s}+02:00`)
}

/** HH:MM for template variable {{1}} (e.g. "09:30"). */
function clockLabel(startTime: string | null | undefined): string {
  const t = (startTime || "09:00:00").trim()
  const parts = t.split(":")
  const h = (parts[0] || "9").padStart(2, "0")
  const m = (parts[1] || "00").padStart(2, "0")
  return `${h}:${m}`
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const db = createAdminClient()
    const now = new Date()
    const stats = { checked: 0, sent24h: 0, sent1h: 0, errors: 0 }

    const windowStart = new Date(now.getTime() + 30 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: appointments } = await db
      .from("practice_appointments")
      .select(`
        id, practice_id, patient_id, patient_name_snapshot,
        appt_date, start_time, end_time, service, reason,
        status, provider_staff_id, metadata
      `)
      .in("status", ["booked", "confirmed"])
      .gte("appt_date", windowStart.toISOString().split("T")[0])
      .lte("appt_date", windowEnd.toISOString().split("T")[0])

    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ ok: true, message: "No upcoming appointments", stats })
    }

    for (const appt of appointments) {
      stats.checked++

      try {
        const apptDateTime = appointmentStartSast(appt.appt_date as string, appt.start_time as string | null)
        const hoursUntil = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

        const metadata = (appt.metadata as Record<string, unknown>) || {}
        const reminded24h = metadata.reminded_24h as boolean
        const reminded1h = metadata.reminded_1h as boolean

        const should24h = hoursUntil >= 23 && hoursUntil <= 25 && !reminded24h
        const should1h = hoursUntil >= 0.5 && hoursUntil <= 1.5 && !reminded1h

        if (!should24h && !should1h) continue

        const phone = await resolvePatientPhone(db, appt.practice_id, appt.patient_id)
        if (!phone) continue

        const { getPracticeName } = await import("@/lib/comms/tools")
        const practiceName = await getPracticeName(appt.practice_id)

        let providerName = "your doctor"
        if (appt.provider_staff_id) {
          const { data: staff } = await db
            .from("practice_staff")
            .select("display_name")
            .eq("id", appt.provider_staff_id)
            .single()
          if (staff?.display_name) providerName = staff.display_name
        }

        if (should24h) {
          await sendPatientTemplatedMessage({
            practiceId: appt.practice_id,
            toE164: phone,
            templateKey: "appointment_reminder_24h",
            variables: {
              "1": clockLabel(appt.start_time as string | null),
              "2": providerName,
              "3": practiceName,
            },
            patientId: appt.patient_id,
            appointmentId: appt.id,
            portalLink:
              appt.patient_id ?
                {
                  patientId: appt.patient_id,
                  purpose: "appointment",
                  appointmentId: appt.id,
                }
              : undefined,
          })

          await mergePracticeAppointmentMetadata(appt.id, {
            reminded_24h: true,
            reminded_24h_at: now.toISOString(),
          })

          stats.sent24h++
        }

        if (should1h) {
          await sendPatientTemplatedMessage({
            practiceId: appt.practice_id,
            toE164: phone,
            templateKey: "appointment_reminder_1h",
            variables: { "1": practiceName },
            patientId: appt.patient_id,
            appointmentId: appt.id,
            portalLink:
              appt.patient_id ?
                {
                  patientId: appt.patient_id,
                  purpose: "check_in",
                  appointmentId: appt.id,
                }
              : undefined,
          })

          await mergePracticeAppointmentMetadata(appt.id, {
            reminded_1h: true,
            reminded_1h_at: now.toISOString(),
          })

          stats.sent1h++
        }
      } catch (err) {
        console.error(`[appointment-reminders] Failed for appt ${appt.id}:`, err)
        stats.errors++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[appointment-reminders] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

async function resolvePatientPhone(
  db: ReturnType<typeof createAdminClient>,
  practiceId: string,
  patientId: string | null
): Promise<string | null> {
  if (!patientId) return null

  const { data: patient } = await db
    .from("practice_patients")
    .select("display_name_hint, phone_e164")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (patient?.phone_e164?.trim()) {
    return normalizePhoneE164Za(patient.phone_e164)
  }

  const { data: thread } = await db
    .from("conversation_threads")
    .select("external_party")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .eq("channel", "rcs")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (thread?.external_party) {
    return normalizePhoneE164Za(thread.external_party)
  }

  if (patient?.display_name_hint) {
    const phoneMatch = patient.display_name_hint.match(/\+?\d[\d\s-]{8,}/)
    if (phoneMatch) return normalizePhoneE164Za(phoneMatch[0])
  }

  return null
}
