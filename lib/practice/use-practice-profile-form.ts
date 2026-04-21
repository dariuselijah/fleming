"use client"

import { decryptJson, encryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useCallback, useEffect, useState } from "react"

export type PracticeBillingExtras = {
  practiceNoBhf?: string
  timezone?: string
  hl7Endpoint?: string
  /** Street / suite — shown to patients and on correspondence */
  physicalAddress?: string
}

export function usePracticeProfileForm() {
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const { updatePreferences } = useUserPreferences()
  const [practiceName, setPracticeName] = useState("")
  const [providerName, setProviderName] = useState("")
  const [bhf, setBhf] = useState("")
  const [timezone, setTimezone] = useState("Africa/Johannesburg")
  const [hl7Endpoint, setHl7Endpoint] = useState("")
  const [physicalAddress, setPhysicalAddress] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId || !dekKey || !unlocked) return
    const sb = createClient()
    if (!sb) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const { data: pr, error: e1 } = await sb.from("practices").select("name").eq("id", practiceId).maybeSingle()
        if (e1) throw e1
        const { data: bill, error: e2 } = await sb
          .from("practice_billing_settings")
          .select("provider_name, billing_ciphertext, billing_iv")
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (e2) throw e2
        if (cancelled) return
        if (pr?.name) setPracticeName(String(pr.name))
        if (bill?.provider_name) setProviderName(String(bill.provider_name))
        if (bill?.billing_ciphertext && bill?.billing_iv) {
          try {
            const extra = await decryptJson<PracticeBillingExtras>(
              dekKey,
              String(bill.billing_ciphertext),
              String(bill.billing_iv)
            )
            setBhf(extra.practiceNoBhf ?? "")
            setTimezone(extra.timezone ?? "Africa/Johannesburg")
            setHl7Endpoint(extra.hl7Endpoint ?? "")
            setPhysicalAddress(extra.physicalAddress ?? "")
          } catch {
            /* first load or legacy row */
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load settings")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId, dekKey, unlocked])

  const save = useCallback(async () => {
    if (!practiceId || !dekKey) return
    const sb = createClient()
    if (!sb) return
    setSaving(true)
    try {
      const extras: PracticeBillingExtras = {
        practiceNoBhf: bhf || undefined,
        timezone: timezone || undefined,
        hl7Endpoint: hl7Endpoint || undefined,
        physicalAddress: physicalAddress || undefined,
      }
      const { ciphertext, iv } = await encryptJson(dekKey, extras)
      const { error: e1 } = await sb.from("practices").update({ name: practiceName }).eq("id", practiceId)
      if (e1) throw e1
      const { error: e2 } = await sb.from("practice_billing_settings").upsert(
        {
          practice_id: practiceId,
          provider_name: providerName || practiceName || "Practice",
          billing_ciphertext: ciphertext,
          billing_iv: iv,
          billing_version: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "practice_id" }
      )
      if (e2) throw e2
      const nameOk = practiceName.trim().length > 2
      const bhfOk = bhf.trim().length > 2
      if (nameOk && bhfOk) {
        try {
          await updatePreferences({ practiceProfileCompleted: true })
        } catch (prefErr) {
          console.warn("[usePracticeProfileForm] practice profile preference", prefErr)
        }
      }
    } catch (e) {
      console.warn("[usePracticeProfileForm] save", e)
    } finally {
      setSaving(false)
    }
  }, [bhf, dekKey, hl7Endpoint, physicalAddress, practiceId, practiceName, providerName, timezone, updatePreferences])

  return {
    practiceId,
    unlocked,
    practiceName,
    setPracticeName,
    providerName,
    setProviderName,
    bhf,
    setBhf,
    timezone,
    setTimezone,
    hl7Endpoint,
    setHl7Endpoint,
    physicalAddress,
    setPhysicalAddress,
    loading,
    saving,
    loadError,
    save,
  }
}
