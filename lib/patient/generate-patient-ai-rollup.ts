import type { SupabaseClient } from "@supabase/supabase-js"
import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"

export const PATIENT_AI_ROLLUP_DEFAULT_MODEL = "gpt-4o-mini"

export type PatientAiRollupResult = {
  rollup: string | null
  basedOnCount: number
  latestSummaryAt: string | null
  modelId: string
  cached: boolean
  updatedAt?: string
}

type SummaryRow = { summary_text?: string; created_at?: string }

export async function generatePatientAiRollup(args: {
  supabase: SupabaseClient
  practiceId: string
  patientId: string
  patientName: string
  force?: boolean
  modelId?: string
}): Promise<PatientAiRollupResult> {
  const { supabase, practiceId, patientId, patientName, force = false } = args
  const modelId = args.modelId ?? ((process.env.ASSISTANT_ADMIN_MODEL as string) || PATIENT_AI_ROLLUP_DEFAULT_MODEL)

  const { data: sums, error } = await supabase
    .from("practice_encounter_summaries")
    .select("summary_text, created_at")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(5)

  if (error) throw new Error(error.message)

  const list = (sums ?? []) as SummaryRow[]
  if (list.length === 0) {
    return { rollup: null, basedOnCount: 0, latestSummaryAt: null, modelId, cached: false }
  }

  const latestSummaryAt = list[0]?.created_at ?? null
  if (!latestSummaryAt) {
    return { rollup: null, basedOnCount: list.length, latestSummaryAt: null, modelId, cached: false }
  }

  if (!force) {
    const { data: cached, error: cacheErr } = await supabase
      .from("patient_ai_rollups")
      .select("rollup,based_on_count,latest_summary_at,model_id,updated_at")
      .eq("practice_id", practiceId)
      .eq("patient_id", patientId)
      .eq("latest_summary_at", latestSummaryAt)
      .eq("model_id", modelId)
      .maybeSingle()

    if (cacheErr) throw new Error(cacheErr.message)

    if (cached) {
      return {
        rollup: cached.rollup,
        basedOnCount: cached.based_on_count,
        latestSummaryAt: cached.latest_summary_at,
        modelId: cached.model_id,
        cached: true,
        updatedAt: cached.updated_at,
      }
    }
  }

  const model = openproviders(modelId as never)
  const joined = list
    .map(
      (s, i) =>
        `Visit ${i + 1} (${s.created_at?.slice(0, 10) ?? "?"}): ${String(s.summary_text ?? "").slice(0, 1200)}`
    )
    .join("\n\n")

  let rollup = ""
  try {
    const { text } = await generateText({
      model,
      prompt: `You are summarizing prior visit notes for ${patientName}. In exactly 2 short sentences, synthesize recurring themes, stability vs change, and any follow-up threads. Do not invent facts. If uncertain, say so.\n\n${joined}`,
    })
    rollup = text?.trim() ?? ""
  } catch (err) {
    console.error("[patient-ai-rollup] LLM failed:", err)
    throw new Error(err instanceof Error ? err.message : "Rollup generation failed")
  }

  const { error: writeErr } = await supabase.from("patient_ai_rollups").upsert(
    {
      practice_id: practiceId,
      patient_id: patientId,
      latest_summary_at: latestSummaryAt,
      model_id: modelId,
      rollup,
      based_on_count: list.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "practice_id,patient_id,latest_summary_at,model_id" }
  )

  if (writeErr) throw new Error(writeErr.message)

  return {
    rollup,
    basedOnCount: list.length,
    latestSummaryAt,
    modelId,
    cached: false,
  }
}
