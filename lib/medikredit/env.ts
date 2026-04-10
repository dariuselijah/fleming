import type { MedikreditEnvConfig } from "./types"

export function getMedikreditEnv(): MedikreditEnvConfig | null {
  const apiUrl = process.env.MEDIKREDIT_API_URL?.trim()
  const username = process.env.MEDIKREDIT_USERNAME?.trim()
  const password = process.env.MEDIKREDIT_PASSWORD?.trim()
  if (!apiUrl || !username || !password) return null
  return { apiUrl, username, password }
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
