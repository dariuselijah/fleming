import type { ClaimResponse } from "./types"

/** Merges split P/M claim responses into one consolidated view for UI / persistence. */
export function mergeClaimResponses(responses: ClaimResponse[]): ClaimResponse {
  if (responses.length === 0) {
    return {
      ok: false,
      outcome: "error",
      itemStatuses: [],
      remittanceMessages: [],
      warnings: [],
    }
  }
  if (responses.length === 1) return responses[0]

  const itemStatuses = responses.flatMap((r) => r.itemStatuses)

  const remittanceMessages = responses.flatMap((r) => r.remittanceMessages)
  const warnings = responses.flatMap((r) => r.warnings)
  const approvedSum = responses.reduce((s, r) => s + (r.approvedAmount ?? 0), 0)

  const anyDup = responses.some((r) => r.duplicateDetected)
  const anyRejected = responses.some((r) => r.outcome === "rejected")
  const anyPartial = responses.some((r) => r.outcome === "partially_approved")
  const allOk = responses.every((r) => r.ok)

  let outcome: ClaimResponse["outcome"] = "approved"
  if (anyDup) outcome = "duplicate"
  else if (anyRejected && !responses.some((r) => r.ok)) outcome = "rejected"
  else if (anyPartial || (anyRejected && responses.some((r) => r.ok))) outcome = "partially_approved"

  return {
    ok: allOk || outcome === "partially_approved",
    outcome,
    txNbr: responses.map((r) => r.txNbr).filter(Boolean).join("+"),
    approvedAmount: approvedSum || responses[0].approvedAmount,
    itemStatuses,
    remittanceMessages,
    warnings,
    responseMessage: responses.map((r) => r.responseMessage).filter(Boolean).join(" · "),
    rawXml: responses.map((r) => r.rawXml).filter(Boolean).join("\n---\n"),
  }
}
