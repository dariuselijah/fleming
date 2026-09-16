import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

function keyForToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest()
}

export function createClinicalDocumentShareToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashClinicalDocumentShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function encryptClinicalDocumentShare(
  token: string,
  content: string
): { ciphertext: string; iv: string } {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyForToken(token), iv)
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
  }
}

export function decryptClinicalDocumentShare(
  token: string,
  ciphertext: string,
  iv: string
): string | null {
  try {
    const packed = Buffer.from(ciphertext, "base64")
    if (packed.length < 17) return null
    const encrypted = packed.subarray(0, packed.length - 16)
    const tag = packed.subarray(packed.length - 16)
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyForToken(token),
      Buffer.from(iv, "base64")
    )
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export function clinicalDocumentShareUrl(token: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    ""
  const path = `/share/clinical/${encodeURIComponent(token)}`
  return base ? `${base}${path}` : path
}
