import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const ALGORITHM = "aes-256-gcm"

// Only initialize encryption if key is available
let key: Buffer | null = null
if (ENCRYPTION_KEY) {
  try {
    key = Buffer.from(ENCRYPTION_KEY, "base64")
    if (key.length !== 32) {
      console.warn("ENCRYPTION_KEY must be 32 bytes long, encryption disabled")
      key = null
    }
  } catch (error) {
    console.warn("Invalid ENCRYPTION_KEY format, encryption disabled")
    key = null
  }
} else {
  console.warn("ENCRYPTION_KEY not set - encryption is disabled. This is a security risk for healthcare data.")
}

/**
 * Check if encryption is enabled
 */
export function isEncryptionEnabled(): boolean {
  return key !== null
}

/**
 * Encrypt sensitive data (API keys, messages, health data)
 * Uses AES-256-GCM for authenticated encryption
 */
export function encryptKey(plaintext: string): {
  encrypted: string
  iv: string
} {
  if (!key) {
    // Return plaintext as "encrypted" when encryption is disabled
    return {
      encrypted: plaintext,
      iv: "",
    }
  }

  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")

  const authTag = cipher.getAuthTag()
  const encryptedWithTag = encrypted + ":" + authTag.toString("hex")

  return {
    encrypted: encryptedWithTag,
    iv: iv.toString("hex"),
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptKey(encryptedData: string, ivHex: string): string {
  if (!key) {
    // Return encryptedData as plaintext when encryption is disabled
    return encryptedData
  }

  if (!ivHex || !encryptedData) {
    // If no IV, assume it's plaintext (backward compatibility)
    return encryptedData
  }

  try {
    const [encrypted, authTagHex] = encryptedData.split(":")
    if (!encrypted || !authTagHex) {
      // Invalid format, return as-is (might be plaintext)
      return encryptedData
    }

    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  } catch (error) {
    console.error("Decryption error:", error)
    // If decryption fails, return as-is (might be plaintext from before encryption was enabled)
    return encryptedData
  }
}

/**
 * Encrypt message content for storage
 * Returns encrypted content with IV, or plaintext if encryption is disabled
 */
export function encryptMessage(content: string): {
  encrypted: string
  iv: string
} {
  return encryptKey(content)
}

/**
 * Decrypt message content from storage
 * Handles both encrypted and plaintext (backward compatibility)
 */
export function decryptMessage(encryptedData: string, ivHex: string | null): string {
  if (!ivHex) {
    // No IV means it's plaintext (backward compatibility)
    return encryptedData
  }
  return decryptKey(encryptedData, ivHex)
}

/**
 * Encrypt health data (conditions, medications, allergies, etc.)
 */
export function encryptHealthData(data: string | string[] | null | undefined): {
  encrypted: string | string[] | null
  iv: string | string[] | null
} {
  if (!data) {
    return { encrypted: null, iv: null }
  }

  if (Array.isArray(data)) {
    const encrypted: string[] = []
    const ivs: string[] = []
    for (const item of data) {
      const result = encryptKey(item)
      encrypted.push(result.encrypted)
      ivs.push(result.iv)
    }
    return { encrypted, iv: ivs }
  }

  const result = encryptKey(data)
  return { encrypted: result.encrypted, iv: result.iv }
}

/**
 * Decrypt health data
 */
export function decryptHealthData(
  encryptedData: string | string[] | null | undefined,
  ivHex: string | string[] | null | undefined
): string | string[] | null {
  if (!encryptedData) {
    return null
  }

  if (Array.isArray(encryptedData)) {
    if (!Array.isArray(ivHex)) {
      // Backward compatibility: if no IVs, assume plaintext
      return encryptedData
    }
    return encryptedData.map((item, index) => decryptKey(item, ivHex[index] || ""))
  }

  return decryptKey(encryptedData, ivHex as string || "")
}

export function maskKey(key: string): string {
  if (key.length <= 8) {
    return "*".repeat(key.length)
  }
  return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4)
}
