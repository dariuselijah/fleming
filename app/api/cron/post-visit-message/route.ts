/**
 * Post-visit follow-up SMS after completed visits (template: post_visit_followup).
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolvePatientPhoneE164 } from "@/lib/comms/patient-phone"
import { mergePracticeAppointmentMetadata } from "@/lib/comms/appointment-metadata"
import { getPracticeName } from "@/lib/comms/tools"
import { sendPatientTemplatedMessage } from "@/lib/comms/communication-service"

export const maxDuration = 120
export const dynamic = "force-dynamic"

function firstNameFromSnapshot(name: string | null | undefined): string {
  const n = (name || "Patient").trim().split(/\s+/)[0] || "Patient"
  return n
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
    const stats = { checked: 0, sent: 0, skipped: 0, errors: 0 }

    const lookbackStart = new Date(now.getTime() - 72 * 60 * 60 * 1000)
    const lookbackDate = lookbackStart.toISOString().split("T")[0]

    const { data: appointments } = await db
      .from("practice_appointments")
      .select(
        "id, practice_id, patient_id, patient_name_snapshot, appt_date, start_time, end_time, status, metadata"
      )
      .eq("status", "completed")
      .gte("appt_date", lookbackDate)

    if (!appointments?.length) {
      return NextResponse.json({ ok: true, message: "No completed appointments in lookback", stats })
    }

    for (const appt of appointments) {
      stats.checked++
      try {
        const metadata = (appt.metadata as Record<string, unknown>) || {}
        if (metadata.post_visit_message_sent_at || metadata.post_visit_whatsapp_sent_at) {
          stats.skipped++
          continue
        }

        const apptEnd = new Date(`${appt.appt_date}T${appt.end_time}:00+02:00`)
        const hoursSinceEnd = (now.getTime() - apptEnd.getTime()) / (1000 * 60 * 60)
        if (hoursSinceEnd < 2 || hoursSinceEnd > 48) continue

        if (!appt.patient_id) {
          stats.skipped++
          continue
        }

        const phone = await resolvePatientPhoneE164(db, appt.practice_id, appt.patient_id)
        if (!phone) {
          stats.skipped++
          continue
        }

        const practiceName = await getPracticeName(appt.practice_id)
        const first = firstNameFromSnapshot(appt.patient_name_snapshot)

        const { messageSid } = await sendPatientTemplatedMessage({
          practiceId: appt.practice_id,
          toE164: phone,
          templateKey: "post_visit_followup",
          variables: {
            "1": first,
            "2": practiceName,
          },
          patientId: appt.patient_id,
          appointmentId: appt.id,
          portalLink: {
            patientId: appt.patient_id,
            purpose: "general",
            appointmentId: appt.id,
          },
        })

        await mergePracticeAppointmentMetadata(appt.id, {
          post_visit_message_sent_at: new Date().toISOString(),
          post_visit_message_sid: messageSid,
        })
        stats.sent++
      } catch (err) {
        console.error(`[post-visit-message] appt ${appt.id}:`, err)
        stats.errors++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[post-visit-message] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
