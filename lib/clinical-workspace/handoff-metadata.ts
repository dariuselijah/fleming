import type { ClinicalDocType } from "./types"

export type ClinicalHandoffMetadata = {
  docType?: ClinicalDocType
  sessionDocumentId?: string
  clinicalEncounterId?: string
  prescriberStaffId?: string
  source?: "clinical_consult"
}

export function parseHandoffMetadata(raw: unknown): ClinicalHandoffMetadata {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  return {
    docType: typeof o.docType === "string" ? (o.docType as ClinicalDocType) : undefined,
    sessionDocumentId: typeof o.sessionDocumentId === "string" ? o.sessionDocumentId : undefined,
    clinicalEncounterId: typeof o.clinicalEncounterId === "string" ? o.clinicalEncounterId : undefined,
    prescriberStaffId: typeof o.prescriberStaffId === "string" ? o.prescriberStaffId : undefined,
    source: o.source === "clinical_consult" ? "clinical_consult" : undefined,
  }
}
