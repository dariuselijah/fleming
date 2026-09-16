"use client"

import { decryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { createPatientSession, useWorkspaceStore } from "./workspace-store"
import type { ConsultStatus, PracticePatient } from "./types"
import { encounterPlainToSessionPartial, scribePartialFromPlain } from "./encounter-state"
import type { EncounterStatePlain } from "./encounter-state"

function sessionFromPracticePatient(
  p: PracticePatient,
  overrides?: { clinicalEncounterId?: string; status?: ConsultStatus }
) {
  return createPatientSession({
    patientId: p.id,
    name: p.name,
    age: p.age,
    sex: p.sex,
    clinicalEncounterId: overrides?.clinicalEncounterId,
    status: overrides?.status ?? "waiting",
    medicalAidStatus:
      p.medicalAidStatus === "verified"
        ? "active"
        : p.medicalAidStatus === "terminated"
          ? "inactive"
          : p.medicalAidStatus,
    medicalAidScheme: p.medicalAidScheme,
    memberNumber: p.memberNumber,
    chronicConditions: p.chronicConditions ?? [],
    criticalAllergies: p.allergies ?? [],
    activeMedications: p.currentMedications ?? [],
  })
}

/** Open a patient chart from admin / Front Desk with full profile hydration. */
export async function openPatientFromAdmin(opts: {
  patientId: string
  patientName?: string
  clinicalEncounterId?: string
  practiceId?: string | null
  dekKey?: CryptoKey | null
  status?: ConsultStatus
}): Promise<boolean> {
  const store = useWorkspaceStore.getState()
  const patients = store.patients
  let patient = patients.find((p) => p.id === opts.patientId)

  if (!patient && opts.patientName) {
    patient = {
      id: opts.patientId,
      name: opts.patientName,
      medicalAidStatus: "unknown",
      outstandingBalance: 0,
      registeredAt: new Date().toISOString(),
    }
  }

  if (!patient) {
    toast.error("Patient not found in directory")
    return false
  }

  if (opts.clinicalEncounterId && opts.practiceId && opts.dekKey) {
    const supabase = createClient()
    if (!supabase) {
      toast.error("Could not connect to load encounter")
      return false
    }
    const { data, error } = await supabase
      .from("clinical_encounters")
      .select("id, state_ciphertext, state_iv")
      .eq("id", opts.clinicalEncounterId)
      .eq("practice_id", opts.practiceId)
      .eq("patient_id", patient.id)
      .maybeSingle()

    if (error || !data?.state_ciphertext || !data.state_iv) {
      toast.error("Could not load clinical encounter")
      return false
    }

    try {
      const plain = await decryptJson<EncounterStatePlain>(
        opts.dekKey,
        String(data.state_ciphertext),
        String(data.state_iv)
      )
      if (!plain || plain.v !== 1) throw new Error("Invalid state")
      const fromEncounter = encounterPlainToSessionPartial(plain)
      const session = sessionFromPracticePatient(patient, {
        clinicalEncounterId: data.id as string,
        status: opts.status,
      })
      Object.assign(session, fromEncounter)
      store.openPatient(session)
      const s = scribePartialFromPlain(plain)
      useWorkspaceStore.setState({
        scribeTranscript: s.transcript,
        scribeSegments: s.segments,
        scribeEntities: s.entities,
        scribeHighlights: s.highlights,
        scribeEntityStatus: s.entityStatus,
      })
      store.setMode("clinical")
      return true
    } catch {
      toast.error("Could not decrypt clinical session")
      return false
    }
  }

  store.openPatient(sessionFromPracticePatient(patient, { status: opts.status }))
  store.setMode("clinical")
  return true
}
