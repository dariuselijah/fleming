import { NextResponse } from "next/server"

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

  const [openFdaResult, rxNavResult] = await Promise.allSettled([
    searchOpenFdaMedications(query, limit),
    searchRxNavMedications(query, limit),
  ])

  const sourceNames: string[] = []
  const merged = new Set<string>()

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
