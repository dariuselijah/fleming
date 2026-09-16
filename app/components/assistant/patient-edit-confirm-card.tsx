"use client"

import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Check, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { createClient } from "@/lib/supabase/client"
import { encryptPatientProfile, usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useWorkspace } from "@/lib/clinical-workspace"
import type { PracticePatient } from "@/lib/clinical-workspace"
import { fetchClient } from "@/lib/fetch"
import { requestPatientsRefresh } from "@/lib/clinical-workspace/patients-refresh-bus"

export type ProposedChange = { field: string; newValue: string }

const FIELD_LABEL: Record<string, string> = {
  name: "Full name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  dateOfBirth: "Date of birth",
  idNumber: "ID number",
  medicalAidScheme: "Medical aid scheme",
  memberNumber: "Member number",
  passportNumber: "Passport",
  nationality: "Nationality",
}

function patchFromChanges(changes: ProposedChange[]): Partial<PracticePatient> {
  const patch: Partial<PracticePatient> = {}
  for (const c of changes) {
    switch (c.field) {
      case "name":
        patch.name = c.newValue
        break
      case "phone":
        patch.phone = c.newValue
        break
      case "email":
        patch.email = c.newValue
        break
      case "address":
        patch.address = c.newValue
        break
      case "dateOfBirth":
        patch.dateOfBirth = c.newValue
        break
      case "idNumber":
        patch.idNumber = c.newValue
        break
      case "medicalAidScheme":
        patch.medicalAidScheme = c.newValue
        break
      case "memberNumber":
        patch.memberNumber = c.newValue
        break
      case "passportNumber":
        patch.passportNumber = c.newValue
        break
      case "nationality":
        patch.nationality = c.newValue
        break
      default:
        break
    }
  }
  return patch
}

function oldValueForField(patient: PracticePatient | undefined, field: string): string {
  if (!patient) return "—"
  const v = (patient as unknown as Record<string, unknown>)[field]
  return v != null && String(v).trim() ? String(v) : "—"
}

export function PatientEditConfirmCard({
  patientId,
  changes,
  requireTypedConfirm,
  onDismiss,
}: {
  patientId: string
  changes: ProposedChange[]
  requireTypedConfirm: boolean
  onDismiss: () => void
}) {
  const { patients, updatePatient } = useWorkspace()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const patient = useMemo(() => patients.find((p) => p.id === patientId), [patients, patientId])
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const nameOk =
    !requireTypedConfirm ||
    patient?.name?.trim().toLowerCase() === typed.trim().toLowerCase()

  const apply = async () => {
    if (!patient || !practiceId || !dekKey || !unlocked) {
      setErr(!unlocked ? "Unlock the session to save changes" : "Missing practice context")
      return
    }
    if (!nameOk) {
      setErr("Type the patient's current full name exactly to confirm.")
      return
    }
    setBusy(true)
    setErr(null)
    const patch = patchFromChanges(changes)
    const merged: PracticePatient = { ...patient, ...patch }
    updatePatient(patientId, patch)
    try {
      const supabase = createClient()
      if (!supabase) throw new Error("No client")
      const payload = { ...merged } as Record<string, unknown>
      delete payload.id
      const { ciphertext, iv } = await encryptPatientProfile(dekKey, payload as Record<string, unknown>)
      const { error } = await supabase
        .from("practice_patients")
        .update({
          profile_ciphertext: ciphertext,
          profile_iv: iv,
          display_name_hint: merged.name,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", patientId)
        .eq("practice_id", practiceId)
      if (error) throw error
      await fetchClient("/api/assistant/confirm-patient-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, changes }),
      }).catch(() => {})
      requestPatientsRefresh()
      onDismiss()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("overflow-hidden rounded-2xl", panelSurface)}
    >
      <div className="flex items-center justify-between border-b border-panel-border px-3 py-2">
        <span className="text-[11px] font-medium text-status-warning-foreground dark:text-status-warning">Confirm patient updates</span>
        <button type="button" onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="max-h-[220px] space-y-2 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "none" }}>
        {changes.map((c, i) => (
          <div
            key={`${c.field}-${i}`}
            className="rounded-xl border border-panel-border bg-panel-muted px-2.5 py-2 text-[11px]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {FIELD_LABEL[c.field] ?? c.field}
            </p>
            <p className="mt-1 line-through decoration-muted-foreground/30 text-muted-foreground">{oldValueForField(patient, c.field)}</p>
            <p className="mt-0.5 font-medium text-status-success-foreground dark:text-status-success">{c.newValue}</p>
          </div>
        ))}
      </div>
      {requireTypedConfirm ? (
        <div className="px-3 pb-2">
          <label className="text-[10px] text-muted-foreground">Type the patient&apos;s current full name to confirm</label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={cn(
              "mt-1 w-full rounded-xl border bg-background px-3 py-2 text-[12px] text-foreground",
              nameOk && typed ? "border-status-success/30" : "border-input"
            )}
            placeholder={patient?.name ?? ""}
          />
        </div>
      ) : null}
      {err ? <p className="px-3 pb-1 text-[11px] text-status-danger-foreground dark:text-status-danger">{err}</p> : null}
      <div className="flex gap-2 border-t border-panel-border px-3 py-2">
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 rounded-full border border-border py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !nameOk}
          onClick={() => void apply()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Check className="size-3.5" weight="bold" />
          {busy ? "Saving…" : "Apply"}
        </button>
      </div>
    </motion.div>
  )
}
