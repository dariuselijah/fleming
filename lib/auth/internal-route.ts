import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Development-only diagnostics must be explicitly enabled and authenticated.
 * They remain unavailable in production even if a secret is accidentally set.
 */
export function authorizeDevelopmentRoute(request: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const secret = process.env.DEV_ROUTE_SECRET?.trim()
  const supplied = request.headers.get("x-dev-route-secret")?.trim()
  if (!secret || !supplied || !safeEqual(secret, supplied)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return null
}
