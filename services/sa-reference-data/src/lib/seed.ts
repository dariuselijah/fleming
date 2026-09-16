import { newId, readJsonSeed, type Db } from "./db.js"

type IcdSeed = {
  code: string
  description: string
  category?: string
  asterisk?: boolean
  dagger?: boolean
}

type ProductSeed = {
  nappiCode: string
  name: string
  fullDescription?: string
  strength?: string | null
  packSize?: string | null
  manufacturer?: string | null
  productClass: string
  atcCode?: string
  gmdnCode?: string
  sepCents?: number
  listCents?: number
}

type TariffSeed = {
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

type SchemeOptionSeed = {
  code: string
  name: string
  administrator?: string
  claimType?: string
  optionType?: string
  masCode?: string
  schemeCode?: string
  famcheck?: boolean
  authcheck?: boolean
}

export function recordBatch(
  db: Db,
  dataset: string,
  source: string,
  rowCount: number,
  filename?: string,
  notes?: string
): string {
  const id = newId("batch")
  db.prepare(
    `INSERT INTO ingest_batches (id, source, dataset, filename, notes, row_count, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, source, dataset, filename ?? null, notes ?? null, rowCount)
  return id
}

export function seedIcd10(db: Db): number {
  const rows = readJsonSeed<IcdSeed[]>("icd10-seed.json")
  const batchId = recordBatch(db, "icd10", "ndoh-mit-seed", rows.length, "icd10-seed.json", "MVP subset pending full MIT ingest")
  const insert = db.prepare(
    `INSERT OR REPLACE INTO icd10_codes
      (id, code, description, category, valid_for_morbidity, asterisk, dagger, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, '2021-03-16', NULL, ?)`
  )
  for (const row of rows) {
    insert.run(
      newId("icd"),
      row.code.toUpperCase(),
      row.description,
      row.category ?? null,
      row.asterisk ? 1 : 0,
      row.dagger ? 1 : 0,
      batchId
    )
  }
  return rows.length
}

export function seedProducts(db: Db): number {
  const rows = readJsonSeed<ProductSeed[]>("products-seed.json")
  const batchId = recordBatch(db, "products", "nappi-sep-seed", rows.length, "products-seed.json")
  const insertProduct = db.prepare(
    `INSERT OR REPLACE INTO nappi_products
      (id, nappi_code, name, full_description, strength, pack_size, manufacturer, product_class, atc_code, gmdn_code, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-01-01', NULL, ?)`
  )
  const insertPrice = db.prepare(
    `INSERT OR REPLACE INTO product_prices
      (id, nappi_code, price_type, amount_cents, currency, vat_inclusive, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, 'ZAR', 1, '2026-01-01', NULL, ?)`
  )
  for (const row of rows) {
    insertProduct.run(
      newId("nappi"),
      row.nappiCode,
      row.name,
      row.fullDescription ?? row.name,
      row.strength ?? null,
      row.packSize ?? null,
      row.manufacturer ?? null,
      row.productClass,
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
  return rows.length
}

export function seedTariffs(db: Db): number {
  const rows = readJsonSeed<TariffSeed[]>("tariffs-seed.json")
  const batchId = recordBatch(db, "tariffs", "scheme-files-seed", rows.length, "tariffs-seed.json")
  const insert = db.prepare(
    `INSERT OR REPLACE INTO tariff_rates
      (id, year, scheme_code, scheme_name, plan_option_code, discipline_code, tariff_code, description, network_flag, amount_cents, currency, source_file_id, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZAR', ?, '2026-01-01', NULL, ?)`
  )
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
  return rows.length
}

export function seedSchemesFromOptions(db: Db, options: SchemeOptionSeed[]): number {
  const batchId = recordBatch(db, "schemes", "doctor-option-catalog", options.length, "schemes-seed.json")
  const insertScheme = db.prepare(
    `INSERT OR IGNORE INTO schemes (id, code, name, administrator, scheme_type, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, NULL, '2026-01-01', NULL, ?)`
  )
  const insertOption = db.prepare(
    `INSERT OR REPLACE INTO plan_options
      (id, scheme_code, option_code, plan_code, name, claim_type, option_type, mas_code, famcheck, authcheck, administrator, effective_from, effective_to, ingest_batch_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-01-01', NULL, ?)`
  )

  const schemes = new Map<string, { name: string; administrator?: string }>()
  for (const opt of options) {
    const schemeKey = opt.schemeCode || opt.code
    if (!schemes.has(schemeKey)) {
      const baseName = opt.name.replace(/\s+(DD|P&C|ACUTE|CHRONIC).*$/i, "").trim() || opt.name
      schemes.set(schemeKey, { name: baseName, administrator: opt.administrator })
    }
  }
  for (const [code, meta] of schemes) {
    insertScheme.run(newId("scheme"), code, meta.name, meta.administrator ?? null, batchId)
  }
  for (const opt of options) {
    insertOption.run(
      newId("plan"),
      opt.schemeCode || opt.code,
      opt.code,
      opt.schemeCode || opt.code,
      opt.name,
      opt.claimType ?? null,
      opt.optionType ?? null,
      opt.masCode ?? null,
      opt.famcheck ? 1 : 0,
      opt.authcheck ? 1 : 0,
      opt.administrator ?? null,
      batchId
    )
  }
  return options.length
}

export function seedAll(db: Db, schemeOptions: SchemeOptionSeed[] = []): {
  icd: number
  products: number
  tariffs: number
  schemes: number
} {
  db.exec("BEGIN")
  try {
    const icd = seedIcd10(db)
    const products = seedProducts(db)
    const tariffs = seedTariffs(db)
    let schemes = 0
    if (schemeOptions.length) {
      schemes = seedSchemesFromOptions(db, schemeOptions)
    } else {
      try {
        const fallback = readJsonSeed<SchemeOptionSeed[]>("schemes-seed.json")
        schemes = seedSchemesFromOptions(db, fallback)
      } catch {
        schemes = 0
      }
    }
    db.exec("COMMIT")
    return { icd, products, tariffs, schemes }
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}
