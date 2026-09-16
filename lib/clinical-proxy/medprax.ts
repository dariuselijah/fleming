import { getCatalogueProxyBase } from "./url"

function requireCatalogueBase(): string {
  const b = getCatalogueProxyBase()
  if (!b) {
    throw new Error(
      "Set SA_REFERENCE_DATA_URL (preferred) or CLINICAL_PROXY_URL for catalogue / Medprax-compatible APIs"
    )
  }
  return b
}

function authHeaders(): Record<string, string> {
  const key = process.env.SA_REFERENCE_DATA_API_KEY?.trim()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = requireCatalogueBase()
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Catalogue proxy ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as T
}

async function getJson<T>(path: string): Promise<T> {
  const base = requireCatalogueBase()
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: authHeaders(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Catalogue proxy ${path} HTTP ${res.status}: ${text.slice(0, 400)}`)
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
  return getJson(`/api/medprax/schemes/${encodeURIComponent(schemeCode)}/planoptions`)
}

/** GET /api/icd10/search — SA Health Codes first-class ICD API */
export async function searchIcd10(query: string, limit = 12): Promise<unknown> {
  return getJson(`/api/icd10/search?q=${encodeURIComponent(query)}&limit=${limit}`)
}

/** GET /api/icd10/validate */
export async function validateIcd10(code: string): Promise<unknown> {
  return getJson(`/api/icd10/validate?code=${encodeURIComponent(code)}`)
}
