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

/** MediKredit sometimes returns extra siblings or trailing text after </DOCUMENT>; JSDOM then throws "text outside of root node". */
function sliceFirstDocumentFragment(s: string): string {
  const m = /<DOCUMENT\b[^>]*>[\s\S]*?<\/DOCUMENT>/i.exec(s.trim())
  return m ? m[0] : s.trim()
}

/** BOM, duplicate XML declarations, and trailing junk break `new JSDOM(..., text/xml)`. */
function sanitizeMedikreditXmlFragment(s: string): string {
  let t = s.trim()
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  let keepFirstDecl = true
  t = t.replace(/<\?xml[^?]*\?>\s*/gi, (decl) => {
    if (keepFirstDecl) {
      keepFirstDecl = false
      return decl
    }
    return ""
  })
  return sliceFirstDocumentFragment(t)
}

/** Attribute scan for MediKredit elements (double or single quotes, spaces around `=`). */
function parseXmlAttrString(attr: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attr)) !== null) {
    const key = (m[1] ?? m[3]) as string
    const val = (m[2] ?? m[4]) as string
    if (key) out[key] = val
  }
  return out
}

function ymd8ToIso(ymd: string | undefined): string | undefined {
  if (!ymd || !/^\d{8}$/.test(ymd.trim())) return undefined
  const y = ymd.slice(0, 4)
  const m = ymd.slice(4, 6)
  const d = ymd.slice(6, 8)
  return `${y}-${m}-${d}`
}

function planAttrsFromElement(el: Element | null): { pln_descr?: string; dt_join?: string } {
  if (!el) return {}
  const a = attrs(el)
  return { pln_descr: a.pln_descr?.trim(), dt_join: a.dt_join?.trim() }
}

function firstPlanDescriptionInDocument(doc: Document): string | undefined {
  const plans = doc.getElementsByTagName("PLAN")
  if (!plans.length) return undefined
  const a = attrs(plans[0])
  return a.pln_descr?.trim() || undefined
}

/** When JSDOM cannot parse the fragment, extract TX / RJ / AUTHS by regex (same fields as DOM path). */
function parseEligibilityXmlRegex(inner: string): EligibilityResponse {
  const txM = /<TX\b([^>]*)>/i.exec(inner)
  const txA = txM ? parseXmlAttrString(txM[1]) : {}
  const p: ParsedTX = {
    res: txA.res ?? null,
    tx_nbr: txA.tx_nbr ?? null,
    tx_cd: txA.tx_cd ?? null,
    dt: txA.dt ?? null,
    tm: txA.tm ?? null,
  }
  let rj: MedikreditRJ | undefined
  const rjSelf = /<RJ\b([^/>]*)\/>/i.exec(inner)
  const rjBlock = /<RJ\b([^>]*)>([^<]*)<\/RJ>/i.exec(inner)
  if (rjSelf) {
    const a = parseXmlAttrString(rjSelf[1])
    if (a.cd || a.desc) rj = { cd: a.cd, desc: a.desc }
  } else if (rjBlock) {
    const a = parseXmlAttrString(rjBlock[1])
    if (a.cd || a.desc) rj = { cd: a.cd, desc: a.desc }
  }
  const authsM = /<AUTHS\b([^/>]*)\/>/i.exec(inner) ?? /<AUTHS\b([^>]*)>[\s\S]*?<\/AUTHS>/i.exec(inner)
  const auths = authsM ? parseXmlAttrString(authsM[1]) : {}
  const planM = /<PLAN\b[^>]*\bpln_descr="([^"]*)"/i.exec(inner)
  const planDescription = planM?.[1]?.trim() || undefined
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
    planDescription,
    remittanceMessages: [],
    warnings: [],
    rawXml: inner,
  }
}

function pushPatRow(out: FamilyDependentRow[], a: Record<string, string>, planA: Record<string, string>) {
  const fname = a.fname?.trim()
  const sname = a.sname?.trim()
  const name = [fname, sname].filter(Boolean).join(" ") || fname || sname
  const dobYmd = a.dob?.trim()
  out.push({
    dep_cd: a.dep_cd,
    relationshipLabel: a.rel,
    id_nbr: a.id_nbr ?? a.ch_id,
    name,
    surname: sname,
    firstNames: fname,
    initials: a.inits ?? a.ini,
    gender: a.gender,
    dobYmd,
    dateOfBirthIso: ymd8ToIso(dobYmd),
    planDescription: planA.pln_descr?.trim(),
    planJoinDateYmd: planA.dt_join?.trim(),
  })
}

