/**
 * Smoke-test local API against seeded DB (no server required for query layer;
 * also hits HTTP if SA_REFERENCE_DATA_URL is set).
 */
import { openDb, ensureBootstrapApiKey } from "./lib/db.js"
import { seedAll } from "./lib/seed.js"
import {
  medicineByNappi,
  searchIcd,
  searchMedicines,
  searchPlanOptions,
  searchSchemes,
  tariffsContractsMedical,
  validateIcd,
} from "./lib/queries.js"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const db = openDb()
  const icdCount = (db.prepare("SELECT COUNT(*) AS c FROM icd10_codes").get() as { c: number }).c
  if (icdCount === 0) {
    try {
      const mod = await import("../../../../lib/medikredit/doctor-option-catalog.ts")
      seedAll(
        db,
        mod.getAllDoctorOptions().map((o) => ({
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
      )
    } catch {
      seedAll(db)
    }
  }
  ensureBootstrapApiKey(db)

  const icd = searchIcd(db, "E11", 5)
  assert(icd.length > 0, "ICD search should return E11*")
  assert(validateIcd(db, "I10"), "I10 should validate")

  const meds = searchMedicines(db, "metformin", 1, 5)
  assert(meds.length > 0, "medicine search should find metformin")
  assert(medicineByNappi(db, "714512001"), "by-nappi should find 714512001")

  const tariffs = tariffsContractsMedical(db, {
    planOptionCode: "PRIVATE",
    disciplineCode: "014",
    tariffCodes: ["0190"],
  })
  assert(tariffs.length > 0, "tariff 0190 should resolve for PRIVATE")

  const schemes = searchSchemes(db, "discovery", 1, 5)
  const plans = searchPlanOptions(db, "614117", 1, 5)
  console.log(
    JSON.stringify(
      {
        ok: true,
        icd: icd.length,
        meds: meds.length,
        tariffs: tariffs.length,
        schemes: schemes.length,
        plans: plans.length,
      },
      null,
      2
    )
  )

  const base = process.env.SA_REFERENCE_DATA_URL?.replace(/\/$/, "")
  if (base) {
    const res = await fetch(`${base}/health`)
    assert(res.ok, `health check failed against ${base}`)
    const medRes = await fetch(`${base}/api/medprax/medicines/by-nappi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nappiCode: "714512001" }),
    })
    assert(medRes.ok, "HTTP by-nappi failed")
    console.log("HTTP smoke ok against", base)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
