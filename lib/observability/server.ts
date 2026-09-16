import { randomUUID } from "node:crypto"
import { anonymizeText } from "@/lib/anonymize"

type LogLevel = "info" | "warn" | "error"
type SafeFields = Record<string, unknown>

const SENSITIVE_KEY =
  /(authorization|cookie|password|secret|token|patient|member|email|phone|address|name|payload|body|document|xml|diagnosis|clinical|message)/i

function sanitizeString(value: string): string {
  return anonymizeText(value)
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|whsec|polar|eyJ)[-_A-Za-z0-9.]{12,}\b/g, "[REDACTED]")
    .slice(0, 1_000)
}

export function redactLogValue(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]"
  if (depth > 4) return "[TRUNCATED]"
  if (value == null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return sanitizeString(value)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      code: "code" in value ? sanitizeString(String(value.code)) : undefined,
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactLogValue(item, "", depth + 1))
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([entryKey, entryValue]) => [
          entryKey,
          redactLogValue(entryValue, entryKey, depth + 1),
        ])
    )
  }
  return sanitizeString(String(value))
}

function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim()
  return candidate && /^[A-Za-z0-9._-]{8,128}$/.test(candidate)
    ? candidate
    : randomUUID()
}

export function createRequestLogger(request: Request, route: string) {
  const requestId = requestIdFrom(request)
  const startedAt = Date.now()

  function log(level: LogLevel, event: string, fields: SafeFields = {}) {
    const safeFields = redactLogValue(fields) as SafeFields
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: "fleming",
      event,
      route,
      method: request.method,
      requestId,
      elapsedMs: Date.now() - startedAt,
      ...safeFields,
    }
    const line = `${JSON.stringify(record)}\n`
    if (level === "error") process.stderr.write(line)
    else process.stdout.write(line)
  }

  function withRequestId<T extends Response>(response: T): T {
    response.headers.set("x-request-id", requestId)
    return response
  }

  return {
    requestId,
    info: (event: string, fields?: SafeFields) => log("info", event, fields),
    warn: (event: string, fields?: SafeFields) => log("warn", event, fields),
    error: (event: string, fields?: SafeFields) => log("error", event, fields),
    withRequestId,
  }
}
