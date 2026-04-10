/**
 * WhatsApp follow-up after completed visits (template: post_visit_followup).
 * Schedule: hourly — see vercel.json.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendTemplateMessage, BUILTIN_TEMPLATES } from "@/lib/comms/templates"
import { resolvePatientPhoneE164 } from "@/lib/comms/patient-phone"
import { mergePracticeAppointmentMetadata } from "@/lib/comms/appointment-metadata"
import { getPracticeName } from "@/lib/comms/tools"
import { appendMessage, getOrCreateThread, getPracticeWhatsAppNumber } from "@/lib/comms/threads"

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
        if (metadata.post_visit_whatsapp_sent_at) {
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

        const practiceNumber = await getPracticeWhatsAppNumber(appt.practice_id)
        if (!practiceNumber) {
          stats.skipped++
          continue
        }

        const practiceName = await getPracticeName(appt.practice_id)
        const first = firstNameFromSnapshot(appt.patient_name_snapshot)

        const messageSid = await sendTemplateMessage({
          practiceId: appt.practice_id,
          from: practiceNumber,
          to: phone,
          templateKey: "post_visit_followup",
          variables: {
            "1": first,
            "2": practiceName,
          },
        })

        const thread = await getOrCreateThread(appt.practice_id, "whatsapp", phone)
        await appendMessage({
          threadId: thread.id,
          practiceId: appt.practice_id,
          direction: "outbound",
          senderType: "system",
          contentType: "template",
          body: BUILTIN_TEMPLATES.post_visit_followup.body
            .replace("{{1}}", first)
            .replace("{{2}}", practiceName),
          templateName: "post_visit_followup",
          providerMessageId: messageSid,
          deliveryStatus: "sent",
        })

        await mergePracticeAppointmentMetadata(appt.id, {
          post_visit_whatsapp_sent_at: new Date().toISOString(),
          post_visit_whatsapp_message_sid: messageSid,
        })
        stats.sent++
      } catch (err) {
        console.error(`[post-visit-whatsapp] appt ${appt.id}:`, err)
        stats.errors++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[post-visit-whatsapp] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
