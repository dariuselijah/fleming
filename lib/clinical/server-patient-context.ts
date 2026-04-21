/**
 * Server-only: structured <patient_context> block for /api/chat when a consult is bound to a patient.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptPracticeAesGcm, vaultOpenDek } from "@/lib/server/clinical-vault"
import { generateEmbedding } from "@/lib/rag/embeddings"

async function loadVaultDek(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("clinical_session_keys")
    .select("enc_dek, dek_iv, expires_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.enc_dek || !data?.dek_iv) return null
  return vaultOpenDek(data.enc_dek, data.dek_iv)
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export type BuildClinicalConsultContextParams = {
  supabase: SupabaseClient
  userId: string
  practiceId: string
  patientId: string
  chatId: string
  /** Used to retrieve relevant historical RAG chunks */
  firstUserMessage: string
}

/**
 * Builds XML-like patient_context for system prompt injection.
 * Requires unlocked practice vault (clinical_session_keys).
 */
export async function buildStructuredClinicalConsultContext(
  params: BuildClinicalConsultContextParams
): Promise<string | null> {
  const { supabase, userId, practiceId, patientId, chatId, firstUserMessage } = params
  const dek = await loadVaultDek(supabase, userId, practiceId)
  if (!dek) return null

  const { data: pRow, error: pErr } = await supabase
    .from("practice_patients")
    .select("profile_ciphertext, profile_iv, display_name_hint")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (pErr || !pRow?.profile_ciphertext || !pRow?.profile_iv) return null

  const profileJson = decryptPracticeAesGcm(dek, pRow.profile_ciphertext, pRow.profile_iv)
  if (!profileJson) return null

  let profile: Record<string, unknown>
  try {
    profile = JSON.parse(profileJson) as Record<string, unknown>
  } catch {
    return null
  }

  const demographics = [
    profile.name != null ? `Name: ${String(profile.name)}` : "",
    profile.age != null ? `Age: ${String(profile.age)}` : "",
    profile.sex != null ? `Sex: ${String(profile.sex)}` : "",
    profile.phone != null ? `Phone: ${String(profile.phone)}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const allergies = Array.isArray(profile.allergies)
    ? (profile.allergies as unknown[]).map(String).join("; ")
    : ""
  const chronic = Array.isArray(profile.chronicConditions)
    ? (profile.chronicConditions as unknown[]).map(String).join("; ")
    : ""
  const meds = Array.isArray(profile.currentMedications)
    ? (profile.currentMedications as unknown[])
        .map((m) => {
          if (m && typeof m === "object" && "name" in (m as object)) {
            const o = m as Record<string, unknown>
            return [o.name, o.dosage, o.frequency].filter(Boolean).join(" ")
          }
          return String(m)
        })
        .join("; ")
    : ""

  let { data: encRow } = await supabase
    .from("clinical_encounters")
    .select("id, state_ciphertext, state_iv, started_at, chat_id")
    .eq("patient_id", patientId)
    .eq("practice_id", practiceId)
    .eq("chat_id", chatId)
    .maybeSingle()

  if (!encRow) {
    const { data: latest } = await supabase
      .from("clinical_encounters")
      .select("id, state_ciphertext, state_iv, started_at, chat_id")
      .eq("patient_id", patientId)
      .eq("practice_id", practiceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    encRow = latest
  }

  let currentEncounterXml = ""
  if (encRow?.state_ciphertext && encRow.state_iv) {
    const stateJson = decryptPracticeAesGcm(dek, encRow.state_ciphertext, encRow.state_iv)
    if (stateJson) {
      try {
        const state = JSON.parse(stateJson) as Record<string, unknown>
        const soap = (state.soapNote ?? {}) as Record<string, unknown>
        const vitals = state.vitals
        const problems = state.encounterProblems
        const transcript = typeof state.scribeTranscript === "string" ? state.scribeTranscript : ""
        const cc =
          Array.isArray((state.scribeEntities as Record<string, unknown> | undefined)?.chief_complaint)
            ? ((state.scribeEntities as { chief_complaint?: string[] }).chief_complaint ?? []).join("; ")
            : ""

        currentEncounterXml = `
  <current_encounter encounter_id="${escapeXml(String(encRow.id))}">
    <chief_complaint>${escapeXml(cc || (typeof state.appointmentReason === "string" ? state.appointmentReason : ""))}</chief_complaint>
    <vitals>${escapeXml(typeof vitals === "object" ? JSON.stringify(vitals) : String(vitals ?? ""))}</vitals>
    <soap>
      <subjective>${escapeXml(String(soap.subjective ?? ""))}</subjective>
      <objective>${escapeXml(String(soap.objective ?? ""))}</objective>
      <assessment>${escapeXml(String(soap.assessment ?? ""))}</assessment>
      <plan>${escapeXml(String(soap.plan ?? ""))}</plan>
    </soap>
    <encounter_problems>${escapeXml(Array.isArray(problems) ? (problems as string[]).join("; ") : "")}</encounter_problems>
    <scribe_transcript_tail>${escapeXml(transcript.length > 4000 ? transcript.slice(-4000) : transcript)}</scribe_transcript_tail>
  </current_encounter>`
      } catch {
        /* skip malformed */
      }
    }
  }

  const ragQuery =
    firstUserMessage.trim().length >= 3
      ? firstUserMessage.slice(0, 500)
      : "patient medical history clinical summary"

  let relevantHistoryXml = ""
  try {
    const embedding = await generateEmbedding(ragQuery)
    const vec = `[${embedding.join(",")}]`
    const { data: hits, error: rpcErr } = await supabase.rpc("hybrid_search_clinical_chunks", {
      p_practice_id: practiceId,
      p_patient_id: patientId,
      p_query_text: ragQuery,
      p_query_embedding: vec,
      p_match_count: 10,
      p_encounter_id: null,
      p_source_types: null,
    })
    if (!rpcErr && hits && hits.length > 0) {
      const ids = (hits as { chunk_id: string }[]).map((h) => h.chunk_id)
      const { data: bodies } = await supabase
        .from("clinical_rag_chunks")
        .select("id, chunk_body, source_type, encounter_id")
        .in("id", ids)

      const byId = new Map((bodies ?? []).map((b) => [b.id as string, b]))
      const chunksXml = (hits as { chunk_id: string; rrf_score?: number; source_type?: string }[])
        .map((h) => {
          const row = byId.get(h.chunk_id)
          if (!row?.chunk_body) return ""
          const body = String(row.chunk_body).slice(0, 2000)
          return `    <chunk source="${escapeXml(String(row.source_type ?? h.source_type ?? ""))}" encounter="${escapeXml(String(row.encounter_id ?? ""))}" score="${escapeXml(String(h.rrf_score ?? ""))}">${escapeXml(body)}</chunk>`
        })
        .filter(Boolean)
        .join("\n")
      if (chunksXml) {
        relevantHistoryXml = `
  <relevant_history retrieved_via="hybrid_search_clinical_chunks">
${chunksXml}
  </relevant_history>`
      }
    }
  } catch (e) {
    console.warn("[buildStructuredClinicalConsultContext] RAG snippet failed", e)
  }

  return `<patient_context provenance="structured_consult_injection">
  <demographics>${escapeXml(demographics)}</demographics>
  <allergies>${escapeXml(allergies)}</allergies>
  <chronic_conditions>${escapeXml(chronic)}</chronic_conditions>
  <chart_medications>${escapeXml(meds)}</chart_medications>
  ${currentEncounterXml}
  ${relevantHistoryXml}
</patient_context>

You have structured patient and encounter context above. Use it to answer clinically. If something is missing, say what is missing rather than denying all patient knowledge.

Available chart tools (when shown in your tool list): get_patient_summary, get_encounter_state, search_patient_clinical_record, search_patient_history, prescribe_medication — prefer these over assuming no data exists.`
}
