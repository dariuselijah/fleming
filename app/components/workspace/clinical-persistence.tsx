"use client"

import { fetchClient } from "@/lib/fetch"
import { encryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { getEncounterStorageKey } from "@/lib/clinical-workspace/encounter-storage-key"
import { buildRagChunksFromEncounterState } from "@/lib/clinical-workspace/clinical-chunks"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { serializeEncounterState } from "@/lib/clinical-workspace/encounter-state"
import { buildEncounterSummarySourceText } from "@/lib/clinical/encounter-summary-source"
import { registerEncounterPersistenceFlush } from "@/lib/clinical-workspace/encounter-persist-bridge"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { useUser } from "@/lib/user-store/provider"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

const DEBOUNCE_MS = 700

function plainsEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Debounced encrypted upsert of the active clinical encounter + optional RAG reindex.
 */
export function ClinicalPersistence() {
  const { user } = useUser()
  const { practiceId, dekKey } = usePracticeCrypto()
  const practiceIdRef = useRef(practiceId)
  const dekKeyRef = useRef(dekKey)
  const userIdRef = useRef(user?.id)
  practiceIdRef.current = practiceId
  dekKeyRef.current = dekKey
  userIdRef.current = user?.id

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let chain: Promise<void> = Promise.resolve()

    const enqueue = (fn: () => Promise<void>): Promise<void> => {
      const runPromise = chain.then(() => fn())
      chain = runPromise.catch((e) => {
        console.warn("[ClinicalPersistence]", e)
      })
      return runPromise
    }

    const run = async () => {
      const pid = practiceIdRef.current
      const key = dekKeyRef.current ?? (pid ? await getEncounterStorageKey(pid) : null)
      const uid = userIdRef.current
      if (!pid || !key || !uid) return

      const supabase = createClient()
      if (!supabase) return
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return

      const activeId = useWorkspaceStore.getState().activePatientId
      if (!activeId) return
      const patientPre = useWorkspaceStore.getState().openPatients.find((p) => p.patientId === activeId)
      if (!patientPre || !isPracticePatientUuid(patientPre.patientId)) return
      const snapshotChatId = patientPre.chatId ?? null

      const stForPlain = useWorkspaceStore.getState()
      const patient = stForPlain.openPatients.find((p) => p.patientId === activeId)
      if (!patient) return

      let plain = serializeEncounterState(patient, {
        transcript: stForPlain.scribeTranscript,
        segments: stForPlain.scribeSegments,
        entities: stForPlain.scribeEntities,
        highlights: stForPlain.scribeHighlights,
        entityStatus: stForPlain.scribeEntityStatus,
      })

      let ciphertext: string
      let iv: string
      try {
        const enc = await encryptJson(key, plain)
        ciphertext = enc.ciphertext
        iv = enc.iv
      } catch (e) {
        console.warn("[ClinicalPersistence] encrypt", e)
        toast.error("Could not encrypt clinical encounter", {
          description: e instanceof Error ? e.message : String(e),
        })
        throw e
      }

      const stAfterEnc = useWorkspaceStore.getState()
      const pChat = stAfterEnc.openPatients.find((p) => p.patientId === activeId)
      if (!pChat || (pChat.chatId ?? null) !== snapshotChatId) {
        console.warn("[ClinicalPersistence] Skipped write: consult chat changed mid-save")
        return
      }

      const plainLatest = serializeEncounterState(
        pChat,
        {
          transcript: stAfterEnc.scribeTranscript,
          segments: stAfterEnc.scribeSegments,
          entities: stAfterEnc.scribeEntities,
          highlights: stAfterEnc.scribeHighlights,
          entityStatus: stAfterEnc.scribeEntityStatus,
        }
      )
      if (!plainsEqual(plain, plainLatest)) {
        plain = plainLatest
        const enc2 = await encryptJson(key, plain)
        ciphertext = enc2.ciphertext
        iv = enc2.iv

        const st3 = useWorkspaceStore.getState()
        const p3 = st3.openPatients.find((p) => p.patientId === activeId)
        if (!p3 || (p3.chatId ?? null) !== snapshotChatId) {
          console.warn("[ClinicalPersistence] Skipped write after re-encrypt: consult chat changed")
          return
        }
      }

      const stWrite = useWorkspaceStore.getState()
      const pWrite =
        stWrite.openPatients.find((p) => p.patientId === activeId) ?? pChat
      const encStatus = pWrite.consultSigned ? "signed" : "in_progress"
      const endedAt = pWrite.consultSigned ? new Date().toISOString() : null

      let encId = pWrite.clinicalEncounterId
      try {
        if (!encId) {
          const { data: row, error } = await supabase
            .from("clinical_encounters")
            .insert({
              practice_id: pid,
              patient_id: pWrite.patientId,
              provider_user_id: auth.user.id,
              status: encStatus,
              started_at: new Date().toISOString(),
              ended_at: endedAt,
              state_ciphertext: ciphertext,
              state_iv: iv,
              state_version: 1,
              encounter_version: pWrite.encounterVersion ?? 1,
              amendment_of_encounter_id: pWrite.amendmentOfEncounterId ?? null,
              amendment_reason: pWrite.amendmentReason ?? null,
              signed_by_user_id: pWrite.signatureAttestation?.signerUserId ?? null,
              signed_at: pWrite.signatureAttestation?.signedAt ?? null,
              signature_version: pWrite.signatureAttestation?.version ?? null,
              chat_id: pWrite.chatId ?? null,
              appointment_id: pWrite.appointmentId ?? null,
            })
            .select("id")
            .single()
          if (error) {
            console.warn("[ClinicalPersistence] encounter insert", error)
            const msg = error.message
            toast.error("Could not save clinical encounter", {
              description: msg,
            })
            throw new Error(msg)
          }
          if (row?.id) {
            encId = row.id as string
            useWorkspaceStore.getState().setPatientClinicalEncounterId(pWrite.patientId, encId)
          }
        } else {
          let updateQuery = supabase
            .from("clinical_encounters")
            .update({
              state_ciphertext: ciphertext,
              state_iv: iv,
              updated_at: new Date().toISOString(),
              status: encStatus,
              ended_at: endedAt,
              encounter_version: pWrite.encounterVersion ?? 1,
              amendment_of_encounter_id: pWrite.amendmentOfEncounterId ?? null,
              amendment_reason: pWrite.amendmentReason ?? null,
              signed_by_user_id: pWrite.signatureAttestation?.signerUserId ?? null,
              signed_at: pWrite.signatureAttestation?.signedAt ?? null,
              signature_version: pWrite.signatureAttestation?.version ?? null,
              chat_id: pWrite.chatId ?? null,
              appointment_id: pWrite.appointmentId ?? null,
            })
            .eq("id", encId)
          // The first signing write seals the encrypted clinical payload. Later
          // billing/UI state changes must not rewrite the signed record.
          if (pWrite.consultSigned) updateQuery = updateQuery.is("signed_at", null)
          const { error } = await updateQuery
          if (error) {
            console.warn("[ClinicalPersistence] encounter update", error)
            const msg = error.message
            toast.error("Could not update clinical encounter", {
              description: msg,
            })
            throw new Error(msg)
          }
        }

        if (encId && pWrite.appointmentId) {
          void supabase
            .from("practice_appointments")
            .update({
              linked_consult_id: encId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", pWrite.appointmentId)
            .eq("practice_id", pid)
            .eq("patient_id", pWrite.patientId)
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
                patientId: pWrite.patientId,
                chunks,
              }),
            })
          }
          if (pWrite.consultSigned) {
            const sourceText = buildEncounterSummarySourceText(plain)
            try {
              const res = await fetchClient("/api/clinical/encounter-summary", {
                method: "POST",
                body: JSON.stringify({
                  encounterId: encId,
                  patientId: pWrite.patientId,
                  appointmentId: pWrite.appointmentId ?? undefined,
                  sourceText,
                }),
              })
              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string }
                toast.error("Visit summary could not be saved", {
                  description: body.error ?? res.statusText,
                })
              } else {
                window.dispatchEvent(
                  new CustomEvent("fleming:patient-overview-reload", {
                    detail: { patientId: pWrite.patientId },
                  })
                )
              }
            } catch (e) {
                toast.error("Visit summary request failed", {
                  description: e instanceof Error ? e.message : String(e),
                })
              }
          }
        }
      } catch (e) {
        console.warn("[ClinicalPersistence]", e)
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void enqueue(run)
      }, DEBOUNCE_MS)
    }

    const flushNow = () => {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      return enqueue(run)
    }

    const unsub = useWorkspaceStore.subscribe(schedule)
    const unreg = registerEncounterPersistenceFlush(flushNow)

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushNow()
    }
    const onPageHide = () => void flushNow()
    const onBeforeUnload = () => void flushNow()

    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("beforeunload", onBeforeUnload)

    return () => {
      unsub()
      unreg()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("beforeunload", onBeforeUnload)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return null
}
