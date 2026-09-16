import type { ClaimStatus } from "@/lib/clinical-workspace/types"
import type { MediAdjudicationSnapshot, MedikreditItemStatus } from "@/lib/medikredit/types"

function itemWarnings(it: MedikreditItemStatus): MediAdjudicationSnapshot["warnings"] {
  const w = it.warnings
  if (!w?.length) return undefined
  return w.map((x) => ({ cd: x.cd, desc: x.desc }))
}

function itemToSnapshot(it: MedikreditItemStatus): MediAdjudicationSnapshot {
  return {
    schemeStatus: it.status,
    gross: it.gross,
    net: it.net,
    patientResponsibility: it.patientResponsibility,
    rejectionCode: it.rejectionCode,
    rejectionDescription: it.rejectionDescription,
    warnings: itemWarnings(it),
  }
}

/** Map MediKredit ITEM status to workspace claim-line status chips. */
export function claimLineStatusFromMedikreditItem(it: MedikreditItemStatus | undefined): ClaimStatus {
  const s = it?.status?.toUpperCase()
  if (!it || !s) return "submitted"
  if (s === "R") return "rejected"
  if (s === "A" || s === "P") return "approved"
  if (s === "W") return "partial"
  return "submitted"
}

function isMedicalAidStoredLine(o: Record<string, unknown>): boolean {
  if (o.lineType === "cash" || o.lineType === "patient_liability") return false
  if (o.lineType === "medical_aid") return true
  // Legacy MediKredit JSON rows
  if (typeof o.tp === "number" || typeof o.tp === "string") return true
  if (o.tariffCode || o.nappiCode || o.icdCodes || o.icdCode) return true
  return false
}

/** Same procedure vs medicine partitioning as {@link analyzeAndSplit} for stored JSON lines. */
function storedLineSplitCategory(o: Record<string, unknown>): "P" | "M" {
  const tp = o.medikreditTp
  if (tp === 1) return "M"
  if (tp === 2 || tp === 3) return "P"
  if (typeof o.nappiCode === "string" && o.nappiCode.trim()) return "M"
  return "P"
}

/**
 * Order of medical-aid row indices as submitted to MediKredit (procedures/modifiers batch, then medicines).
 * Must stay in sync with `assignGlobalLineNumbers` + `analyzeAndSplit` in `claim-service`.
 */
export function submissionOrderMedicalAidIndices(lines: unknown[] | undefined): number[] {
  if (!lines?.length) return []
  const categorized: { idx: number; cat: "P" | "M" }[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (typeof raw !== "object" || raw === null) continue
    const o = raw as Record<string, unknown>
    if (!isMedicalAidStoredLine(o)) continue
    categorized.push({ idx: i, cat: storedLineSplitCategory(o) })
  }
  const proc = categorized.filter((c) => c.cat === "P").map((c) => c.idx)
  const med = categorized.filter((c) => c.cat === "M").map((c) => c.idx)
  return [...proc, ...med]
}

/**
 * Overlay Medikredit ITEM outcomes onto persisted `practice_claims.lines` JSON.
 * Matches `ITEM@lin_num` after global renumbering in split submissions; falls back to batch order.
 */
export function enrichStoredClaimLines(lines: unknown[] | undefined, itemStatuses: MedikreditItemStatus[]): unknown[] {
  if (!lines?.length) return lines ?? []
  const out: unknown[] = [...lines]
  const byLinNum = new Map<string, MedikreditItemStatus>()
  for (const it of itemStatuses) {
    const k = it.lineNumber != null && String(it.lineNumber).trim() !== "" ? String(it.lineNumber).trim() : ""
    if (k) byLinNum.set(k, it)
  }
  const order = submissionOrderMedicalAidIndices(lines)
  for (let seq = 0; seq < order.length; seq++) {
    const i = order[seq]
    const linNum = String(seq + 1)
    const raw = out[i]
    if (typeof raw !== "object" || raw === null) continue
    const o = raw as Record<string, unknown>
    if (!isMedicalAidStoredLine(o)) continue
    const it = byLinNum.get(linNum) ?? itemStatuses[seq]
    if (!it) continue
    const lineStatus = claimLineStatusFromMedikreditItem(it)
    out[i] = {
      ...o,
      mediAdjudication: itemToSnapshot(it),
      status: lineStatus,
    }
  }
  return out
}
