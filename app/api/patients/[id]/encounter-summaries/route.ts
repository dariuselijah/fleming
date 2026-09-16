import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const patientId = (await context.params).id

  const { data: p } = await ctx.supabase
    .from("practice_patients")
    .select("id")
    .eq("id", patientId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data, error } = await ctx.supabase
    .from("practice_encounter_summaries")
    .select("id, encounter_id, appointment_id, chief_complaint, summary_text, key_findings, follow_up, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ summaries: data ?? [] })
}
