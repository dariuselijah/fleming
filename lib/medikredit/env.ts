import { getClinicalProxyBase } from "@/lib/clinical-proxy/url"
import type { MedikreditEnvConfig } from "./types"

export function getMedikreditEnv(): MedikreditEnvConfig | null {
  const apiUrl = process.env.MEDIKREDIT_API_URL?.trim()
  const username = process.env.MEDIKREDIT_USERNAME?.trim()
  const password = process.env.MEDIKREDIT_PASSWORD?.trim()
  if (!apiUrl || !username || !password) return null
  return { apiUrl, username, password }
}

/** True when direct MediKredit env, JSON proxy base, or dry-run is available. */
export function isMedikreditConfigured(): boolean {
  if (process.env.MEDIKREDIT_DRY_RUN === "1") return true
  if (getClinicalProxyBase()) return true
  return getMedikreditEnv() !== null
}

export function requireMedikreditEnv(): MedikreditEnvConfig {
  const c = getMedikreditEnv()
  if (!c) {
    throw new Error(
      "MediKredit is not configured. Set MEDIKREDIT_API_URL, MEDIKREDIT_USERNAME, and MEDIKREDIT_PASSWORD on the server."
    )
  }
  return c
}

/** Fallback TX@plan when the patient has no `medicalAidSchemeCode` (e.g. MediKredit test option 631372). */
export function getMedikreditDefaultOptionCode(): string | undefined {
  const v = process.env.MEDIKREDIT_DEFAULT_OPTION_CODE?.trim()
  return v || undefined
}
