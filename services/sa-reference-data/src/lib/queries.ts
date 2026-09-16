import type { Db } from "../lib/db.js"

function like(q: string): string {
  return `%${q.replace(/[%_]/g, "")}%`
}

export function searchIcd(db: Db, query: string, limit = 20) {
  const q = query.trim()
  if (q.length < 1) return []
  const codeQ = q.toUpperCase().replace(/\s+/g, "")
  return db
    .prepare(
      `SELECT code, description, category, asterisk, dagger
       FROM icd10_codes
       WHERE effective_to IS NULL
         AND (code LIKE ? OR upper(code) LIKE ? OR description LIKE ?)
       ORDER BY CASE WHEN upper(code) = ? THEN 0 WHEN upper(code) LIKE ? THEN 1 ELSE 2 END, code
       LIMIT ?`
    )
    .all(`${codeQ}%`, like(codeQ), like(q), codeQ, `${codeQ}%`, limit) as Array<{
    code: string
    description: string
    category: string | null
    asterisk: number
    dagger: number
  }>
}

export function validateIcd(db: Db, code: string) {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "")
  const row = db
    .prepare(
      `SELECT code, description, category, asterisk, dagger
       FROM icd10_codes WHERE upper(replace(code, ' ', '')) = ? AND effective_to IS NULL LIMIT 1`
    )
    .get(normalized) as
    | { code: string; description: string; category: string | null; asterisk: number; dagger: number }
    | undefined
  return row ?? null
}

export function searchSchemes(db: Db, query: string, page = 1, pageSize = 20) {
  const q = query.trim()
  const offset = Math.max(0, (page - 1) * pageSize)
  if (!q) {
    return db
      .prepare(
        `SELECT code, name, administrator AS schemeAdministratorCode
         FROM schemes WHERE effective_to IS NULL ORDER BY name LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset)
  }
  return db
    .prepare(
      `SELECT code, name, administrator AS schemeAdministratorCode
       FROM schemes
       WHERE effective_to IS NULL AND (name LIKE ? OR code LIKE ? OR ifnull(administrator,'') LIKE ?)
       ORDER BY name LIMIT ? OFFSET ?`
    )
    .all(like(q), like(q), like(q), pageSize, offset)
}

export function searchPlanOptions(db: Db, query: string, page = 1, pageSize = 20) {
  const q = query.trim()
  const offset = Math.max(0, (page - 1) * pageSize)
  if (!q) {
    return db
      .prepare(
        `SELECT option_code AS code, plan_code AS planCode, claim_type AS option, scheme_code AS schemeCode, name
         FROM plan_options WHERE effective_to IS NULL ORDER BY name LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset)
  }
  return db
    .prepare(
      `SELECT option_code AS code, plan_code AS planCode, claim_type AS option, scheme_code AS schemeCode, name
       FROM plan_options
       WHERE effective_to IS NULL AND (name LIKE ? OR option_code LIKE ? OR scheme_code LIKE ?)
       ORDER BY name LIMIT ? OFFSET ?`
    )
    .all(like(q), like(q), like(q), pageSize, offset)
}

export function planOptionsForScheme(db: Db, schemeCode: string) {
  return db
    .prepare(
      `SELECT option_code AS code, plan_code AS planCode, claim_type AS option, scheme_code AS schemeCode, name,
              famcheck, authcheck, mas_code AS masCode, administrator
       FROM plan_options
       WHERE effective_to IS NULL AND (scheme_code = ? OR option_code = ?)
       ORDER BY name`
    )
    .all(schemeCode, schemeCode)
}