function parsePATListRegex(inner: string): FamilyDependentRow[] {
  const out: FamilyDependentRow[] = []
  const block = /<PAT\b([^>]*)>([\s\S]*?)<\/PAT>/gi
  let m: RegExpExecArray | null
  while ((m = block.exec(inner)) !== null) {
    const a = parseXmlAttrString(m[1])
    const innerPat = m[2] ?? ""
    const planSelf = /<PLAN\b([^/>]*)\/>/i.exec(innerPat)
    const planA = planSelf ? parseXmlAttrString(planSelf[1]) : {}
    pushPatRow(out, a, planA)
  }
  if (out.length > 0) return out
  const re = /<PAT\b([^/>]*)\/>/gi
  while ((m = re.exec(inner)) !== null) {
    const a = parseXmlAttrString(m[1])
    pushPatRow(out, a, {})
  }
  return out
}

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
  /** Some proxies return the JSON envelope string as `response`; unwrap before XML path. */
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const obj = JSON.parse(t) as { response?: unknown; error?: string }
      if (typeof obj.response === "string" && obj.response.trim()) {
        t = obj.response.trim()
      }
    } catch {
      /* not JSON — continue as raw */
    }
  }
  const replyMatch = /<reply[^>]*>([\s\S]*?)<\/reply>/i.exec(t)
  if (replyMatch) {
    /** MediKredit SOAP often entity-encodes the inner DOCUMENT inside &lt;reply&gt; — must decode before XML parse. */
    t = unescapeXmlText(replyMatch[1].trim())
  }
  const reqMatch = /<request[^>]*>([\s\S]*?)<\/request>/i.exec(t)
  if (reqMatch) {
    t = unescapeXmlText(reqMatch[1].trim())
  } else if (!replyMatch) {
    const bodyMatch = /<soap[^:]*:Body[^>]*>([\s\S]*?)<\/soap[^:]*:Body>/i.exec(t)
    if (bodyMatch) t = bodyMatch[1].trim()
  }
  /** Proxy / edge paths may still return entity-encoded XML without a &lt;reply&gt; wrapper. */
  if (/&lt;\s*\?xml/i.test(t) || /&lt;\s*DOCUMENT\b/i.test(t) || /&lt;\s*TX\b/i.test(t)) {
    t = unescapeXmlText(t)
  }
  return sanitizeMedikreditXmlFragment(t)
}

function parseRJ(el: Element | null): MedikreditRJ | undefined {
  if (!el) return undefined
  const a = attrs(el)
  if (!a.cd && !a.desc) return undefined
  return { cd: a.cd, desc: a.desc }
}

