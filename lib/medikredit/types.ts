/** MediKredit S2PI transaction codes (see MEDIKREDIT_INTEGRATION.md). */
export type MedikreditTxCd = "11" | "20" | "21" | "30"

export type MedikreditSoapAction = "claim" | "eligibility" | "reversal"

export interface MedikreditEnvConfig {
  apiUrl: string
  username: string
  password: string
}

/** Practice row from `medikredit_providers` merged with defaults. */
export interface MedikreditProviderSettings {
  /** Practice label on MediKredit registration (optional). */
  providerDisplayName?: string | null
  vendorId?: string | null
  bhfNumber?: string | null
  hpcNumber?: string | null
  groupPracticeNumber?: string | null
  pcNumber?: string | null
  worksNumber?: string | null
  prescriberMemAccNbr?: string | null
  /** VEND@vend_ver in XML (often `"1"`). */
  vendorVersion?: string | null
  /** PHISC discipline for modifier catalog lookup (e.g. "medical", "dental") */
  discipline?: string | null
  useTestProvider: boolean
  extraSettings: Record<string, unknown>
}

/** Patient payload for MEM/PAT — sent from authenticated client with decrypted profile fields. */
export interface MedikreditPatientPayload {
  id: string
  name: string
  idNumber?: string
  memberNumber?: string
  medicalAidScheme?: string
  /** Doctor option / plan code (6-digit) for TX@plan — required by the switch to resolve benefit option. */
  medicalAidSchemeCode?: string
  dependentCode?: string
  mainMemberName?: string
  dateOfBirth?: string
  sex?: "M" | "F" | "Other"
}

export interface MedikreditWarning {
  cd?: string
  desc?: string
  rmr_tp?: string
}

export interface MedikreditRJ {
  cd?: string
  desc?: string
}

export interface MedikreditItemStatus {
  lineNumber?: string
  status?: string
  /** A approved, R rejected, W warning, P processed */
  gross?: string
  net?: string
  rejectionCode?: string
  rejectionDescription?: string
  warnings?: MedikreditWarning[]
  /** procedure vs med inferred in parser */
  itemKind?: "procedure" | "medication" | "unknown"
}

export interface MedikreditRemittanceMessage {
  code: string
  description: string
}

export interface EligibilityResponse {
  ok: boolean
  status: "eligible" | "not_eligible" | "not_found" | "error" | "pending"
  responseCode?: string
  responseMessage?: string
  txNbr?: string
  rejectionCode?: string
  rejectionDescription?: string
  healthNetworkId?: string
  authNumber?: string
  remittanceMessages: MedikreditRemittanceMessage[]
  warnings: MedikreditWarning[]
  rawXml?: string
  /** Inner DOCUMENT XML sent to MediKredit (SOAP body `request` content / proxy `xmlData`). */
  requestInnerXml?: string
  /** Full SOAP envelope sent when using direct MEDIKREDIT_API_URL (omitted when using CLINICAL_PROXY JSON API). */
  requestSoapEnvelope?: string
  /** Full raw HTTP body returned by MediKredit or the clinical proxy (before parser unwrap). */
  responseRaw?: string
  /** Normalized from TX@res */
  res?: string
  /** First PAT/PLAN@pln_descr when the switch returns a plan description (tx_cd 20/30). */
  planDescription?: string
}

export interface FamilyDependentRow {
  dep_cd?: string
  relationshipLabel?: string
  id_nbr?: string
  /** Display name: typically fname + sname from switch */
  name?: string
  surname?: string
  firstNames?: string
  initials?: string
  /** Switch gender: 1 male, 2 female */
  gender?: string
  /** Raw YYYYMMDD from PAT@dob */
  dobYmd?: string
  /** ISO yyyy-mm-dd when dobYmd is valid */
  dateOfBirthIso?: string
  /** PLAN@pln_descr (e.g. POLMED MARINE) */
  planDescription?: string
  /** PLAN@dt_join YYYYMMDD */
  planJoinDateYmd?: string
}

export interface FamilyEligibilityResponse extends EligibilityResponse {
  dependents: FamilyDependentRow[]
  /** MEM@ch_id — principal scheme id on household */
  memberChId?: string
  /** MEM@nbr_depn — number of dependants on file */
  memberDependentCount?: string
}

export type ItemTypeIndicator = "01" | "02" | "03" | "04" | "05" | "06"

export interface ClaimLineInput {
  lineNumber: number
  /** 1 med, 2 procedure, 3 modifier */
  tp: 1 | 2 | 3
  tariffCode?: string
  nappiCode?: string
  icdCodes?: string[]
  /** ZAR cents or rand depending on scheme — we send as rand string */
  grossAmount: number
  /** ISO date */
  treatmentDate: string
  /** HH:mm */
  treatmentTime?: string
  /** @deprecated Use modifierCodes[] instead */
  modifierCode?: string
  /** Up to 5 PHISC modifier codes per line item */
  modifierCodes?: string[]
  /** Parallel array of modifier amounts (electronic claims only, informational) */
  modifierAmounts?: number[]
  /** Parallel array controlling processing order */
  modifierSequences?: number[]
  /** PHISC Table 6 item type indicator (01–06) */
  itemTypeIndicator?: ItemTypeIndicator
  /** Quantity / duration (e.g. anaesthetic minutes, treatment days) */
  quantity?: number
}

export interface ClaimSubmitInput {
  patient: MedikreditPatientPayload
  provider: MedikreditProviderSettings
  lines: ClaimLineInput[]
  /** Transaction id suffix for split batches */
  transactionIdSuffix?: string
  /** Explicit option code override (e.g. 631364 chronic retry). When omitted, auto-resolved from schemeCode + claimType via the doctor option catalog. */
  medicalSchemeOptionCode?: string
  /** Scheme/plan code from the doctor option list. Used to auto-resolve masCode, optionCode, and validation rules. */
  schemeCode?: string
  /** "acute" | "chronic" — narrows lookup for schemes with separate acute/chronic entries. */
  acuteChronic?: "acute" | "chronic"
}

export interface ClaimResponse {
  ok: boolean
  outcome: "approved" | "partially_approved" | "rejected" | "pending" | "duplicate" | "error"
  responseCode?: string
  responseMessage?: string
  txNbr?: string
  rejectionCode?: string
  rejectionDescription?: string
  denialReason?: string
  approvedAmount?: number
  patientResponsibility?: number
  healthNetworkId?: string
  itemStatuses: MedikreditItemStatus[]
  remittanceMessages: MedikreditRemittanceMessage[]
  warnings: MedikreditWarning[]
  rawXml?: string
  res?: string
  duplicateDetected?: boolean
}

export interface ParsedTX {
  res?: string | null
  tx_nbr?: string | null
  tx_cd?: string | null
  dt?: string | null
  tm?: string | null
}
