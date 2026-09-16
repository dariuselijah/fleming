/**
 * Export Doctor Option catalog into schemes-seed.json and load into SQLite.
 * Run from repo root: npm run reference-data:ingest-schemes
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { openDb } from "../lib/db.js"
import { seedSchemesFromOptions } from "../lib/seed.js"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const seedDir = join(__dirname, "../../data/seed")

async function main() {
  // Resolve Fleming catalog via tsx/ts-node path from monorepo
  const catalogPath = join(__dirname, "../../../../lib/medikredit/doctor-option-catalog.ts")
  let getAllDoctorOptions: () => Array<{
    name: string
    administrator: string
    optionType: string
    claimType: string
    famcheck: boolean
    authcheck: boolean
    schemeCode: string
    masCode: string
    optionCode: string
  }>

  try {
    // When executed via tsx from Fleming root, this resolves the TS module
    const mod = await import("../../../../lib/medikredit/doctor-option-catalog.ts")
    getAllDoctorOptions = mod.getAllDoctorOptions
  } catch {
    try {
      const mod = require(catalogPath)
      getAllDoctorOptions = mod.getAllDoctorOptions
    } catch (err) {
      throw new Error(
        `Unable to load doctor-option-catalog. Run from Fleming with tsx. ${(err as Error).message}`
      )
    }
  }

  const options = getAllDoctorOptions().map((o) => ({
    code: o.optionCode,
    name: o.name,
    administrator: o.administrator,
    claimType: o.claimType,
    optionType: o.optionType,
    masCode: o.masCode,
    schemeCode: o.schemeCode,
    famcheck: o.famcheck,
    authcheck: o.authcheck,
  }))

  mkdirSync(seedDir, { recursive: true })
  const outPath = join(seedDir, "schemes-seed.json")
  writeFileSync(outPath, JSON.stringify(options, null, 2))
  console.log(`Wrote ${options.length} plan options to ${outPath}`)

  const db = openDb()
  // Clear existing scheme/plan rows for reload
  db.exec("DELETE FROM plan_options")
  db.exec("DELETE FROM schemes")
  const n = seedSchemesFromOptions(db, options)
  console.log(`Loaded ${n} plan options into SQLite`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
