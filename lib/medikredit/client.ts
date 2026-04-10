import { createSoapEnvelope, soapActionHeaderValue } from "./soap-envelope"
import type { MedikreditSoapAction } from "./types"
import { requireMedikreditEnv } from "./env"

/**
 * Sends inner MediKredit DOCUMENT XML to the switch via HTTPS + SOAP + Basic auth.
 * Server-only — never expose credentials to the browser.
 */
export async function sendMedikreditSoap(action: MedikreditSoapAction, innerDocumentXml: string): Promise<string> {
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
    if (action === "eligibility") {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="20" res="A" tx_nbr="DRY-ELIG"><AUTHS hnet="JIFFY01" auth_nbr="DRY-AUTH" /><MEM/><PAT/></TX></DOCUMENT>`
    }
    if (action === "reversal") {
      return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="11" res="A" tx_nbr="DRY-REV"><MEM/><PAT/></TX></DOCUMENT>`
    }
    // claim: echo structure — approved with FIN
    return `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="21" res="A" tx_nbr="DRY-CLAIM"><FIN gross="0" net="0"/><MEM/><PAT/></TX></DOCUMENT>`
  }
  return sendMedikreditSoap(action, innerDocumentXml)
}
