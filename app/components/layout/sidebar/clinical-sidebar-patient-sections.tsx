"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { searchChronicConditionCatalog } from "@/lib/clinical-workspace/chronic-condition-catalog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Heartbeat,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  X,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"

function SidebarSearchPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  query,
  onQueryChange,
  placeholder,
  onSearchKeyDown,
  accent,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  query: string
  onQueryChange: (q: string) => void
  placeholder: string
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  accent: "amber" | "sky"
  children: React.ReactNode
}) {
  const focusRing =
    accent === "amber"
      ? "focus:border-amber-400/40 focus:ring-amber-400/25"
      : "focus:border-sky-400/40 focus:ring-sky-400/25"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 border border-white/10 bg-zinc-950/98 p-0 text-white shadow-2xl backdrop-blur-xl sm:max-w-lg"
        )}
        hasCloseButton
      >
        <DialogHeader className="border-b border-white/[0.07] px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold tracking-tight text-white">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-xs leading-relaxed text-white/45">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="px-5 pb-5 pt-4">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={placeholder}
              className={cn(
                "w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-10 pr-3 text-sm text-white outline-none ring-0 placeholder:text-white/35 focus:ring-1",
                focusRing
              )}
            />
          </div>
          <div
            className="mt-3 max-h-[min(52vh,24rem)] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/35 p-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ClinicalSidebarChronicSection() {
  const {
    activePatient,
    addPatientChronicCondition,
    removePatientChronicCondition,
    renamePatientChronicCondition,
  } = useWorkspace()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const pid = activePatient?.patientId
  const conditions = activePatient?.chronicConditions ?? []

  const suggestions = useMemo(
    () => searchChronicConditionCatalog(query, 24),
    [query]
  )

  const addCondition = useCallback(
    (label: string) => {
      if (!pid) return
      const t = label.trim()
      if (!t) return
      addPatientChronicCondition(pid, t)
      setQuery("")
      setPickerOpen(false)
    },
    [addPatientChronicCondition, pid]
  )

  const startEdit = useCallback((c: string) => {
    setEditing(c)
    setEditValue(c)
  }, [])

  const commitEdit = useCallback(() => {
    if (!pid || !editing) return
    const next = editValue.trim()
    if (next && next !== editing) {
      renamePatientChronicCondition(pid, editing, next)
    }
    setEditing(null)
    setEditValue("")
  }, [editValue, editing, pid, renamePatientChronicCondition])

  if (!activePatient) return null

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
          <Heartbeat className="size-3.5 text-amber-400" weight="fill" />
          Chronic conditions
          {conditions.length > 0 && (
            <span className="rounded-md bg-white/[0.06] px-1.5 py-px text-[9px] tabular-nums text-white/40">
              {conditions.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-white/90"
        >
          <Plus className="size-3" weight="bold" />
          Add
        </button>
      </div>

      <SidebarSearchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add chronic condition"
        description="Search the catalog or type a custom diagnosis to attach to this encounter."
        query={query}
        onQueryChange={setQuery}
        placeholder="Search conditions…"
        accent="amber"
        onSearchKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault()
            addCondition(query)
          }
        }}
      >
        <div className="space-y-0.5 p-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addCondition(s)}
              className="flex w-full rounded-lg px-3 py-2.5 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
          {query.trim().length > 1 &&
            !suggestions.some((s) => s.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => addCondition(query)}
                className="mt-1 w-full rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-[12px] font-medium text-amber-300/85 transition-colors hover:bg-amber-500/10"
              >
                Add “{query.trim()}”
              </button>
            )}
        </div>
      </SidebarSearchPickerDialog>

      {conditions.length === 0 ? (
        <p className="py-1 text-[11px] leading-relaxed text-white/28">
          None recorded — use Add to open search
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {conditions.map((c) => (
            <span
              key={c}
              className="group/chip inline-flex max-w-full items-center gap-1 rounded-xl border border-amber-400/18 bg-amber-400/[0.07] py-1 pl-2.5 pr-1 text-[11px] font-medium text-amber-200/90"
            >
              {editing === c ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit()
                    if (e.key === "Escape") {
                      setEditing(null)
                      setEditValue("")
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md bg-black/35 px-1.5 py-0.5 text-[11px] text-amber-100 outline-none"
                />
              ) : (
                <span className="truncate">{c}</span>
              )}
              {editing !== c && (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="rounded-md p-1 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-white/70 group-hover/chip:opacity-100"
                    aria-label="Edit"
                  >
                    <PencilSimple className="size-3" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => pid && removePatientChronicCondition(pid, c)}
                    className="rounded-md p-1 text-white/30 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-300 group-hover/chip:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="size-3" weight="bold" />
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ClinicalSidebarMedicationsSection() {
  const { activePatient, addSessionMedication, removeSessionMedication } = useWorkspace()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const pid = activePatient?.patientId
  const meds = activePatient?.activeMedications ?? []

  useEffect(() => {
    if (!pickerOpen || query.trim().length < 2) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/medications/search?q=${encodeURIComponent(query.trim())}&limit=24`)
        .then((r) => r.json())
        .then((data: { suggestions?: string[] }) => {
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [query, pickerOpen])

  const addMed = useCallback(
    (name: string) => {
      if (!pid) return
      addSessionMedication(pid, { name: name.trim() })
      setQuery("")
      setPickerOpen(false)
      setSuggestions([])
    },
    [addSessionMedication, pid]
  )

  if (!activePatient) return null

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
          <Pill className="size-3.5 shrink-0 text-sky-400" weight="fill" />
          <span className="truncate">Meds &amp; e‑scripts</span>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-white/90"
        >
          <MagnifyingGlass className="size-3" weight="bold" />
          Search
        </button>
      </div>
      <p className="mb-3 text-[10px] leading-relaxed text-white/22">
        RxNav / OpenFDA. Optional{" "}
        <code className="rounded bg-white/[0.06] px-1 py-px text-[9px]">MEDPRAX_API_URL</code> merges
        Medprax server-side.
      </p>

      <SidebarSearchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Search medications"
        description="Find a drug by name; results update as you type."
        query={query}
        onQueryChange={setQuery}
        placeholder="Type drug name…"
        accent="sky"
      >
        {loading && <p className="px-3 py-8 text-center text-[12px] text-white/35">Searching…</p>}
        {!loading && query.length < 2 && (
          <p className="px-3 py-8 text-center text-[12px] text-white/30">Enter at least 2 characters</p>
        )}
        {!loading &&
          query.length >= 2 &&
          suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addMed(s)}
              className="flex w-full rounded-lg px-3 py-2.5 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
        {!loading && query.length >= 2 && suggestions.length === 0 && (
          <p className="px-3 py-8 text-center text-[12px] text-white/30">No matches</p>
        )}
      </SidebarSearchPickerDialog>

      {meds.length === 0 ? (
        <p className="py-1 text-[11px] leading-relaxed text-white/28">No meds on encounter — open Search to add</p>
      ) : (
        <ul className="space-y-2">
          {meds.map((m) => (
            <li
              key={m.id}
              className="group/med flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-white/88">{m.name}</p>
                {(m.dosage || m.frequency) && (
                  <p className="mt-0.5 text-[10px] text-white/38">
                    {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => pid && removeSessionMedication(pid, m.id)}
                className="shrink-0 rounded-lg p-1 text-white/28 opacity-0 transition-opacity hover:bg-red-500/15 hover:text-red-300 group-hover/med:opacity-100"
                aria-label="Remove medication"
              >
                <X className="size-3.5" weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
