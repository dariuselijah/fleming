/**
 * Ingest NAPPI product list (+ optional SEP/list prices) from JSON or CSV.
 *
 * CSV: nappiCode,name,fullDescription,strength,packSize,manufacturer,productClass,atcCode,gmdnCode,sepCents,listCents
 *
 * Usage:
 *   npx tsx src/ingest/products-from-file.ts --file ./data/seed/products-seed.json
 */
import { readFileSync, existsSync } from "node:fs"
import { openDb, newId } from "../lib/db.js"
import { recordBatch } from "../lib/seed.js"

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i]
    }
  }
  return out
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(",").map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim())
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = cells[i] ?? ""
    })
    return row
  })
}

type Row = {
  nappiCode: string
  name: string
  fullDescription?: string
  strength?: string | null
  packSize?: string | null
  manufacturer?: string | null
  productClass?: string
  atcCode?: string
  gmdnCode?: string
  sepCents?: number
  listCents?: number
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const file = args.file
  if (!file || !existsSync(file)) {
    console.error("Provide --file path to products JSON/CSV")
    process.exit(1)
  }

  let rows: Row[] = []
  if (file.endsWith(".json")) {
    rows = JSON.parse(readFileSync(file, "utf8"))
  } else {
    rows = parseCsv(readFileSync(file, "utf8")).map((r) => ({
      nappiCode: r.nappiCode,
      name: r.name,
      fullDescription: r.fullDescription || r.name,
      strength: r.strength || null,
      packSize: r.packSize || null,
      manufacturer: r.manufacturer || null,
      productClass: r.productClass || "pharma",
      atcCode: r.atcCode || undefined,
      gmdnCode: r.gmdnCode || undefined,
      sepCents: r.sepCents ? Number(r.sepCents) : undefined,
      listCents: r.listCents ? Number(r.listCents) : undefined,
    }))
  }

  rows = rows.filter((r) => r.nappiCode && r.name)
  const db = openDb()
  const batchId = recordBatch(db, "products", "nappi-vendor-or-medikredit", rows.length, file)
  const insertProduct = db.prepare(
    `INSERT OR REPLACE INTO nappi_products
      (id, nappi_code, name, full_description, strength, pack_size, manufacturer, product_class, atc_code, gmdn_code, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), NULL, ?)`
  )
  const insertPrice = db.prepare(
    `INSERT OR REPLACE INTO product_prices
      (id, nappi_code, price_type, amount_cents, currency, vat_inclusive, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, 'ZAR', 1, date('now'), NULL, ?)`
  )

  db.exec("BEGIN")
  try {
    for (const row of rows) {
      insertProduct.run(
        newId("nappi"),
        row.nappiCode,
        row.name,
        row.fullDescription ?? row.name,
        row.strength ?? null,
        row.packSize ?? null,
        row.manufacturer ?? null,
        row.productClass ?? "pharma",
        row.atcCode ?? null,
        row.gmdnCode ?? null,
        batchId
      )
      if (typeof row.sepCents === "number") {
        insertPrice.run(newId("price"), row.nappiCode, "sep", row.sepCents, batchId)
      }
      if (typeof row.listCents === "number") {
        insertPrice.run(newId("price"), row.nappiCode, "list", row.listCents, batchId)
      }
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  console.log(`Ingested ${rows.length} products from ${file}`)
}

main()
