import type { PracticePatient } from "@/lib/clinical-workspace/types"

/** Keys that map to practice registration / Add Patient form */
const PATIENT_REGISTRATION_KEYS = new Set([
  "Full Name",
  "Title",
  "ID Number",
  "Date of Birth",
  "Sex",
  "Phone",
  "Email",
  "Medical Aid",
  "Plan",
  "Member No.",
  "Dependent Code",
  "Main Member",
  "Patient",
])

/** Passport / narrative — shown for context, not primary demographics */
const DOCUMENT_META_KEYS = new Set([
  "Passport No.",
  "Nationality",
  "Document Expiry",
  "Pages",
  "Summary",
  "Tip",
])

const MEDICAL_AID_KEYS = new Set([
  "Medical Aid",
  "Plan",
  "Member No.",
  "Dependent Code",
  "Main Member",
])

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
}

export function partitionSmartImportFields(fields: Record<string, string>): {
  patient: Record<string, string>
  documentMeta: Record<string, string>
} {
  const patient: Record<string, string> = {}
  const documentMeta: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!v?.trim()) continue
    if (DOCUMENT_META_KEYS.has(k)) documentMeta[k] = v
    else if (PATIENT_REGISTRATION_KEYS.has(k)) patient[k] = v
    else documentMeta[k] = v
  }
  return { patient, documentMeta }
}

export function pickMedicalAidFieldsOnly(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key, v]) => MEDICAL_AID_KEYS.has(key) && v?.trim())
  )
}

export function mergeIdentityAndMedicalAidExtract(
  identity: Record<string, string> | null,
  medicalAid: Record<string, string> | null
): Record<string, string> | null {
  if (!identity && !medicalAid) return null
  if (!identity) return { ...medicalAid }
  if (!medicalAid) return { ...identity }
  return { ...identity, ...medicalAid }
}

export function normalizeSaIdDigits(raw?: string): string | undefined {
  if (!raw) return undefined
  const d = raw.replace(/\D/g, "")
  return d.length === 13 ? d : undefined
}

export function normalizePassportKey(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined
  const n = raw.replace(/\s/g, "").toUpperCase()
  return n.length >= 4 ? n : undefined
}

export function findDuplicatePatient(
  patients: PracticePatient[],
  candidate: { idNumber?: string; passportNumber?: string }
): PracticePatient | undefined {
  const id = normalizeSaIdDigits(candidate.idNumber)
  const pp = normalizePassportKey(candidate.passportNumber)
  return patients.find((p) => {
    const pid = normalizeSaIdDigits(p.idNumber)
    if (id && pid && id === pid) return true
    const ppp = normalizePassportKey(p.passportNumber)
    if (pp && ppp && pp === ppp) return true
    return false
  })
}

export function isPracticePatientProfileIncomplete(
  p: Pick<PracticePatient, "phone" | "email" | "address">
): boolean {
  const digits = p.phone?.replace(/\D/g, "") ?? ""
  const phoneOk = digits.length >= 9
  const emailOk = Boolean(p.email?.trim().includes("@"))
  return !phoneOk || !emailOk
}

export type PatientRegistrationPrefill = {
  title?: string
  firstName?: string
  lastName?: string
  idNumber?: string
  dateOfBirth?: string
  sex?: string
  phone?: string
  email?: string
  hasMedicalAid?: boolean
  scheme?: string
  memberNumber?: string
  dependentCode?: string
  mainMemberName?: string
  /** Benefit plan label from switch (PLAN@pln_descr), e.g. after eligibility / famcheck */
  medicalAidPlan?: string
  /** When known (principal / catalog) */
  medicalAidSchemeCode?: string
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
}

function parseSex(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined
  const u = raw.trim().toUpperCase()
  if (u === "M" || u === "MALE") return "M"
  if (u === "F" || u === "FEMALE") return "F"
  if (u === "OTHER" || u === "X") return "Other"
  return undefined
}

