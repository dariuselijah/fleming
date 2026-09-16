import type { SupabaseClient } from "@supabase/supabase-js"
import { randomBytes } from "@/lib/crypto/practice-e2ee"
import { vaultOpenDek, vaultSealDek } from "@/lib/server/clinical-vault"
import { loadVaultDek } from "@/lib/clinical/vault-dek"

function dekRawToBase64(raw: Uint8Array): string {
  return Buffer.from(raw).toString("base64")
}

/** Load server-sealed practice DEK (plain base64) for an authenticated practice member. */
export async function loadPracticeDekFromStore(
  supabase: SupabaseClient,
  practiceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("practice_encryption_keys")
    .select("enc_dek, dek_iv")
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (error || !data?.enc_dek || !data?.dek_iv) return null
  return vaultOpenDek(data.enc_dek, data.dek_iv)
}

/** Persist practice DEK sealed with CLINICAL_VAULT_SECRET / ENCRYPTION_KEY. */
export async function upsertPracticeDekStore(
  supabase: SupabaseClient,
  practiceId: string,
  dekBase64: string
): Promise<boolean> {
  const sealed = vaultSealDek(dekBase64)
  if (!sealed) return false

  const { error } = await supabase.from("practice_encryption_keys").upsert(
    {
      practice_id: practiceId,
      enc_dek: sealed.enc,
      dek_iv: sealed.iv,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "practice_id" }
  )
  return !error
}

/** Create a new random practice DEK if none exists yet. */
export async function ensurePracticeDek(
  supabase: SupabaseClient,
  practiceId: string
): Promise<string | null> {
  const existing = await loadPracticeDekFromStore(supabase, practiceId)
  if (existing) return existing

  const raw = await randomBytes(32)
  const dekBase64 = dekRawToBase64(raw)
  const ok = await upsertPracticeDekStore(supabase, practiceId, dekBase64)
  return ok ? dekBase64 : null
}

const SESSION_TTL_DAYS = 7

export function sessionVaultExpiresAt(): string {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000).toISOString()
}

/** Recover DEK from any active session key in the practice (admin only). */
export async function loadPracticeDekFromAnySession(
  supabase: SupabaseClient,
  practiceId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("clinical_session_keys")
    .select("enc_dek, dek_iv")
    .eq("practice_id", practiceId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.enc_dek || !data?.dek_iv) return null
  return vaultOpenDek(data.enc_dek, data.dek_iv)
}

/** Resolve DEK for the signed-in user: session vault → any practice session → store → create new. */
export async function resolvePracticeDekForUser(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
  admin?: SupabaseClient
): Promise<string | null> {
  const fromSession = await loadVaultDek(supabase, userId, practiceId)
  if (fromSession) return fromSession

  const adminClient = admin ?? supabase
  const fromPeerSession = await loadPracticeDekFromAnySession(adminClient, practiceId)
  if (fromPeerSession) return fromPeerSession

  const fromStore = await loadPracticeDekFromStore(adminClient, practiceId)
  if (fromStore) return fromStore

  return ensurePracticeDek(adminClient, practiceId)
}

/** Write DEK to user session vault (long TTL) and practice store. */
export async function persistPracticeDekForUser(
  supabase: SupabaseClient,
  userId: string,
  practiceId: string,
  dekBase64: string
): Promise<void> {
  await upsertPracticeDekStore(supabase, practiceId, dekBase64)

  const sealed = vaultSealDek(dekBase64)
  if (!sealed) return

  await supabase.from("clinical_session_keys").insert({
    user_id: userId,
    practice_id: practiceId,
    enc_dek: sealed.enc,
    dek_iv: sealed.iv,
    expires_at: sessionVaultExpiresAt(),
  })
}
