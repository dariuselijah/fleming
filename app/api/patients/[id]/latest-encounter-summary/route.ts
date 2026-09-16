import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/** Most recent AI encounter summary for calendar / appointment prefill (chief complaint + summary). */
export async function GET(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
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
    .select("encounter_id, summary_text, chief_complaint, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ chiefComplaint: null, summary: null, encounterId: null, signedAt: null })

  const row = data as {
    encounter_id: string
    summary_text: string
    chief_complaint?: string | null
    created_at: string
  }

  return NextResponse.json({
    encounterId: row.encounter_id,
    chiefComplaint: row.chief_complaint?.trim() || null,
    summary: row.summary_text?.trim() || null,
    signedAt: row.created_at,
  })
}
