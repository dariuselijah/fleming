import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: invoices, error } = await admin
    .from("practice_invoices")
    .select("id, practice_id, total_cents, amount_paid_cents, due_at, issued_at, created_at, status")
    .in("status", ["issued", "sent", "partially_paid"])
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const db = admin as unknown as SupabaseClient
  let created = 0
  const now = Date.now()

  for (const inv of invoices ?? []) {
    const due = Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0))
    if (due <= 0) continue
    const base = inv.due_at ?? inv.issued_at ?? inv.created_at
    const age = Math.floor((now - new Date(base).getTime()) / 86400000)
    const level = age >= 30 ? "30d" : age >= 14 ? "14d" : age >= 7 ? "7d" : null
    if (!level) continue
    const { error: insertErr } = await db.from("practice_invoice_reminders").insert({
      practice_id: inv.practice_id,
      invoice_id: inv.id,
      level,
      channel: "sms",
      message_id: `dry-${inv.id}-${level}`,
    })
    if (!insertErr) created += 1
  }

  return NextResponse.json({ ok: true, remindersCreated: created })
}
