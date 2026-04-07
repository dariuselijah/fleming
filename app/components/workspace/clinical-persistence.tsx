"use client"

import { fetchClient } from "@/lib/fetch"
import { encryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { buildRagChunksFromEncounterState } from "@/lib/clinical-workspace/clinical-chunks"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { serializeEncounterState } from "@/lib/clinical-workspace/encounter-state"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { useUser } from "@/lib/user-store/provider"
import { useEffect, useRef } from "react"

const DEBOUNCE_MS = 1400

/**
 * Debounced encrypted upsert of the active clinical encounter + optional RAG reindex.
 */
export function ClinicalPersistence() {
  const { user } = useUser()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const practiceIdRef = useRef(practiceId)
  const dekKeyRef = useRef(dekKey)
  const unlockedRef = useRef(unlocked)
  const userIdRef = useRef(user?.id)
  practiceIdRef.current = practiceId
  dekKeyRef.current = dekKey
  unlockedRef.current = unlocked
  userIdRef.current = user?.id

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      const pid = practiceIdRef.current
      const key = dekKeyRef.current
      const uid = userIdRef.current
      if (!pid || !key || !unlockedRef.current || !uid) return

      const state = useWorkspaceStore.getState()
      const activeId = state.activePatientId
      if (!activeId) return
      const patient = state.openPatients.find((p) => p.patientId === activeId)
      if (!patient || !isPracticePatientUuid(patient.patientId)) return

      const supabase = createClient()
      if (!supabase) return
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const plain = serializeEncounterState(patient, {
        transcript: state.scribeTranscript,
        segments: state.scribeSegments,
        entities: state.scribeEntities,
        highlights: state.scribeHighlights,
        entityStatus: state.scribeEntityStatus,
      })

      let encId = patient.clinicalEncounterId
      try {
        const { ciphertext, iv } = await encryptJson(key, plain)
        if (!encId) {
          const { data: row, error } = await supabase
            .from("clinical_encounters")
            .insert({
              practice_id: pid,
              patient_id: patient.patientId,
              provider_user_id: auth.user.id,
              status: "in_progress",
              state_ciphertext: ciphertext,
              state_iv: iv,
              state_version: 1,
              chat_id: patient.chatId ?? null,
            })
            .select("id")
            .single()
          if (error) {
            console.warn("[ClinicalPersistence] encounter insert", error)
            return
          }
          if (row?.id) {
            encId = row.id as string
            useWorkspaceStore.getState().setPatientClinicalEncounterId(patient.patientId, encId)
          }
        } else {
          const { error } = await supabase
            .from("clinical_encounters")
            .update({
              state_ciphertext: ciphertext,
              state_iv: iv,
              updated_at: new Date().toISOString(),
              chat_id: patient.chatId ?? null,
            })
            .eq("id", encId)
          if (error) console.warn("[ClinicalPersistence] encounter update", error)
        }

        if (encId) {
          const chunks = buildRagChunksFromEncounterState(plain)
          if (chunks.length > 0) {
            void fetchClient("/api/clinical/rag/index-encounter", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                encounterId: encId,
                practiceId: pid,
                patientId: patient.patientId,
                chunks,
              }),
            })
          }
        }
      } catch (e) {
        console.warn("[ClinicalPersistence]", e)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void run(), DEBOUNCE_MS)
    }

    const unsub = useWorkspaceStore.subscribe(schedule)
    return () => {
      unsub()
      if (timer) clearTimeout(timer)
    }
  }, [])

  return null
}
