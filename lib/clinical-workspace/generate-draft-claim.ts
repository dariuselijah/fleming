import { normalizeIcd10ForClaim } from "@/lib/medikredit/normalize-icd"
import type { ClaimLine, PatientSession, PracticeClaim } from "./types"
import {
  claimDocumentItemsToClaimLines,
  collectIcdCodesFromSession,
} from "./normalize-claim-items"

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function consultationLine(lineType: ClaimLine["lineType"]): ClaimLine {
  return {
    id: uid("cl-consult"),
    description: "Consultation",
    tariffCode: "0190",
    medikreditTp: 2,
    quantity: 1,
    amount: 450,
    lineType,
    status: "draft",
    lineSource: "manual",
  }
}

function toPracticeClaim(
  patient: PatientSession,
  lines: ClaimLine[],
  doctorId: string | null | undefined,
  sessionDocumentId?: string
): PracticeClaim {
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0)
  const medicalAidAmount = lines
    .filter((l) => l.lineType === "medical_aid")
    .reduce((s, l) => s + l.amount, 0)
  return {
    id: `claim-${Date.now()}`,
    patientId: patient.patientId,
    patientName: patient.name,
    doctorId: doctorId ?? undefined,
    sessionDocumentId,
    lines,
    totalAmount,
    medicalAidAmount,
    cashAmount: totalAmount - medicalAidAmount,
    status: "draft",
    createdAt: new Date().toISOString(),
  }
}

/**
 * Build a draft claim from THIS visit only — accepted billing/ICD/Rx documents,
 * not longitudinal chronic meds or symptom lists from the chart.
 */
export function generateDraftClaim(
  patient: PatientSession,
  doctorId?: string | null
): PracticeClaim | null {
  const lineType = patient.medicalAidStatus === "active" ? "medical_aid" : "cash"
  const accepted = (patient.sessionDocuments ?? []).filter((sd) => sd.status === "accepted")

  const claimDoc = [...accepted]
    .reverse()
    .find((sd) => sd.document.type === "claim" && (sd.document.claimItems?.length ?? 0) > 0)

  if (claimDoc?.document.claimItems?.length) {
    const lines = claimDocumentItemsToClaimLines(claimDoc.document.claimItems, lineType)
    if (lines.length > 0) {
      return toPracticeClaim(patient, lines, doctorId, claimDoc.id)
    }
  }

  const lines: ClaimLine[] = [consultationLine(lineType)]
  const seenIcd = new Set<string>()
  const seenDrug = new Set<string>()

  const icdDoc = [...accepted].reverse().find((sd) => sd.document.type === "icd")
  const icdItems = collectIcdCodesFromSession(icdDoc?.document.icdItems, undefined)
  for (const item of icdItems) {
    const code = normalizeIcd10ForClaim(item.code)
    if (!code || seenIcd.has(code)) continue
    seenIcd.add(code)
    lines.push({
      id: uid(`cl-icd-${code}`),
      description: item.description?.trim() || `Diagnosis ${code}`,
      icdCode: code,
      medikreditTp: 2,
      quantity: 1,
      amount: 0,
      lineType,
      status: "draft",
      lineSource: "manual",
    })
  }

  for (const sd of accepted) {
    if (sd.document.type !== "prescribe" || !sd.document.prescriptionItems?.length) continue
    for (const rx of sd.document.prescriptionItems) {
      const key = rx.drug.toLowerCase().trim()
      if (!key || seenDrug.has(key)) continue
      seenDrug.add(key)
      lines.push({
        id: uid(`cl-rx-${rx.id}`),
        description: `Rx: ${rx.drug}${rx.strength ? ` ${rx.strength}` : ""}`,
        medikreditTp: 1,
        quantity: 1,
        amount: 0,
        lineType,
        status: "draft",
        lineSource: "manual",
      })
    }
  }

  return toPracticeClaim(patient, lines, doctorId, icdDoc?.id ?? claimDoc?.id)
}

/** Always returns a claim suitable for MediKredit submission (fallback consultation line if needed). */
export function buildDraftClaimForSubmit(
  patient: PatientSession,
  doctorId?: string | null
): PracticeClaim {
  return (
    generateDraftClaim(patient, doctorId) ??
    toPracticeClaim(
      patient,
      [consultationLine(patient.medicalAidStatus === "active" ? "medical_aid" : "cash")],
      doctorId
    )
  )
}
