import { createAdminClient } from "@/lib/supabase/admin"
import type { ConsentType } from "./types"

export async function hasConsent(
  practiceId: string,
  externalParty: string,
  consentType: ConsentType = "ai_communication"
): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("patient_consent")
    .select("granted")
    .eq("practice_id", practiceId)
    .eq("external_party", externalParty.replace("whatsapp:", ""))
    .eq("consent_type", consentType)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle()

  return data?.granted === true
}

export async function recordConsent(opts: {
  practiceId: string
  externalParty: string
  channel: string
  consentType: ConsentType
  granted: boolean
  patientId?: string
  evidenceMessageId?: string
}): Promise<void> {
  const db = createAdminClient()
  const cleanParty = opts.externalParty.replace("whatsapp:", "")

  await db.from("patient_consent").upsert(
    {
      practice_id: opts.practiceId,
      external_party: cleanParty,
      channel: opts.channel,
      consent_type: opts.consentType,
      granted: opts.granted,
      granted_at: opts.granted ? new Date().toISOString() : undefined,
      revoked_at: opts.granted ? null : new Date().toISOString(),
      patient_id: opts.patientId,
      evidence_message_id: opts.evidenceMessageId,
    },
    { onConflict: "practice_id,external_party,consent_type" }
  )
}

export function isOptOutKeyword(text: string): boolean {
  const normalized = text.trim().toUpperCase()
  return ["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL MESSAGES"].includes(normalized)
}

export function isConsentGrant(text: string): boolean {
  const normalized = text.trim().toUpperCase()
  return ["YES", "I AGREE", "AGREE", "CONSENT", "OK", "ACCEPT", "Y"].includes(normalized)
}

export function getConsentPrompt(practiceName: string): string {
  return (
    `Welcome to ${practiceName}. Before we can assist you, we need your consent to process ` +
    `your messages using AI in accordance with POPIA.\n\n` +
    `Your data is encrypted and never shared. Reply *YES* to continue or *NO* to opt out.`
  )
}
