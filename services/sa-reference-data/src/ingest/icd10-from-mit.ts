/**
 * Ingest NDoH ICD-10 MIT from CSV/JSON.
 *
 * Expected CSV columns (flexible): code, description, category?, asterisk?, dagger?
 * Official MIT layout varies; map via --code-col / --desc-col if needed.
 *
 * Usage:
 *   npx tsx src/ingest/icd10-from-mit.ts --file ./data/raw/icd10-mit.csv
 *   npx tsx src/ingest/icd10-from-mit.ts --file ./data/seed/icd10-seed.json
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
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    if (ch === "\r") continue
    cell += ch
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const file = args.file
  if (!file || !existsSync(file)) {
    console.error("Provide --file path to MIT CSV or JSON seed")
    process.exit(1)
  }

  const db = openDb()
  let rows: Array<{ code: string; description: string; category?: string; asterisk?: boolean; dagger?: boolean }> = []

  if (file.endsWith(".json")) {
    rows = JSON.parse(readFileSync(file, "utf8"))
  } else {
    const table = parseCsv(readFileSync(file, "utf8"))
    const header = table[0].map((h) => h.trim().toLowerCase())
    const codeCol = args["code-col"]
      ? header.indexOf(args["code-col"].toLowerCase())
      : header.findIndex((h) => h.includes("code") || h === "icd10" || h === "icd-10")
    const descCol = args["desc-col"]
      ? header.indexOf(args["desc-col"].toLowerCase())
      : header.findIndex((h) => h.includes("desc") || h.includes("title") || h.includes("name"))
    if (codeCol < 0 || descCol < 0) {
      console.error("Could not detect code/description columns. Pass --code-col and --desc-col")
      process.exit(1)
    }
    for (const r of table.slice(1)) {
      const code = (r[codeCol] ?? "").trim()
      const description = (r[descCol] ?? "").trim()
      if (!code || !description) continue
      rows.push({ code, description })
    }
  }

  const batchId = recordBatch(db, "icd10", "ndoh-mit", rows.length, file, "MIT ingest")
  db.exec("BEGIN")
  try {
    // Soft-close previous versions
    db.prepare(`UPDATE icd10_codes SET effective_to = date('now') WHERE effective_to IS NULL`).run()
    const insert = db.prepare(
      `INSERT INTO icd10_codes
        (id, code, description, category, valid_for_morbidity, asterisk, dagger, effective_from, effective_to, ingest_batch_id)
       VALUES (?, ?, ?, ?, 1, ?, ?, date('now'), NULL, ?)`
    )
    for (const row of rows) {
      insert.run(
        newId("icd"),
        row.code.toUpperCase().replace(/\s+/g, ""),
        row.description,
        row.category ?? null,
        row.asterisk ? 1 : 0,
        row.dagger ? 1 : 0,
        batchId
      )
    }
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
  console.log(`Ingested ${rows.length} ICD-10 codes from ${file}`)
}

main()
