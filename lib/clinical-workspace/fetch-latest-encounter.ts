import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptJson } from "@/lib/crypto/practice-e2ee"
import type { EncounterStatePlain } from "@/lib/clinical-workspace/encounter-state"

/**
 * Loads the most relevant saved encounter for this consult thread.
 * Prefer row linked to the active chat; otherwise latest for this patient.
 */
export async function fetchLatestEncounterPlain(args: {
  supabase: SupabaseClient
  practiceId: string
  patientId: string
  chatId: string | null | undefined
  dekKey: CryptoKey
}): Promise<{ encounterId: string; plain: EncounterStatePlain } | null> {
  const { supabase, practiceId, patientId, chatId, dekKey } = args

  if (chatId) {
    const { data: byChat, error: e1 } = await supabase
      .from("clinical_encounters")
      .select("id, state_ciphertext, state_iv")
      .eq("practice_id", practiceId)
      .eq("patient_id", patientId)
      .eq("chat_id", chatId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!e1 && byChat?.state_ciphertext && byChat?.state_iv) {
      const plain = await tryDecrypt(dekKey, byChat.state_ciphertext, byChat.state_iv)
      if (plain) return { encounterId: byChat.id as string, plain }
    }
  }

  const { data: latest, error: e2 } = await supabase
    .from("clinical_encounters")
    .select("id, state_ciphertext, state_iv")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (e2 || !latest?.state_ciphertext || !latest?.state_iv) return null
  const plain = await tryDecrypt(dekKey, latest.state_ciphertext, latest.state_iv)
  if (!plain) return null
  return { encounterId: latest.id as string, plain }
}

async function tryDecrypt(
  dekKey: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<EncounterStatePlain | null> {
  try {
    const plain = await decryptJson<EncounterStatePlain>(dekKey, String(ciphertext), String(iv))
    if (plain && plain.v === 1) return plain
  } catch {
    /* ignore */
  }
  return null
}
