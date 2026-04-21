"use client"

import { createClient } from "@/lib/supabase/client"
import { mapPracticeClaimRow } from "./map-practice-claim"
import type { PracticeClaim } from "./types"

/** Loads `practice_claims` for billing UI (member RLS). */
export async function fetchPracticeClaimsForWorkspace(
  practiceId: string
): Promise<PracticeClaim[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data: patHints, error: hErr } = await supabase
    .from("practice_patients")
    .select("id, display_name_hint")
    .eq("practice_id", practiceId)
  if (hErr) console.warn("[fetchPracticeClaims] patient hints", hErr)

  const nameById = new Map<string, string | undefined>()
  for (const r of patHints ?? []) {
    const row = r as { id: string; display_name_hint: string | null }
    const hint = row.display_name_hint?.trim()
    nameById.set(String(row.id), hint || undefined)
  }

  const { data: claimRows, error } = await supabase
    .from("practice_claims")
    .select("*")
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: false })

  if (error) {
    console.warn("[fetchPracticeClaims]", error)
    return []
  }

  return (claimRows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const pid = String(row.patient_id ?? "")
    return mapPracticeClaimRow(row, nameById.get(pid))
  })
}
