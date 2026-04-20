import { buildClaimDocument, buildReversalDocument } from "./build-document"
import { sendMedikreditSoapMaybeDryRun } from "./client"
import { mergeClaimResponses } from "./claim-response-merger"
import { analyzeAndSplit } from "./claim-splitter"
import { resolveOption, resolveOptionByPlanName, resolveSchemeOptionCode } from "./doctor-option-catalog"
import type { DoctorClaimType, DoctorOption } from "./doctor-option-catalog"
import { parseClaimXml } from "./parse-response"
import type { ClaimLineInput, ClaimResponse, ClaimSubmitInput, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"

const CHRONIC_OPTION = "631364"

/**
 * Resolve the medical scheme option code for the MEM@scheme_opt attribute.
 * Priority: explicit override > 5-digit schemeCode + claim type > exact plan name + claim type.
 * Plan-name resolution matches the doctor option list row (DD vs P&C can have different 6-digit codes).
 */
function resolveOptionCode(input: ClaimSubmitInput, batchClaimType?: DoctorClaimType): string | undefined {
  if (input.medicalSchemeOptionCode) return input.medicalSchemeOptionCode
  const fromPatient = input.patient.medicalAidSchemeCode?.trim()
  if (fromPatient) return fromPatient
  const ct = batchClaimType ?? (input.lines.some((l) => l.tp === 1) ? "DD" : "P&C")
  if (input.schemeCode?.trim()) {
    return resolveSchemeOptionCode(input.schemeCode.trim(), ct, input.acuteChronic) ?? undefined
  }
  return resolveOptionByPlanName(input.patient.medicalAidScheme, ct, input.acuteChronic)?.optionCode ?? undefined
}

/**
 * Resolve the full DoctorOption for a claim submission.
 * Returns null when no schemeCode is provided or the code is not in the catalog.
 */
export function resolveClaimDoctorOption(input: ClaimSubmitInput, batchClaimType?: DoctorClaimType): DoctorOption | null {
  const ct = batchClaimType ?? (input.lines.some((l) => l.tp === 1) ? "DD" : "P&C")
  if (input.schemeCode?.trim()) {
    return resolveOption(input.schemeCode.trim(), ct, input.acuteChronic)
  }
  return resolveOptionByPlanName(input.patient.medicalAidScheme, ct, input.acuteChronic)
}

/**
 * Build claim XML locally (no SOAP) — same batching as {@link submitClaim}.
 * Multiple batches are separated by XML comments for preview UIs.
 */
export function buildPreviewClaimXml(input: ClaimSubmitInput): string {
  const batches = analyzeAndSplit(input.lines)
  const parts: string[] = []
  for (const batch of batches) {
    const batchCt: DoctorClaimType = batch.key === "M" ? "DD" : "P&C"
    const xml = buildClaimDocument(input.patient, input.provider, batch.lines, {
      transactionIdSuffix: batch.transactionIdSuffix + (input.transactionIdSuffix ?? ""),
      medicalSchemeOptionCode: resolveOptionCode(input, batchCt),
    })
    parts.push(xml)
  }
  if (parts.length <= 1) return parts[0] ?? ""
  return parts.join("\n\n<!-- next MediKredit transaction batch -->\n\n")
}

export async function submitClaim(input: ClaimSubmitInput): Promise<ClaimResponse> {
  const batches = analyzeAndSplit(input.lines)
  const results: ClaimResponse[] = []

  for (const batch of batches) {
    const batchCt: DoctorClaimType = batch.key === "M" ? "DD" : "P&C"
    const optionCode = resolveOptionCode(input, batchCt)

    const xml = buildClaimDocument(input.patient, input.provider, batch.lines, {
      transactionIdSuffix: batch.transactionIdSuffix + (input.transactionIdSuffix ?? ""),
      medicalSchemeOptionCode: optionCode,
    })
    const raw = await sendMedikreditSoapMaybeDryRun("claim", xml)
    let parsed = parseClaimXml(raw)

    const chronicHint =
      parsed.rejectionDescription?.toLowerCase().includes("chronic") ||
      parsed.rejectionCode === "342" ||
      /chronic option/i.test(parsed.responseMessage ?? "")

    if (chronicHint && optionCode !== CHRONIC_OPTION) {
      const chronicCode =
        (input.schemeCode?.trim()
          ? resolveSchemeOptionCode(input.schemeCode.trim(), batchCt, "chronic")
          : resolveOptionByPlanName(input.patient.medicalAidScheme, batchCt, "chronic")?.optionCode) ??
        CHRONIC_OPTION
      const retryXml = buildClaimDocument(input.patient, input.provider, batch.lines, {
        transactionIdSuffix: `${batch.transactionIdSuffix}C`,
        medicalSchemeOptionCode: chronicCode,
      })
      const raw2 = await sendMedikreditSoapMaybeDryRun("claim", retryXml)
      parsed = parseClaimXml(raw2)
    }

    results.push(parsed)
  }

  return mergeClaimResponses(results)
}

export async function reverseClaim(opts: {
  originalTxNbr: string
  patient: MedikreditPatientPayload
  provider: MedikreditProviderSettings
}): Promise<ClaimResponse> {
  const xml = buildReversalDocument(opts.originalTxNbr, opts.patient, opts.provider)
  const raw = await sendMedikreditSoapMaybeDryRun("reversal", xml)
  return parseClaimXml(raw)
}

export function validateReversal(originalResponse: ClaimResponse): { ok: true } | { ok: false; reason: string } {
  if (originalResponse.outcome === "rejected" && !originalResponse.txNbr) {
    return { ok: false, reason: "Cannot reverse a claim that was never accepted by the switch." }
  }
  return { ok: true }
}

export function fingerprintClaimLines(patientId: string, lines: ClaimLineInput[]): string {
  const key = JSON.stringify({ patientId, lines })
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return `fp_${patientId}_${(h >>> 0).toString(16)}`
}