/** Claim-level RJ only — skips `<RJ>` nested under `<ITEM>`. */
function parseClaimLevelRJ(tx: Element | null): MedikreditRJ | undefined {
  if (!tx) return undefined
  const rjs = tx.getElementsByTagName("RJ")
  for (let i = 0; i < rjs.length; i++) {
    const el = rjs[i]
    let p: Element | null = el.parentElement
    let underItem = false
    while (p && p !== tx) {
      if (p.tagName === "ITEM") {
        underItem = true
        break
      }
      p = p.parentElement
    }
    if (!underItem) return parseRJ(el)
  }
  return undefined
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
    const procDirect = it.getElementsByTagName("PROC")[0] ?? null
    const medDirect = it.getElementsByTagName("MED")[0] ?? null
    const procModCount = procDirect ? procDirect.getElementsByTagName("MOD").length : 0
    const tarModCount = tar ? tar.getElementsByTagName("MOD").length : 0
    let kind: MedikreditItemStatus["itemKind"] = "unknown"
    const tpAttr = (a.tp ?? "").trim()
    if (tpAttr === "3") kind = "modifier"
    else if (medDirect || tar?.getElementsByTagName("NAPPI").length || tar?.getElementsByTagName("MED").length)
      kind = "medication"
    else if (procDirect || tar?.getElementsByTagName("PROC").length) kind = "procedure"
    else if (tarModCount > 0 || procModCount > 0) kind = "modifier"
    const fin = it.getElementsByTagName("FIN")[0]
    const fa = attrs(fin)
    const hb = attrs(it.getElementsByTagName("HB")[0] ?? null)
    const net = fa.net ?? fa.nett
    const payAdvice = hb.pay_adv?.trim()
    const status = !rj && (payAdvice === "P" || payAdvice === "A") ? payAdvice : a.status
    out.push({
      lineNumber: a.lin_num ?? a.nbr,
      status,
      gross: fa.gross,
      net,
      patientResponsibility: computeLinePatientResponsibility(fa.gross, net),
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
    const pat = pats[i]
    const a = attrs(pat)
    const plan = planAttrsFromElement(pat.getElementsByTagName("PLAN")[0] ?? null)
    const fname = a.fname?.trim()
    const sname = a.sname?.trim()
    const name = [fname, sname].filter(Boolean).join(" ") || fname || sname
    const dobYmd = a.dob?.trim()
    out.push({
      dep_cd: a.dep_cd,
      relationshipLabel: a.rel,
      id_nbr: a.id_nbr ?? a.ch_id,
      name,
      surname: sname,
      firstNames: fname,
      initials: a.inits ?? a.ini,
      gender: a.gender,
      dobYmd,
      dateOfBirthIso: ymd8ToIso(dobYmd),
      planDescription: plan.pln_descr,
      planJoinDateYmd: plan.dt_join,
    })
  }
  return out
}

function parseMEMHousehold(
  doc: Document,
  tx: Element | null
): { memberChId?: string; memberDependentCount?: string } {
  const mem = tx?.getElementsByTagName("MEM")[0] ?? doc.getElementsByTagName("MEM")[0] ?? null
  if (!mem) return {}
  const a = attrs(mem)
  return { memberChId: a.ch_id, memberDependentCount: a.nbr_depn }
}

function parseAUTHS(doc: Document, tx: Element | null): { hnet?: string; auth_nbr?: string } {
  const auths =
    tx?.getElementsByTagName("AUTHS")[0] ??
    doc.getElementsByTagName("AUTHS")[0] ??
    null
  if (!auths) return {}
  const a = attrs(auths)
  return { hnet: a.hnet, auth_nbr: a.auth_nbr }
}

function parseFIN(tx: Element | null): { gross?: string; net?: string } {
  const fin = tx?.getElementsByTagName("FIN")[0]
  if (!fin) return {}
  const a = attrs(fin)
  return { gross: a.gross, net: a.net ?? a.nett }
}

/**
 * Some switches return line-oriented text inside SOAP &lt;reply&gt; instead of XML DOCUMENT
 * (e.g. scheme line + `20260413203533R023...015003Unknown Plan`). No &lt;TX res="…"&gt; to parse.
 */
function parseEligibilityPlaintext(inner: string): EligibilityResponse | null {
  const t = inner.trim()
  if (!t) return null
  /** Still-encoded XML should be parsed as DOCUMENT, not as legacy plaintext lines. */
  if (/&lt;\s*(DOCUMENT|TX)\b/i.test(t)) return null
  if (/<\s*(DOCUMENT|TX)\b/i.test(t)) return null

  const merged = t.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim()
  const unknownPlan = /unknown\s+plan/i.test(merged)
  /** YYYYMMDDHHMMSS (14 digits) + R + numeric tail + optional text, e.g. …20260413203533R023…015003Unknown Plan */
  const afterDateTimeR = merged.match(/(\d{14})R(\d+)(.*)$/i)

  let res = ""
  let message: string | undefined
  let status: EligibilityResponse["status"] = "error"

  if (unknownPlan) {
    res = "R"
    message = merged.match(/unknown\s+plan[^\n]*/i)?.[0]?.trim() ?? "Unknown Plan"
    status = "not_eligible"
  } else if (afterDateTimeR) {
    res = "R"
    const tail = (afterDateTimeR[3] ?? "").trim()
    message = tail.replace(/^\d+/, "").trim() || tail || merged
    status = "not_eligible"
  } else {
    message = merged.replace(/^[\d\s]+/g, "").trim() || merged
    status = "error"
  }

  const ok = res === "A"

  return {
    ok,
    status,
    res: res || undefined,
    responseCode: res || undefined,
    responseMessage: message,
    rejectionDescription: res === "R" ? message : undefined,
    txNbr: undefined,
    healthNetworkId: undefined,
    authNumber: undefined,
    remittanceMessages: [],
    warnings: [],
    rawXml: inner,
  }
}

export function parseEligibilityXml(xml: string): EligibilityResponse {
  const inner = unwrapMedikreditResponse(xml)
  const plaintext = parseEligibilityPlaintext(inner)
  if (plaintext) return plaintext

  try {
    const dom = new JSDOM(inner, { contentType: "text/xml" })
    const doc = dom.window.document
    const tx = firstEl(doc, "TX")
    const p = parseTX(tx)
    const rj = parseRJ(firstEl(doc, "RJ"))
    const auths = parseAUTHS(doc, tx)
    const warns = parseWARNList(tx)
    const rmrs = parseRMRList(tx)
    const res = p.res ?? ""
    const planDescription = firstPlanDescriptionInDocument(doc)

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
      planDescription,
      remittanceMessages: rmrs,
      warnings: warns,
      rawXml: inner,
    }
  } catch {
    return parseEligibilityXmlRegex(inner)
  }
}

