"use client"

import { useCallback, useState } from "react"
import type { EligibilityResponse, FamilyEligibilityResponse, MedikreditPatientPayload } from "@/lib/medikredit/types"

export function useEligibilityCheck(opts: { practiceId: string | null | undefined }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runEligibility = useCallback(
    async (patient: MedikreditPatientPayload, persist = true): Promise<EligibilityResponse | null> => {
      if (!opts.practiceId) {
        setError("No practice selected")
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/clinical/medikredit/eligibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId: opts.practiceId, patient, persist }),
        })
        const data = (await res.json()) as { error?: string; result?: EligibilityResponse }
        if (!res.ok) {
          setError(data.error ?? res.statusText)
          return null
        }
        return data.result ?? null
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed")
        return null
      } finally {
        setLoading(false)
      }
    },
    [opts.practiceId]
  )

  const runFamily = useCallback(
    async (
      patient: MedikreditPatientPayload,
      dependents?: MedikreditPatientPayload[],
      persist = true
    ): Promise<FamilyEligibilityResponse | null> => {
      if (!opts.practiceId) {
        setError("No practice selected")
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/clinical/medikredit/family", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId: opts.practiceId, patient, dependents, persist }),
        })
        const data = (await res.json()) as { error?: string; result?: FamilyEligibilityResponse }
        if (!res.ok) {
          setError(data.error ?? res.statusText)
          return null
        }
        return data.result ?? null
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed")
        return null
      } finally {
        setLoading(false)
      }
    },
    [opts.practiceId]
  )

  return { loading, error, setError, runEligibility, runFamily }
}
