import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  const month = new Date().toISOString().slice(0, 7)
  const { data, error } = await admin
    .from("practice_invoices")
    .select("practice_id, patient_id")
    .not("patient_id", "is", null)
    .gte("created_at", `${month}-01T00:00:00.000Z`)
    .limit(1000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const patients = new Set((data ?? []).map((r) => `${r.practice_id}:${r.patient_id}`))
  return NextResponse.json({
    ok: true,
    month,
    statementsQueued: patients.size,
    note: "Use /api/billing/statements?patientId=...&month=YYYY-MM to generate each signed statement PDF.",
  })
}
