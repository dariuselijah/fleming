import { tool } from "ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadVaultDek } from "@/lib/clinical/vault-dek"
import { decryptPracticeAesGcm } from "@/lib/server/clinical-vault"
import { sendPatientMessageEmail } from "@/lib/patient/send-patient-message-email"
import { getPracticeMessagingNumber, sendSmsMessage } from "@/lib/comms"
import { normalizePhoneE164Za, resolvePatientPhoneE164 } from "@/lib/comms/patient-phone"

export function buildClinicalAssistantExtras(ctx: {
  supabase: SupabaseClient
  userId: string
  practiceId: string
  patientId: string
}) {
  const { supabase, userId, practiceId, patientId } = ctx

  return {
    summarize_current_visit: tool({
      description:
        "Summarize the active consult: transcript tail, SOAP draft, chief complaint, and extracted entities from the vault encounter state.",
      parameters: z.object({}),
      execute: async () => {
        const dek = await loadVaultDek(supabase, userId, practiceId)
        if (!dek) return { ok: false, error: "Vault locked — unlock in clinical workspace." }

        const { data: enc } = await supabase
          .from("clinical_encounters")
          .select("id, state_ciphertext, state_iv")
          .eq("patient_id", patientId)
          .eq("practice_id", practiceId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!enc?.state_ciphertext || !enc.state_iv) {
          return { ok: false, error: "No in-progress encounter state found." }
        }

        const json = decryptPracticeAesGcm(dek, enc.state_ciphertext, enc.state_iv)
        if (!json) return { ok: false, error: "Failed to decrypt encounter." }

        try {
          const st = JSON.parse(json) as Record<string, unknown>
          const soap = (st.soapNote ?? {}) as Record<string, unknown>
          const transcript =
            typeof st.scribeTranscript === "string" ? st.scribeTranscript.slice(-3000) : ""
          const entities = st.scribeEntities ?? null
          return {
            ok: true,
            encounterId: enc.id,
            transcriptTail: transcript,
            soap,
            entities,
            appointmentReason: st.appointmentReason ?? null,
          }
        } catch {
          return { ok: false, error: "Invalid encounter JSON." }
        }
      },
    }),

    send_patient_email: tool({
      description: "Send a plain-text email to the patient on file (requires Resend configured).",
      parameters: z.object({
        subject: z.string().min(3).max(120),
        body: z.string().min(10).max(8000),
      }),
      execute: async ({ subject, body }) => {
        const dek = await loadVaultDek(supabase, userId, practiceId)
        if (!dek) return { ok: false, error: "Vault locked." }
        const { data: row } = await supabase
          .from("practice_patients")
          .select("profile_ciphertext, profile_iv")
          .eq("id", patientId)
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (!row?.profile_ciphertext || !row?.profile_iv) {
          return { ok: false, error: "Patient not found." }
        }
        const profileJson = decryptPracticeAesGcm(dek, row.profile_ciphertext, row.profile_iv)
        if (!profileJson) return { ok: false, error: "Decrypt failed." }
        const profile = JSON.parse(profileJson) as { email?: string; name?: string }
        const to = profile.email?.trim()
        if (!to) return { ok: false, error: "Patient has no email on file." }
        const sent = await sendPatientMessageEmail({ to, subject, body, patientName: profile.name })
        return sent.ok ? { ok: true, to, channel: "email" as const } : sent
      },
    }),

    send_patient_sms: tool({
      description: "Send an SMS/RCS message to the patient on file (requires practice messaging number).",
      parameters: z.object({
        message: z.string().min(10).max(1600),
      }),
      execute: async ({ message }) => {
        let phone: string | null = null
        const { data: pat } = await supabase
          .from("practice_patients")
          .select("phone_e164")
          .eq("id", patientId)
          .eq("practice_id", practiceId)
          .maybeSingle()
        const col = (pat as { phone_e164?: string | null } | null)?.phone_e164
        if (col?.trim()) phone = col.trim()

        if (!phone) {
          phone = await resolvePatientPhoneE164(supabase, practiceId, patientId)
        }

        if (!phone) return { ok: false, error: "Patient has no phone on file." }

        const from = await getPracticeMessagingNumber(practiceId)
        if (!from) return { ok: false, error: "Practice messaging number not configured." }

        const normalized = normalizePhoneE164Za(phone)
        try {
          await sendSmsMessage({ to: normalized, from, body: message })
          if (!col?.trim()) {
            await supabase
              .from("practice_patients")
              .update({ phone_e164: normalized })
              .eq("id", patientId)
              .eq("practice_id", practiceId)
          }
          return {
            ok: true,
            channel: "sms" as const,
            phoneMasked: normalized.replace(/\d(?=\d{4})/g, "*"),
          }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "SMS failed" }
        }
      },
    }),

    upsert_session_document: tool({
      description:
        "Propose creating or updating a session document (soap, summary, refer). Returns a clientAction for the UI to apply.",
      parameters: z.object({
        docType: z.enum(["soap", "summary", "refer"]),
        title: z.string().min(2).max(120),
        content: z.string().min(20).max(50000),
      }),
      execute: async ({ docType, title, content }) => ({
        ok: true,
        clientAction: {
          type: "upsert_session_document",
          patientId,
          docType,
          title,
          content,
        },
      }),
    }),
  }
}
