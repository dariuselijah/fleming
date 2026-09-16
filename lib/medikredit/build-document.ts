import { splitPersonNameParts } from "@/lib/clinical/person-name"
import { resolveEligibilityPlanOptionCode } from "./doctor-option-catalog"
import { getMedikreditDefaultOptionCode } from "./env"
import type { ClaimLineInput, ItemTypeIndicator, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"
import { normalizeIcd10ForClaim } from "./normalize-icd"
import { escapeXmlText } from "./xml-escape"

const DOC_VERSION = "3.53"

function attr(name: string, value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return ""
  return ` ${name}="${escapeXmlText(String(value))}"`
}

function memAttrs(patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  const { fname, sname } = splitPersonNameParts(patient.name ?? "")
  const memNbr = patient.memberNumber?.trim()
  return [
    attr("ch_id", memNbr),
    attr("mem_acc_nbr", memNbr),
    attr("id_nbr", patient.idNumber),
    attr("sname", sname),
    attr("fname", fname),
    attr("bhf_nbr", prov.bhfNumber),
    attr("hpc_nbr", prov.hpcNumber),
  ].join("")
}

function patAttrs(patient: MedikreditPatientPayload): string {
  const { fname } = splitPersonNameParts(patient.name ?? "")
  return [attr("dep_cd", patient.dependentCode), attr("ch_id", patient.idNumber), attr("fname", fname)].join("")
}

/** PAT for tx_cd 21 — demographics on PAT; SA ID in id_nbr, not ch_id. */
function patClaimAttrs(patient: MedikreditPatientPayload): string {
  const { fname, sname, ini } = splitPersonNameParts(patient.name ?? "")
  const dep = patient.dependentCode?.trim() || "00"
  const dob = ymdFromIsoDob(patient.dateOfBirth)
  const gend = patient.sex === "M" ? "1" : patient.sex === "F" ? "2" : undefined
  return [
    attr("dep_cd", dep),
    attr("dob", dob),
    attr("id_nbr", patient.idNumber),
    attr("sname", sname),
    attr("fname", fname),
    attr("inits", ini),
    attr("gend", gend),
    attr("rlnship", "0"),
    attr("status", "O"),
    attr("newborn", "N"),
  ].join("")
}

function memClaimAttrs(patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  const { fname, sname, ini } = splitPersonNameParts(patient.name ?? "")
  const memNbr = patient.memberNumber?.trim()
  return [
    attr("ch_id", memNbr),
    attr("mem_acc_nbr", memNbr),
    attr("sname", sname),
    attr("inits", ini),
    attr("fname", fname),
    attr("mbr_ent", patient.name?.trim()),
    attr("bhf_nbr", prov.bhfNumber),
    attr("hpc_nbr", prov.hpcNumber),
  ].join("")
}

/**
 * tx_cd 21 — certified realtime-claim profile (see docs/medikredit-realtime-claims-replication.md).
 */
function txAttrsClaim21(
  prov: MedikreditProviderSettings,
  txNbr: string,
  claimOrig: "03" | "04",
  nbrItems: number,
  planCode: string
): string {
  const ymd = todayYmd()
  const tm = nowHmSs()
  return [
    attr("sp_bhf", prov.bhfNumber),
    attr("sp_hpc", prov.hpcNumber),
    attr("grp_prac", prov.groupPracticeNumber),
    attr("tx_nbr", txNbr),
    attr("plan", planCode),
    attr("dt_cr", ymd),
    attr("dt_os", ymd),
    attr("dt", ymd),
    attr("tm", tm),
    attr("tx_cd", "21"),
    attr("nbr_items", String(nbrItems)),
    attr("clm_orig", "E"),
    attr("msg_fmt", "13"),
    attr("orig", claimOrig),
    attr("bin", "2"),
    attr("cntry_cd", "ZA"),
    attr("sect_cd", "PR"),
    attr("pay_adv", "P"),
    attr("cl_tp", "0"),
    attr("amd_ind", "0"),
  ].join("")
}

function ymdFromIsoDob(iso?: string): string | undefined {
  if (!iso?.trim()) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  return m ? `${m[1]}${m[2]}${m[3]}` : undefined
}

/** Doctor option code on TX@plan — stored code → infer from plan label (e.g. POLMED DD → 624139) → env → test default. */
function eligibilityPlanCode(patient: MedikreditPatientPayload): string {
  const resolved = resolveEligibilityPlanOptionCode(patient)
  if (resolved) return resolved
  return getMedikreditDefaultOptionCode()?.trim() || "631372"
}

function eligibilityTxNbr(): string {
  return `ELIG${Date.now()}`
}

/** MEM for tx_cd 20/30 — membership on MEM; ch_id follows scheme id, not PAT SA ID. */
function memEligibilityAttrs(patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  const { fname, sname } = splitPersonNameParts(patient.name ?? "")
  const memNbr = patient.memberNumber?.trim()
  return [
    attr("mem_acc_nbr", memNbr),
    attr("ch_id", memNbr),
    attr("id_nbr", patient.idNumber),
    attr("fname", fname),
    attr("sname", sname),
    attr("bhf_nbr", prov.bhfNumber),
    attr("hpc_nbr", prov.hpcNumber),
  ].join("")
}

/** PAT for tx_cd 20/30 — dep_cd + demographics; do not put SA ID in ch_id (principal uses dep_cd only). */
function patEligibilityAttrs(patient: MedikreditPatientPayload): string {
  const { fname, sname, ini } = splitPersonNameParts(patient.name ?? "")
  const dep = patient.dependentCode?.trim() || "00"
  const dob = ymdFromIsoDob(patient.dateOfBirth)
  const gend = patient.sex === "M" || patient.sex === "F" ? patient.sex : undefined
  return [
    attr("dep_cd", dep),
    attr("fname", fname),
    attr("ini", ini),
    attr("sname", sname),
    attr("dob", dob),
    attr("gend", gend),
  ].join("")
}

/**
 * VEND inside TX before MEM — required for switch (RJ 2420 without vend_id).
 * Attribute `wks_nbr` (not wrks_nbr). `hb_id` matches this transaction’s `tx_nbr`.
 */
function vendEligibilityBlock(prov: MedikreditProviderSettings, txNbr: string): string {
  const vendId = prov.vendorId?.trim()
  if (!vendId) return ""
  const wks = prov.worksNumber?.trim() || "001"
  const pc = prov.pcNumber?.trim() || "01"
  const vver = prov.vendorVersion?.trim() || "1"
  return `<VEND${attr("wks_nbr", wks)}${attr("vend_id", vendId)}${attr("vend_ver", vver)}${attr("pc_nbr", pc)}${attr("hb_id", txNbr)} />`
}

/**
 * tx_cd 20/30 — aligned with certified eligibility template (plan + message profile).
 * `plan` is always set (medicalAidSchemeCode → catalog by medicalAidScheme label → MEDIKREDIT_DEFAULT_OPTION_CODE → 631372).
 */
function txAttrsEligibility(
  txCd: "20" | "30",
  patient: MedikreditPatientPayload,
  prov: MedikreditProviderSettings,
  txNbr: string
): string {
  const ymd = todayYmd()
  const plan = eligibilityPlanCode(patient)
  return [
    attr("dt_cr", ymd),
    attr("dt_os", ymd),
    attr("cl_tp", "0"),
    attr("orig", "04"),
    attr("bin", "2"),
    attr("sect_cd", "PR"),
    attr("sp_hpc", prov.hpcNumber),
    attr("clm_orig", "P"),
    attr("msg_fmt", "13"),
    attr("pay_adv", "P"),
    attr("grp_prac", prov.groupPracticeNumber),
    attr("sp_bhf", prov.bhfNumber),
    attr("tx_nbr", txNbr),
    attr("plan", plan),
    attr("amd_ind", "0"),
    attr("cntry_cd", "ZA"),
    attr("tx_cd", txCd),
  ].join("")
}

/** tx_cd 20 — single-member eligibility (full DOCUMENT 3.53 shape: reply_tp, TX, VEND, MEM, PAT). */
export function buildEligibilityDocument(
  patient: MedikreditPatientPayload,
  prov: MedikreditProviderSettings
): string {
  const txNbr = eligibilityTxNbr()
  const mem = `<MEM${memEligibilityAttrs(patient, prov)} />`
  const pat = `<PAT${patEligibilityAttrs(patient)} />`
  const vend = vendEligibilityBlock(prov, txNbr)
  const txA = txAttrsEligibility("20", patient, prov, txNbr)
  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT reply_tp="1" version="${DOC_VERSION}">
  <TX${txA}>
    ${vend ? `${vend}\n    ` : ""}${mem}
    ${pat}
  </TX>
</DOCUMENT>`
}

/** tx_cd 30 — family / dependants */
export function buildFamilyEligibilityDocument(
  mainMember: MedikreditPatientPayload,
  prov: MedikreditProviderSettings,
  dependents?: MedikreditPatientPayload[]
): string {
  const txNbr = eligibilityTxNbr()
  const mem = `<MEM${memEligibilityAttrs(mainMember, prov)} />`
  const patMain = `<PAT${patEligibilityAttrs(mainMember)} rel="00" />`
  const extra =
    dependents?.map(
      (d, i) =>
        `<PAT${patEligibilityAttrs(d)} rel="${escapeXmlText(String(i + 1))}" />`
    ) ?? []
  const vend = vendEligibilityBlock(prov, txNbr)
  const txA = txAttrsEligibility("30", mainMember, prov, txNbr)
  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT reply_tp="1" version="${DOC_VERSION}">
  <TX${txA}>
    ${vend ? `${vend}\n    ` : ""}${mem}
    ${patMain}
    ${extra.join("\n    ")}
  </TX>
</DOCUMENT>`
}

function treatmentYmd(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (m) return `${m[1]}${m[2]}${m[3]}`
  const digits = iso.replace(/\D/g, "")
  return digits.length >= 8 ? digits.slice(0, 8) : todayYmd()
}

function treatmentHms(time?: string): string {
  if (!time?.trim()) return "120000"
  const t = time.replace(/:/g, "").trim()
  if (/^\d{6}$/.test(t)) return t
  if (/^\d{4}$/.test(t)) return `${t}00`
  return "120000"
}

function trmntBlock(line: ClaimLineInput): string {
  const ymd = treatmentYmd(line.treatmentDate)
  const tm = treatmentHms(line.treatmentTime)
  return `<TRMNT${attr("st_dt", ymd)}${attr("st_tm", tm)}${attr("end_dt", ymd)}${attr("end_tm", tm)}/>`
}

function lineCdgSet(line: ClaimLineInput): ItemTypeIndicator | "02" | "03" {
  if (line.itemTypeIndicator) return line.itemTypeIndicator
  if (line.tp === 1) return "03"
  return "02"
}

function modifierBlocksInsideProc(line: ClaimLineInput): string {
  const codes = line.modifierCodes ?? (line.modifierCode ? [line.modifierCode] : [])
  if (codes.length === 0) return ""
  const qty = (line.quantity ?? 1).toFixed(2)
  return codes
    .slice(0, 5)
    .map((modCode) => `<MOD${attr("mod", modCode)}${attr("qty", qty)} units="1" unit_tp="06"/>`)
    .join("")
}

/** Certified tx_cd 21 ITEM shape — no request-side TAR wrapper (switch rejects with RJ 5337). */
function claimItemBlock(line: ClaimLineInput, prov: MedikreditProviderSettings): string {
  const gross = line.grossAmount.toFixed(2)
  const qty = (line.quantity ?? 1).toFixed(2)
  const cdgSet = lineCdgSet(line)
  const diagCodes = (line.icdCodes ?? [])
    .map((c) => normalizeIcd10ForClaim(c))
    .filter((c): c is string => Boolean(c))
    .slice(0, 4)
  const diags = diagCodes.map((c) => `<DIAG stg_ind="01"${attr("cd", c)}/>`).join("\n    ")
  const addBhf = `<ADD_BHF tp_ind="1"${attr("bhf_nbr", prov.bhfNumber)}${attr("hpc_nbr", prov.hpcNumber)}/>`
  const lineFin = `<FIN tar_ind="03"${attr("price", gross)} bs_of_cst="3"${attr("gross", gross)}/>`

  let procOrMed = ""
  if (line.tp === 1) {
    procOrMed = `<MED${attr("nappi_cd", line.nappiCode)}${attr("qty", qty)} basis_of_eds="3" mix_cd="0" subst_ind=" "/>`
  } else if (line.tp === 3) {
    const modCode = line.modifierCode ?? line.modifierCodes?.[0]
    const modInner =
      modifierBlocksInsideProc(line) ||
      (modCode ? `<MOD${attr("mod", modCode)}${attr("qty", qty)} units="1" unit_tp="06"/>` : "")
    procOrMed = `<PROC>${modInner}${trmntBlock(line)}</PROC>`
  } else {
    const mods = modifierBlocksInsideProc(line)
    procOrMed = `<PROC${attr("tar_cd", line.tariffCode)}${attr("qty", qty)}${attr("units", qty)} unit_tp="06">${mods}${trmntBlock(line)}</PROC>`
  }

  return `<ITEM lin_num="${line.lineNumber}" pay_adv="P" tp="${line.tp}"${attr("cdg_set", cdgSet)} process_tp="01">
    ${procOrMed}
    ${diags}
    ${addBhf}
    ${lineFin}
  </ITEM>`
}

/** tx_cd 21 — real-time claim */
export function buildClaimDocument(
  patient: MedikreditPatientPayload,
  prov: MedikreditProviderSettings,
  lines: ClaimLineInput[],
  opts?: { transactionIdSuffix?: string; medicalSchemeOptionCode?: string; orig?: "03" | "04" }
): string {
  const hasMed = lines.some((l) => l.tp === 1)
  const orig = opts?.orig ?? (hasMed ? "03" : "04")
  const gross = lines.reduce((s, l) => s + l.grossAmount, 0)
  const planCode =
    opts?.medicalSchemeOptionCode?.trim() || eligibilityPlanCode(patient)
  const mem = `<MEM${memClaimAttrs(patient, prov)}${attr("scheme_opt", opts?.medicalSchemeOptionCode)} />`
  const pat = `<PAT${patClaimAttrs(patient)} />`
  /** Scheme prescribing location — required for medication episodes per accreditation pack. */
  const bhfPrescr =
    hasMed && prov.bhfNumber?.trim() ? `<BHF${attr("prescr", prov.bhfNumber.trim())} />` : ""
  const doctor =
    hasMed && prov.prescriberMemAccNbr?.trim()
      ? `<DOCTOR${attr("mem_acc_nbr", prov.prescriberMemAccNbr.trim())}${attr("plcsv_cd", "11")}${attr("disp_cd", "01")} />`
      : ""
  const items = lines.map((l) => claimItemBlock(l, prov)).join("\n    ")
  const txNbr = `FLEM${Date.now()}${opts?.transactionIdSuffix ?? ""}`
  const vend = vendEligibilityBlock(prov, txNbr)
  const txOpen = `<TX${txAttrsClaim21(prov, txNbr, orig, lines.length, planCode)}>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT reply_tp="1" version="${DOC_VERSION}">
  ${txOpen}
    ${vend ? `${vend}\n    ` : ""}${mem}
    ${pat}
    ${bhfPrescr}
    ${doctor}
    <FIN gross="${gross.toFixed(2)}" />
    ${items}
  </TX>
</DOCUMENT>`
}

/** tx_cd 11 — reversal (no ITEM) */
export function buildReversalDocument(originalTxNbr: string, patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  const mem = `<MEM${memAttrs(patient, prov)} />`
  const pat = `<PAT${patAttrs(patient)} />`
  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT version="${DOC_VERSION}">
  <TX tx_cd="11"${attr("dt", todayYmd())}${attr("tm", nowHm())}${attr("tx_nbr", originalTxNbr)}>
    ${mem}
    ${pat}
  </TX>
</DOCUMENT>`
}

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}

function nowHm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
}

function nowHmSs(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`
}
