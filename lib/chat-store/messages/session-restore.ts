function parseJson(input: string | null): unknown {
  if (!input) return null
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function coerceMessages(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { messages?: unknown }).messages)
  ) {
    return (value as { messages: unknown[] }).messages
  }
  return null
}

export function resolveScopedSessionMessages(params: {
  chatId: string | null
  pendingRaw: string | null
  latestRaw: string | null
  nowMs?: number
  latestTtlMs?: number
}): unknown[] | null {
  const {
    chatId,
    pendingRaw,
    latestRaw,
    nowMs = Date.now(),
    latestTtlMs = 10_000,
  } = params

  if (chatId) {
    return coerceMessages(parseJson(pendingRaw))
  }

  const latestParsed = parseJson(latestRaw)
  if (!latestParsed || typeof latestParsed !== "object") return null
  const latest = latestParsed as { timestamp?: unknown; messages?: unknown[] }
  const messages = coerceMessages(latest)
  if (!messages || messages.length === 0) return null

  const timestamp =
    typeof latest.timestamp === "number"
      ? latest.timestamp
      : Number.parseInt(String(latest.timestamp ?? ""), 10)
  if (Number.isFinite(timestamp) && nowMs - timestamp > latestTtlMs) {
    return null
  }
  return messages
}
