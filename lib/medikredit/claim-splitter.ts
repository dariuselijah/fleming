import type { ClaimLineInput } from "./types"

export interface SplitClaimBatch {
  key: "P" | "M"
  lines: ClaimLineInput[]
  transactionIdSuffix: string
}

/**
 * Splits tariff procedures vs medicines into separate MediKredit transactions (P / M suffixes).
 */
export function analyzeAndSplit(lines: ClaimLineInput[]): SplitClaimBatch[] {
  const procedures = lines.filter((l) => l.tp === 2 || l.tp === 3)
  const medicines = lines.filter((l) => l.tp === 1)
  if (procedures.length > 0 && medicines.length > 0) {
    return [
      { key: "P", lines: procedures, transactionIdSuffix: "P" },
      { key: "M", lines: medicines, transactionIdSuffix: "M" },
    ]
  }
  return [{ key: "P", lines, transactionIdSuffix: "" }]
}
