import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization")?.trim()
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function requireCronAuthorization(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[security] CRON_SECRET is required in production")
      return NextResponse.json(
        { error: "Cron authentication is not configured" },
        { status: 503 }
      )
    }
    return null
  }

  const supplied = bearerToken(request)
  if (!supplied || !safeEqual(secret, supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
