import type { MedikreditSoapAction } from "./types"
import { escapeXmlText } from "./xml-escape"

const SOAP_ENV = "http://schemas.xmlsoap.org/soap/envelope/"
/** Declared on MediKredit integration; adjust if your certification uses a different URI. */
const S2PI_NS = "http://www.medikredit.co.za/s2pi"

function soapOperationName(action: MedikreditSoapAction): string {
  switch (action) {
    case "claim":
      return "submit-claim"
    case "eligibility":
      return "submit-eligibility"
    case "reversal":
      return "submit-reversal"
    default:
      return "submit-claim"
  }
}

/**
 * Wraps inner MediKredit DOCUMENT XML (already well-formed) inside a SOAP body.
 * Inner XML is HTML-entity–escaped inside `<request>` per integration spec.
 */
export function createSoapEnvelope(action: MedikreditSoapAction, innerDocumentXml: string): string {
  const op = soapOperationName(action)
  const escaped = escapeXmlText(innerDocumentXml)
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="${SOAP_ENV}" xmlns:s2pi="${S2PI_NS}">
  <soapenv:Body>
    <s2pi:${op}>
      <request>${escaped}</request>
    </s2pi:${op}>
  </soapenv:Body>
</soapenv:Envelope>`
}

export function soapActionHeaderValue(action: MedikreditSoapAction): string {
  return `"submit-${action}"`
}
