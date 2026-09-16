import type { ClinicalDocType } from "@/lib/clinical-workspace/types"

export const FRONT_DESK_DOC_LABEL: Record<ClinicalDocType, string> = {
  soap: "SOAP Note",
  summary: "Clinical Summary",
  evidence: "Evidence Review",
  interactions: "Drug Interactions",
  drug: "Drug Info",
  icd: "ICD-10 Codes",
  prescribe: "Prescription",
  refer: "Referral Letter",
  vitals: "Vitals",
  verify: "Verification",
  claim: "Billing Claim",
}

const LABEL_TO_DOC_TYPE = Object.fromEntries(
  Object.entries(FRONT_DESK_DOC_LABEL).map(([k, v]) => [v.toLowerCase(), k])
) as Record<string, ClinicalDocType>

/** Parse doc type from inbox from_label like "Prescription · Mr Name". */
export function parseDocTypeFromHandoffLabel(fromLabel: string): ClinicalDocType | null {
  const head = fromLabel.split("·")[0]?.trim().toLowerCase() ?? ""
  return LABEL_TO_DOC_TYPE[head] ?? null
}

export function handoffDocTypeLabel(docType: string | null | undefined): string {
  if (!docType) return "Clinical document"
  return FRONT_DESK_DOC_LABEL[docType as ClinicalDocType] ?? docType
}