export function parseFamilyEligibilityXml(xml: string): FamilyEligibilityResponse {
  const base = parseEligibilityXml(xml)
  const inner = unwrapMedikreditResponse(xml)
  try {
    const dom = new JSDOM(inner, { contentType: "text/xml" })
    const doc = dom.window.document
    const tx = firstEl(doc, "TX")
    const deps = parsePATList(tx)
    const mem = parseMEMHousehold(doc, tx)
    return {
      ...base,
      dependents: deps,
      ...mem,
    }
  } catch {
    const memM = /<MEM\b([^>]*)>/i.exec(inner)
    const memA = memM ? parseXmlAttrString(memM[1]) : {}
    return {
      ...base,
      dependents: parsePATListRegex(inner),
      memberChId: memA.ch_id,
      memberDependentCount: memA.nbr_depn,
    }
  }
}

function parseZarAmount(s?: string | null): number | undefined {
  if (s == null || String(s).trim() === "") return undefined
  const n = parseFloat(String(s).trim().replace(",", "."))
  return Number.isFinite(n) ? n : undefined
}

function computeLinePatientResponsibility(gross?: string | null, net?: string | null): number | undefined {
  const g = parseZarAmount(gross)
  if (g == null) return undefined
  const n = parseZarAmount(net) ?? 0
  return Math.round(Math.max(0, g - n) * 100) / 100
}

/**
 * Estimated patient owing (scheme shortfall) from ITEM FIN gross/net, else TX FIN.
 */
function computePatientResponsibilityFromClaim(
  items: MedikreditItemStatus[],
  fin: { gross?: string; net?: string }
): number | undefined {
  let sum = 0
  let counted = false
  for (const it of items) {
    const g = parseZarAmount(it.gross)
    const n = parseZarAmount(it.net)
    if (g != null) {
      const netVal = n ?? 0
      sum += Math.max(0, g - netVal)
      counted = true
    }
  }
  if (counted) {
    const rounded = Math.round(sum * 100) / 100
    return rounded > 0 ? rounded : 0
  }
  const fg = parseZarAmount(fin.gross)
  const fn = parseZarAmount(fin.net)
  if (fg != null && fn != null) {
    const v = Math.max(0, fg - fn)
    const rounded = Math.round(v * 100) / 100
    return rounded > 0 ? rounded : 0
  }
  return undefined
}

