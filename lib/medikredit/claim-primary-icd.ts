import type { ClaimLineInput } from "./types"
import { normalizeIcd10ForClaim } from "./normalize-icd"

/** MediKredit requires at least one primary ICD per submitted line or the switch returns RJ 762. */
export function validateClaimLinesPrimaryIcd(lines: ClaimLineInput[]): string | null {
  for (const line of lines) {
    const codes = line.icdCodes ?? []
    const hasPrimary = codes.some((c) => Boolean(normalizeIcd10ForClaim(c)))
    if (!hasPrimary) {
      const n = line.lineNumber ?? "?"
      return `Line ${n}: add a primary ICD-10 code. The scheme rejects lines without one (RJ 762).`
    }
  }
  return null
}
