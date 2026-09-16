import type { ClinicalDocType, SessionDocument } from "./types"

const DOC_TITLES: Record<ClinicalDocType, string> = {
  soap: "SOAP Note",
  summary: "Clinical Summary",
  evidence: "Evidence Review",
  interactions: "Drug Interactions",
  drug: "Drug Information",
  icd: "ICD-10 Codes",
  prescribe: "Prescription",
  refer: "Referral Letter",
  vitals: "Vitals Assessment",
  verify: "Eligibility Check",
  claim: "Billing Claim",
}

export function createPendingSessionDocument(type: ClinicalDocType): SessionDocument {
  const id = `cdoc-pending-${type}-${Date.now()}`
  return {
    id,
    messageId: "pending",
    status: "draft",
    document: {
      id,
      type,
      title: DOC_TITLES[type],
      content: "",
      isStreaming: true,
      timestamp: new Date(),
    },
    updatedAt: new Date().toISOString(),
  }
}

export function findSessionDocumentByType(
  documents: SessionDocument[] | undefined,
  type: ClinicalDocType
): SessionDocument | undefined {
  if (!documents?.length) return undefined
  return [...documents].reverse().find((s) => s.document.type === type)
}

export function prepareSessionDocumentForGeneration(
  documents: SessionDocument[] | undefined,
  type: ClinicalDocType
): SessionDocument {
  const existing = findSessionDocumentByType(documents, type)
  if (existing) {
    return {
      ...existing,
      messageId: "pending",
      status: "draft",
      document: {
        ...existing.document,
        content: "",
        isStreaming: true,
        timestamp: new Date(),
      },
      updatedAt: new Date().toISOString(),
    }
  }
  return createPendingSessionDocument(type)
}
