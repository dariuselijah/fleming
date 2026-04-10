/**
 * Outbound Vapi call ~24h before appointment to confirm attendance.
 * Schedule: every 15 minutes — see vercel.json.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall } from "@/lib/comms/vapi"
import { resolvePatientPhoneE164 } from "@/lib/comms/patient-phone"
import { mergePracticeAppointmentMetadata } from "@/lib/comms/appointment-metadata"
import { getPracticeName } from "@/lib/comms/tools"

export const maxDuration = 120
export const dynamic = "force-dynamic"

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
    const stats = { checked: 0, calls: 0, skipped: 0, errors: 0 }

    const windowStart = new Date(now.getTime() + 30 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: appointments } = await db
      .from("practice_appointments")
      .select(
        "id, practice_id, patient_id, patient_name_snapshot, appt_date, start_time, end_time, status, metadata"
      )
      .in("status", ["booked", "confirmed"])
      .gte("appt_date", windowStart.toISOString().split("T")[0])
      .lte("appt_date", windowEnd.toISOString().split("T")[0])

    if (!appointments?.length) {
      return NextResponse.json({ ok: true, message: "No appointments in window", stats })
    }

    for (const appt of appointments) {
      stats.checked++
      try {
        const apptDateTime = new Date(`${appt.appt_date}T${appt.start_time}:00+02:00`)
        const hoursUntil = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

        const metadata = (appt.metadata as Record<string, unknown>) || {}
        if (metadata.voice_checkin_sent_at) {
          stats.skipped++
          continue
        }

        const shouldCall = hoursUntil >= 23 && hoursUntil <= 25
        if (!shouldCall) continue

        const phone = await resolvePatientPhoneE164(db, appt.practice_id, appt.patient_id)
        if (!phone) {
          stats.skipped++
          continue
        }

        const { data: voice } = await db
          .from("practice_channels")
          .select("vapi_assistant_id, vapi_phone_number_id")
          .eq("practice_id", appt.practice_id)
          .eq("channel_type", "voice")
          .eq("status", "active")
          .limit(1)
          .maybeSingle()

        if (!voice?.vapi_assistant_id || !voice?.vapi_phone_number_id) {
          stats.skipped++
          continue
        }

        const practiceName = await getPracticeName(appt.practice_id)
        const firstName =
          (appt.patient_name_snapshot || "Patient").trim().split(/\s+/)[0] || "Patient"

        const call = await createOutboundCall({
          assistantId: voice.vapi_assistant_id,
          phoneNumberId: voice.vapi_phone_number_id,
          customerNumber: phone,
          metadata: {
            practiceId: appt.practice_id,
            purpose: "pre_appointment_checkin",
            appointmentId: appt.id,
            apptDate: appt.appt_date,
            apptTime: appt.start_time,
            patientFirstName: firstName,
            practiceName,
          },
        })

        await mergePracticeAppointmentMetadata(appt.id, {
          voice_checkin_sent_at: new Date().toISOString(),
          voice_checkin_call_id: call.id,
        })
        stats.calls++
      } catch (err) {
        console.error(`[appointment-voice-checkin] appt ${appt.id}:`, err)
        stats.errors++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[appointment-voice-checkin] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
