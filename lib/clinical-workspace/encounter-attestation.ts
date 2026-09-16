import type { EncounterAttestation } from "./types"

export const ENCOUNTER_ATTESTATION_STATEMENT =
  "I confirm that I have reviewed this encounter, that the clinical record accurately reflects my assessment and plan, and that any AI-assisted content has been clinically verified."

export function buildEncounterAttestation(input: {
  signerUserId: string
  signerDisplayName?: string | null
  signerEmail?: string | null
  signedAt?: Date
}): EncounterAttestation {
  const displayName =
    input.signerDisplayName?.trim() ||
    input.signerEmail?.split("@")[0]?.trim() ||
    "Authenticated clinician"

  return {
    version: 1,
    statement: ENCOUNTER_ATTESTATION_STATEMENT,
    signerUserId: input.signerUserId,
    signerDisplayName: displayName,
    signerEmail: input.signerEmail?.trim() || undefined,
    signedAt: (input.signedAt ?? new Date()).toISOString(),
  }
}
