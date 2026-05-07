import type { ClaimLine, ClaimStatus, PracticeClaim } from "./types"

type ClaimLineJson = {
  lineNumber?: number
  tp?: number
  tariffCode?: string
  nappiCode?: string
  icdCodes?: string[]
  grossAmount?: number
  treatmentDate?: string
  treatmentTime?: string
  modifierCode?: string
}

function lineStatusFromMedikredit(
  itemStatuses: unknown,
  index: number
): ClaimStatus {
  if (!Array.isArray(itemStatuses)) return "submitted"
  const row = itemStatuses[index] as { status?: string } | undefined
  const s = row?.status?.toUpperCase()
  if (s === "A" || s === "P") return "approved"
  if (s === "R") return "rejected"
  if (s === "W") return "submitted"
  return "submitted"
}

function buildLineDescription(l: ClaimLineJson, index: number): string {
  const parts: string[] = []
  if (l.tariffCode) parts.push(`Tariff ${l.tariffCode}`)
  if (l.nappiCode) parts.push(`NAPPI ${l.nappiCode}`)
  if (l.icdCodes?.length) parts.push(`ICD ${l.icdCodes.join(", ")}`)
  if (parts.length === 0) parts.push(`Line ${index + 1}`)
  return parts.join(" · ")
}

function mapRowStatus(s: string): ClaimStatus {
  if (s === "draft") return "draft"
  if (s === "submitted") return "submitted"
  if (s === "partial") return "partial"
  if (s === "approved") return "approved"
  if (s === "rejected") return "rejected"
  if (s === "paid") return "paid"
  return "submitted"
}

/** Saved MediKredit preview drafts store full workspace `ClaimLine` rows in `lines` jsonb. */
function isWorkspaceClaimLine(raw: unknown): raw is ClaimLine {
  if (typeof raw !== "object" || raw === null) return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.description === "string" &&
    !("lineNumber" in o) &&
    typeof o.amount === "number"
  )
}

/**
 * Maps a `practice_claims` row (+ optional patient display hint) to UI `PracticeClaim`.
 */
export function mapPracticeClaimRow(
  row: Record<string, unknown>,
  patientNameHint?: string
): PracticeClaim {
  const linesRaw = row.lines
  const med = (row.medikredit_response ?? null) as Record<string, unknown> | null
  const itemStatuses = med?.itemStatuses

  const linesIn = Array.isArray(linesRaw) ? linesRaw : []

  const rowStatus = mapRowStatus(String(row.status ?? "submitted"))

  let lines: ClaimLine[]
  if (linesIn.length > 0 && isWorkspaceClaimLine(linesIn[0])) {
    lines = (linesIn as unknown as ClaimLine[]).map((l) => ({
      ...l,
      status: rowStatus === "draft" ? "draft" : l.status,
    }))
  } else {
    lines = linesIn.map((raw, idx) => {
      const l = raw as ClaimLineJson
      const amount = typeof l.grossAmount === "number" ? l.grossAmount : Number(l.grossAmount ?? 0)
      const lineStatus = lineStatusFromMedikredit(itemStatuses, idx)
      const tp = l.tp
      const lineType =
        tp === 1 ? "medical_aid" : tp === 2 ? "medical_aid" : ("cash" as const)

      return {
        id: `${String(row.id)}-L${idx + 1}`,
        description: buildLineDescription(l, idx),
        icdCode: l.icdCodes?.[0],
        tariffCode: l.tariffCode,
        nappiCode: l.nappiCode,
        amount,
        lineType,
        status: lineStatus,
      }
    })
  }

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0)
  const medicalAidAmount = lines
    .filter((l) => l.lineType === "medical_aid")
    .reduce((s, l) => s + l.amount, 0)
  const cashAmount = totalAmount - medicalAidAmount

  const pid = String(row.patient_id ?? "")
  const createdAt = String(row.created_at ?? new Date().toISOString())

  const rejectionReason =
    typeof med?.rejectionDescription === "string"
      ? med.rejectionDescription
      : typeof med?.denialReason === "string"
        ? med.denialReason
        : undefined

  const patientName =
    patientNameHint?.trim() ||
    (pid ? `Patient ${pid.slice(0, 8)}…` : "Unknown patient")

  return {
    id: String(row.id),
    patientId: pid,
    patientName,
    clinicalEncounterId: row.clinical_encounter_id
      ? String(row.clinical_encounter_id)
      : undefined,
    lines,
    totalAmount,
    medicalAidAmount,
    cashAmount,
    status: rowStatus,
    rejectionReason,
    submittedAt:
      rowStatus !== "draft" ? createdAt : undefined,
    createdAt,
    medikreditResponse: med,
  }
}