function buildClaimResponse(
  inner: string,
  p: ParsedTX,
  rj: MedikreditRJ | undefined,
  items: MedikreditItemStatus[],
  fin: { gross?: string; net?: string },
  auths: { hnet?: string; auth_nbr?: string },
  warns: MedikreditWarning[],
  rmrs: MedikreditRemittanceMessage[]
): ClaimResponse {
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
  else if (res === "A" || res === "P" || res === "") {
    if (itemRejected.length > 0 && itemRejected.length === items.length) outcome = "rejected"
    else if (itemRejected.length > 0) outcome = "partially_approved"
    else outcome = "approved"
  }

  const approvedAmount = fin.net ? parseFloat(fin.net) : undefined

  let patientResponsibility: number | undefined
  if (outcome === "approved" || outcome === "partially_approved" || outcome === "rejected") {
    patientResponsibility = computePatientResponsibilityFromClaim(items, fin)
  }

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
    patientResponsibility,
    healthNetworkId: auths.hnet,
    itemStatuses: items,
    remittanceMessages: rmrs,
    warnings: warns,
    rawXml: inner,
    duplicateDetected: duplicate,
  }
}

function sliceTxInnerDocument(inner: string): string | undefined {
  const m = /<TX\b[^>]*>([\s\S]*?)<\/TX>/i.exec(inner)
  return m ? m[1] : undefined
}

function parseClaimItemsRegex(inner: string): MedikreditItemStatus[] {
  const out: MedikreditItemStatus[] = []
  const re = /<ITEM\b([^>]*)>([\s\S]*?)<\/ITEM>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    const a = parseXmlAttrString(m[1])
    const body = m[2] ?? ""
    let rji: MedikreditRJ | undefined
    const rjSelf = /<RJ\b([^/>]*)\/>/i.exec(body)
    const rjBlock = /<RJ\b([^>]*)>([^<]*)<\/RJ>/i.exec(body)
    if (rjSelf) {
      const ra = parseXmlAttrString(rjSelf[1])
      if (ra.cd || ra.desc) rji = { cd: ra.cd, desc: ra.desc }
    } else if (rjBlock) {
      const ra = parseXmlAttrString(rjBlock[1])
      if (ra.cd || ra.desc) rji = { cd: ra.cd, desc: ra.desc }
    }
    const finM = /<FIN\b([^/>]*)\/>/i.exec(body) ?? /<FIN\b([^>]*)>/i.exec(body)
    const fa = finM ? parseXmlAttrString(finM[1]) : {}
    out.push({
      lineNumber: a.lin_num ?? a.nbr,
      status: a.status,
      gross: fa.gross,
      net: fa.net ?? fa.nett,
      patientResponsibility: computeLinePatientResponsibility(fa.gross, fa.net ?? fa.nett),
      rejectionCode: rji?.cd,
      rejectionDescription: rji?.desc,
      warnings: [],
      itemKind: "unknown",
    })
  }
  return out
}

function parseTxLevelFinRegex(txInner: string): { gross?: string; net?: string } {
  const head = txInner.split(/<ITEM\b/i)[0] ?? txInner
  const finM = /<FIN\b([^/>]*)\/>/i.exec(head) ?? /<FIN\b([^>]*)>/i.exec(head)
  if (!finM) return {}
  const a = parseXmlAttrString(finM[1])
  return { gross: a.gross, net: a.net ?? a.nett }
}

function parseAUTHSRegex(scope: string): { hnet?: string; auth_nbr?: string } {
  const authsM = /<AUTHS\b([^/>]*)\/>/i.exec(scope) ?? /<AUTHS\b([^>]*)>[\s\S]*?<\/AUTHS>/i.exec(scope)
  if (!authsM) return {}
  const a = parseXmlAttrString(authsM[1])
  return { hnet: a.hnet, auth_nbr: a.auth_nbr }
}

function parseRJFirstInScope(scope: string): MedikreditRJ | undefined {
  const rjSelf = /<RJ\b([^/>]*)\/>/i.exec(scope)
  const rjBlock = /<RJ\b([^>]*)>([^<]*)<\/RJ>/i.exec(scope)
  if (rjSelf) {
    const a = parseXmlAttrString(rjSelf[1])
    if (a.cd || a.desc) return { cd: a.cd, desc: a.desc }
  }
  if (rjBlock) {
    const a = parseXmlAttrString(rjBlock[1])
    if (a.cd || a.desc) return { cd: a.cd, desc: a.desc }
  }
  return undefined
}

