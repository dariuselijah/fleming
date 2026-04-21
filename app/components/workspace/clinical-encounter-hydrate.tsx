"use client"

import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchLatestEncounterPlain } from "@/lib/clinical-workspace/fetch-latest-encounter"
import {
  encounterPlainToSessionPartial,
  scribePartialFromPlain,
} from "@/lib/clinical-workspace/encounter-state"
import { isEncounterHydrationSuppressed } from "@/lib/clinical-workspace/encounter-hydrate-suppress"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * After navigating to a consult chat, load saved transcript + extraction when the
 * client session is still empty (paths like check-in don't run the directory loader).
 */
export function ClinicalEncounterHydrate() {
  const pathname = usePathname()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const activePatientId = useWorkspaceStore((s) => s.activePatientId)
  const chatIdOnPatient = useWorkspaceStore((s) => {
    const p = s.openPatients.find((x) => x.patientId === s.activePatientId)
    return p?.chatId ?? null
  })
  const transcriptEmpty = useWorkspaceStore((s) => s.scribeTranscript.trim().length === 0)

  const appliedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!practiceId || !dekKey || !unlocked || !activePatientId || !transcriptEmpty) return
    if (isEncounterHydrationSuppressed()) return

    const routeChatId =
      pathname?.startsWith("/c/") ? pathname.split("/c/")[1]?.split("/")[0] ?? null : null
    if (!routeChatId || chatIdOnPatient !== routeChatId) return

    const st = useWorkspaceStore.getState()
    const patient = st.openPatients.find((p) => p.patientId === activePatientId)
    if (!patient || !isPracticePatientUuid(patient.patientId)) return

    const syncKey = `${patient.patientId}:${routeChatId}`
    if (appliedRef.current === syncKey) return

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const row = await fetchLatestEncounterPlain({
        supabase,
        practiceId,
        patientId: patient.patientId,
        chatId: routeChatId,
        dekKey,
      })
      if (cancelled || !row) return
      if (isEncounterHydrationSuppressed()) return

      const hasRemote =
        row.plain.scribeTranscript?.trim().length ||
        Object.values(row.plain.scribeEntities ?? {}).some(
          (a) => Array.isArray(a) && a.length > 0
        ) ||
        (row.plain.blocks?.length ?? 0) > 0

      if (!hasRemote) {
        useWorkspaceStore.getState().setPatientClinicalEncounterId(patient.patientId, row.encounterId)
        appliedRef.current = syncKey
        return
      }

      const fromEncounter = encounterPlainToSessionPartial(row.plain)
      const s = scribePartialFromPlain(row.plain)

      useWorkspaceStore.setState({
        scribeTranscript: s.transcript,
        scribeSegments: s.segments,
        scribeEntities: s.entities,
        scribeHighlights: s.highlights,
        scribeEntityStatus: s.entityStatus,
        openPatients: useWorkspaceStore.getState().openPatients.map((op) =>
          op.patientId === patient.patientId
            ? {
                ...op,
                ...fromEncounter,
                clinicalEncounterId: row.encounterId,
                chatId: routeChatId,
              }
            : op
        ),
      })
      appliedRef.current = syncKey
    })()

    return () => {
      cancelled = true
    }
  }, [
    pathname,
    practiceId,
    dekKey,
    unlocked,
    activePatientId,
    chatIdOnPatient,
    transcriptEmpty,
  ])

  return null
}
