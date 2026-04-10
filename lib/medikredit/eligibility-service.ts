import { buildEligibilityDocument, buildFamilyEligibilityDocument } from "./build-document"
import { sendMedikreditSoapMaybeDryRun } from "./client"
import { parseEligibilityXml, parseFamilyEligibilityXml } from "./parse-response"
import type { EligibilityResponse, FamilyEligibilityResponse, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"

export async function checkEligibility(
  patient: MedikreditPatientPayload,
  provider: MedikreditProviderSettings
): Promise<EligibilityResponse> {
  const xml = buildEligibilityDocument(patient, provider)
  const raw = await sendMedikreditSoapMaybeDryRun("eligibility", xml)
  return parseEligibilityXml(raw)
}

export async function checkFamilyEligibility(
  mainMember: MedikreditPatientPayload,
  provider: MedikreditProviderSettings,
  dependents?: MedikreditPatientPayload[]
): Promise<FamilyEligibilityResponse> {
  const xml = buildFamilyEligibilityDocument(mainMember, provider, dependents)
  const raw = await sendMedikreditSoapMaybeDryRun("eligibility", xml)
  return parseFamilyEligibilityXml(raw)
}
