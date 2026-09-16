/**
 * Smoke-check catalogue (SA Health Codes) and/or clinical proxy routes.
 *
 * Catalogue:
 *   SA_REFERENCE_DATA_URL=http://127.0.0.1:3011 npm run verify:clinical-proxy
 * MediKredit proxy:
 *   CLINICAL_PROXY_URL=http://localhost:3001 npm run verify:clinical-proxy
 */
function catalogueBase(): string | null {
  const u = process.env.SA_REFERENCE_DATA_URL?.trim() || process.env.CLINICAL_PROXY_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

function medikreditBase(): string | null {
  const u = process.env.CLINICAL_PROXY_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

async function main() {
  const catalogue = catalogueBase()
  const switchProxy = medikreditBase()

  if (!catalogue && !switchProxy) {
    console.log("verify-clinical-proxy: SA_REFERENCE_DATA_URL / CLINICAL_PROXY_URL not set — skipping.")
    process.exit(0)
  }

  const log = (label: string, status: number) => {
    console.log(`${label}: HTTP ${status}`)
  }

  const post = async (base: string, path: string, body: unknown) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const key = process.env.SA_REFERENCE_DATA_API_KEY?.trim()
    if (key) headers.Authorization = `Bearer ${key}`
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    return res.status
  }

  const get = async (base: string, path: string) => {
    const headers: Record<string, string> = { Accept: "application/json" }
    const key = process.env.SA_REFERENCE_DATA_API_KEY?.trim()
    if (key) headers.Authorization = `Bearer ${key}`
    const res = await fetch(`${base}${path}`, { headers })
    return res.status
  }

  if (catalogue) {
    console.log(`Catalogue base: ${catalogue}`)
    log("GET /health", await get(catalogue, "/health").catch(() => 0))
    log("POST /api/medication-search", await post(catalogue, "/api/medication-search", { query: "pa" }))
    log(
      "POST /api/medprax/medicines/search",
      await post(catalogue, "/api/medprax/medicines/search", { query: "me", page: 1, pageSize: 5 })
    )
    log(
      "POST /api/medprax/medicines/by-nappi",
      await post(catalogue, "/api/medprax/medicines/by-nappi", { nappiCode: "714512001" })
    )
    log(
      "POST /api/medprax/tariffs/contracts/medical",
      await post(catalogue, "/api/medprax/tariffs/contracts/medical", {
        planOptionCode: "PRIVATE",
        disciplineCode: "014",
        tariffCodes: ["0190"],
      })
    )
    log(
      "POST /api/medprax/schemes/search",
      await post(catalogue, "/api/medprax/schemes/search", { query: "disc", page: 1, pageSize: 5 })
    )
    log(
      "POST /api/medprax/planoptions/search",
      await post(catalogue, "/api/medprax/planoptions/search", { query: "614117", page: 1, pageSize: 5 })
    )
    log("GET /api/medprax/schemes/614117/planoptions", await get(catalogue, "/api/medprax/schemes/614117/planoptions"))
    log("GET /api/icd10/search?q=E11", await get(catalogue, "/api/icd10/search?q=E11"))
  }

  if (switchProxy) {
    console.log(`MediKredit proxy base: ${switchProxy}`)
    log(
      'POST /api/medikredit (tx_cd="20" via action="claim")',
      await post(switchProxy, "/api/medikredit", {
        action: "claim",
        xmlData:
          '<?xml version="1.0" encoding="UTF-8"?><DOCUMENT reply_tp="1" version="3.53"><TX tx_cd="20"/></TX></DOCUMENT>',
      })
    )
  }

  console.log("verify-clinical-proxy: done (status codes only; 4xx may be expected if proxy rejects test payloads).")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
