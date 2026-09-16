import type { ClaimLine, PatientSession, PracticePatient } from "./types"
import { normalizeIcd10ForClaim } from "@/lib/medikredit/normalize-icd"
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

export function practicePatientToMedikreditPayload(p: PracticePatient): MedikreditPatientPayload {
  return {
    id: p.id,
    name: p.name,
    idNumber: p.idNumber,
    memberNumber: p.memberNumber,
    medicalAidScheme: p.medicalAidScheme,
    medicalAidSchemeCode: p.medicalAidSchemeCode,
    dependentCode: p.dependentCode,
    mainMemberName: p.mainMemberName,
    dateOfBirth: p.dateOfBirth,
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

    const icdNorm = normalizeIcd10ForClaim(l.icdCode)
    const partial: ClaimLineInput = {
      lineNumber: i + 1,
      tp,
      tariffCode: l.tariffCode,
      nappiCode: l.nappiCode,
      icdCodes: icdNorm ? [icdNorm] : undefined,
      grossAmount: l.amount,
      treatmentDate: l.treatmentDate?.trim() || treatmentDate,
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
