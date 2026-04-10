/**
 * Cron endpoint for appointment reminders (24h and 1h before).
 * Schedule: every 15 minutes — see vercel.json crons.
 *
 * External: curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/appointment-reminders
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendTemplateMessage, BUILTIN_TEMPLATES } from "@/lib/comms/templates"
import { getPracticeWhatsAppNumber } from "@/lib/comms/threads"
import { appendMessage, getOrCreateThread } from "@/lib/comms/threads"
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
    const stats = { checked: 0, sent24h: 0, sent1h: 0, errors: 0 }

    // Fetch all appointments in the next 25 hours that haven't been reminded
    const windowStart = new Date(now.getTime() + 30 * 60 * 1000) // 30 min from now
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000) // 25h from now

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
        const apptDateTime = new Date(`${appt.appt_date}T${appt.start_time}:00+02:00`) // SAST
        const hoursUntil = (apptDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

        const metadata = (appt.metadata as Record<string, unknown>) || {}
        const reminded24h = metadata.reminded_24h as boolean
        const reminded1h = metadata.reminded_1h as boolean

        // 24h reminder: send between 23-25 hours before
        const should24h = hoursUntil >= 23 && hoursUntil <= 25 && !reminded24h
        // 1h reminder: send between 0.5-1.5 hours before
        const should1h = hoursUntil >= 0.5 && hoursUntil <= 1.5 && !reminded1h

        if (!should24h && !should1h) continue

        // Resolve patient phone from thread or patient record
        const phone = await resolvePatientPhone(db, appt.practice_id, appt.patient_id)
        if (!phone) continue

        const practiceNumber = await getPracticeWhatsAppNumber(appt.practice_id)
        if (!practiceNumber) continue

        const practiceName = await getPracticeName(appt.practice_id)

        // Resolve provider name
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
          const messageSid = await sendTemplateMessage({
            practiceId: appt.practice_id,
            from: practiceNumber,
            to: phone,
            templateKey: "appointment_reminder_24h",
            variables: {
              "1": appt.start_time,
              "2": providerName,
              "3": practiceName,
            },
          })

          const thread = await getOrCreateThread(appt.practice_id, "whatsapp", phone)
          await appendMessage({
            threadId: thread.id,
            practiceId: appt.practice_id,
            direction: "outbound",
            senderType: "system",
            contentType: "template",
            body: BUILTIN_TEMPLATES.appointment_reminder_24h.body
              .replace("{{1}}", appt.start_time)
              .replace("{{2}}", providerName)
              .replace("{{3}}", practiceName),
            templateName: "appointment_reminder_24h",
            providerMessageId: messageSid,
            deliveryStatus: "sent",
          })

          await db
            .from("practice_appointments")
            .update({ metadata: { ...metadata, reminded_24h: true, reminded_24h_at: now.toISOString() } })
            .eq("id", appt.id)

          stats.sent24h++
        }

        if (should1h) {
          const messageSid = await sendTemplateMessage({
            practiceId: appt.practice_id,
            from: practiceNumber,
            to: phone,
            templateKey: "appointment_reminder_1h",
            variables: { "1": practiceName },
          })

          const thread = await getOrCreateThread(appt.practice_id, "whatsapp", phone)
          await appendMessage({
            threadId: thread.id,
            practiceId: appt.practice_id,
            direction: "outbound",
            senderType: "system",
            contentType: "template",
            body: BUILTIN_TEMPLATES.appointment_reminder_1h.body.replace("{{1}}", practiceName),
            templateName: "appointment_reminder_1h",
            providerMessageId: messageSid,
            deliveryStatus: "sent",
          })

          await db
            .from("practice_appointments")
            .update({ metadata: { ...metadata, reminded_1h: true, reminded_1h_at: now.toISOString() } })
            .eq("id", appt.id)

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
  // First try: find an existing WhatsApp thread linked to this patient
  if (patientId) {
    const { data: thread } = await db
      .from("conversation_threads")
      .select("external_party")
      .eq("practice_id", practiceId)
      .eq("patient_id", patientId)
      .eq("channel", "whatsapp")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (thread?.external_party) return thread.external_party
  }

  // Second try: extract phone from display_name_hint
  if (patientId) {
    const { data: patient } = await db
      .from("practice_patients")
      .select("display_name_hint")
      .eq("id", patientId)
      .single()

    if (patient?.display_name_hint) {
      const phoneMatch = patient.display_name_hint.match(/\+?\d[\d\s-]{8,}/)
      if (phoneMatch) return phoneMatch[0].replace(/[\s-]/g, "")
    }
  }

  return null
}
