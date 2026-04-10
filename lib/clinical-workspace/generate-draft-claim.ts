import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"
import type { ClaimLine, PatientSession, PracticeClaim } from "./types"

const ICD_REGEX = /\b([A-Z]\d{2}\.?\d{0,2})\b/g
const TARIFF_REGEX = /\b(\d{4,5})\b/g

function extractIcdCodes(text: string): string[] {
  const matches = text.match(ICD_REGEX)
  return [...new Set(matches ?? [])]
}

function extractTariffCandidates(text: string): string[] {
  const matches = text.match(TARIFF_REGEX)
  return [...new Set(matches ?? [])]
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Extract scribe entity data from the SCRIBE blocks on the patient session.
 * Only the most recent fingerprint is used to avoid double-counting.
 */
function getScribeEntitiesFromBlocks(patient: PatientSession): ExtractedEntities | null {
  const scribeBlocks = patient.blocks.filter((b) => b.type === "SCRIBE")
  if (!scribeBlocks.length) return null
  const latest = scribeBlocks[scribeBlocks.length - 1]
  try {
    const fp = latest.metadata?.extractionFingerprint
    if (typeof fp === "string") return JSON.parse(fp) as ExtractedEntities
  } catch { /* ignore */ }
  return null
}

export function generateDraftClaim(
  patient: PatientSession,
  doctorId?: string | null
): PracticeClaim | null {
  const lineType = patient.medicalAidStatus === "active" ? "medical_aid" : "cash"
  const lines: ClaimLine[] = []
  const seenIcd = new Set<string>()
  const seenDrug = new Set<string>()
  const seenProc = new Set<string>()

  const accepted = (patient.sessionDocuments ?? []).filter((sd) => sd.status === "accepted")
  const allContent = accepted.map((sd) => sd.document.content).join("\n")

  // ── 1. Consultation line (always present for a signed encounter) ──
  lines.push({
    id: uid("cl-consult"),
    description: "Consultation",
    tariffCode: "0190",
    medikreditTp: 2,
    amount: 450,
    lineType,
    status: "draft",
  })

  // ── 2. ICD-10 codes from accepted documents → procedure lines ──
  for (const code of extractIcdCodes(allContent)) {
    if (seenIcd.has(code)) continue
    seenIcd.add(code)
    lines.push({
      id: uid(`cl-icd-${code}`),
      description: `Diagnosis: ${code}`,
      icdCode: code,
      medikreditTp: 2,
      amount: 0,
      lineType,
      status: "draft",
    })
  }

  // ── 3. Encounter problems (accepted diagnoses from scribe) → add ICD codes ──
  for (const problem of patient.encounterProblems ?? []) {
    const codes = extractIcdCodes(problem)
    if (codes.length > 0) {
      for (const code of codes) {
        if (seenIcd.has(code)) continue
        seenIcd.add(code)
        lines.push({
          id: uid(`cl-dx-${code}`),
          description: problem,
          icdCode: code,
          medikreditTp: 2,
          amount: 0,
          lineType,
          status: "draft",
        })
      }
    }
  }

  // ── 4. Prescription items from accepted "prescribe" documents → medication lines ──
  for (const sd of accepted) {
    if (sd.document.type !== "prescribe" || !sd.document.prescriptionItems) continue
    for (const rx of sd.document.prescriptionItems) {
      const key = rx.drug.toLowerCase()
      if (seenDrug.has(key)) continue
      seenDrug.add(key)
      lines.push({
        id: uid(`cl-rx-${rx.id}`),
        description: `Rx: ${rx.drug}${rx.strength ? ` ${rx.strength}` : ""}`,
        nappiCode: undefined,
        medikreditTp: 1,
        amount: 0,
        lineType,
        status: "draft",
      })
    }
  }

  // ── 5. Active medications from scribe acceptance → medication lines ──
  for (const med of patient.activeMedications ?? []) {
    const key = med.name.toLowerCase()
    if (seenDrug.has(key)) continue
    seenDrug.add(key)
    lines.push({
      id: uid(`cl-med-${med.id}`),
      description: `${med.name}${med.dosage ? ` ${med.dosage}` : ""}`,
      nappiCode: undefined,
      medikreditTp: 1,
      amount: 0,
      lineType,
      status: "draft",
    })
  }

  // ── 6. Procedures from scribe entities → procedure lines with tariff candidates ──
  const entities = getScribeEntitiesFromBlocks(patient)
  if (entities?.procedures?.length) {
    for (const proc of entities.procedures) {
      const normKey = proc.toLowerCase().trim()
      if (seenProc.has(normKey)) continue
      seenProc.add(normKey)
      const tariffCandidates = extractTariffCandidates(proc)
      lines.push({
        id: uid("cl-proc"),
        description: proc,
        tariffCode: tariffCandidates[0],
        medikreditTp: 2,
        amount: 0,
        lineType,
        status: "draft",
      })
    }
  }

  // ── 7. Medications from scribe entities that weren't already captured ──
  if (entities?.medications?.length) {
    for (const med of entities.medications) {
      const key = med.toLowerCase().trim()
      if (seenDrug.has(key)) continue
      seenDrug.add(key)
      lines.push({
        id: uid("cl-scribe-med"),
        description: med,
        nappiCode: undefined,
        medikreditTp: 1,
        amount: 0,
        lineType,
        status: "draft",
      })
    }
  }

  if (lines.length === 0) return null

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

/** Always returns a claim suitable for MediKredit submission (fallback consultation line if needed). */
export function buildDraftClaimForSubmit(
  patient: PatientSession,
  doctorId?: string | null
): PracticeClaim {
  const existing = generateDraftClaim(patient, doctorId)
  if (existing) return existing

  const lineType = patient.medicalAidStatus === "active" ? "medical_aid" : "cash"
  const lines: ClaimLine[] = [
    {
      id: `cl-fallback-${Date.now()}`,
      description: "Consultation fee",
      tariffCode: "0190",
      medikreditTp: 2,
      amount: 450,
      lineType,
      status: "draft",
    },
  ]
  const totalAmount = 450
  const medicalAidAmount = lineType === "medical_aid" ? 450 : 0
  const cashAmount = lineType === "medical_aid" ? 0 : 450

  return {
    id: `draft-${patient.patientId}-${Date.now()}`,
    patientId: patient.patientId,
    patientName: patient.name,
    doctorId: doctorId ?? undefined,
    lines,
    totalAmount,
    medicalAidAmount,
    cashAmount,
    status: "draft",
    createdAt: new Date().toISOString(),
  }
}
