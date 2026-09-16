"use client"

import {
  dekBase64ToRaw,
  dekRawToBase64,
  importDekRaw,
  randomBytes,
} from "@/lib/crypto/practice-e2ee"

const KEY_PREFIX = "fleming:encounter-storage-key"

export async function getEncounterStorageKey(practiceId: string): Promise<CryptoKey> {
  const storageKey = `${KEY_PREFIX}:${practiceId}`
  let b64 = window.localStorage.getItem(storageKey)

  if (!b64) {
    const raw = await randomBytes(32)
    b64 = dekRawToBase64(raw)
    window.localStorage.setItem(storageKey, b64)
    return importDekRaw(raw)
  }

  return importDekRaw(dekBase64ToRaw(b64))
}
