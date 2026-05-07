import { createHash, randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPortalBaseUrl } from "./env"

export type PortalTokenPurpose =
  | "check_in"
  | "intake"
  | "billing"
  | "billing_invoice"
  | "lab_results"
  | "general"
  | "appointment"

export function newPortalTokenRaw(): string {
  return randomBytes(32).toString("base64url")
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export async function createPatientAccessToken(opts: {
  practiceId: string
  patientId: string
  purpose: PortalTokenPurpose
  appointmentId?: string | null
  invoiceId?: string | null
  expiresInHours?: number
}): Promise<{ rawToken: string; portalUrl: string }> {
  const rawToken = newPortalTokenRaw()
  const tokenHash = hashPortalToken(rawToken)
  const expiresAt = new Date(
    Date.now() + (opts.expiresInHours ?? Number(process.env.PORTAL_TOKEN_EXPIRY_HOURS || 24)) * 60 * 60 * 1000
  ).toISOString()

  const { error } = await createAdminClient().from("patient_access_tokens").insert({
    practice_id: opts.practiceId,
    patient_id: opts.patientId,
    token_hash: tokenHash,
    purpose: opts.purpose,
    appointment_id: opts.appointmentId ?? null,
    invoice_id: opts.invoiceId ?? null,
    expires_at: expiresAt,
  })

  if (error) throw new Error(`patient_access_tokens: ${error.message}`)

  const base = getPortalBaseUrl()
  const path = `/portal/${encodeURIComponent(rawToken)}`
  const portalUrl = base ? `${base}${path}` : path

  return { rawToken, portalUrl }
}

export async function getPatientAccessTokenByHash(tokenHash: string) {
  const { data, error } = await createAdminClient()
    .from("patient_access_tokens")
    .select("id, practice_id, patient_id, purpose, appointment_id, invoice_id, expires_at, used_at, elevated_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}
