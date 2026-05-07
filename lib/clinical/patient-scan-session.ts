import { createHash, randomBytes } from "node:crypto"
import { getPortalBaseUrl } from "@/lib/portal/env"
import {
  buildPatientRegistrationPrefill,
  type PatientRegistrationPrefill,
} from "@/lib/clinical/smart-import-patient"

export type PatientScanSessionStatus =
  | "created"
  | "opened"
  | "processing"
  | "submitted"
  | "cancelled"
  | "expired"
  | "error"

export type PatientScanDocumentKind = "id_document" | "medical_aid_card"

export type PatientScanDocument = {
  kind: PatientScanDocumentKind
  fileName: string
  detectedLabel: string
  fields: Record<string, string>
  warnings?: string[]
}

export type PatientScanSessionView = {
  id: string
  status: PatientScanSessionStatus
  expiresAt: string
  scanUrl?: string
  documents: PatientScanDocument[]
  extractedFields: Record<string, string>
  prefill: PatientRegistrationPrefill
  missingFields: string[]
  error?: string | null
}

export function newPatientScanTokenRaw(): string {
  return randomBytes(32).toString("base64url")
}

export function hashPatientScanToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function patientScanUrlForToken(rawToken: string): string {
  const path = `/scan/patient/${encodeURIComponent(rawToken)}`
  const base = getPortalBaseUrl()
  return base ? `${base}${path}` : path
}

export function mergePatientScanFields(documents: PatientScanDocument[]): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const doc of documents) {
    for (const [key, value] of Object.entries(doc.fields)) {
      const trimmed = value.trim()
      if (!trimmed) continue
      merged[key] = trimmed
    }
  }
  return merged
}

export function prefillFromPatientScanFields(fields: Record<string, string>): PatientRegistrationPrefill {
  return buildPatientRegistrationPrefill(fields)
}

export function missingFieldsForPatientScan(
  prefill: PatientRegistrationPrefill,
  opts: { address?: string } = {}
): string[] {
  const missing: string[] = []
  const phoneDigits = prefill.phone?.replace(/\D/g, "") ?? ""
  if (!prefill.firstName?.trim()) missing.push("First name")
  if (!prefill.lastName?.trim()) missing.push("Last name")
  if (!prefill.idNumber?.trim() && !prefill.dateOfBirth?.trim()) missing.push("SA ID or date of birth")
  if (phoneDigits.length < 9) missing.push("Phone")
  if (!prefill.email?.includes("@")) missing.push("Email")
  if (!opts.address?.trim()) missing.push("Address")
  if (prefill.hasMedicalAid || prefill.scheme || prefill.memberNumber) {
    if (!prefill.scheme?.trim()) missing.push("Medical aid")
    if (!prefill.memberNumber?.trim()) missing.push("Member number")
    if (!prefill.dependentCode?.trim()) missing.push("Dependent code")
  }
  return missing
}

export function buildPatientScanResult(documents: PatientScanDocument[]) {
  const extractedFields = mergePatientScanFields(documents)
  const prefill = prefillFromPatientScanFields(extractedFields)
  const missingFields = missingFieldsForPatientScan(prefill)
  return { extractedFields, prefill, missingFields }
}

export function normalizePatientScanSessionRow(
  row: Record<string, unknown>,
  scanUrl?: string
): PatientScanSessionView {
  return {
    id: String(row.id),
    status: String(row.status ?? "created") as PatientScanSessionStatus,
    expiresAt: String(row.expires_at),
    scanUrl,
    documents: Array.isArray(row.documents) ? (row.documents as PatientScanDocument[]) : [],
    extractedFields:
      row.extracted_fields && typeof row.extracted_fields === "object" && !Array.isArray(row.extracted_fields)
        ? (row.extracted_fields as Record<string, string>)
        : {},
    prefill:
      row.prefill && typeof row.prefill === "object" && !Array.isArray(row.prefill)
        ? (row.prefill as PatientRegistrationPrefill)
        : {},
    missingFields: Array.isArray(row.missing_fields) ? row.missing_fields.map(String) : [],
    error: typeof row.error === "string" ? row.error : null,
  }
}
