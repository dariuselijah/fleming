/**
 * Bootstrap SQLite DB with all seed datasets.
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { openDb, ensureBootstrapApiKey } from "../lib/db.js"
import { seedAll } from "../lib/seed.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  let schemeOptions: Array<{
    code: string
    name: string
    administrator?: string
    claimType?: string
    optionType?: string
    masCode?: string
    schemeCode?: string
    famcheck?: boolean
    authcheck?: boolean
  }> = []

  try {
    const mod = await import("../../../../lib/medikredit/doctor-option-catalog.ts")
    schemeOptions = mod.getAllDoctorOptions().map((o) => ({
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
    const seedDir = join(__dirname, "../../data/seed")
    mkdirSync(seedDir, { recursive: true })
    writeFileSync(join(seedDir, "schemes-seed.json"), JSON.stringify(schemeOptions, null, 2))
    console.log(`Exported ${schemeOptions.length} doctor options → schemes-seed.json`)
  } catch (err) {
    console.warn("Doctor option catalog unavailable; schemes seed may be empty.", (err as Error).message)
  }

  const db = openDb()
  db.exec("DELETE FROM product_prices")
  db.exec("DELETE FROM nappi_products")
  db.exec("DELETE FROM tariff_rates")
  db.exec("DELETE FROM icd10_codes")
  db.exec("DELETE FROM plan_options")
  db.exec("DELETE FROM schemes")
  db.exec("DELETE FROM ingest_batches")

  const result = seedAll(db, schemeOptions)
  const key = ensureBootstrapApiKey(db)
  console.log("Seed result:", result)
  if (key) console.log("Bootstrap API key:", key)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
