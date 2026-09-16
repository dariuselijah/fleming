import { getClinicalProxyBase } from "@/lib/clinical-proxy/url"
import type { MedikreditSoapAction } from "./types"
import { randomUUID } from "crypto"

export class MedikreditTransportError extends Error {
  code: string
  status: number

  constructor(message: string, code = "MEDIKREDIT_TRANSPORT", status = 502) {
    super(message)
    this.name = "MedikreditTransportError"
    this.code = code
    this.status = status
  }
}

/** Outbound MediKredit / proxy HTTP cap; 0 disables (not recommended). Default 120s per integration guide. */
function getMedikreditRequestTimeoutMs(): number {
  const raw = process.env.MEDIKREDIT_REQUEST_TIMEOUT_MS?.trim()
  if (raw === "0") return 0
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n > 0) return n
  return 120_000
}

async function fetchWithOptionalTimeout(url: string, init: RequestInit): Promise<Response> {
  const ms = getMedikreditRequestTimeoutMs()
  if (ms <= 0) return fetch(url, init)
  const ac = new AbortController()
  const id = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `MediKredit request timed out after ${ms}ms (${url}). Check network, IP allow-list, or increase MEDIKREDIT_REQUEST_TIMEOUT_MS.`
      )
    }
    throw err
  } finally {
    clearTimeout(id)
  }
}

async function sendMedikreditViaProxy(
  base: string,
  action: MedikreditSoapAction,
  innerDocumentXml: string
): Promise<string> {
  const url = `${base}/api/medikredit`
  const requestId = randomUUID()
  const startedAt = Date.now()
  validateProxyDocumentXml(innerDocumentXml)

  let res: Response
  try {
    res = await fetchWithOptionalTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
      body: JSON.stringify({ action, xmlData: innerDocumentXml }),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new MedikreditTransportError(
      `MediKredit proxy fetch failed (${url}): ${reason}. Is CLINICAL_PROXY_URL correct and the proxy process running?`
    )
  }
  const text = await res.text()
  if (!res.ok) {
    const parsed = parseProxyJson(text)
    const code =
      typeof parsed?.code === "string"
        ? parsed.code
        : res.status === 504
          ? "MEDIKREDIT_TIMEOUT"
          : "MEDIKREDIT_TRANSPORT"
    const error =
      typeof parsed?.error === "string" && parsed.error.trim()
        ? parsed.error.trim()
        : `MediKredit proxy HTTP ${res.status}`
    const hint =
      res.status === 502 || res.status === 503 || res.status === 504
        ? " Proxy returned gateway/timeout; check the proxy's MediKredit upstream configuration."
        : ""
    console.warn("[medikredit/proxy]", {
      requestId,
      action,
      xmlLength: innerDocumentXml.length,
      elapsedMs: Date.now() - startedAt,
      status: res.status,
      code,
    })
    throw new MedikreditTransportError(
      `MediKredit proxy HTTP ${res.status} at ${url}: ${error}${hint}`,
      code,
      res.status >= 400 && res.status < 500 ? res.status : 502
    )
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

function validateProxyDocumentXml(innerDocumentXml: string): void {
  if (/<(?:[A-Za-z_][\w.-]*:)?Envelope\b/i.test(innerDocumentXml)) {
    throw new MedikreditTransportError(
      "MediKredit proxy payload must be raw DOCUMENT XML, not a SOAP envelope.",
      "MEDIKREDIT_PROXY_PAYLOAD",
      400
    )
  }
  if (!/<DOCUMENT\b/i.test(innerDocumentXml)) {
    throw new MedikreditTransportError(
      "MediKredit proxy payload must contain a DOCUMENT element.",
      "MEDIKREDIT_PROXY_PAYLOAD",
      400
    )
  }
}

function parseProxyJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Sends inner MediKredit DOCUMENT XML via CLINICAL_PROXY_URL JSON API.
 * Server-only — never expose credentials to the browser.
 */
export async function sendMedikreditSoap(action: MedikreditSoapAction, innerDocumentXml: string): Promise<string> {
  const proxyBase = getClinicalProxyBase()
  if (proxyBase) {
    return sendMedikreditViaProxy(proxyBase, action, innerDocumentXml)
  }
  throw new MedikreditTransportError(
    "MediKredit proxy is not configured. Set CLINICAL_PROXY_URL or MEDIKREDIT_DRY_RUN=1 for local UI testing.",
    "MEDIKREDIT_CONFIG",
    503
  )
}

/** Optional dry-run: skip network — returns a minimal DOCUMENT the parsers accept. */
export async function sendMedikreditSoapMaybeDryRun(
  action: MedikreditSoapAction,
  innerDocumentXml: string
): Promise<string> {
  if (
    process.env.MEDIKREDIT_DRY_RUN === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
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
