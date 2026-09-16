import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { PATIENT_AI_ROLLUP_DEFAULT_MODEL } from "@/lib/patient/generate-patient-ai-rollup"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

/** Lightweight read of cached patient AI summary — no LLM, no signed URLs. */
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

  const { data: latest, error: latestErr } = await ctx.supabase
    .from("practice_encounter_summaries")
    .select("summary_text, chief_complaint, key_findings, follow_up, created_at")
    .eq("practice_id", ctx.practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) {
    return NextResponse.json({ error: latestErr.message }, { status: 500 })
  }

  if (!latest) {
    return NextResponse.json({
      ok: true,
      patientId,
      summaryCount: 0,
      rollup: null,
      latestChiefComplaint: null,
      latestSummaryText: null,
      recentKeyFindings: [] as string[],
      latestFollowUp: null,
      latestSummaryAt: null,
    })
  }

  const { count } = await ctx.supabase
    .from("practice_encounter_summaries")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", ctx.practiceId)
    .eq("patient_id", patientId)

  const modelId = (process.env.ASSISTANT_ADMIN_MODEL as string) || PATIENT_AI_ROLLUP_DEFAULT_MODEL
  const latestSummaryAt = latest.created_at

  const { data: cached } = await ctx.supabase
    .from("patient_ai_rollups")
    .select("rollup, based_on_count, updated_at")
    .eq("practice_id", ctx.practiceId)
    .eq("patient_id", patientId)
    .eq("latest_summary_at", latestSummaryAt)
    .eq("model_id", modelId)
    .maybeSingle()

  const keyFindings = Array.isArray(latest.key_findings)
    ? (latest.key_findings as string[]).filter(Boolean).slice(0, 4)
    : []

  return NextResponse.json({
    ok: true,
    patientId,
    summaryCount: count ?? 1,
    rollup: cached?.rollup ?? null,
    basedOnCount: cached?.based_on_count ?? count ?? 1,
    latestChiefComplaint: latest.chief_complaint?.trim() || null,
    latestSummaryText: latest.summary_text?.trim() || null,
    recentKeyFindings: keyFindings,
    latestFollowUp: latest.follow_up?.trim() || null,
    latestSummaryAt,
    cached: Boolean(cached),
    updatedAt: cached?.updated_at ?? null,
  })
}
