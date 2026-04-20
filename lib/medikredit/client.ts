import { getClinicalProxyBase } from "@/lib/clinical-proxy/url"
import { createSoapEnvelope, soapActionHeaderValue } from "./soap-envelope"
import type { MedikreditSoapAction } from "./types"
import { requireMedikreditEnv } from "./env"

async function sendMedikreditViaProxy(
  base: string,
  action: MedikreditSoapAction,
  innerDocumentXml: string
): Promise<string> {
  const res = await fetch(`${base}/api/medikredit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, xmlData: innerDocumentXml }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`MediKredit proxy HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`MediKredit proxy: expected JSON, got: ${text.slice(0, 200)}`)
  }
  const response =
    parsed && typeof parsed === "object" && typeof (parsed as { response?: unknown }).response === "string"
      ? (parsed as { response: string }).response
      : null
  if (response == null) {
    throw new Error(`MediKredit proxy: missing response in body: ${text.slice(0, 300)}`)
  }
  return response
}

/**
 * Sends inner MediKredit DOCUMENT XML: via CLINICAL_PROXY_URL JSON API when set,
 * else direct HTTPS + SOAP + Basic auth to MEDIKREDIT_API_URL.
 * Server-only — never expose credentials to the browser.
 */
export async function sendMedikreditSoap(action: MedikreditSoapAction, innerDocumentXml: string): Promise<string> {
  const proxyBase = getClinicalProxyBase()
  if (proxyBase) {
    return sendMedikreditViaProxy(proxyBase, action, innerDocumentXml)
  }

  const { apiUrl, username, password } = requireMedikreditEnv()
  const body = createSoapEnvelope(action, innerDocumentXml)
  const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64")

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapActionHeaderValue(action),
      Authorization: `Basic ${auth}`,
    },
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`MediKredit HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  return text
}

/** Optional dry-run: skip network — returns a minimal DOCUMENT the parsers accept. */
export async function sendMedikreditSoapMaybeDryRun(
  action: MedikreditSoapAction,
  innerDocumentXml: string
): Promise<string> {
  if (process.env.MEDIKREDIT_DRY_RUN === "1") {
    // Dispatch by inner tx_cd (outer SOAP action is often "claim" for all types).
    if (/tx_cd="11"/.test(innerDocumentXml)) {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="11" res="A" tx_nbr="DRY-REV"><MEM/><PAT/></TX></DOCUMENT>`
    }
    if (/tx_cd="30"/.test(innerDocumentXml)) {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="30" res="A" tx_nbr="DRY-FAM"><AUTHS hnet="JIFFY01" auth_nbr="DRY-AUTH" /><MEM/><PAT rel="00"/><PAT rel="01" fname="Dep"/></TX></DOCUMENT>`
    }
    if (/tx_cd="20"/.test(innerDocumentXml) || action === "eligibility") {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="20" res="A" tx_nbr="DRY-ELIG"><AUTHS hnet="JIFFY01" auth_nbr="DRY-AUTH" /><MEM/><PAT/></TX></DOCUMENT>`
    }
    if (action === "reversal") {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="11" res="A" tx_nbr="DRY-REV"><MEM/><PAT/></TX></DOCUMENT>`
    }
    // claim (tx_cd 21)
    return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="21" res="A" tx_nbr="DRY-CLAIM"><FIN gross="0" net="0"/><MEM/><PAT/></TX></DOCUMENT>`
  }
  return sendMedikreditSoap(action, innerDocumentXml)
}
