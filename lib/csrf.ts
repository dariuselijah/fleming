import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"

function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error("CSRF_SECRET must be configured with at least 32 characters")
  }
  return secret
}

export function generateCsrfToken(): string {
  const raw = randomBytes(32).toString("hex")
  const token = createHmac("sha256", getCsrfSecret()).update(raw).digest("hex")
  return `${raw}:${token}`
}

export function validateCsrfToken(fullToken: string): boolean {
  const [raw, token] = fullToken.split(":")
  if (!raw || !token) return false
  try {
    const expected = createHmac("sha256", getCsrfSecret()).update(raw).digest("hex")
    const actualBuffer = Buffer.from(token, "hex")
    const expectedBuffer = Buffer.from(expected, "hex")
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    )
  } catch {
    return false
  }
}

export async function setCsrfCookie() {
  const cookieStore = await cookies()
  const token = generateCsrfToken()
  cookieStore.set("csrf_token", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  })
}