/** Parse DOB to yyyy-mm-dd for the registration form */
export function parseSmartImportDob(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const isoTry = Date.parse(s)
  if (!Number.isNaN(isoTry)) return new Date(isoTry).toISOString().slice(0, 10)
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, "0")
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (mon) return `${m[3]}-${mon}-${dd}`
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
  return undefined
}

export function buildPatientRegistrationPrefill(
  fields: Record<string, string>
): PatientRegistrationPrefill {
  const full =
    fields["Full Name"]?.trim() ||
    fields["Patient"]?.trim() ||
    fields["Main Member"]?.trim() ||
    ""
  const { firstName, lastName } = splitFullName(full)
  const idDigits = normalizeSaIdDigits(fields["ID Number"])
  let sex = parseSex(fields["Sex"])
  if (!sex && idDigits && idDigits.length >= 10) {
    const g = parseInt(idDigits[6], 10)
    if (!Number.isNaN(g)) sex = g >= 5 ? "M" : "F"
  }
  let dateOfBirth = parseSmartImportDob(fields["Date of Birth"])
  if (!dateOfBirth && idDigits) {
    dateOfBirth = dobIsoFromSaIdDigits(idDigits)
  }
  const scheme = fields["Medical Aid"]?.trim()
  const member = fields["Member No."]?.trim()
  return {
    title: fields["Title"]?.trim() || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    idNumber: idDigits || undefined,
    dateOfBirth,
    sex,
    phone: fields["Phone"]?.trim() || undefined,
    email: fields["Email"]?.trim() || undefined,
    hasMedicalAid: Boolean(scheme || member),
    scheme: scheme || undefined,
    memberNumber: member || undefined,
    dependentCode: fields["Dependent Code"]?.trim() || undefined,
    mainMemberName: fields["Main Member"]?.trim() || undefined,
  }
}

export type BuiltPatientFromSmartImport = Omit<PracticePatient, "id">

export function buildPatientFromSmartImportFields(
  fields: Record<string, string>
): BuiltPatientFromSmartImport {
  const pre = buildPatientRegistrationPrefill(fields)
  const name = [pre.title, pre.firstName, pre.lastName].filter(Boolean).join(" ").trim() || "Unknown"
  const dob = pre.dateOfBirth
  const age = dob ? calculateAgeFromIso(dob) : undefined
  const passportNumber = fields["Passport No."]?.trim() || undefined
  const nationality = fields["Nationality"]?.trim() || undefined
  const medicalAidScheme = pre.scheme
  const memberNumber = pre.memberNumber
  const hasAid = Boolean(medicalAidScheme || memberNumber)
  const draft: BuiltPatientFromSmartImport = {
    name,
    idNumber: pre.idNumber,
    dateOfBirth: dob,
    age,
    sex: (pre.sex as PracticePatient["sex"]) || undefined,
    phone: pre.phone,
    email: pre.email,
    medicalAidStatus: hasAid ? "pending" : "unknown",
    medicalAidScheme: hasAid ? medicalAidScheme : undefined,
    memberNumber: hasAid ? memberNumber : undefined,
    dependentCode: pre.dependentCode,
    mainMemberName: pre.mainMemberName,
    passportNumber,
    nationality,
    outstandingBalance: 0,
    registeredAt: new Date().toISOString().slice(0, 10),
    profileIncomplete: isPracticePatientProfileIncomplete({
      phone: pre.phone,
      email: pre.email,
      address: undefined,
    }),
  }
  return draft
}

function dobIsoFromSaIdDigits(id: string): string | undefined {
  if (id.length !== 13) return undefined
  const yy = parseInt(id.slice(0, 2), 10)
  const mm = id.slice(2, 4)
  const dd = id.slice(4, 6)
  if (Number.isNaN(yy) || !/^\d{2}$/.test(mm) || !/^\d{2}$/.test(dd)) return undefined
  const year = yy >= 0 && yy <= 29 ? 2000 + yy : 1900 + yy
  return `${year}-${mm}-${dd}`
}

function calculateAgeFromIso(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}
