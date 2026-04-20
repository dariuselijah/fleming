import { getClinicalProxyBase } from "./url"

function requireProxyBase(): string {
  const b = getClinicalProxyBase()
  if (!b) {
    throw new Error("CLINICAL_PROXY_URL is not set")
  }
  return b
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = requireProxyBase()
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Medprax proxy ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as T
}

/** POST /api/medication-suggestions — at least one of clinicalNote or diagnosis required. */
export async function postMedicationSuggestions(body: {
  clinicalNote?: string
  diagnosis?: string[]
  patientAge?: number
  patientGender?: string
  allergies?: string[]
}): Promise<unknown> {
  return postJson("/api/medication-suggestions", body)
}

/** POST /api/medication-search */
export async function postMedicationSearch(body: { query: string }): Promise<unknown> {
  return postJson("/api/medication-search", body)
}

/** POST /api/medprax/medicines/search */
export async function postMedpraxMedicinesSearch(body: {
  query: string
  page?: number
  pageSize?: number
}): Promise<unknown> {
  return postJson("/api/medprax/medicines/search", body)
}

/** POST /api/medprax/medicines/by-nappi */
export async function postMedpraxMedicinesByNappi(body: { nappiCode: string }): Promise<unknown> {
  return postJson("/api/medprax/medicines/by-nappi", body)
}

/** POST /api/medprax/tariffs/contracts/medical */
export async function postMedpraxTariffsContractsMedical(body: {
  planOptionCode: string
  disciplineCode: string
  tariffCodes: string[]
}): Promise<unknown> {
  return postJson("/api/medprax/tariffs/contracts/medical", body)
}

/** POST /api/medprax/schemes/search */
export async function postMedpraxSchemesSearch(body: {
  query: string
  page?: number
  pageSize?: number
}): Promise<unknown> {
  return postJson("/api/medprax/schemes/search", body)
}

/** POST /api/medprax/planoptions/search */
export async function postMedpraxPlanoptionsSearch(body: {
  query: string
  page?: number
  pageSize?: number
}): Promise<unknown> {
  return postJson("/api/medprax/planoptions/search", body)
}

/** GET /api/medprax/schemes/:code/planoptions */
export async function getMedpraxSchemePlanoptions(schemeCode: string): Promise<unknown> {
  const base = requireProxyBase()
  const path = `/api/medprax/schemes/${encodeURIComponent(schemeCode)}/planoptions`
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Medprax proxy ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as unknown
}
