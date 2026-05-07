"use client"

import { useWorkspaceStore } from "@/lib/clinical-workspace"
import type { PracticePatient } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Plus, UserCircle } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

export function PatientCombobox({
  patients,
  value,
  onChange,
  placeholder = "Search patient",
  className,
}: {
  patients: PracticePatient[]
  value: string
  onChange: (patientId: string) => void
  placeholder?: string
  className?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const selected = patients.find((p) => p.id === value)
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = q
      ? patients.filter((p) => {
          return (
            p.name.toLowerCase().includes(q) ||
            p.idNumber?.includes(q) ||
            p.memberNumber?.toLowerCase().includes(q) ||
            p.phone?.toLowerCase().includes(q)
          )
        })
      : patients
    return rows.slice(0, 12)
  }, [patients, query])

  const openAddPatient = () => {
    const q = query.trim()
    useWorkspaceStore.getState().openPatientAddModalWithPrefill(
      q
        ? {
            firstName: q.split(/\s+/).slice(0, -1).join(" ") || q,
            lastName: q.split(/\s+/).slice(-1)[0] ?? "",
          }
        : {}
    )
    setOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 dark:border-white/[0.08] dark:bg-black/20">
        <UserCircle className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={open ? query : selected?.name ?? query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery(selected?.name ?? query)
            setOpen(true)
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl dark:border-white/[0.08] dark:bg-[#101010]">
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(p.id)
                setQuery("")
                setOpen(false)
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-muted dark:hover:bg-white/[0.06]"
            >
              <span className="text-[11px] font-medium">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {[p.phone, p.memberNumber, p.medicalAidScheme].filter(Boolean).join(" · ") || "Patient profile"}
              </span>
            </button>
          ))}
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">No patient profiles match.</p>
          ) : null}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openAddPatient}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-left text-[11px] font-semibold text-emerald-400"
          >
            <Plus className="size-3.5" weight="bold" />
            Add patient{query.trim() ? ` "${query.trim()}"` : ""}
          </button>
        </div>
      )}
    </div>
  )
}
