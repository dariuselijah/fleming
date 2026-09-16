import { NextResponse } from "next/server"
import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { replacePromotedChartFactsForEncounter } from "@/lib/clinical/promote-chart-facts"
import { generatePatientAiRollup } from "@/lib/patient/generate-patient-ai-rollup"

export const runtime = "nodejs"
export const maxDuration = 60

const DEFAULT_MODEL = "gpt-4o-mini"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    encounterId?: string
    patientId?: string
    appointmentId?: string
    sourceText?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const encounterId = body.encounterId?.trim()
  const patientId = body.patientId?.trim()
  const sourceText = body.sourceText?.trim()
  if (!encounterId || !patientId || !sourceText) {
    return NextResponse.json({ error: "encounterId, patientId, sourceText required" }, { status: 400 })
  }

  const { data: enc, error: encErr } = await ctx.supabase
    .from("clinical_encounters")
    .select("id, practice_id, patient_id, appointment_id")
    .eq("id", encounterId)
    .maybeSingle()

  if (encErr || !enc) {
    return NextResponse.json({ error: "Encounter not found" }, { status: 404 })
  }
  if (enc.practice_id !== ctx.practiceId || enc.patient_id !== patientId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const fromBodyAppt = body.appointmentId?.trim() || null
  const fromEncAppt = enc.appointment_id ? String(enc.appointment_id) : null
  let resolvedAppointmentId = fromBodyAppt || fromEncAppt
  if (resolvedAppointmentId) {
    const { data: apptRow } = await ctx.supabase
      .from("practice_appointments")
      .select("id")
      .eq("id", resolvedAppointmentId)
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .maybeSingle()
    if (!apptRow) {
      resolvedAppointmentId = null
    }
  }

  const modelId = (process.env.ASSISTANT_ADMIN_MODEL as string) || DEFAULT_MODEL
  const model = openproviders(modelId as never)

  const { text } = await generateText({
    model,
    prompt: `You are a clinical documentation assistant. Read the visit excerpt and produce a JSON object ONLY (no markdown), with keys:
- "chiefComplaint": string, one short phrase describing the reason for visit. Prefer the explicit complaint from the note. Do not invent diagnoses.
- "summary": string, 1-2 concise sentences for a patient sidebar. State what the visit was for, the main assessment/treatment, and only mention meds/tests/procedures if they are explicitly present.
- "keyFindings": string array, max 4 short factual bullets.
- "followUp": string or null, one short line only if a follow-up action is explicitly implied.

Rules:
- Be accurate and terse.
- Do not mention information that is not in the excerpt.
- Do not pad with generic phrases.
- If the chart is sparse, keep the summary minimal rather than speculative.

Visit excerpt:
---
${sourceText.slice(0, 12000)}
---`,
  })

  let chiefComplaint: string | null = null
  let summary = ""
  let keyFindings: string[] = []
  let followUp: string | null = null
  try {
    const json = JSON.parse(text.replace(/```json\s*|\s*```/g, "").trim()) as {
      chiefComplaint?: string
      summary?: string
      keyFindings?: string[]
      followUp?: string | null
    }
    chiefComplaint = json.chiefComplaint?.trim() || null
    summary = json.summary ?? ""
    keyFindings = Array.isArray(json.keyFindings) ? json.keyFindings : []
    followUp = json.followUp ?? null
  } catch {
    summary = text.slice(0, 2000)
  }

  if (!chiefComplaint && sourceText) {
    const m = sourceText.match(/<reason_for_visit>\s*([\s\S]*?)\s*<\/reason_for_visit>/i)
    const fromTag = m?.[1]?.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim()
    if (fromTag) chiefComplaint = fromTag.slice(0, 280)
  }

  if (!summary) {
    return NextResponse.json({ error: "Could not generate summary" }, { status: 500 })
  }

  summary = summary.replace(/\s+/g, " ").trim()
  if (summary.length > 360) summary = `${summary.slice(0, 357).trimEnd()}...`
  keyFindings = keyFindings
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
  followUp = followUp?.replace(/\s+/g, " ").trim() || null

  const baseRow = {
    practice_id: ctx.practiceId,
    patient_id: patientId,
    encounter_id: encounterId,
    summary_text: summary,
    chief_complaint: chiefComplaint,
    key_findings: keyFindings as unknown as never,
    follow_up: followUp,
    model: modelId,
  }

  const rowWithAppt = resolvedAppointmentId
    ? { ...baseRow, appointment_id: resolvedAppointmentId }
    : baseRow

  let { error: upsertErr } = await ctx.supabase
    .from("practice_encounter_summaries")
    .upsert(rowWithAppt, { onConflict: "encounter_id" })

  const apptColumnMissing = (msg: string | undefined) =>
    !!msg &&
    /appointment_id/i.test(msg) &&
    (/schema cache/i.test(msg) || /could not find/i.test(msg))

  if (upsertErr && apptColumnMissing(upsertErr.message) && resolvedAppointmentId) {
    ;({ error: upsertErr } = await ctx.supabase
      .from("practice_encounter_summaries")
      .upsert(baseRow, { onConflict: "encounter_id" }))
  }

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  if (resolvedAppointmentId) {
    await ctx.supabase
      .from("practice_appointments")
      .update({
        linked_consult_id: encounterId,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", resolvedAppointmentId)
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
  }

  await replacePromotedChartFactsForEncounter({
    supabase: ctx.supabase,
    practiceId: ctx.practiceId,
    patientId,
    encounterId,
    chiefComplaint,
    keyFindings,
    followUp,
  })

  const { data: patientRow } = await ctx.supabase
    .from("practice_patients")
    .select("display_name_hint")
    .eq("id", patientId)
    .maybeSingle()

  try {
    await generatePatientAiRollup({
      supabase: ctx.supabase,
      practiceId: ctx.practiceId,
      patientId,
      patientName: String(patientRow?.display_name_hint ?? "Patient"),
      force: true,
    })
  } catch (rollupErr) {
    console.warn("[encounter-summary] rollup warm failed:", rollupErr)
  }

  return NextResponse.json({ ok: true, chiefComplaint, summary, keyFindings, followUp })
}