export function searchMedicines(
  db: Db,
  query: string,
  page = 1,
  pageSize = 20,
  productClass?: string
) {
  const q = query.trim()
  const offset = Math.max(0, (page - 1) * pageSize)
  const pattern = like(q)
  const sql = `
    SELECT p.nappi_code AS nappiCode, p.name, p.full_description AS fullDescription, p.product_class AS productClass,
           (
             SELECT amount_cents FROM product_prices pp
             WHERE pp.nappi_code = p.nappi_code AND pp.effective_to IS NULL
             ORDER BY CASE pp.price_type WHEN 'sep' THEN 0 WHEN 'list' THEN 1 ELSE 2 END
             LIMIT 1
           ) AS priceCents
    FROM nappi_products p
    WHERE p.effective_to IS NULL
      AND (p.name LIKE ? OR p.nappi_code LIKE ? OR ifnull(p.full_description,'') LIKE ?)
      ${productClass ? "AND p.product_class = ?" : ""}
    ORDER BY p.name
    LIMIT ? OFFSET ?`
  const params = productClass
    ? [pattern, pattern, pattern, productClass, pageSize, offset]
    : [pattern, pattern, pattern, pageSize, offset]
  const rows = db.prepare(sql).all(...params) as Array<{
    nappiCode: string
    name: string
    fullDescription: string | null
    productClass: string
    priceCents: number | null
  }>
  return rows.map((r) => ({
    nappiCode: r.nappiCode,
    name: r.name,
    fullDescription: r.fullDescription ?? r.name,
    productClass: r.productClass,
    singleExitPrice: typeof r.priceCents === "number" ? r.priceCents / 100 : null,
  }))
}

export function medicineByNappi(db: Db, nappiCode: string) {
  const code = nappiCode.trim()
  const row = db
    .prepare(
      `SELECT p.nappi_code AS nappiCode, p.name, p.full_description AS fullDescription, p.product_class AS productClass,
              (
                SELECT amount_cents FROM product_prices pp
                WHERE pp.nappi_code = p.nappi_code AND pp.effective_to IS NULL
                ORDER BY CASE pp.price_type WHEN 'sep' THEN 0 WHEN 'list' THEN 1 ELSE 2 END
                LIMIT 1
              ) AS priceCents
       FROM nappi_products p
       WHERE p.effective_to IS NULL AND (p.nappi_code = ? OR p.nappi_code LIKE ?)
       LIMIT 1`
    )
    .get(code, `${code}%`) as
    | { nappiCode: string; name: string; fullDescription: string | null; productClass: string; priceCents: number | null }
    | undefined
  if (!row) return null
  return {
    nappiCode: row.nappiCode,
    name: row.name,
    fullDescription: row.fullDescription ?? row.name,
    productClass: row.productClass,
    singleExitPrice: typeof row.priceCents === "number" ? row.priceCents / 100 : null,
  }
}

export function tariffsContractsMedical(
  db: Db,
  input: { planOptionCode: string; disciplineCode: string; tariffCodes: string[]; year?: number }
) {
  const year = input.year ?? new Date().getFullYear()
  const codes = input.tariffCodes.map((c) => c.trim()).filter(Boolean)
  if (!codes.length) return []
  const placeholders = codes.map(() => "?").join(",")
  const rows = db
    .prepare(
      `SELECT tariff_code AS tariffCode, description, amount_cents AS amountCents,
              plan_option_code AS planOptionCode, discipline_code AS disciplineCode,
              network_flag AS networkFlag, year
       FROM tariff_rates
       WHERE effective_to IS NULL
         AND year = ?
         AND discipline_code = ?
         AND tariff_code IN (${placeholders})
         AND (plan_option_code = ? OR plan_option_code = 'PRIVATE' OR ? = 'PRIVATE')
       ORDER BY CASE WHEN plan_option_code = ? THEN 0 WHEN plan_option_code = 'PRIVATE' THEN 1 ELSE 2 END`
    )
    .all(year, input.disciplineCode, ...codes, input.planOptionCode, input.planOptionCode, input.planOptionCode) as Array<{
    tariffCode: string
    description: string | null
    amountCents: number
    planOptionCode: string
    disciplineCode: string
    networkFlag: string
    year: number
  }>

  // Deduplicate by tariff code preferring exact plan match
  const seen = new Set<string>()
  const out = []
  for (const row of rows) {
    if (seen.has(row.tariffCode)) continue
    seen.add(row.tariffCode)
    out.push({
      tariffCode: row.tariffCode,
      description: row.description ?? `Tariff ${row.tariffCode}`,
      unitPrice: row.amountCents / 100,
      planOptionCode: row.planOptionCode,
      disciplineCode: row.disciplineCode,
      tariffModifiers: null as null,
      networkFlag: row.networkFlag,
      year: row.year,
    })
  }
  return out
}