function parseWarnRmrsRegex(txInner: string): {
  warns: MedikreditWarning[]
  rmrs: MedikreditRemittanceMessage[]
} {
  const warns: MedikreditWarning[] = []
  const rmrs: MedikreditRemittanceMessage[] = []
  const warnRe = /<WARN\b([^/>]*)\/>/gi
  let wm: RegExpExecArray | null
  while ((wm = warnRe.exec(txInner)) !== null) {
    const a = parseXmlAttrString(wm[1])
    warns.push({ cd: a.cd, desc: a.desc, rmr_tp: a.rmr_tp })
  }
  const rmrRe = /<RMR\b([^/>]*)\/>/gi
  while ((wm = rmrRe.exec(txInner)) !== null) {
    const a = parseXmlAttrString(wm[1])
    if (a.cd || a.code) {
      rmrs.push({
        code: a.cd ?? a.code ?? "",
        description: a.desc ?? a.description ?? "",
      })
    }
  }
  return { warns, rmrs }
}

/** When JSDOM rejects the fragment (trailing junk, multi-root, whitespace), salvage TX / ITEM / FIN via regex. */
function parseClaimXmlRegexFallback(inner: string): ClaimResponse {
  const txM = /<TX\b([^>]*)>/i.exec(inner)
  const txA = txM ? parseXmlAttrString(txM[1]) : {}
  const p: ParsedTX = {
    res: txA.res ?? null,
    tx_nbr: txA.tx_nbr ?? null,
    tx_cd: txA.tx_cd ?? null,
    dt: txA.dt ?? null,
    tm: txA.tm ?? null,
  }

  const txInner = sliceTxInnerDocument(inner) ?? inner
  const scanForRj = txInner.length >= inner.length * 0.5 ? txInner : inner
  const rj = parseRJFirstInScope(scanForRj)
  const { warns, rmrs } = parseWarnRmrsRegex(txInner)
  const items = parseClaimItemsRegex(inner)
  const fin = parseTxLevelFinRegex(txInner)
  const auths = parseAUTHSRegex(txInner)

  if (!txM && items.length === 0 && !p.res) {
    return {
      ok: false,
      outcome: "error",
      responseMessage: "Unrecognised MediKredit response (not valid claim XML)",
      itemStatuses: [],
      remittanceMessages: [],
      warnings: [],
      rawXml: inner.slice(0, 8000),
    }
  }

  return buildClaimResponse(inner, p, rj, items, fin, auths, warns, rmrs)
}

export function parseClaimXml(xml: string): ClaimResponse {
  const inner = unwrapMedikreditResponse(xml)
  if (!inner || inner.length < 4) {
    return {
      ok: false,
      outcome: "error",
      responseMessage: "Empty MediKredit response",
      itemStatuses: [],
      remittanceMessages: [],
      warnings: [],
      rawXml: inner,
    }
  }
  if (/<!DOCTYPE\s+html/i.test(inner) || /<html[\s>]/i.test(inner)) {
    return {
      ok: false,
      outcome: "error",
      responseMessage: "MediKredit path returned HTML (proxy error page or wrong URL)",
      itemStatuses: [],
      remittanceMessages: [],
      warnings: [],
      rawXml: inner.slice(0, 4000),
    }
  }

  try {
    const dom = new JSDOM(inner, { contentType: "text/xml" })
    const doc = dom.window.document
    const tx = firstEl(doc, "TX")
    const p = parseTX(tx)
    const rj = parseClaimLevelRJ(tx)
    const warns = parseWARNList(tx)
    const rmrs = parseRMRList(tx)
    const items = parseItems(tx)
    const fin = parseFIN(tx)
    const auths = parseAUTHS(doc, tx)
    return buildClaimResponse(inner, p, rj, items, fin, auths, warns, rmrs)
  } catch (e) {
    const reason = e instanceof Error ? e.message : "XML parse failed"
    const recovered = parseClaimXmlRegexFallback(inner)
    if (recovered.outcome !== "error" || recovered.itemStatuses.length > 0 || recovered.res) {
      return recovered
    }
    return {
      ok: false,
      outcome: "error",
      responseMessage: reason,
      itemStatuses: [],
      remittanceMessages: [],
      warnings: [],
      rawXml: inner.slice(0, 8000),
    }
  }
}
