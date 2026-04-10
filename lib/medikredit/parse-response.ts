import { JSDOM } from "jsdom"
import type {
  ClaimResponse,
  EligibilityResponse,
  FamilyDependentRow,
  FamilyEligibilityResponse,
  MedikreditItemStatus,
  MedikreditRJ,
  MedikreditRemittanceMessage,
  MedikreditWarning,
  ParsedTX,
} from "./types"
import { unescapeXmlText } from "./xml-escape"

function firstEl(doc: Document, local: string): Element | null {
  const all = doc.getElementsByTagName(local)
  return all.length ? all[0] : null
}

function attrs(el: Element | null): Record<string, string> {
  if (!el) return {}
  const out: Record<string, string> = {}
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    out[a.name] = a.value
  }
  return out
}

/** Strip SOAP envelope and decode &lt;request&gt; if present; return inner DOCUMENT or raw. */
export function unwrapMedikreditResponse(raw: string): string {
  let t = raw.trim()
  const replyMatch = /<reply[^>]*>([\s\S]*?)<\/reply>/i.exec(t)
  if (replyMatch) t = replyMatch[1].trim()
  const reqMatch = /<request[^>]*>([\s\S]*?)<\/request>/i.exec(t)
  if (reqMatch) {
    return unescapeXmlText(reqMatch[1].trim())
  }
  const bodyMatch = /<soap[^:]*:Body[^>]*>([\s\S]*?)<\/soap[^:]*:Body>/i.exec(t)
  if (bodyMatch) t = bodyMatch[1].trim()
  return t
}

function parseRJ(el: Element | null): MedikreditRJ | undefined {
  if (!el) return undefined
  const a = attrs(el)
  if (!a.cd && !a.desc) return undefined
  return { cd: a.cd, desc: a.desc }
}

function parseWARNList(parent: Element | null): MedikreditWarning[] {
  if (!parent) return []
  const out: MedikreditWarning[] = []
  const warns = parent.getElementsByTagName("WARN")
  for (let i = 0; i < warns.length; i++) {
    const a = attrs(warns[i])
    out.push({ cd: a.cd, desc: a.desc, rmr_tp: a.rmr_tp })
  }
  return out
}

function parseRMRList(tx: Element | null): MedikreditRemittanceMessage[] {
  if (!tx) return []
  const out: MedikreditRemittanceMessage[] = []
  const rmrs = tx.getElementsByTagName("RMR")
  for (let i = 0; i < rmrs.length; i++) {
    const a = attrs(rmrs[i])
    if (a.cd || a.code) {
      out.push({
        code: a.cd ?? a.code ?? "",
        description: a.desc ?? a.description ?? "",
      })
    }
  }
  return out
}

function parseTX(el: Element | null): ParsedTX {
  if (!el) return {}
  const a = attrs(el)
  return {
    res: a.res ?? null,
    tx_nbr: a.tx_nbr ?? null,
    tx_cd: a.tx_cd ?? null,
    dt: a.dt ?? null,
    tm: a.tm ?? null,
  }
}

function parseItems(tx: Element | null): MedikreditItemStatus[] {
  if (!tx) return []
  const out: MedikreditItemStatus[] = []
  const items = tx.getElementsByTagName("ITEM")
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const a = attrs(it)
    const rj = parseRJ(it.getElementsByTagName("RJ")[0] ?? null)
    const tar = it.getElementsByTagName("TAR")[0]
    let kind: MedikreditItemStatus["itemKind"] = "unknown"
    if (tar?.getElementsByTagName("NAPPI").length || tar?.getElementsByTagName("MED").length) kind = "medication"
    else if (tar?.getElementsByTagName("PROC").length) kind = "procedure"
    const fin = it.getElementsByTagName("FIN")[0]
    const fa = attrs(fin)
    out.push({
      lineNumber: a.lin_num,
      status: a.status,
      gross: fa.gross,
      net: fa.net,
      rejectionCode: rj?.cd,
      rejectionDescription: rj?.desc,
      warnings: parseWARNList(it),
      itemKind: kind,
    })
  }
  return out
}

function parsePATList(tx: Element | null): FamilyDependentRow[] {
  if (!tx) return []
  const out: FamilyDependentRow[] = []
  const pats = tx.getElementsByTagName("PAT")
  for (let i = 0; i < pats.length; i++) {
    const a = attrs(pats[i])
    out.push({
      dep_cd: a.dep_cd,
      relationshipLabel: a.rel,
      id_nbr: a.ch_id ?? a.id_nbr,
      name: a.fname,
    })
  }
  return out
}

