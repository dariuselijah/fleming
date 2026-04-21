/**
 * RxNorm API — Drug Interaction Lookup
 *
 * Uses the NIH RxNorm REST API (public, no key required) to:
 *  1. Resolve drug names → RxCUI identifiers
 *  2. Query the Interaction API for drug-drug interactions
 *
 * @see https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
 * @see https://lhncbc.nlm.nih.gov/RxNav/APIs/InteractionAPIs.html
 */

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"
const INTERACTION_BASE = "https://rxnav.nlm.nih.gov/REST/interaction"
const TIMEOUT_MS = 6_000

export interface RxCuiResult {
  rxcui: string
  name: string
  tty: string
}

export interface DrugInteraction {
  severity: string
  description: string
  drug1: string
  drug2: string
  source: string
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveRxCui(drugName: string): Promise<RxCuiResult | null> {
  const encoded = encodeURIComponent(drugName.trim())
  const data = await fetchJson<any>(
    `${RXNORM_BASE}/rxcui.json?name=${encoded}&search=1`
  )
  if (!data?.idGroup?.rxnormId?.length) {
    const approx = await fetchJson<any>(
      `${RXNORM_BASE}/approximateTerm.json?term=${encoded}&maxEntries=1`
    )
    const candidate = approx?.approximateGroup?.candidate?.[0]
    if (!candidate?.rxcui) return null
    return { rxcui: candidate.rxcui, name: candidate.name || drugName, tty: candidate.tty || "" }
  }
  return {
    rxcui: data.idGroup.rxnormId[0],
    name: data.idGroup.name || drugName,
    tty: "",
  }
}

export async function getInteractions(rxcui: string): Promise<DrugInteraction[]> {
  const data = await fetchJson<any>(
    `${INTERACTION_BASE}/interaction.json?rxcui=${rxcui}&sources=DrugBank`
  )
  const pairs = data?.interactionTypeGroup?.flatMap(
    (g: any) =>
      g.interactionType?.flatMap((t: any) =>
        t.interactionPair?.map((p: any) => ({
          severity: p.severity || "N/A",
          description: p.description || "",
          drug1: p.interactionConcept?.[0]?.minConceptItem?.name || "",
          drug2: p.interactionConcept?.[1]?.minConceptItem?.name || "",
          source: "DrugBank via RxNorm",
        }))
      ) ?? []
  ) ?? []
  return pairs
}

export async function getMultiDrugInteractions(
  rxcuis: string[]
): Promise<DrugInteraction[]> {
  if (rxcuis.length < 2) return []
  const list = rxcuis.join("+")
  const data = await fetchJson<any>(
    `${INTERACTION_BASE}/list.json?rxcuis=${list}&sources=DrugBank`
  )
  const pairs =
    data?.fullInteractionTypeGroup?.flatMap(
      (g: any) =>
        g.fullInteractionType?.flatMap((t: any) =>
          t.interactionPair?.map((p: any) => ({
            severity: p.severity || "N/A",
            description: p.description || "",
            drug1: p.interactionConcept?.[0]?.minConceptItem?.name || "",
            drug2: p.interactionConcept?.[1]?.minConceptItem?.name || "",
            source: "DrugBank via RxNorm",
          }))
        ) ?? []
    ) ?? []
  return pairs
}

/**
 * High-level: given a drug name query, resolve + fetch interactions.
 */
export async function searchDrugInteractions(
  query: string,
  maxResults = 10
): Promise<{ drug: string; rxcui: string; interactions: DrugInteraction[] } | null> {
  const drugs = query
    .split(/\s+(?:and|with|vs|,|\+)\s+/i)
    .map((d) => d.trim())
    .filter(Boolean)

  if (drugs.length === 0) return null

  const resolved = await Promise.all(drugs.map(resolveRxCui))
  const valid = resolved.filter(Boolean) as RxCuiResult[]
  if (valid.length === 0) return null

  let interactions: DrugInteraction[]
  if (valid.length >= 2) {
    interactions = await getMultiDrugInteractions(valid.map((r) => r.rxcui))
  } else {
    interactions = await getInteractions(valid[0].rxcui)
  }

  return {
    drug: valid.map((r) => r.name).join(" + "),
    rxcui: valid.map((r) => r.rxcui).join(","),
    interactions: interactions.slice(0, maxResults),
  }
}
