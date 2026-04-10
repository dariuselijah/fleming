import { tool, type ToolSet } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptPracticeAesGcm, vaultOpenDek } from "@/lib/server/clinical-vault"
import { generateEmbedding } from "@/lib/rag/embeddings"
import { buildPrescriptionDraft } from "@/lib/clinical/prescribe-tool-logic"

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      if (typeof x === "string") return x
      if (x && typeof x === "object" && "name" in x) return String((x as { name?: string }).name ?? "")
      return String(x)
    })
    .filter(Boolean)
}

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

type HybridHit = {
  chunk_id: string
  encounter_id: string
  chunk_index: number
  source_type: string
  chunk_key: string | null
  rrf_score: number
  similarity: number
  keyword_rank: number
}

async function hybridSearchWithChunkBodies(params: {
  supabase: SupabaseClient
  practiceId: string
  patientId: string
  query: string
  maxResults: number
  encounterId: string | null
}): Promise<{ chunks: Record<string, unknown>[]; error?: string }> {
  const { supabase, practiceId, patientId, query, maxResults, encounterId } = params
  let embedding: number[]
  try {
    embedding = await generateEmbedding(query)
  } catch (e) {
    return { chunks: [], error: `Embedding failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  const vec = `[${embedding.join(",")}]`
  const { data, error } = await supabase.rpc("hybrid_search_clinical_chunks", {
    p_practice_id: practiceId,
    p_patient_id: patientId,
    p_query_text: query,
    p_query_embedding: vec,
    p_match_count: maxResults,
    p_encounter_id: encounterId,
    p_source_types: null,
  })
  if (error) {
    return { chunks: [], error: error.message }
  }
  const hits = (data ?? []) as HybridHit[]
  if (hits.length === 0) return { chunks: [] }

  const ids = hits.map((h) => h.chunk_id)
  const { data: rows } = await supabase
    .from("clinical_rag_chunks")
    .select("id, chunk_body, source_type, encounter_id")
    .in("id", ids)

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]))

  const chunks = hits.map((h) => {
    const row = byId.get(h.chunk_id)
    return {
      chunk_id: h.chunk_id,
      encounter_id: h.encounter_id,
      chunk_index: h.chunk_index,
      source_type: h.source_type,
      chunk_key: h.chunk_key,
      rrf_score: h.rrf_score,
      similarity: h.similarity,
      keyword_rank: h.keyword_rank,
      chunk_body: row?.chunk_body ? String(row.chunk_body).slice(0, 12000) : null,
    }
  })

  return { chunks }
}

export function buildPatientClinicalTools(params: {
  supabase: SupabaseClient
  userId: string
  practiceId: string
  patientId: string
  /** SOAP / chart documents: skip hybrid RAG over past chunks — consult context is in the system prompt. */
  omitRetrievalTools?: boolean
}): ToolSet {
  const { supabase, userId, practiceId, patientId, omitRetrievalTools } = params

  return {
    get_patient_summary: tool({
      description:
        "Load structured patient demographics, medical aid, allergies, chronic conditions, and active medications for the active consult. Call before stating patient-specific facts.",
      parameters: z.object({
        sections: z
          .array(
            z.enum([
              "demographics",
              "medical_aid",
              "allergies",
              "conditions",
              "medications",
            ])
          )
          .optional()
          .describe("Subset to return; omit for all"),
      }),
      execute: async ({ sections }) => {
        const dek = await loadVaultDek(supabase, userId, practiceId)
        if (!dek) {
          return {
            error:
              "Practice session not unlocked for server tools. Unlock in the clinical workspace (session vault).",
          }
        }
        const { data: row, error } = await supabase
          .from("practice_patients")
          .select("profile_ciphertext, profile_iv, display_name_hint")
          .eq("id", patientId)
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (error || !row?.profile_ciphertext || !row?.profile_iv) {
          return { error: "Patient record not found or not yet encrypted." }
        }
        const json = decryptPracticeAesGcm(dek, row.profile_ciphertext, row.profile_iv)
        if (!json) return { error: "Failed to decrypt patient profile." }
        try {
          const profile = JSON.parse(json) as Record<string, unknown>
          const want = sections?.length ? new Set(sections) : null
          const out: Record<string, unknown> = {
            patientId,
            displayNameHint: row.display_name_hint,
            provenance: "practice_patients.profile",
          }
          if (!want || want.has("demographics")) {
            out.demographics = {
              name: profile.name,
              dateOfBirth: profile.dateOfBirth,
              age: profile.age,
              sex: profile.sex,
              phone: profile.phone,
              email: profile.email,
              address: profile.address,
              idNumber: profile.idNumber,
            }
          }
          if (!want || want.has("medical_aid")) {
            out.medical_aid = {
              medicalAidStatus: profile.medicalAidStatus,
              medicalAidScheme: profile.medicalAidScheme,
              memberNumber: profile.memberNumber,
              dependentCode: profile.dependentCode,
              mainMemberName: profile.mainMemberName,
              mainMemberId: profile.mainMemberId,
            }
          }
          if (!want || want.has("allergies")) out.allergies = profile.allergies
          if (!want || want.has("conditions")) out.chronicConditions = profile.chronicConditions
          if (!want || want.has("medications")) out.currentMedications = profile.currentMedications
          return out
        } catch {
          return { error: "Invalid decrypted profile JSON." }
        }
      },
    }),

    get_encounter_state: tool({
      description:
        "Load SOAP, vitals, timeline blocks, and session documents for an encounter. Use encounter id from the consult context or omit for latest in-progress encounter.",
      parameters: z.object({
        encounter_id: z.string().uuid().optional(),
        include: z
          .array(z.enum(["soap", "vitals", "blocks", "documents", "scribe"]))
          .optional(),
      }),
      execute: async ({ encounter_id, include }) => {
        const dek = await loadVaultDek(supabase, userId, practiceId)
        if (!dek) {
          return {
            error:
              "Practice session not unlocked for server tools. Unlock in the clinical workspace (session vault).",
          }
        }
        const base = supabase
          .from("clinical_encounters")
          .select("id, state_ciphertext, state_iv, status, started_at")
          .eq("patient_id", patientId)
          .eq("practice_id", practiceId)

        const { data: row, error } = encounter_id
          ? await base.eq("id", encounter_id).maybeSingle()
          : await (async () => {
              const r = await base.order("updated_at", { ascending: false }).limit(1)
              return { data: r.data?.[0] ?? null, error: r.error }
            })()

        if (error || !row?.state_ciphertext || !row?.state_iv) {
          return { error: "Encounter not found or empty." }
        }
        const json = decryptPracticeAesGcm(dek, row.state_ciphertext, row.state_iv)
        if (!json) return { error: "Failed to decrypt encounter state." }
        try {
          const state = JSON.parse(json) as Record<string, unknown>
          const inc = include?.length ? new Set(include) : null
          const out: Record<string, unknown> = { encounterId: row.id, status: row.status }
          if (!inc || inc.has("soap")) out.soapNote = state.soapNote
          if (!inc || inc.has("vitals")) out.vitals = state.vitals
          if (!inc || inc.has("blocks")) out.blocks = state.blocks
          if (!inc || inc.has("documents")) out.sessionDocuments = state.sessionDocuments
          if (!inc || inc.has("scribe")) {
            out.scribeTranscript = state.scribeTranscript
            out.scribeEntities = state.scribeEntities
          }
          out.provenance = "clinical_encounters.state"
          return out
        } catch {
          return { error: "Invalid decrypted encounter JSON." }
        }
      },
    }),

    ...(omitRetrievalTools
      ? {}
      : {
          search_patient_clinical_record: tool({
            description:
              "Hybrid semantic + keyword retrieval over indexed clinical chunks for this patient. Optionally scope to one encounter. Returns chunk text bodies for model use.",
            parameters: z.object({
              query: z.string().min(2),
              max_results: z.number().int().min(1).max(20).optional(),
              encounter_id: z.string().uuid().optional(),
            }),
            execute: async ({ query, max_results, encounter_id }) => {
              const dek = await loadVaultDek(supabase, userId, practiceId)
              if (!dek) {
                return {
                  error:
                    "Practice session not unlocked for server tools. Unlock in the clinical workspace (session vault).",
                }
              }
              const { chunks, error } = await hybridSearchWithChunkBodies({
                supabase,
                practiceId,
                patientId,
                query,
                maxResults: max_results ?? 12,
                encounterId: encounter_id ?? null,
              })
              if (error) return { error, chunks: [] }
              return {
                chunks,
                provenance: "clinical_rag_chunks",
              }
            },
          }),

          search_patient_history: tool({
            description:
              "Search across ALL past encounters for this patient (not limited to the current visit). Use for historical labs, prior diagnoses, or previous notes.",
            parameters: z.object({
              query: z.string().min(2),
              max_results: z.number().int().min(1).max(24).optional(),
            }),
            execute: async ({ query, max_results }) => {
              const dek = await loadVaultDek(supabase, userId, practiceId)
              if (!dek) {
                return {
                  error:
                    "Practice session not unlocked for server tools. Unlock in the clinical workspace (session vault).",
                }
              }
              const { chunks, error } = await hybridSearchWithChunkBodies({
                supabase,
                practiceId,
                patientId,
                query,
                maxResults: max_results ?? 16,
                encounterId: null,
              })
              if (error) return { error, chunks: [] }
              return {
                chunks,
                provenance: "clinical_rag_chunks_all_encounters",
              }
            },
          }),
        }),

    prescribe_medication: tool({
      description:
        "Draft a structured prescription with per-line clinical reasoning, allergy cross-checks, and duplicate medication warnings. Call when the user asks to prescribe or review medications. Always verify against the live chart.",
      parameters: z.object({
        clinical_focus: z
          .string()
          .optional()
          .describe("Optional focus (e.g. indication or drug class the user asked about)"),
      }),
      execute: async ({ clinical_focus }) => {
        const dek = await loadVaultDek(supabase, userId, practiceId)
        if (!dek) {
          return {
            error:
              "Practice session not unlocked for server tools. Unlock in the clinical workspace (session vault).",
          }
        }
        const { data: prow, error: perr } = await supabase
          .from("practice_patients")
          .select("profile_ciphertext, profile_iv")
          .eq("id", patientId)
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (perr || !prow?.profile_ciphertext || !prow?.profile_iv) {
          return { error: "Patient profile not found." }
        }
        const pjson = decryptPracticeAesGcm(dek, prow.profile_ciphertext, prow.profile_iv)
        if (!pjson) return { error: "Failed to decrypt patient profile." }
        let profile: Record<string, unknown>
        try {
          profile = JSON.parse(pjson) as Record<string, unknown>
        } catch {
          return { error: "Invalid profile JSON." }
        }

        const allergies = asStringList(profile.allergies)
        const chronicConditions = asStringList(profile.chronicConditions)
        const currentMeds = asStringList(profile.currentMedications)

        const { data: enc } = await supabase
          .from("clinical_encounters")
          .select("state_ciphertext, state_iv")
          .eq("patient_id", patientId)
          .eq("practice_id", practiceId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        let encounterProblems: string[] = []
        if (enc?.state_ciphertext && enc.state_iv) {
          const ej = decryptPracticeAesGcm(dek, enc.state_ciphertext, enc.state_iv)
          if (ej) {
            try {
              const st = JSON.parse(ej) as Record<string, unknown>
              encounterProblems = asStringList(st.encounterProblems)
              const encChronic = asStringList(st.chronicConditions)
              if (encChronic.length) {
                chronicConditions.push(...encChronic.filter((c) => !chronicConditions.includes(c)))
              }
            } catch {
              /* noop */
            }
          }
        }

        const draft = buildPrescriptionDraft({
          allergies,
          chronicConditions,
          encounterProblems,
          activeMedNames: currentMeds,
          focus: clinical_focus,
        })

        return {
          ...draft,
          provenance: "prescribe_medication_tool",
          safetyNote:
            "Verify renal/hepatic function, pregnancy, interactions, and local formulary. This is decision support only.",
        }
      },
    }),
  }
}
