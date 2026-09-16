import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { generatePatientAiRollup } from "@/lib/patient/generate-patient-ai-rollup"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }
type RequestBody = { force?: boolean }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const patientId = (await context.params).id
  const body = (await req.json().catch(() => ({}))) as RequestBody

  const { data: p } = await ctx.supabase
    .from("practice_patients")
    .select("id, display_name_hint")
    .eq("id", patientId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const result = await generatePatientAiRollup({
      supabase: ctx.supabase,
      practiceId: ctx.practiceId,
      patientId,
      patientName: String(p.display_name_hint ?? "Patient"),
      force: body.force,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[ai-rollup] failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rollup failed" },
      { status: 500 }
    )
  }
}
