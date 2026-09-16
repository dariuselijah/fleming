import { normalizeIcd10ForClaim } from "@/lib/medikredit/normalize-icd"
import { resolveItemTypeIndicator } from "@/lib/medikredit/modifier-engine"
import type { ClaimLineInput } from "@/lib/medikredit/types"
import type { ClaimDocumentItem, ClaimLine, IcdCodeItem } from "./types"

/** Normalize parsed claim JSON rows for MediKredit-shaped session storage. */
export function normalizeClaimDocumentItems(items: ClaimDocumentItem[]): ClaimDocumentItem[] {
  return items.map((row, i) => {
    const icd = row.icdCode ? normalizeIcd10ForClaim(row.icdCode) : undefined
    const tp: 1 | 2 | 3 = row.nappiCode?.trim() ? 1 : 2
    const partial: ClaimLineInput = {
      lineNumber: i + 1,
      tp,
      tariffCode: row.tariffCode,
      nappiCode: row.nappiCode,
      icdCodes: icd ? [icd] : undefined,
      grossAmount: row.amount ?? 0,
      quantity: row.quantity ?? 1,
      treatmentDate: row.treatmentDate ?? new Date().toISOString().slice(0, 10),
    }
    partial.itemTypeIndicator = resolveItemTypeIndicator(partial)
    return {
      ...row,
      id: row.id || `claim-line-${i + 1}`,
      icdCode: icd,
      quantity: row.quantity ?? 1,
      amount: row.amount ?? 0,
      treatmentDate: row.treatmentDate ?? new Date().toISOString().slice(0, 10),
    }
  })
}

export function claimDocumentItemsToClaimLines(
  items: ClaimDocumentItem[],
  lineType: ClaimLine["lineType"] = "medical_aid"
): ClaimLine[] {
  return normalizeClaimDocumentItems(items).map((row) => {
    const tp: 1 | 2 | 3 = row.nappiCode?.trim() ? 1 : 2
    return {
      id: row.id,
      description: row.description,
      icdCode: row.icdCode,
      tariffCode: row.tariffCode,
      nappiCode: row.nappiCode,
      medikreditTp: tp,
      quantity: row.quantity ?? 1,
      amount: row.amount ?? 0,
      lineType,
      status: "draft",
      lineSource: row.tariffCode || row.nappiCode ? "medprax" : "manual",
      treatmentDate: row.treatmentDate ?? new Date().toISOString().slice(0, 10),
    }
  })
}

export function collectIcdCodesFromSession(
  icdItems: IcdCodeItem[] | undefined,
  claimItems: ClaimDocumentItem[] | undefined
): IcdCodeItem[] {
  const byCode = new Map<string, IcdCodeItem>()
  for (const item of icdItems ?? []) {
    const code = normalizeIcd10ForClaim(item.code)
    if (!code) continue
    byCode.set(code, { ...item, code })
  }
  for (const line of claimItems ?? []) {
    const code = line.icdCode ? normalizeIcd10ForClaim(line.icdCode) : undefined
    if (!code || byCode.has(code)) continue
    byCode.set(code, {
      id: `claim-icd-${code}`,
      code,
      description: line.description.slice(0, 80),
      confidence: "Medium",
      sourceTag: "T",
    })
  }
  return [...byCode.values()]
}
