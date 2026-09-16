/**
 * Ingest scheme tariff CSV/JSON into tariff_rates.
 *
 * CSV columns (header required):
 * year,schemeCode,schemeName,planOptionCode,disciplineCode,tariffCode,description,networkFlag,amountCents,sourceFileId
 *
 * Amount may also be `amount` (rands) — converted to cents.
 *
 * Usage:
 *   npx tsx src/ingest/tariffs-from-file.ts --file ./data/raw/gems-2026.csv
 *   npx tsx src/ingest/tariffs-from-file.ts --file ./data/seed/tariffs-seed.json
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

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const cells: string[] = []
      let cur = ""
      let q = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (q) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"'
            i++
          } else if (ch === '"') q = false
          else cur += ch
          continue
        }
        if (ch === '"') {
          q = true
          continue
        }
        if (ch === ",") {
          cells.push(cur)
          cur = ""
          continue
        }
        cur += ch
      }
      cells.push(cur)
      return cells
    })
}

type Row = {
  year: number
  schemeCode?: string
  schemeName?: string
  planOptionCode: string
  disciplineCode: string
  tariffCode: string
  description?: string
  networkFlag?: string
  amountCents: number
  sourceFileId?: string
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const file = args.file
  if (!file || !existsSync(file)) {
    console.error("Provide --file path to tariff CSV or JSON")
    process.exit(1)
  }

  let rows: Row[] = []
  if (file.endsWith(".json")) {
    rows = JSON.parse(readFileSync(file, "utf8"))
  } else {
    const table = parseCsv(readFileSync(file, "utf8"))
    const header = table[0].map((h) => h.trim())
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
    for (const r of table.slice(1)) {
      const amountCentsIdx = idx("amountCents")
      const amountIdx = idx("amount")
      let amountCents = 0
      if (amountCentsIdx >= 0) amountCents = Math.round(Number(r[amountCentsIdx]))
      else if (amountIdx >= 0) amountCents = Math.round(Number(r[amountIdx]) * 100)
      rows.push({
        year: Number(r[idx("year")] || new Date().getFullYear()),
        schemeCode: r[idx("schemeCode")] || undefined,
        schemeName: r[idx("schemeName")] || undefined,
        planOptionCode: r[idx("planOptionCode")] || "PRIVATE",
        disciplineCode: r[idx("disciplineCode")] || "014",
        tariffCode: r[idx("tariffCode")],
        description: r[idx("description")] || undefined,
        networkFlag: r[idx("networkFlag")] || "any",
        amountCents,
        sourceFileId: r[idx("sourceFileId")] || file,
      })
    }
  }

  rows = rows.filter((r) => r.tariffCode && Number.isFinite(r.amountCents))
  const db = openDb()
  const batchId = recordBatch(db, "tariffs", "scheme-tariff-file", rows.length, file)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO tariff_rates
      (id, year, scheme_code, scheme_name, plan_option_code, discipline_code, tariff_code, description, network_flag, amount_cents, currency, source_file_id, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZAR', ?, '2026-01-01', NULL, ?)`
  )
  db.exec("BEGIN")
  try {
    for (const row of rows) {
      insert.run(
        newId("tariff"),
        row.year,
        row.schemeCode ?? null,
        row.schemeName ?? null,
        row.planOptionCode,
        row.disciplineCode,
        row.tariffCode,
        row.description ?? null,
        row.networkFlag ?? "any",
        row.amountCents,
        row.sourceFileId ?? null,
        batchId
      )
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  console.log(`Ingested ${rows.length} tariff rows from ${file}`)
}

main()
