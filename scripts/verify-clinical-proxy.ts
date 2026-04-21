/**
 * Smoke-check xai-proxy routes when CLINICAL_PROXY_URL is set.
 * Skips with exit 0 if unset (CI / local without proxy).
 *
 * Run: CLINICAL_PROXY_URL=http://localhost:3001 npm run verify:clinical-proxy
 */
function proxyBase(): string | null {
  const u = process.env.CLINICAL_PROXY_URL?.trim()
  if (!u) return null
  return u.replace(/\/$/, "")
}

async function main() {
  const base = proxyBase()
  if (!base) {
    console.log("verify-clinical-proxy: CLINICAL_PROXY_URL not set — skipping.")
    process.exit(0)
  }

  const log = (label: string, status: number) => {
    console.log(`${label}: HTTP ${status}`)
  }

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.status
  }

  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } })
    return res.status
  }

  log("POST /api/medication-suggestions", await post("/api/medication-suggestions", { diagnosis: ["E11.9"] }))
  log("POST /api/medication-search", await post("/api/medication-search", { query: "pa" }))
  log("POST /api/medprax/medicines/search", await post("/api/medprax/medicines/search", { query: "me", page: 1, pageSize: 5 }))
  log("POST /api/medprax/medicines/by-nappi", await post("/api/medprax/medicines/by-nappi", { nappiCode: "700217" }))
  log(
    "POST /api/medprax/tariffs/contracts/medical",
    await post("/api/medprax/tariffs/contracts/medical", {
      planOptionCode: "631372",
      disciplineCode: "014",
      tariffCodes: ["0190"],
    })
  )
  log("POST /api/medprax/schemes/search", await post("/api/medprax/schemes/search", { query: "disc", page: 1, pageSize: 5 }))
  log("POST /api/medprax/planoptions/search", await post("/api/medprax/planoptions/search", { query: "cla", page: 1, pageSize: 5 }))
  log("GET /api/medprax/schemes/TEST/planoptions", await get("/api/medprax/schemes/TEST/planoptions"))

  log(
    "POST /api/medikredit",
    await post("/api/medikredit", {
      action: "eligibility",
      xmlData:
        '<?xml version="1.0" encoding="UTF-8"?><DOCUMENT reply_tp="1" version="3.53"><TX tx_cd="20"/></TX></DOCUMENT>',
    })
  )

  console.log("verify-clinical-proxy: done (status codes only; 4xx may be expected if proxy rejects test payloads).")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
