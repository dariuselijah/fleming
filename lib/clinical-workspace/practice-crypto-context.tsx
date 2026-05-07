"use client"

import { fetchClient } from "@/lib/fetch"
import {
  decryptJson,
  dekBase64ToRaw,
  dekRawToBase64,
  encryptJson,
  importDekRaw,
  randomBytes,
  unwrapDekWithPassphrase,
  wrapDekWithPassphrase,
} from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type PracticeCryptoContextValue = {
  practiceId: string | null
  dekKey: CryptoKey | null
  dekBase64: string | null
  unlocked: boolean
  busy: boolean
  error: string | null
  setPracticeId: (id: string | null) => void
  unlockWithPassphrase: (passphrase: string) => Promise<boolean>
  createNewPracticeCrypto: (passphrase: string) => Promise<boolean>
  pushVaultSession: () => Promise<void>
  lock: () => void
}

const PracticeCryptoContext = createContext<PracticeCryptoContextValue | null>(null)

export function PracticeCryptoProvider({ children }: { children: ReactNode }) {
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [dekKey, setDekKey] = useState<CryptoKey | null>(null)
  const [dekBase64, setDekBase64] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lock = useCallback(() => {
    setDekKey(null)
    setDekBase64(null)
    setError(null)
  }, [])

  /** Rehydrate DEK from server session vault after soft navigation (avoids passphrase on every route change). */
  useEffect(() => {
    if (!practiceId || dekKey) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchClient(
          `/api/clinical/session-vault?practiceId=${encodeURIComponent(practiceId)}`
        )
        if (!res.ok || cancelled) return
        const j = (await res.json()) as { dekBase64?: string | null }
        if (!j.dekBase64 || cancelled) return
        const raw = dekBase64ToRaw(j.dekBase64)
        const key = await importDekRaw(raw)
        if (cancelled) return
        setDekKey(key)
        setDekBase64(j.dekBase64)
      } catch {
        /* missing / expired vault — user unlocks with passphrase */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId, dekKey])

  const pushVaultSession = useCallback(async () => {
    if (!practiceId || !dekBase64) return
    await fetchClient("/api/clinical/session-vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ practiceId, dekBase64 }),
    })
  }, [practiceId, dekBase64])

  const unlockWithPassphrase = useCallback(
    async (passphrase: string) => {
      if (!practiceId) {
        setError("No practice selected")
        return false
      }
      setBusy(true)
      setError(null)
      try {
        const supabase = createClient()
        if (!supabase) throw new Error("Supabase not configured")
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) throw new Error("Not signed in")

        const { data: wrap, error: wErr } = await supabase
          .from("practice_crypto_wrappers")
          .select("salt, wrapped_dek, iv")
          .eq("practice_id", practiceId)
          .eq("user_id", auth.user.id)
          .maybeSingle()
        if (wErr || !wrap) throw new Error("No crypto wrapper for this user/practice")

        const raw = await unwrapDekWithPassphrase(
          wrap.wrapped_dek,
          wrap.iv,
          wrap.salt,
          passphrase
        )
        const key = await importDekRaw(raw)
        const b64 = dekRawToBase64(raw)
        setDekKey(key)
        setDekBase64(b64)
        await fetchClient("/api/clinical/session-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId, dekBase64: b64 }),
        })
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unlock failed")
        return false
      } finally {
        setBusy(false)
      }
    },
    [practiceId]
  )

  const createNewPracticeCrypto = useCallback(
    async (passphrase: string) => {
      if (!practiceId) {
        setError("No practice selected")
        return false
      }
      setBusy(true)
      setError(null)
      try {
        const supabase = createClient()
        if (!supabase) throw new Error("Supabase not configured")
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user) throw new Error("Not signed in")

        const dekRaw = await randomBytes(32)
        const wrapped = await wrapDekWithPassphrase(dekRaw, passphrase)
        const { error: insErr } = await supabase.from("practice_crypto_wrappers").insert({
          practice_id: practiceId,
          user_id: auth.user.id,
          salt: wrapped.salt,
          wrapped_dek: wrapped.wrapped,
          iv: wrapped.iv,
        })
        if (insErr) throw new Error(insErr.message)

        const key = await importDekRaw(dekRaw)
        const b64 = dekRawToBase64(dekRaw)
        setDekKey(key)
        setDekBase64(b64)
        await fetchClient("/api/clinical/session-vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId, dekBase64: b64 }),
        })
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : "Setup failed")
        return false
      } finally {
        setBusy(false)
      }
    },
    [practiceId]
  )

  const value = useMemo<PracticeCryptoContextValue>(
    () => ({
      practiceId,
      dekKey,
      dekBase64,
      unlocked: Boolean(dekKey),
      busy,
      error,
      setPracticeId,
      unlockWithPassphrase,
      createNewPracticeCrypto,
      pushVaultSession,
      lock,
    }),
    [
      practiceId,
      dekKey,
      dekBase64,
      busy,
      error,
      unlockWithPassphrase,
      createNewPracticeCrypto,
      pushVaultSession,
      lock,
    ]
  )

  return (
    <PracticeCryptoContext.Provider value={value}>{children}</PracticeCryptoContext.Provider>
  )
}

export function usePracticeCrypto() {
  const ctx = useContext(PracticeCryptoContext)
  if (!ctx) {
    throw new Error("usePracticeCrypto must be used within PracticeCryptoProvider")
  }
  return ctx
}

export async function encryptPatientProfile(
  dekKey: CryptoKey,
  profile: Record<string, unknown>
): Promise<{ ciphertext: string; iv: string }> {
  return encryptJson(dekKey, profile)
}

export async function decryptPatientProfile<T = Record<string, unknown>>(
  dekKey: CryptoKey,
  ciphertext: string,
  iv: string
): Promise<T> {
  return decryptJson<T>(dekKey, ciphertext, iv)
}

export { dekBase64ToRaw, importDekRaw }
