import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptPracticeAesGcm, vaultOpenDek } from "@/lib/server/clinical-vault"

/** Load unlocked practice DEK for the current user session. */
export async function loadVaultDek(
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

export function escapeClinicalXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export { decryptPracticeAesGcm }
