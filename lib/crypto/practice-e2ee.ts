/**
 * Browser-only practice DEK + AES-256-GCM for JSON payloads.
 * Ciphertext format matches server helpers: iv (hex) + payload (hex:ciphertext+authTag hex).
 */

const PBKDF2_ITERATIONS = 210_000

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return [...u8].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export async function randomBytes(n: number): Promise<Uint8Array> {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return b
}

/** Derive a 256-bit AES key from a user passphrase + salt (for wrapping the practice DEK). */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ])
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
}

export async function generatePracticeDekRaw(): Promise<Uint8Array> {
  return randomBytes(32)
}

export async function importDekRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ])
}

/** Encrypt raw DEK bytes with passphrase-derived key; returns salt + iv + wrapped hex. */
export async function wrapDekWithPassphrase(
  dekRaw: Uint8Array,
  passphrase: string
): Promise<{ salt: string; iv: string; wrapped: string }> {
  const salt = await randomBytes(16)
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const iv = await randomBytes(12)
  const wrappedBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dekRaw)
  return {
    salt: toHex(salt),
    iv: toHex(iv),
    wrapped: toHex(wrappedBuf),
  }
}

export async function unwrapDekWithPassphrase(
  wrapped: string,
  ivHex: string,
  saltHex: string,
  passphrase: string
): Promise<Uint8Array> {
  const salt = fromHex(saltHex)
  const iv = fromHex(ivHex)
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromHex(wrapped))
  return new Uint8Array(plain)
}

export async function encryptJson(
  dekKey: CryptoKey,
  value: unknown
): Promise<{ ciphertext: string; iv: string }> {
  const iv = await randomBytes(12)
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dekKey, bytes)
  return { ciphertext: toHex(ct), iv: toHex(iv) }
}

export async function decryptJson<T = unknown>(
  dekKey: CryptoKey,
  ciphertext: string,
  ivHex: string
): Promise<T> {
  const iv = fromHex(ivHex)
  if (ciphertext.includes(":")) {
    const [bodyHex, tagHex] = ciphertext.split(":")
    if (!bodyHex || !tagHex) throw new Error("Invalid ciphertext format")
    const body = fromHex(bodyHex)
    const tag = fromHex(tagHex)
    const combined = new Uint8Array(body.length + tag.length)
    combined.set(body, 0)
    combined.set(tag, body.length)
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, dekKey, combined)
    return JSON.parse(new TextDecoder().decode(plain)) as T
  }
  const combined = fromHex(ciphertext)
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, dekKey, combined)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

export function dekRawToBase64(raw: Uint8Array): string {
  let bin = ""
  raw.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

export function dekBase64ToRaw(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
