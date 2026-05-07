import { NextResponse } from "next/server"
import {
  postMedpraxMedicinesSearch,
  postMedpraxTariffsContractsMedical,
} from "@/lib/clinical-proxy/medprax"

export const runtime = "nodejs"

type CodeKind = "tariff" | "nappi" | "icd"
type CodeResult = {
  code: string
  description: string
  kind: CodeKind
  amount?: number
  source: "medprax"
}

const cache = new Map<string, { expiresAt: number; payload: { results: CodeResult[]; stale?: boolean } }>()

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const type = ((url.searchParams.get("type") ?? "tariff").trim() || "tariff") as CodeKind
  const discipline = (url.searchParams.get("discipline") ?? "014").trim() || "014"
  const key = `${type}:${discipline}:${q.toLowerCase()}`

  if (q.length < 2) return NextResponse.json({ results: [] })
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.payload)

  try {
    let results: CodeResult[]
    if (type === "nappi") {
      const raw = await postMedpraxMedicinesSearch({ query: q, page: 1, pageSize: 12 })
      results = normalizeMedicineResults(raw)
    } else if (type === "tariff") {
      const raw = await postMedpraxTariffsContractsMedical({
        planOptionCode: "PRIVATE",
        disciplineCode: discipline,
        tariffCodes: [q],
      })
      results = normalizeTariffResults(raw, q)
    } else {
      results = normalizeIcdFallback(q)
    }

    const payload = { results: results.slice(0, 12) }
    cache.set(key, { expiresAt: Date.now() + 60_000, payload })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({
      results: [],
      unavailable: true,
      message: e instanceof Error ? e.message : "Medprax is unavailable",
    })
  }
}

function normalizeMedicineResults(raw: unknown): CodeResult[] {
  const rows = extractRows(raw)
  return rows.flatMap((row) => {
    const r = row as Record<string, unknown>
    const code = stringFrom(r.nappiCode, r.nappi, r.nappi_code, r.code)
    const description = stringFrom(r.name, r.description, r.tradeName, r.productName)
    if (!code || !description) return []
    return [{ code, description, kind: "nappi" as const, amount: centsFrom(r.price, r.amount, r.priceCents), source: "medprax" as const }]
  })
}

function normalizeTariffResults(raw: unknown, q: string): CodeResult[] {
  const rows = extractRows(raw)
  const out = rows.flatMap((row) => {
    const r = row as Record<string, unknown>
    const code = stringFrom(r.tariffCode, r.tariff_code, r.code, r.itemCode)
    const description = stringFrom(r.description, r.name, r.tariffDescription)
    if (!code || !description) return []
    return [{ code, description, kind: "tariff" as const, amount: centsFrom(r.amount, r.fee, r.priceCents), source: "medprax" as const }]
  })
  return out.length ? out : [{ code: q, description: `Tariff ${q}`, kind: "tariff", source: "medprax" }]
}

function normalizeIcdFallback(q: string): CodeResult[] {
  if (!/^[A-TV-Z][0-9]/i.test(q)) return []
  return [{ code: q.toUpperCase(), description: `ICD-10 ${q.toUpperCase()}`, kind: "icd", source: "medprax" }]
}

function extractRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== "object") return []
  const r = raw as Record<string, unknown>
  for (const key of ["results", "items", "data", "rows", "medicines", "tariffs"]) {
    if (Array.isArray(r[key])) return r[key] as unknown[]
  }
  return []
}

function stringFrom(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

function centsFrom(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) && value > 1000 ? value : Math.round(value * 100)
    }
    if (typeof value === "string") {
      const n = Number(value.replace(/[^\d.]/g, ""))
      if (Number.isFinite(n) && n > 0) return Math.round(n * 100)
    }
  }
  return undefined
}
