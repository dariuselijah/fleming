import { splitPersonNameParts } from "@/lib/clinical/person-name"
import { resolveEligibilityPlanOptionCode } from "./doctor-option-catalog"
import { getMedikreditDefaultOptionCode } from "./env"
import type { ClaimLineInput, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"
import { escapeXmlText } from "./xml-escape"

const DOC_VERSION = "3.53"

function attr(name: string, value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return ""
  return ` ${name}="${escapeXmlText(String(value))}"`
}

function memAttrs(patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  const { fname, sname } = splitPersonNameParts(patient.name ?? "")
  return [
    attr("mem_acc_nbr", patient.memberNumber),
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

function modElements(line: ClaimLineInput): string {
  const codes = line.modifierCodes ?? (line.modifierCode ? [line.modifierCode] : [])
  if (codes.length === 0) return ""
  return codes
    .slice(0, 5)
    .map((cd, i) => {
      const seqAttr = line.modifierSequences?.[i] != null ? attr("seq", String(line.modifierSequences[i])) : ""
      const amtAttr = line.modifierAmounts?.[i] != null ? attr("amt", line.modifierAmounts[i].toFixed(2)) : ""
      return `<MOD${attr("cd", cd)}${seqAttr}${amtAttr} />`
    })
    .join("")
}

function finLine(line: ClaimLineInput): string {
  const trmnt = `<TRMNT${attr("dt", line.treatmentDate)}${attr("tm", line.treatmentTime ?? "12:00")} />`
  const tarCd = line.tariffCode ?? line.modifierCode ?? line.modifierCodes?.[0]
  const proc =
    line.tp === 2 || line.tp === 3
      ? `<PROC${attr("tar_cd", tarCd)}>${trmnt}</PROC>`
      : ""
  const med = line.tp === 1 ? `<MED${attr("nappi", line.nappiCode)}>${trmnt}</MED>` : ""
  const diag = (line.icdCodes ?? [])
    .slice(0, 4)
    .map((c) => `<DIAG${attr("cd", c)} />`)
    .join("")
  const mods = modElements(line)
  const cdgSet = line.itemTypeIndicator ?? "01"
  const qtyAttr = line.quantity != null ? attr("qty", String(line.quantity)) : ""
  const tarInner = [proc || med, diag, mods].filter(Boolean).join("")
  return `<ITEM lin_num="${line.lineNumber}" tp="${line.tp}"${attr("cdg_set", cdgSet)}${qtyAttr}>
    <TAR>${tarInner}</TAR>
    <FIN gross="${line.grossAmount.toFixed(2)}" net="${line.grossAmount.toFixed(2)}" />
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
  const mem = `<MEM${memAttrs(patient, prov)}${attr("scheme_opt", opts?.medicalSchemeOptionCode)} />`
  const pat = `<PAT${patAttrs(patient)} />`
  const bhf = prov.bhfNumber ? `<ADD_BHF${attr("nbr", prov.bhfNumber)} />` : ""
  const items = lines.map((l) => finLine(l)).join("\n    ")
  const txNbr = `FLEM${Date.now()}${opts?.transactionIdSuffix ?? ""}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT version="${DOC_VERSION}">
  <TX tx_cd="21"${attr("dt", todayYmd())}${attr("tm", nowHm())}${attr("orig", orig)}${attr("tx_nbr", txNbr)}>
    <FIN gross="${gross.toFixed(2)}" net="${gross.toFixed(2)}" />
    ${mem}
    ${pat}
    ${bhf}
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