function parseAUTHS(tx: Element | null): { hnet?: string; auth_nbr?: string } {
  const auths = tx?.getElementsByTagName("AUTHS")[0]
  if (!auths) return {}
  const a = attrs(auths)
  return { hnet: a.hnet, auth_nbr: a.auth_nbr }
}

function parseFIN(tx: Element | null): { gross?: string; net?: string } {
  const fin = tx?.getElementsByTagName("FIN")[0]
  if (!fin) return {}
  const a = attrs(fin)
  return { gross: a.gross, net: a.net }
}

export function parseEligibilityXml(xml: string): EligibilityResponse {
  const inner = unwrapMedikreditResponse(xml)
  const dom = new JSDOM(inner, { contentType: "text/xml" })
  const doc = dom.window.document
  const tx = firstEl(doc, "TX")
  const p = parseTX(tx)
  const rj = parseRJ(firstEl(doc, "RJ"))
  const auths = parseAUTHS(tx)
  const warns = parseWARNList(tx)
  const rmrs = parseRMRList(tx)
  const res = p.res ?? ""

  let status: EligibilityResponse["status"] = "error"
  let ok = false
  if (res === "A") {
    status = "eligible"
    ok = true
  } else if (res === "R") {
    status = rj?.cd === "115" || /member unknown/i.test(rj?.desc ?? "") ? "not_found" : "not_eligible"
    ok = false
  } else if (res === "P") {
    status = "pending"
    ok = false
  }

  return {
    ok,
    status,
    res,
    responseCode: res,
    responseMessage: rj?.desc,
    txNbr: p.tx_nbr ?? undefined,
    rejectionCode: rj?.cd,
    rejectionDescription: rj?.desc,
    healthNetworkId: auths.hnet,
    authNumber: auths.auth_nbr,
    remittanceMessages: rmrs,
    warnings: warns,
    rawXml: inner,
  }
}

export function parseFamilyEligibilityXml(xml: string): FamilyEligibilityResponse {
  const base = parseEligibilityXml(xml)
  const inner = unwrapMedikreditResponse(xml)
  const dom = new JSDOM(inner, { contentType: "text/xml" })
  const tx = firstEl(dom.window.document, "TX")
  const deps = parsePATList(tx)
  return {
    ...base,
    dependents: deps,
  }
}

export function parseClaimXml(xml: string): ClaimResponse {
  const inner = unwrapMedikreditResponse(xml)
  const dom = new JSDOM(inner, { contentType: "text/xml" })
  const doc = dom.window.document
  const tx = firstEl(doc, "TX")
  const p = parseTX(tx)
  const rj = parseRJ(firstEl(doc, "RJ"))
  const warns = parseWARNList(tx)
  const rmrs = parseRMRList(tx)
  const items = parseItems(tx)
  const fin = parseFIN(tx)
  const res = p.res ?? ""

  const itemRejected = items.filter((i) => i.status === "R" || i.rejectionCode)
  const duplicate =
    rj?.cd === "349" ||
    rj?.cd === "350" ||
    /duplicate/i.test(rj?.desc ?? "") ||
    /duplicate/i.test(inner)

  let outcome: ClaimResponse["outcome"] = "error"
  if (duplicate) outcome = "duplicate"
  else if (res === "R") outcome = "rejected"
  else if (res === "P") outcome = "pending"
  else if (res === "A" || res === "") {
    if (itemRejected.length > 0 && itemRejected.length === items.length) outcome = "rejected"
    else if (itemRejected.length > 0) outcome = "partially_approved"
    else outcome = "approved"
  }

  const approvedAmount = fin.net ? parseFloat(fin.net) : undefined

  return {
    ok: outcome === "approved" || outcome === "partially_approved",
    outcome,
    res,
    responseCode: res,
    responseMessage: rj?.desc,
    txNbr: p.tx_nbr ?? undefined,
    rejectionCode: rj?.cd,
    rejectionDescription: rj?.desc,
    denialReason: rj?.desc,
    approvedAmount,
    patientResponsibility: undefined,
    itemStatuses: items,
    remittanceMessages: rmrs,
    warnings: warns,
    rawXml: inner,
    duplicateDetected: duplicate,
  }
}
