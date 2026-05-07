/**
 * Redis Client Singleton
 * Uses Upstash Redis (serverless, Edge-compatible)
 * Gracefully degrades to no-op when Redis is not configured
 */

import { Redis } from "@upstash/redis"

let redisInstance: Redis | null = null
let initAttempted = false

function resolveRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN
  if (!url || !token) return null
  return { url, token }
}

export function getRedis(): Redis | null {
  if (redisInstance) return redisInstance
  if (initAttempted) return null

  initAttempted = true
  const config = resolveRedisConfig()
  if (!config) {
    console.log("[Redis] No Redis URL/token configured – caching disabled")
    return null
  }

  try {
    redisInstance = new Redis({
      url: config.url,
      token: config.token,
      automaticDeserialization: true,
    })
    console.log("[Redis] Client initialised")
    return redisInstance
  } catch (err) {
    console.error("[Redis] Failed to initialise client:", err)
    return null
  }
}

export function isRedisAvailable(): boolean {
  return getRedis() !== null
}

export async function redisHealthCheck(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    const pong = await redis.ping()
    return pong === "PONG"
  } catch {
    return false
  }
}

/**
 * Safe get – returns null on miss or error
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<T>(key)
  } catch (err) {
    console.warn("[Redis] GET failed for", key, err)
    return null
  }
}

/**
 * Safe set with TTL (seconds)
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    await redis.set(key, value, { ex: ttlSeconds })
    return true
  } catch (err) {
    console.warn("[Redis] SET failed for", key, err)
    return false
  }
}

/**
 * Safe delete
 */
export async function cacheDel(key: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    await redis.del(key)
    return true
  } catch (err) {
    console.warn("[Redis] DEL failed for", key, err)
    return false
  }
}

/**
 * Delete keys matching a prefix (scan-based, safe for production)
 */
export async function cacheDelByPrefix(prefix: string): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0

  let deleted = 0
  let cursor = 0
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${prefix}*`,
        count: 100,
      })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await redis.del(...keys)
        deleted += keys.length
      }
    } while (cursor !== 0)
  } catch (err) {
    console.warn("[Redis] Prefix delete failed for", prefix, err)
  }
  return deleted
}
