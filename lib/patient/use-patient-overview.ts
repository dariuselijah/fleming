"use client"

import { useEffect, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchClient } from "@/lib/fetch"
import { createClient } from "@/lib/supabase/client"
import type {
  PatientAiRollupResponse,
  PatientAiSummaryResponse,
  PatientOverviewResponse,
} from "./patient-overview-types"

export const patientOverviewQueryKey = (patientId: string) => ["patient-overview", patientId] as const
export const patientAiSummaryQueryKey = (patientId: string) => ["patient-ai-summary", patientId] as const
export const patientAiRollupQueryKey = (patientId: string, latestSummaryAt: string | null, modelId = "default") =>
  ["patient-ai-rollup", patientId, latestSummaryAt, modelId] as const

async function fetchPatientOverview(patientId: string): Promise<PatientOverviewResponse> {
  const res = await fetchClient(`/api/patients/${patientId}/overview`)
  const body = (await res.json().catch(() => ({}))) as PatientOverviewResponse | { error?: string }
  if (!res.ok || !("ok" in body) || !body.ok) {
    const msg = "error" in body && typeof body.error === "string" && body.error.trim() ? body.error : "Unable to load overview"
    throw new Error(msg)
  }
  return body
}

async function fetchPatientAiSummary(patientId: string): Promise<PatientAiSummaryResponse> {
  const res = await fetchClient(`/api/patients/${patientId}/ai-summary`)
  const body = (await res.json().catch(() => ({}))) as PatientAiSummaryResponse | { error?: string }
  if (!res.ok || !("ok" in body) || !body.ok) {
    const msg = "error" in body && typeof body.error === "string" && body.error.trim() ? body.error : "Unable to load AI summary"
    throw new Error(msg)
  }
  return body
}

async function fetchPatientAiRollup(patientId: string, force = false): Promise<PatientAiRollupResponse> {
  const res = await fetchClient(`/api/patients/${patientId}/ai-rollup`, {
    method: "POST",
    body: JSON.stringify({ force }),
  })
  const body = (await res.json().catch(() => ({}))) as PatientAiRollupResponse | { error?: string }
  if (!res.ok || !("ok" in body) || !body.ok) {
    const msg = "error" in body && typeof body.error === "string" && body.error.trim() ? body.error : "Unable to load AI rollup"
    throw new Error(msg)
  }
  return body
}

export function usePatientOverview(patientId: string | null) {
  return useQuery({
    queryKey: patientId ? patientOverviewQueryKey(patientId) : ["patient-overview", "none"],
    queryFn: () => fetchPatientOverview(patientId!),
    enabled: Boolean(patientId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })
}

/** Universal cached patient AI summary — prefetch on patient open for instant hover. */
export function usePatientAiSummary(patientId: string | null) {
  return useQuery({
    queryKey: patientId ? patientAiSummaryQueryKey(patientId) : ["patient-ai-summary", "none"],
    queryFn: () => fetchPatientAiSummary(patientId!),
    enabled: Boolean(patientId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })
}

export function usePrefetchPatientAiSummary() {
  const queryClient = useQueryClient()
  return (patientId: string) => {
    void queryClient.prefetchQuery({
      queryKey: patientAiSummaryQueryKey(patientId),
      queryFn: () => fetchPatientAiSummary(patientId),
      staleTime: 5 * 60_000,
    })
  }
}

/** @deprecated Prefer usePatientAiSummary */
export function usePatientAiRollup(patientId: string | null, latestSummaryAt: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: patientId ? patientAiRollupQueryKey(patientId, latestSummaryAt ?? null) : ["patient-ai-rollup", "none"],
    queryFn: () => fetchPatientAiRollup(patientId!, false),
    enabled: Boolean(patientId && latestSummaryAt && enabled),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })
}

export function useRegeneratePatientAiRollup(patientId: string | null, latestSummaryAt: string | null | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => fetchPatientAiRollup(patientId!, true),
    onSuccess: (data) => {
      if (!patientId) return
      queryClient.setQueryData(patientAiRollupQueryKey(patientId, data.latestSummaryAt ?? latestSummaryAt ?? null), data)
      void queryClient.invalidateQueries({ queryKey: patientAiSummaryQueryKey(patientId) })
    },
  })
}

export function usePatientOverviewInvalidation(patientId: string | null, overview?: PatientOverviewResponse | null) {
  const queryClient = useQueryClient()
  const timerRef = useRef<number | null>(null)

  const invalidate = useMemo(
    () => () => {
      if (!patientId) return
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: patientOverviewQueryKey(patientId) })
        void queryClient.invalidateQueries({ queryKey: patientAiSummaryQueryKey(patientId) })
        timerRef.current = null
      }, 350)
    },
    [patientId, queryClient]
  )

  useEffect(() => {
    if (!patientId) return
    const handler = (ev: Event) => {
      const id = (ev as CustomEvent<{ patientId?: string }>).detail?.patientId
      if (id === patientId) invalidate()
    }
    window.addEventListener("fleming:patient-overview-reload", handler)
    return () => window.removeEventListener("fleming:patient-overview-reload", handler)
  }, [invalidate, patientId])

  useEffect(() => {
    if (!patientId) return
    const needsSummaryPoll =
      overview != null &&
      !(overview.summaryCount > 0 && overview.appointments.every((a) => !a.linked_consult_id || a.encounter_summary))
    if (!needsSummaryPoll) return
    const t = window.setInterval(invalidate, 10_000)
    return () => window.clearInterval(t)
  }, [invalidate, overview, patientId])

  useEffect(() => {
    if (!patientId) return
    const supabase = createClient()
    if (!supabase) return
    const ch = supabase.channel(`patient-overview-${patientId}`)
    const onReload = () => invalidate()
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "practice_encounter_summaries", filter: `patient_id=eq.${patientId}` },
      onReload
    )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_ai_rollups", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_attachments", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_chart_facts", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_notes", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "practice_appointments", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "practice_claims", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "practice_invoices", filter: `patient_id=eq.${patientId}` },
        onReload
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [invalidate, patientId])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])
}
