/**
 * Multi-Level Retrieval Cache
 *
 * L1: Evidence search results   – keyed by normalised query hash
 * L2: PubMed UID sets + metadata – keyed by pubmed:{queryHash}
 * L3: Synthesised answer text    – keyed by answer:{queryHash}:{modelId}
 *
 * Falls back gracefully when Redis is unavailable.
 */

import { createHash } from "crypto"
import { cacheGet, cacheSet, cacheDelByPrefix } from "./redis"

const L1_PREFIX = "evidence:"
const L2_PREFIX = "pubmed:"
const L3_PREFIX = "answer:"

const L1_TTL_SECONDS = 6 * 60 * 60       // 6 h
const L2_TTL_SECONDS = 36 * 60 * 60      // 36 h
const L3_TTL_SECONDS = 18 * 60 * 60      // 18 h

// Global version prefix – bump to invalidate entire cache on schema change
const CACHE_VERSION = "v1"

function buildPrefix(prefix: string): string {
  return `${CACHE_VERSION}:${prefix}`
}

/**
 * Normalise a query string for cache-key generation.
 * Lowercases, strips non-alphanumeric (keeps spaces/hyphens), collapses whitespace,
 * then sorts tokens for near-duplicate resistance.
 */
export function normaliseQueryForCache(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ")
}

/**
 * SHA-256 hash a normalised query to produce a compact cache key.
 */
export function hashQuery(normalised: string): string {
  return createHash("sha256").update(normalised).digest("hex").slice(0, 32)
}

// ── L1: Evidence search results ──────────────────────────────────────────────

export async function getEvidenceCache<T>(query: string): Promise<T | null> {
  const key = `${buildPrefix(L1_PREFIX)}${hashQuery(normaliseQueryForCache(query))}`
  return cacheGet<T>(key)
}

export async function setEvidenceCache<T>(
  query: string,
  results: T,
  ttlSeconds: number = L1_TTL_SECONDS,
): Promise<boolean> {
  const key = `${buildPrefix(L1_PREFIX)}${hashQuery(normaliseQueryForCache(query))}`
  return cacheSet(key, results, ttlSeconds)
}

// ── L2: PubMed UID sets ──────────────────────────────────────────────────────

export interface PubMedCacheEntry {
  pmids: string[]
  totalResults: number
  articles: unknown[]
}

export async function getPubMedCache(
  query: string,
  maxResults: number,
): Promise<PubMedCacheEntry | null> {
  const raw = normaliseQueryForCache(query)
  const key = `${buildPrefix(L2_PREFIX)}${hashQuery(raw)}:${maxResults}`
  return cacheGet<PubMedCacheEntry>(key)
}

export async function setPubMedCache(
  query: string,
  maxResults: number,
  entry: PubMedCacheEntry,
  ttlSeconds: number = L2_TTL_SECONDS,
): Promise<boolean> {
  const raw = normaliseQueryForCache(query)
  const key = `${buildPrefix(L2_PREFIX)}${hashQuery(raw)}:${maxResults}`
  return cacheSet(key, entry, ttlSeconds)
}

// ── L3: Synthesised answers ──────────────────────────────────────────────────

export interface AnswerCacheEntry {
  answer: string
  citations: unknown[]
  modelId: string
  cachedAt: number
}

export async function getAnswerCache(
  query: string,
  modelId: string,
): Promise<AnswerCacheEntry | null> {
  const raw = normaliseQueryForCache(query)
  const key = `${buildPrefix(L3_PREFIX)}${hashQuery(raw)}:${modelId}`
  return cacheGet<AnswerCacheEntry>(key)
}

export async function setAnswerCache(
  query: string,
  modelId: string,
  entry: AnswerCacheEntry,
  ttlSeconds: number = L3_TTL_SECONDS,
): Promise<boolean> {
  const raw = normaliseQueryForCache(query)
  const key = `${buildPrefix(L3_PREFIX)}${hashQuery(raw)}:${modelId}`
  return cacheSet(key, entry, ttlSeconds)
}

// ── Cache Invalidation ───────────────────────────────────────────────────────

/**
 * Invalidate all evidence-related caches (e.g. after new ingestion).
 * Returns total number of keys deleted.
 */
export async function invalidateEvidenceCache(): Promise<number> {
  const l1 = await cacheDelByPrefix(buildPrefix(L1_PREFIX))
  const l3 = await cacheDelByPrefix(buildPrefix(L3_PREFIX))
  return l1 + l3
}

/**
 * Invalidate all PubMed caches.
 */
export async function invalidatePubMedCache(): Promise<number> {
  return cacheDelByPrefix(buildPrefix(L2_PREFIX))
}

/**
 * Invalidate everything.
 */
export async function invalidateAllCaches(): Promise<number> {
  return cacheDelByPrefix(buildPrefix(CACHE_VERSION))
}
