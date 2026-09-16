import type { ClaimResponse } from "./types"

function mergeResponsesMeta(responses: ClaimResponse[]): Pick<
  ClaimResponse,
  | "duplicateDetected"
  | "res"
  | "responseCode"
  | "rejectionCode"
  | "rejectionDescription"
  | "denialReason"
  | "healthNetworkId"
> {
  const anyDup = responses.some((r) => r.duplicateDetected)
  const codes = responses.map((r) => r.res).filter((x): x is string => typeof x === "string" && x.length > 0)
  let res: string | undefined
  if (codes.some((c) => c === "R")) res = "R"
  else if (codes.some((c) => c === "P")) res = "P"
  else if (codes.length > 0 && codes.every((c) => c === "A")) res = "A"
  else res = codes[0]

  const withRej = responses.filter((r) => r.rejectionCode || r.rejectionDescription)
  const primary =
    withRej.find((r) => r.outcome === "rejected" || r.res === "R") ?? withRej[0]

  const rejectionDescription =
    primary?.rejectionDescription ??
    (responses.map((r) => r.rejectionDescription).filter(Boolean).join(" · ") || undefined)
  const rejectionCode = primary?.rejectionCode ?? responses.find((r) => r.rejectionCode)?.rejectionCode

  return {
    duplicateDetected: anyDup,
    res,
    responseCode: res,
    rejectionCode,
    rejectionDescription,
    denialReason: rejectionDescription,
    healthNetworkId: responses.find((r) => r.healthNetworkId)?.healthNetworkId,
  }
}

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

  const patientResponsibilityParts = responses
    .map((r) => r.patientResponsibility)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  const patientResponsibilitySum =
    patientResponsibilityParts.length > 0
      ? Math.round(patientResponsibilityParts.reduce((a, b) => a + b, 0) * 100) / 100
      : undefined

  const meta = mergeResponsesMeta(responses)

  return {
    ok: allOk || outcome === "partially_approved",
    outcome,
    ...meta,
    txNbr: responses.map((r) => r.txNbr).filter(Boolean).join("+"),
    approvedAmount: approvedSum || responses[0].approvedAmount,
    patientResponsibility: patientResponsibilitySum,
    itemStatuses,
    remittanceMessages,
    warnings,
    responseMessage: responses.map((r) => r.responseMessage).filter(Boolean).join(" · "),
    rawXml: responses.map((r) => r.rawXml).filter(Boolean).join("\n---\n"),
  }
}
