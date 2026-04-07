import type { ClaimLine, PatientSession, PracticeClaim } from "./types"

const ICD_REGEX = /\b([A-Z]\d{2}\.?\d{0,2})\b/g
const NAPPI_REGEX = /\b(\d{5,7})\b/g

function extractIcdCodes(text: string): string[] {
  const matches = text.match(ICD_REGEX)
  return [...new Set(matches ?? [])]
}

function estimateAmount(icdCode: string): number {
  const base = 350
  const hash = icdCode.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return base + (hash % 400)
}

export function generateDraftClaim(patient: PatientSession, doctorId?: string | null): PracticeClaim | null {
  const accepted = (patient.sessionDocuments ?? []).filter((sd) => sd.status === "accepted")
  if (accepted.length === 0) return null

  const allContent = accepted.map((sd) => sd.document.content).join("\n")
  const icdCodes = extractIcdCodes(allContent)

  const lines: ClaimLine[] = []

  for (const code of icdCodes) {
    lines.push({
      id: `cl-${Date.now()}-${code}`,
      description: `ICD-10: ${code}`,
      icdCode: code,
      amount: estimateAmount(code),
      lineType: patient.medicalAidStatus === "active" ? "medical_aid" : "cash",
      status: "draft",
    })
  }

  for (const sd of accepted) {
    if (sd.document.type !== "prescribe" || !sd.document.prescriptionItems) continue
    for (const rx of sd.document.prescriptionItems) {
      lines.push({
        id: `cl-${Date.now()}-rx-${rx.id}`,
        description: `Rx: ${rx.drug}${rx.strength ? ` ${rx.strength}` : ""}`,
        nappiCode: undefined,
        amount: 85,
        lineType: patient.medicalAidStatus === "active" ? "medical_aid" : "cash",
        status: "draft",
      })
    }
  }

  if (lines.length === 0) {
    lines.push({
      id: `cl-${Date.now()}-consult`,
      description: "Consultation fee",
      tariffCode: "0190",
      amount: 450,
      lineType: patient.medicalAidStatus === "active" ? "medical_aid" : "cash",
      status: "draft",
    })
  }

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0)
  const medicalAidAmount = lines
    .filter((l) => l.lineType === "medical_aid")
    .reduce((s, l) => s + l.amount, 0)
  const cashAmount = totalAmount - medicalAidAmount

  return {
    id: `claim-${Date.now()}`,
    patientId: patient.patientId,
    patientName: patient.name,
    doctorId: doctorId ?? undefined,
    sessionDocumentId: accepted[0]?.id,
    lines,
    totalAmount,
    medicalAidAmount,
    cashAmount,
    status: "draft",
    createdAt: new Date().toISOString(),
  }
}
