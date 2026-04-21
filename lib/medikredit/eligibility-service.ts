import { getClinicalProxyBase } from "@/lib/clinical-proxy/url"
import { buildEligibilityDocument, buildFamilyEligibilityDocument } from "./build-document"
import { sendMedikreditSoapMaybeDryRun } from "./client"
import { parseEligibilityXml, parseFamilyEligibilityXml } from "./parse-response"
import { createSoapEnvelope } from "./soap-envelope"
import type { EligibilityResponse, FamilyEligibilityResponse, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"

export async function checkEligibility(
  patient: MedikreditPatientPayload,
  provider: MedikreditProviderSettings
): Promise<EligibilityResponse> {
  const requestInnerXml = buildEligibilityDocument(patient, provider)
  // Outer SOAP must be submit-claim for many MediKredit endpoints; tx_cd="20" selects eligibility.
  const responseRaw = await sendMedikreditSoapMaybeDryRun("claim", requestInnerXml)
  const parsed = parseEligibilityXml(responseRaw)
  const out: EligibilityResponse = { ...parsed, requestInnerXml, responseRaw }
  if (!getClinicalProxyBase()) {
    out.requestSoapEnvelope = createSoapEnvelope("claim", requestInnerXml)
  }
  return out
}

export async function checkFamilyEligibility(
  mainMember: MedikreditPatientPayload,
  provider: MedikreditProviderSettings,
  dependents?: MedikreditPatientPayload[]
): Promise<FamilyEligibilityResponse> {
  const requestInnerXml = buildFamilyEligibilityDocument(mainMember, provider, dependents)
  const responseRaw = await sendMedikreditSoapMaybeDryRun("claim", requestInnerXml)
  const parsed = parseFamilyEligibilityXml(responseRaw)
  const out: FamilyEligibilityResponse = { ...parsed, requestInnerXml, responseRaw }
  if (!getClinicalProxyBase()) {
    out.requestSoapEnvelope = createSoapEnvelope("claim", requestInnerXml)
  }
  return out
}
