/**
 * Payment reminders for overdue practice_invoices (SMS/RCS via Twilio).
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendPatientTemplatedMessage } from "@/lib/comms/communication-service"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from("practice_invoices")
    .select(
      "id, practice_id, patient_id, total_cents, amount_paid_cents, patient_snapshot, issued_at, created_at, last_reminded_at, due_at, status"
    )
    .in("status", ["issued", "sent", "viewed", "partially_paid"])
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) {
    console.error("[payment-reminders]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  const now = Date.now()
  const threeDaysAgo = now - 3 * 86400000

  for (const inv of rows ?? []) {
    const last = inv.last_reminded_at ? new Date(inv.last_reminded_at).getTime() : 0
    if (last > threeDaysAgo) continue

    const dueAt = inv.due_at ? new Date(inv.due_at).getTime() : null
    if (dueAt != null && dueAt > now) continue

    const snap = inv.patient_snapshot as { name?: string; phone?: string } | null
    const phone = snap?.phone?.trim()
    if (!phone) continue

    const due = (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)
    if (due <= 0) continue

    const visitDate = (inv.issued_at ?? inv.created_at ?? "").slice(0, 10)
    try {
      await sendPatientTemplatedMessage({
        practiceId: inv.practice_id as string,
        toE164: phone,
        templateKey: "payment_reminder",
        variables: {
          "1": snap?.name?.trim() || "there",
          "2": (due / 100).toFixed(2),
          "3": visitDate || "—",
        },
        patientId: inv.patient_id as string,
      })
      await admin
        .from("practice_invoices")
        .update({ last_reminded_at: new Date().toISOString() })
        .eq("id", inv.id)
      sent++
    } catch (e) {
      console.warn("[payment-reminders] send", inv.id, e)
    }
  }

  return NextResponse.json({ ok: true, sent })
}
