/**
 * Network-free golden checks for claim payloads and revenue safety gates.
 */
import { buildClaimDocument } from "../lib/medikredit/build-document"
import { validateClaimPayload } from "../lib/medikredit/claim-preflight"
import { publicMedikreditResponse } from "../lib/medikredit/persist"
import { disabledPaymentProviderReason } from "../lib/billing/providers/availability"
import type {
  ClaimLineInput,
  ClaimResponse,
  MedikreditPatientPayload,
  MedikreditProviderSettings,
} from "../lib/medikredit/types"

const patient: MedikreditPatientPayload = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Amina Dlamini",
  idNumber: "9001010000088",
  memberNumber: "MEM12345",
  medicalAidScheme: "TEST OPTION",
  medicalAidSchemeCode: "631372",
  dependentCode: "01",
  mainMemberName: "Sipho Dlamini",
  dateOfBirth: "1990-01-01",
  sex: "F",
}

const provider: MedikreditProviderSettings = {
  vendorId: "VENDOR1",
  bhfNumber: "1234567",
  hpcNumber: "MP0123456",
  groupPracticeNumber: "7654321",
  pcNumber: "01",
  worksNumber: "001",
  prescriberMemAccNbr: "ACC001",
  vendorVersion: "1",
  discipline: "014",
  useTestProvider: true,
  extraSettings: {},
}

const lines: ClaimLineInput[] = [
  {
    lineNumber: 1,
    tp: 2,
    tariffCode: "0190",
    icdCodes: ["I10"],
    grossAmount: 450,
    treatmentDate: "2026-07-20",
    treatmentTime: "09:30",
  },
]

const errors = validateClaimPayload(patient, lines)
if (errors.length > 0) throw new Error(`valid claim rejected: ${errors.join(" ")}`)

const incompleteErrors = validateClaimPayload(
  { id: patient.id, name: patient.name, memberNumber: patient.memberNumber },
  [{ ...lines[0], treatmentDate: "" }]
)
for (const expected of ["dependent code", "date of birth", "sex", "treatment date"]) {
  if (!incompleteErrors.some((message) => message.toLowerCase().includes(expected))) {
    throw new Error(`missing payload error for ${expected}`)
  }
}

const xml = buildClaimDocument(patient, provider, lines, {
  medicalSchemeOptionCode: patient.medicalAidSchemeCode,
})
for (const fragment of [
  'scheme_opt="631372"',
  'dep_cd="01"',
  'dob="19900101"',
  'gend="2"',
  'st_dt="20260720"',
  'end_dt="20260720"',
  'st_tm="093000"',
]) {
  if (!xml.includes(fragment)) throw new Error(`claim XML missing ${fragment}`)
}

const parsed: ClaimResponse = {
  ok: true,
  outcome: "approved",
  txNbr: "TX1",
  itemStatuses: [],
  remittanceMessages: [],
  warnings: [],
  rawXml: "<DOCUMENT>PHI</DOCUMENT>",
}
const publicResult = publicMedikreditResponse(parsed) as Record<string, unknown>
if ("rawXml" in publicResult) throw new Error("routine response exposed raw XML")
if (publicResult.txNbr !== "TX1") throw new Error("safe response removed parsed fields")

for (const providerName of ["yoco", "payfast", "payflex"]) {
  if (!disabledPaymentProviderReason(providerName)) {
    throw new Error(`${providerName} must remain fail-closed`)
  }
}

console.log("revenue golden checks OK")
