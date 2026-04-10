import type { ClaimLineInput, MedikreditPatientPayload, MedikreditProviderSettings } from "./types"
import { escapeXmlText } from "./xml-escape"

const DOC_VERSION = "3.53"

function attr(name: string, value: string | undefined | null): string {
  if (value === undefined || value === null || value === "") return ""
  return ` ${name}="${escapeXmlText(String(value))}"`
}

function memAttrs(patient: MedikreditPatientPayload, prov: MedikreditProviderSettings): string {
  return [
    attr("mem_acc_nbr", patient.memberNumber),
    attr("id_nbr", patient.idNumber),
    attr("sname", patient.name?.split(/\s+/).slice(-1)[0]),
    attr("fname", patient.name?.split(/\s+/)[0]),
    attr("bhf_nbr", prov.bhfNumber),
    attr("hpc_nbr", prov.hpcNumber),
  ].join("")
}

function patAttrs(patient: MedikreditPatientPayload): string {
  return [attr("dep_cd", patient.dependentCode), attr("ch_id", patient.idNumber), attr("fname", patient.name?.split(/\s+/)[0])].join("")
}

/** tx_cd 20 — single-member eligibility */
export function buildEligibilityDocument(
  patient: MedikreditPatientPayload,
  prov: MedikreditProviderSettings
): string {
  const mem = `<MEM${memAttrs(patient, prov)} />`
  const pat = `<PAT${patAttrs(patient)} />`
  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT version="${DOC_VERSION}">
  <TX tx_cd="20"${attr("dt", todayYmd())}${attr("tm", nowHm())}>
    ${mem}
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
  const mem = `<MEM${memAttrs(mainMember, prov)} />`
  const patMain = `<PAT${patAttrs(mainMember)} rel="00" />`
  const extra =
    dependents?.map(
      (d, i) =>
        `<PAT${patAttrs(d)} rel="${escapeXmlText(String(i + 1))}"${attr("dep_cd", d.dependentCode)} />`
    ) ?? []
  return `<?xml version="1.0" encoding="UTF-8"?>
<DOCUMENT version="${DOC_VERSION}">
  <TX tx_cd="30"${attr("dt", todayYmd())}${attr("tm", nowHm())}>
    ${mem}
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
