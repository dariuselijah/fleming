"use client"

import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import type { PracticePatient } from "@/lib/clinical-workspace"
import { encryptPatientProfile, usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { isPracticePatientProfileIncomplete } from "@/lib/clinical/smart-import-patient"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

type FormState = {
  firstName: string
  lastName: string
  phone: string
  email: string
  idNumber: string
}

export function AddPatientModalHost() {
  const nonce = useWorkspaceStore((s) => s.patientAddModalOpenNonce)
  const prefill = useWorkspaceStore((s) => s.patientAddModalPrefill)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (nonce > 0) setOpen(true)
  }, [nonce])

  return (
    <AnimatePresence>
      {open ? <AddPatientModal prefill={prefill ?? {}} onClose={() => setOpen(false)} /> : null}
    </AnimatePresence>
  )
}

export function AddPatientModal({
  prefill,
  onClose,
}: {
  prefill: Partial<FormState>
  onClose: () => void
}) {
  const { user } = useUser()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const { addPatient, patients } = useWorkspace()
  const clearPrefill = useWorkspaceStore((s) => s.clearPatientAddModalPrefill)
  const initial = useMemo<FormState>(() => ({
    firstName: prefill.firstName ?? "",
    lastName: prefill.lastName ?? "",
    phone: prefill.phone ?? "+27",
    email: prefill.email ?? "",
    idNumber: prefill.idNumber ?? "",
  }), [prefill])
  const [form, setForm] = useState<FormState>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    clearPrefill()
    onClose()
  }

  const create = async () => {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
    if (!name) {
      setError("Enter the patient name.")
      return
    }
    if (form.idNumber.trim() && patients.some((p) => p.idNumber === form.idNumber.trim())) {
      setError("A patient with this ID number already exists.")
      return
    }

    const draft: Omit<PracticePatient, "id"> = {
      name,
      idNumber: form.idNumber.trim() || undefined,
      phone: form.phone.trim() && form.phone.trim() !== "+27" ? form.phone.trim() : undefined,
      email: form.email.trim() || undefined,
      medicalAidStatus: "unknown",
      outstandingBalance: 0,
      registeredAt: new Date().toISOString().slice(0, 10),
      profileIncomplete: isPracticePatientProfileIncomplete({
        phone: form.phone,
        email: form.email,
        address: undefined,
      }),
    }

    setBusy(true)
    setError(null)
    try {
      let id = crypto.randomUUID()
      const supabase = createClient()
      if (practiceId && dekKey && unlocked && user?.id && supabase) {
        const { ciphertext, iv } = await encryptPatientProfile(dekKey, draft as Record<string, unknown>)
        const { data, error: insertError } = await supabase
          .from("practice_patients")
          .insert({
            practice_id: practiceId,
            profile_ciphertext: ciphertext,
            profile_iv: iv,
            display_name_hint: draft.name,
            created_by: user.id,
          })
          .select("id")
          .single()
        if (insertError) throw insertError
        if (data?.id) id = String(data.id)
      }
      addPatient({ ...draft, id })
      toast.success("Patient profile created")
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create patient")
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0b0b0b] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Add patient profile</h2>
            <p className="mt-1 text-[11px] text-white/40">Create the profile first so checkout, claims, PDFs and portal links stay connected.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-1 text-white/40 hover:bg-white/[0.06] hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        {error ? <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="First name" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
          <Field label="Last name" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <div className="sm:col-span-2">
            <Field label="SA ID number" value={form.idNumber} onChange={(v) => setForm((f) => ({ ...f, idNumber: v.replace(/\D/g, "").slice(0, 13) }))} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-xl bg-white/[0.06] px-4 py-2 text-[11px] font-semibold text-white/60">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void create()} className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-300 disabled:opacity-50">
            Create patient
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-emerald-400/40"
      />
    </label>
  )
}
