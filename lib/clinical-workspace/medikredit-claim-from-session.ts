import type { ClaimLine, PatientSession, PracticeClaim } from "./types"
import type { ClaimLineInput, ItemTypeIndicator, MedikreditPatientPayload } from "@/lib/medikredit/types"
import { resolveItemTypeIndicator } from "@/lib/medikredit/modifier-engine"

export function patientSessionToMedikreditPayload(p: PatientSession): MedikreditPatientPayload {
  return {
    id: p.patientId,
    name: p.name,
    memberNumber: p.memberNumber,
    medicalAidScheme: p.medicalAidScheme,
    dependentCode: undefined,
    mainMemberName: undefined,
    dateOfBirth: undefined,
    sex: p.sex,
  }
}

/** Map UI claim lines to MediKredit claim line inputs (treatment date = today in local practice). */
export function practiceClaimLinesToMedikredit(
  lines: ClaimLine[],
  treatmentDate: string
): ClaimLineInput[] {
  return lines.map((l, i) => {
    const tp: 1 | 2 | 3 =
      l.medikreditTp ?? (l.nappiCode?.trim() ? 1 : 2)

    const partial: ClaimLineInput = {
      lineNumber: i + 1,
      tp,
      tariffCode: l.tariffCode,
      nappiCode: l.nappiCode,
      icdCodes: l.icdCode ? [l.icdCode] : undefined,
      grossAmount: l.amount,
      treatmentDate,
      treatmentTime: undefined,
      modifierCodes: l.modifierCodes?.length ? l.modifierCodes : undefined,
      modifierAmounts: l.modifierAmounts?.length ? l.modifierAmounts : undefined,
      modifierSequences: l.modifierSequences?.length ? l.modifierSequences : undefined,
      quantity: l.quantity,
    }

    partial.itemTypeIndicator =
      (l.itemTypeIndicator as ItemTypeIndicator) || resolveItemTypeIndicator(partial)

    return partial
  })
}
