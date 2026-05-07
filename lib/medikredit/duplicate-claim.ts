import type { ClaimResponse } from "./types"

export function detectDuplicateClaim(response: ClaimResponse): boolean {
  if (response.duplicateDetected) return true
  const code = response.rejectionCode ?? ""
  if (code === "349" || code === "350") return true
  const msg = `${response.rejectionDescription ?? ""} ${response.responseMessage ?? ""}`
  return /duplicate/i.test(msg)
}
