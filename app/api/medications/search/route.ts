import { NextResponse } from "next/server"
import { getClinicalProxyBase } from "@/lib/clinical-proxy/url"

const OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"
const RXNAV_DRUGS_URL = "https://rxnav.nlm.nih.gov/REST/drugs.json"

type OpenFdaRecord = {
  openfda?: {
    generic_name?: string[]
    brand_name?: string[]
    substance_name?: string[]
  }
}

function normalizeMedicationName(name: string): string {
  return name.replace(/\s+/g, " ").trim()
}

/**
 * Optional Medprax (or compatible) product search.
 * - CLINICAL_PROXY_URL: POST /api/medication-search (see API_REQUESTS_MEDIKREDIT_MEDPRAX.md).
 * - Else MEDPRAX_API_URL + MEDPRAX_API_KEY: GET /medicines/search?q=...
 */
async function searchMedpraxMedications(
  query: string,
  limit: number
): Promise<string[]> {
  const proxyBase = getClinicalProxyBase()
  if (proxyBase) {
    try {
      const response = await fetch(`${proxyBase}/api/medication-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query }),
        cache: "no-store",
      })
      if (!response.ok) return []

      const data: unknown = await response.json()
      const out: string[] = []

      const pushName = (raw: unknown) => {
        if (typeof raw === "string") {
          const n = normalizeMedicationName(raw)
          if (n) out.push(n)
          return
        }
        if (raw && typeof raw === "object") {
          const o = raw as Record<string, unknown>
          const n =
            o.name ?? o.fullDescription ?? o.productName ?? o.description ?? o.label
          if (typeof n === "string") {
            const x = normalizeMedicationName(n)
            if (x) out.push(x)
          }
        }
      }

      if (data && typeof data === "object") {
        const o = data as Record<string, unknown>
        const meds = o.medications
        if (Array.isArray(meds)) meds.forEach(pushName)
      }

      return [...new Set(out)].slice(0, limit)
    } catch {
      return []
    }
  }

  const base = process.env.MEDPRAX_API_URL?.replace(/\/$/, "")
  const key = process.env.MEDPRAX_API_KEY
  if (!base || !key) return []

  try {
    const url = `${base}/medicines/search?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!response.ok) return []

    const data: unknown = await response.json()
    const out: string[] = []

    const pushName = (raw: unknown) => {
      if (typeof raw === "string") {
        const n = normalizeMedicationName(raw)
        if (n) out.push(n)
        return
      }
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>
        const n =
          o.name ?? o.productName ?? o.description ?? o.label
        if (typeof n === "string") {
          const x = normalizeMedicationName(n)
          if (x) out.push(x)
        }
      }
    }

    if (Array.isArray(data)) {
      data.forEach(pushName)
    } else if (data && typeof data === "object") {
      const o = data as Record<string, unknown>
      const arr = o.results ?? o.suggestions ?? o.items ?? o.medicines
      if (Array.isArray(arr)) arr.forEach(pushName)
    }

    return [...new Set(out)].slice(0, limit)
  } catch {
    return []
  }
}

function rankMedicationNames(names: string[], query: string): string[] {
  const q = query.toLowerCase()
  return [...names].sort((a, b) => {
    const aLower = a.toLowerCase()
    const bLower = b.toLowerCase()
    const aStarts = aLower.startsWith(q) ? 0 : 1
    const bStarts = bLower.startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return aLower.localeCompare(bLower)
  })
}

async function searchOpenFdaMedications(
  query: string,
  limit: number
): Promise<string[]> {
  const escaped = query.replace(/"/g, '\\"')
  const search = [
    `openfda.generic_name:${escaped}*`,
    `openfda.brand_name:${escaped}*`,
    `openfda.substance_name:${escaped}*`,
  ].join("+")

  const params = new URLSearchParams({
    search,
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })

  const response = await fetch(`${OPENFDA_LABEL_URL}?${params.toString()}`, {
    cache: "no-store",
  })
  if (!response.ok) return []

  const data = await response.json()
  const results = (data?.results || []) as OpenFdaRecord[]

  const names = new Set<string>()
  for (const item of results) {
    const openfda = item.openfda
    if (!openfda) continue
    const combined = [
      ...(openfda.generic_name || []),
      ...(openfda.brand_name || []),
      ...(openfda.substance_name || []),
    ]
    for (const name of combined) {
      const normalized = normalizeMedicationName(name)
      if (!normalized) continue
      names.add(normalized)
    }
  }

  return Array.from(names)
}

async function searchRxNavMedications(
  query: string,
  limit: number
): Promise<string[]> {
  const params = new URLSearchParams({
    name: query,
  })

  const response = await fetch(`${RXNAV_DRUGS_URL}?${params.toString()}`, {
    cache: "no-store",
  })
  if (!response.ok) return []

  const data = await response.json()
  const conceptGroups = (data?.drugGroup?.conceptGroup || []) as Array<{
    conceptProperties?: Array<{ name?: string }>
  }>

  const names = new Set<string>()
  for (const group of conceptGroups) {
    for (const concept of group.conceptProperties || []) {
      const normalized = normalizeMedicationName(concept?.name || "")
      if (!normalized) continue
      names.add(normalized)
      if (names.size >= limit) {
        return Array.from(names)
      }
    }
  }

  return Array.from(names)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = (searchParams.get("q") || "").trim()
  const limit = Number(searchParams.get("limit") || "25")

  if (query.length < 2) {
    return NextResponse.json({ suggestions: [], sources: [] }, { status: 200 })
  }

  const [medpraxResult, openFdaResult, rxNavResult] = await Promise.allSettled([
    searchMedpraxMedications(query, limit),
    searchOpenFdaMedications(query, limit),
    searchRxNavMedications(query, limit),
  ])

  const sourceNames: string[] = []
  const merged = new Set<string>()

  if (medpraxResult.status === "fulfilled" && medpraxResult.value.length > 0) {
    sourceNames.push("Medprax")
    for (const name of medpraxResult.value) merged.add(name)
  }
  if (openFdaResult.status === "fulfilled") {
    sourceNames.push("OpenFDA")
    for (const name of openFdaResult.value) merged.add(name)
  }
  if (rxNavResult.status === "fulfilled") {
    sourceNames.push("RxNav")
    for (const name of rxNavResult.value) merged.add(name)
  }

  const filtered = Array.from(merged).filter((name) =>
    name.toLowerCase().includes(query.toLowerCase())
  )
  const ranked = rankMedicationNames(filtered, query).slice(
    0,
    Math.min(Math.max(limit, 1), 50)
  )

  return NextResponse.json(
    {
      suggestions: ranked,
      sources: sourceNames,
    },
    { status: 200 }
  )
}
