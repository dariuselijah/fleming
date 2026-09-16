"use client"

import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { getEncounterStorageKey } from "@/lib/clinical-workspace/encounter-storage-key"
import { fetchLatestEncounterPlain } from "@/lib/clinical-workspace/fetch-latest-encounter"
import {
  encounterPlainToSessionPartial,
  scribePartialFromPlain,
} from "@/lib/clinical-workspace/encounter-state"
import { isEncounterHydrationSuppressed } from "@/lib/clinical-workspace/encounter-hydrate-suppress"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import type { ScribeSnapshot } from "@/lib/clinical-workspace/types"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * After navigating to a consult chat, load saved transcript + encounter state for that thread.
 */
export function ClinicalEncounterHydrate() {
  const pathname = usePathname()
  const { practiceId, dekKey } = usePracticeCrypto()
  const activePatientId = useWorkspaceStore((s) => s.activePatientId)
  const consultSessionEpoch = useWorkspaceStore((s) => s.consultSessionEpoch)
  const chatIdOnPatient = useWorkspaceStore((s) => {
    const p = s.openPatients.find((x) => x.patientId === s.activePatientId)
    return p?.chatId ?? null
  })

  const appliedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!practiceId || !activePatientId) return
    if (isEncounterHydrationSuppressed()) return

    const routeChatId =
      pathname?.startsWith("/c/") ? pathname.split("/c/")[1]?.split("/")[0] ?? null : null
    if (!routeChatId || chatIdOnPatient !== routeChatId) return

    const st = useWorkspaceStore.getState()
    const patient = st.openPatients.find((p) => p.patientId === activePatientId)
    if (!patient || !isPracticePatientUuid(patient.patientId)) return

    const syncKey = `${patient.patientId}:${routeChatId}:${consultSessionEpoch}`
    if (appliedRef.current === syncKey) return

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const key = dekKey ?? await getEncounterStorageKey(practiceId)
      let row = await fetchLatestEncounterPlain({
        supabase,
        practiceId,
        patientId: patient.patientId,
        chatId: routeChatId,
        dekKey: key,
        strictChatId: true,
      })
      if (!row && routeChatId) {
        row = await fetchLatestEncounterPlain({
          supabase,
          practiceId,
          patientId: patient.patientId,
          chatId: routeChatId,
          dekKey: key,
          strictChatId: false,
        })
      }
      if (cancelled || isEncounterHydrationSuppressed()) return

      if (!row) {
        appliedRef.current = syncKey
        return
      }

      const fromEncounter = encounterPlainToSessionPartial(row.plain)
      const s = scribePartialFromPlain(row.plain)
      const scribeSnap: ScribeSnapshot = {
        transcript: s.transcript,
        segments: s.segments,
        entities: s.entities,
        highlights: s.highlights,
        entityStatus: s.entityStatus,
      }

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
                scribeSnapshot: scribeSnap,
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
    activePatientId,
    chatIdOnPatient,
    consultSessionEpoch,
  ])

  return null
}
