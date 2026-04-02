/**
 * OpenFDA Drug Label Search
 *
 * Queries the openFDA drug label endpoint for structured prescribing information
 * including indications, dosage, contraindications, warnings, and adverse reactions.
 *
 * @see https://open.fda.gov/apis/drug/label/
 */

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json"
const TIMEOUT_MS = 6_000

export interface DrugLabelResult {
  brandName: string
  genericName: string
  manufacturer: string
  indications: string
  dosage: string
  contraindications: string
  warnings: string
  adverseReactions: string
  drugInteractions: string
  boxedWarning: string | null
  route: string
  substance: string
  setId: string
}

function truncate(text: string | undefined, max = 800): string {
  if (!text) return ""
  return text.length > max ? text.slice(0, max) + "…" : text
}

function extractFirst(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return ""
  return arr[0]
}

export async function searchDrugLabels(
  query: string,
  limit = 5
): Promise<DrugLabelResult[]> {
  const escaped = query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ").trim()
  if (!escaped) return []

  const params = new URLSearchParams({
    search: `(openfda.brand_name:"${escaped}"+openfda.generic_name:"${escaped}"+openfda.substance_name:"${escaped}")`,
    limit: String(Math.min(limit, 10)),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${OPENFDA_BASE}?${params}`, {
      signal: controller.signal,
    })
    if (!res.ok) return []
    const data = (await res.json()) as any
    const results = data?.results ?? []

    return results.map((r: any) => ({
      brandName: r.openfda?.brand_name?.[0] ?? "",
      genericName: r.openfda?.generic_name?.[0] ?? "",
      manufacturer: r.openfda?.manufacturer_name?.[0] ?? "",
      indications: truncate(extractFirst(r.indications_and_usage)),
      dosage: truncate(extractFirst(r.dosage_and_administration)),
      contraindications: truncate(extractFirst(r.contraindications)),
      warnings: truncate(extractFirst(r.warnings_and_cautions ?? r.warnings)),
      adverseReactions: truncate(extractFirst(r.adverse_reactions)),
      drugInteractions: truncate(extractFirst(r.drug_interactions)),
      boxedWarning: r.boxed_warning?.[0] ? truncate(r.boxed_warning[0]) : null,
      route: r.openfda?.route?.[0] ?? "",
      substance: r.openfda?.substance_name?.[0] ?? "",
      setId: r.set_id ?? "",
    }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
