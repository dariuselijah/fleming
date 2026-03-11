import type { UploadTopicContext } from "@/lib/uploads/server"

const RETRIEVAL_PREFLIGHT_CACHE_TTL_MS = 20_000
const RETRIEVAL_PREFLIGHT_CACHE_MAX_ENTRIES = 240

type CacheEntry<T> = {
  userId: string
  value: T
  expiresAt: number
  touchedAt: number
}

const preflightCache = new Map<string, CacheEntry<unknown>>()
const userCacheIndex = new Map<string, Set<string>>()

type BuildKeyParams = {
  userId: string
  query: string
  uploadId?: string
  mode?: string
  selectedUploadIds?: string[]
  topicContext?: UploadTopicContext | null
}

export function buildUploadRetrievalPreflightCacheKey(params: BuildKeyParams): string {
  const normalizedQuery = params.query.trim().toLowerCase()
  const normalizedUploadId = params.uploadId?.trim().toLowerCase() || ""
  const normalizedMode = params.mode?.trim().toLowerCase() || "auto"
  const normalizedSelectedIds = (params.selectedUploadIds ?? [])
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id.length > 0)
    .sort()
  const topicContextFingerprint = stableStringify(params.topicContext ?? null)

  return [
    `u:${params.userId}`,
    `q:${normalizedQuery}`,
    `up:${normalizedUploadId}`,
    `m:${normalizedMode}`,
    `sel:${normalizedSelectedIds.join(",")}`,
    `ctx:${topicContextFingerprint}`,
  ].join("|")
}

export function getUploadRetrievalPreflightCache<T>(key: string): T | undefined {
  pruneExpiredEntries()
  const entry = preflightCache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    dropCacheEntry(key, entry.userId)
    return undefined
  }
  entry.touchedAt = Date.now()
  return entry.value as T
}

export function setUploadRetrievalPreflightCache<T>(
  key: string,
  userId: string,
  value: T,
  ttlMs: number = RETRIEVAL_PREFLIGHT_CACHE_TTL_MS
) {
  const now = Date.now()
  const entry: CacheEntry<T> = {
    userId,
    value,
    expiresAt: now + Math.max(1_000, ttlMs),
    touchedAt: now,
  }
  preflightCache.set(key, entry)
  const userEntries = userCacheIndex.get(userId) ?? new Set<string>()
  userEntries.add(key)
  userCacheIndex.set(userId, userEntries)
  enforceCacheSizeLimit()
}

export function invalidateUploadRetrievalPreflightCacheForUser(userId: string) {
  const keys = userCacheIndex.get(userId)
  if (!keys || keys.size === 0) return
  for (const key of keys) {
    preflightCache.delete(key)
  }
  userCacheIndex.delete(userId)
}

function pruneExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of preflightCache) {
    if (entry.expiresAt <= now) {
      dropCacheEntry(key, entry.userId)
    }
  }
}

function enforceCacheSizeLimit() {
  if (preflightCache.size <= RETRIEVAL_PREFLIGHT_CACHE_MAX_ENTRIES) {
    return
  }
  const entries = Array.from(preflightCache.entries()).sort(
    (a, b) => a[1].touchedAt - b[1].touchedAt
  )
  const overflowCount = preflightCache.size - RETRIEVAL_PREFLIGHT_CACHE_MAX_ENTRIES
  for (let i = 0; i < overflowCount; i += 1) {
    const candidate = entries[i]
    if (!candidate) continue
    dropCacheEntry(candidate[0], candidate[1].userId)
  }
}

function dropCacheEntry(key: string, userId: string) {
  preflightCache.delete(key)
  const userEntries = userCacheIndex.get(userId)
  if (!userEntries) return
  userEntries.delete(key)
  if (userEntries.size === 0) {
    userCacheIndex.delete(userId)
  } else {
    userCacheIndex.set(userId, userEntries)
  }
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_, currentValue: unknown) => {
    if (!currentValue || typeof currentValue !== "object") {
      return currentValue
    }
    if (seen.has(currentValue as object)) {
      return null
    }
    seen.add(currentValue as object)
    if (Array.isArray(currentValue)) {
      return currentValue
    }
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(currentValue as Record<string, unknown>).sort()) {
      sorted[key] = (currentValue as Record<string, unknown>)[key]
    }
    return sorted
  })
}
