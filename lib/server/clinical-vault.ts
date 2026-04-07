import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

function getVaultKeyBytes(): Buffer | null {
  const raw = process.env.CLINICAL_VAULT_SECRET || process.env.ENCRYPTION_KEY
  if (!raw) return null
  try {
    const buf = Buffer.from(raw, "base64")
    if (buf.length === 32) return buf
  } catch {
    /* ignore */
  }
  return null
}

/** Wrap client practice DEK (utf8/base64 payload) for short DB storage. */
export function vaultSealDek(plainDek: string): { enc: string; iv: string } | null {
  const key = getVaultKeyBytes()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plainDek, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    enc: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("hex"),
  }
}

export function vaultOpenDek(encB64: string, ivHex: string): string | null {
  const key = getVaultKeyBytes()
  if (!key) return null
  try {
    const iv = Buffer.from(ivHex, "hex")
    const data = Buffer.from(encB64, "base64")
    if (data.length < 17) return null
    const tag = data.subarray(data.length - 16)
    const enc = data.subarray(0, data.length - 16)
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** Decrypt practice patient profile / encounter state using raw DEK base64 (32 bytes). */
export function decryptPracticeAesGcm(
  dekBase64: string,
  ciphertextPacked: string,
  ivHex: string
): string | null {
  try {
    const dek = Buffer.from(dekBase64, "base64")
    if (dek.length !== 32) return null
    const iv = Buffer.from(ivHex, "hex")
    const decipher = createDecipheriv("aes-256-gcm", dek, iv)
    if (ciphertextPacked.includes(":")) {
      const [bodyHex, tagHex] = ciphertextPacked.split(":")
      if (!bodyHex || !tagHex) return null
      const body = Buffer.from(bodyHex, "hex")
      const tag = Buffer.from(tagHex, "hex")
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")
    }
    const combined = Buffer.from(ciphertextPacked, "hex")
    if (combined.length < 17) return null
    const tag = combined.subarray(combined.length - 16)
    const enc = combined.subarray(0, combined.length - 16)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
