"use client"

import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import { LockKey, Spinner } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

/**
 * Blocks clinical workspace until practice crypto is unlocked or first-time passphrase is set.
 */
export function ClinicalUnlockGate({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const { practiceId, unlocked, busy, error, unlockWithPassphrase, createNewPracticeCrypto } =
    usePracticeCrypto()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [pass, setPass] = useState("")
  const [pass2, setPass2] = useState("")

  useEffect(() => {
    if (!user?.id || !practiceId) {
      setChecking(false)
      setNeedsSetup(false)
      return
    }
    const supabase = createClient()
    if (!supabase) {
      setChecking(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("practice_crypto_wrappers")
        .select("id")
        .eq("practice_id", practiceId)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!cancelled) {
        setNeedsSetup(!data?.id)
        setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, practiceId])

  const onUnlock = useCallback(async () => {
    if (!pass.trim()) return
    const ok = await unlockWithPassphrase(pass)
    if (ok) setPass("")
  }, [pass, unlockWithPassphrase])

  const onCreate = useCallback(async () => {
    if (pass.length < 8 || pass !== pass2) return
    const ok = await createNewPracticeCrypto(pass)
    if (ok) {
      setPass("")
      setPass2("")
    }
  }, [pass, pass2, createNewPracticeCrypto])

  if (!user?.id || !practiceId || checking) {
    return <>{children}</>
  }

  if (unlocked) {
    return <>{children}</>
  }

  return (
    <>
      <div className="pointer-events-none opacity-[0.35]">{children}</div>
      <div
        className={cn(
          "fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
        )}
      >
        <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-white">
            <LockKey className="size-5 text-amber-400" weight="duotone" />
            <h2 className="text-sm font-semibold">
              {needsSetup ? "Protect this practice" : "Unlock encrypted workspace"}
            </h2>
          </div>
          <p className="mb-4 text-[11px] leading-relaxed text-white/45">
            {needsSetup
              ? "Create a passphrase to generate your practice encryption key. You will need it on this device to read patient data. Store it safely — we cannot recover it."
              : "Enter your practice passphrase to decrypt patient records for this session."}
          </p>

          {needsSetup ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
                  Passphrase (min 8 characters)
                </span>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-white/20"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
                  Confirm
                </span>
                <input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-white/20"
                  autoComplete="new-password"
                />
              </label>
              <button
                type="button"
                disabled={busy || pass.length < 8 || pass !== pass2}
                onClick={() => void onCreate()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/90 py-2.5 text-xs font-semibold text-black disabled:opacity-40"
              >
                {busy ? <Spinner className="size-4 animate-spin" /> : null}
                Create practice key
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
                  Passphrase
                </span>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void onUnlock()}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white outline-none focus:border-white/20"
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                disabled={busy || !pass.trim()}
                onClick={() => void onUnlock()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/90 py-2.5 text-xs font-semibold text-black disabled:opacity-40"
              >
                {busy ? <Spinner className="size-4 animate-spin" /> : null}
                Unlock
              </button>
            </div>
          )}

          {error ? <p className="mt-3 text-[11px] text-red-400">{error}</p> : null}
        </div>
      </div>
    </>
  )
}
