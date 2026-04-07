import { tool, type ToolSet } from "ai"
import { z } from "zod"
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

export function buildPatientClinicalTools(params: {
  supabase: SupabaseClient
  userId: string
  practiceId: string
  patientId: string
}): ToolSet {
  const { supabase, userId, practiceId, patientId } = params

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

    search_patient_clinical_record: tool({
      description:
        "Hybrid semantic + keyword retrieval over indexed clinical chunks for this patient. Returns chunk ids and scores (no free-text PHI stored server-side).",
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
        let embedding: number[]
        try {
          embedding = await generateEmbedding(query)
        } catch (e) {
          return { error: `Embedding failed: ${e instanceof Error ? e.message : String(e)}` }
        }
        const vec = `[${embedding.join(",")}]`
        const { data, error } = await supabase.rpc("hybrid_search_clinical_chunks", {
          p_practice_id: practiceId,
          p_patient_id: patientId,
          p_query_text: query,
          p_query_embedding: vec,
          p_match_count: max_results ?? 12,
          p_encounter_id: encounter_id ?? null,
          p_source_types: null,
        })
        if (error) {
          return { error: error.message, chunks: [] }
        }
        return {
          chunks: data ?? [],
          provenance: "clinical_rag_chunks",
        }
      },
    }),
  }
}
