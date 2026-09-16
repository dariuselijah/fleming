import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { allowAnon, authenticate, ensureBootstrapApiKey, openDb, type Db } from "./lib/db.js"
import { seedAll } from "./lib/seed.js"
import {
  medicineByNappi,
  planOptionsForScheme,
  searchIcd,
  searchMedicines,
  searchPlanOptions,
  searchSchemes,
  tariffsContractsMedical,
  validateIcd,
} from "./lib/queries.js"

const PORT = Number(process.env.SA_REFERENCE_DATA_PORT ?? 3011)

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  })
  res.end(payload)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (!chunks.length) return {}
  const text = Buffer.concat(chunks).toString("utf8")
  if (!text.trim()) return {}
  return JSON.parse(text) as Record<string, unknown>
}

function requestId(): string {
  return randomUUID()
}

function requireAuth(db: Db, req: IncomingMessage, res: ServerResponse): boolean {
  if (allowAnon()) return true
  const auth = authenticate(db, req.headers.authorization ?? null)
  if (!auth) {
    json(res, 401, { success: false, error: "Unauthorized" })
    return false
  }
  return true
}

function pathname(url: string): string {
  return new URL(url, "http://localhost").pathname
}

async function handle(db: Db, req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET"
  const path = pathname(req.url ?? "/")
  const rid = requestId()

  if (method === "GET" && path === "/health") {
    return json(res, 200, { ok: true, service: "sa-health-codes", requestId: rid })
  }

  if (!requireAuth(db, req, res)) return

  // --- Medprax-compatible routes (Fleming proxy contract) ---
  if (method === "POST" && path === "/api/medprax/medicines/search") {
    const body = await readJson(req)
    const query = String(body.query ?? "")
    const page = Number(body.page ?? 1)
    const pageSize = Math.min(100, Number(body.pageSize ?? 20))
    const items = searchMedicines(db, query, page, pageSize, "pharma")
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "POST" && path === "/api/medprax/medicines/by-nappi") {
    const body = await readJson(req)
    const item = medicineByNappi(db, String(body.nappiCode ?? ""))
    return json(res, 200, { success: true, item, items: item ? [item] : [], requestId: rid, source: "sa-health-codes" })
  }

  if (method === "POST" && path === "/api/medprax/tariffs/contracts/medical") {
    const body = await readJson(req)
    const tariffCodes = Array.isArray(body.tariffCodes)
      ? body.tariffCodes.map(String)
      : String(body.tariffCodes ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
    const items = tariffsContractsMedical(db, {
      planOptionCode: String(body.planOptionCode ?? "PRIVATE"),
      disciplineCode: String(body.disciplineCode ?? "014"),
      tariffCodes,
      year: body.year ? Number(body.year) : undefined,
    })
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "POST" && path === "/api/medprax/schemes/search") {
    const body = await readJson(req)
    const items = searchSchemes(db, String(body.query ?? ""), Number(body.page ?? 1), Number(body.pageSize ?? 20))
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "POST" && path === "/api/medprax/planoptions/search") {
    const body = await readJson(req)
    const items = searchPlanOptions(db, String(body.query ?? ""), Number(body.page ?? 1), Number(body.pageSize ?? 20))
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  const schemeMatch = path.match(/^\/api\/medprax\/schemes\/([^/]+)\/planoptions$/)
  if (method === "GET" && schemeMatch) {
    const code = decodeURIComponent(schemeMatch[1])
    const items = planOptionsForScheme(db, code)
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "POST" && path === "/api/medication-search") {
    const body = await readJson(req)
    const query = String(body.query ?? "").trim()
    if (query.length < 2) return json(res, 400, { success: false, error: "query must be at least 2 characters" })
    const items = searchMedicines(db, query, 1, 20)
    return json(res, 200, {
      success: true,
      source: "sa-health-codes",
      medications: items.map((m) => ({
        id: m.nappiCode,
        name: m.name,
        genericName: m.name,
        nappiCode: m.nappiCode,
        fullDescription: m.fullDescription,
        singleExitPrice: m.singleExitPrice,
        source: "sa-health-codes",
        dosage: "As per product details",
        form: "As per product details",
        strength: "As per product details",
        frequency: "As prescribed",
        duration: "As prescribed",
        instructions: "Verify dose and instructions clinically before prescribing.",
        category: m.productClass === "pharma" ? "Medication" : m.productClass,
      })),
    })
  }

  // --- First-class SA Health Codes routes ---
  if (method === "GET" && path === "/api/icd10/search") {
    const url = new URL(req.url ?? "/", "http://localhost")
    const q = url.searchParams.get("q") ?? ""
    const items = searchIcd(db, q, Number(url.searchParams.get("limit") ?? 20))
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "GET" && path === "/api/icd10/validate") {
    const url = new URL(req.url ?? "/", "http://localhost")
    const code = url.searchParams.get("code") ?? ""
    const item = validateIcd(db, code)
    return json(res, 200, {
      success: true,
      valid: Boolean(item),
      item,
      requestId: rid,
      source: "sa-health-codes",
    })
  }

  if (method === "POST" && path === "/api/products/search") {
    const body = await readJson(req)
    const productClass = body.productClass ? String(body.productClass) : undefined
    const items = searchMedicines(
      db,
      String(body.query ?? ""),
      Number(body.page ?? 1),
      Number(body.pageSize ?? 20),
      productClass
    )
    return json(res, 200, { success: true, items, requestId: rid, source: "sa-health-codes" })
  }

  if (method === "GET" && path === "/api/ingest/status") {
    const batches = db
      .prepare(
        `SELECT id, source, dataset, filename, notes, row_count AS rowCount, ingested_at AS ingestedAt
         FROM ingest_batches ORDER BY ingested_at DESC LIMIT 50`
      )
      .all()
    return json(res, 200, { success: true, batches, requestId: rid })
  }

  return json(res, 404, { success: false, error: `No route ${method} ${path}` })
}

function main() {
  const db = openDb()
  const counts = {
    icd: (db.prepare("SELECT COUNT(*) AS c FROM icd10_codes").get() as { c: number }).c,
    products: (db.prepare("SELECT COUNT(*) AS c FROM nappi_products").get() as { c: number }).c,
    tariffs: (db.prepare("SELECT COUNT(*) AS c FROM tariff_rates").get() as { c: number }).c,
    schemes: (db.prepare("SELECT COUNT(*) AS c FROM plan_options").get() as { c: number }).c,
  }
  if (counts.icd === 0 || counts.products === 0 || counts.tariffs === 0) {
    console.log("[sa-health-codes] seeding empty database…")
    const seeded = seedAll(db)
    console.log("[sa-health-codes] seed complete", seeded)
  }
  const bootstrap = ensureBootstrapApiKey(db)
  if (bootstrap) {
    console.log(`[sa-health-codes] bootstrap API key (dev): ${bootstrap}`)
  }

  const server = createServer((req, res) => {
    handle(db, req, res).catch((err) => {
      console.error(err)
      json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
    })
  })
  server.listen(PORT, () => {
    console.log(`[sa-health-codes] listening on http://127.0.0.1:${PORT}`)
  })
}

main()
