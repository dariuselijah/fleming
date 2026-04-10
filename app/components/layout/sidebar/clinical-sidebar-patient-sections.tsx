"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import type { MedicalBlock, VitalReading } from "@/lib/clinical-workspace/types"
import { searchChronicConditionCatalog } from "@/lib/clinical-workspace/chronic-condition-catalog"
import {
  buildImagingOrderBlock,
  buildLabOrderBlock,
} from "@/lib/clinical-workspace/ingest-patient-clinical"
import { VITAL_CONFIG, type VitalType } from "@/app/components/clinical-blocks/vitals-block"
import {
  matchProcedureLinesToCatalog,
  searchLabCatalog,
  type LabCatalogEntry,
} from "@/lib/clinical-workspace/lab-order-catalog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  CaretRight,
  FirstAid,
  Flask,
  Heartbeat,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  Scan,
  Warning,
  X,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

/* ── shared collapsible section ───────────────────────────────── */

export function SidebarSection({
  icon,
  iconColor,
  title,
  count,
  defaultOpen = true,
  trailing,
  children,
}: {
  icon: React.ReactNode
  iconColor?: string
  title: string
  count?: number
  defaultOpen?: boolean
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="group/section">
      <div className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CaretRight
            className={cn(
              "size-3 shrink-0 text-white/25 transition-transform duration-200",
              open && "rotate-90"
            )}
            weight="bold"
          />
          <span className={cn("flex size-4 items-center justify-center", iconColor)}>{icon}</span>
          <span className="flex-1 truncate text-[11px] font-semibold text-white/70">{title}</span>
          {typeof count === "number" && count > 0 && (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[9px] font-medium tabular-nums text-white/35">
              {count}
            </span>
          )}
        </button>
        {trailing ? (
          <div className="shrink-0 opacity-0 transition-opacity group-hover/section:opacity-100">
            {trailing}
          </div>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── search picker dialog (shared) ────────────────────────────── */

function SidebarSearchPickerDialog({
  open,
  onOpenChange,
  title,
  query,
  onQueryChange,
  placeholder,
  onSearchKeyDown,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  query: string
  onQueryChange: (q: string) => void
  placeholder: string
  onSearchKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 border border-white/[0.08] bg-zinc-950/98 p-0 text-white shadow-2xl backdrop-blur-xl sm:max-w-md"
        hasCloseButton
      >
        <DialogHeader className="border-b border-white/[0.06] px-5 py-3.5 text-left">
          <DialogTitle className="text-sm font-semibold tracking-tight text-white">{title}</DialogTitle>
          <DialogDescription className="sr-only">Search and select an item</DialogDescription>
        </DialogHeader>
        <div className="p-3">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={placeholder}
              autoFocus
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-white/[0.15] focus:ring-1 focus:ring-white/[0.08]"
            />
          </div>
          <div
            className="mt-2 max-h-[min(52vh,22rem)] overflow-y-auto rounded-lg"
            style={{ scrollbarWidth: "thin" }}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── allergies ────────────────────────────────────────────────── */

export function ClinicalSidebarAllergiesSection() {
  const {
    activePatient,
    addCriticalAllergy,
    removeCriticalAllergy,
    renameCriticalAllergy,
  } = useWorkspace()
  const [addOpen, setAddOpen] = useState(false)
  const [addValue, setAddValue] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const pid = activePatient?.patientId
  const allergies = activePatient?.criticalAllergies ?? []

  const commitEdit = useCallback(() => {
    if (!pid || !editing) return
    const next = editValue.trim()
    if (next && next !== editing) renameCriticalAllergy(pid, editing, next)
    setEditing(null)
    setEditValue("")
  }, [editValue, editing, pid, renameCriticalAllergy])

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<Warning className="size-3.5" weight="fill" />}
        iconColor="text-red-400"
        title="Allergies"
        count={allergies.length}
        defaultOpen
        trailing={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add allergy"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {allergies.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">None — tap + (NKDA if applicable)</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {allergies.map((a) => (
              <span
                key={a}
                className="group/al inline-flex max-w-full items-center gap-1 rounded-md bg-red-500/10 py-0.5 pl-2 pr-1 text-[10px] font-medium text-red-300"
              >
                {editing === a ? (
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
                    className="min-w-0 flex-1 bg-transparent text-[10px] text-red-100 outline-none"
                  />
                ) : (
                  <span className="truncate">{a}</span>
                )}
                {editing !== a && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(a)
                        setEditValue(a)
                      }}
                      className="rounded p-0.5 text-white/25 opacity-0 transition hover:text-white/70 group-hover/al:opacity-100"
                      aria-label="Edit"
                    >
                      <PencilSimple className="size-2.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removeCriticalAllergy(pid, a)}
                      className="rounded p-0.5 text-white/25 opacity-0 transition hover:text-red-200 group-hover/al:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="size-2.5" weight="bold" />
                    </button>
                  </>
                )}
              </span>
            ))}
          </div>
        )}
      </SidebarSection>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="gap-0 border border-white/[0.08] bg-zinc-950/98 p-0 text-white sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-white/[0.06] px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-white">Add allergy</DialogTitle>
            <DialogDescription className="sr-only">Record drug or other allergy</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 p-4">
            <input
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="e.g. Penicillin — rash"
              autoFocus
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && addValue.trim() && pid) {
                  addCriticalAllergy(pid, addValue.trim())
                  setAddValue("")
                  setAddOpen(false)
                }
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (pid) addCriticalAllergy(pid, "NKDA")
                  setAddOpen(false)
                }}
                className="flex-1 rounded-lg border border-white/10 py-2 text-[11px] font-medium text-white/60 hover:bg-white/[0.06]"
              >
                NKDA
              </button>
              <button
                type="button"
                disabled={!addValue.trim()}
                onClick={() => {
                  if (pid && addValue.trim()) {
                    addCriticalAllergy(pid, addValue.trim())
                    setAddValue("")
                    setAddOpen(false)
                  }
                }}
                className="flex-1 rounded-lg bg-red-500/20 py-2 text-[11px] font-semibold text-red-200 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ── encounter problems ───────────────────────────────────────── */

export function ClinicalSidebarEncounterProblemsSection() {
  const { activePatient, removeEncounterProblem, addEncounterProblem } = useWorkspace()
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const pid = activePatient?.patientId
  const problems = activePatient?.encounterProblems ?? []

  const commitAdd = useCallback(() => {
    const t = draft.trim()
    if (!t || !pid) return
    addEncounterProblem(pid, t)
    setDraft("")
    setAddOpen(false)
  }, [addEncounterProblem, draft, pid])

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<FirstAid className="size-3.5" weight="fill" />}
        iconColor="text-violet-400"
        title="This visit"
        count={problems.length}
        defaultOpen
        trailing={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add problem"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {problems.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">Accept from AI or tap +</p>
        ) : (
          <ul className="space-y-1.5">
            {problems.map((c) => (
              <li
                key={c}
                className="group/row flex items-start gap-2 rounded-md border-l-2 border-violet-500/40 bg-violet-500/[0.06] py-1.5 pl-2.5 pr-2"
              >
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-violet-100/95">{c}</p>
                <button
                  type="button"
                  onClick={() => pid && removeEncounterProblem(pid, c)}
                  className="shrink-0 rounded p-1 text-white/25 opacity-0 transition hover:text-red-300 group-hover/row:opacity-100"
                  aria-label="Remove"
                >
                  <X className="size-3" weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SidebarSection>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="gap-0 border border-white/[0.08] bg-zinc-950/98 p-0 text-white sm:max-w-md"
          hasCloseButton
        >
          <DialogHeader className="border-b border-white/[0.06] px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-white">
              Add problem (this visit)
            </DialogTitle>
            <DialogDescription className="sr-only">Encounter-only problem</DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Working diagnosis, symptom cluster, or concern…"
              className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => void commitAdd()}
              className="mt-3 w-full rounded-lg bg-violet-500/20 py-2 text-[12px] font-semibold text-violet-200 disabled:opacity-40"
            >
              Add to list
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ── chronic conditions ───────────────────────────────────────── */

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
    () => searchChronicConditionCatalog(query, 20),
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
    <>
      <SidebarSection
        icon={<Heartbeat className="size-3.5" weight="fill" />}
        iconColor="text-amber-400"
        title="Chronic"
        count={conditions.length}
        defaultOpen={conditions.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add chronic condition"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {conditions.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">None — tap + to add</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {conditions.map((c) => (
              <span
                key={c}
                className="group/chip inline-flex items-center gap-1 rounded-md bg-amber-500/10 py-0.5 pl-2 pr-1 text-[10px] font-medium text-amber-200/90"
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
                    className="min-w-0 flex-1 bg-transparent px-0.5 text-[10px] text-amber-100 outline-none"
                  />
                ) : (
                  <span className="truncate">{c}</span>
                )}
                {editing !== c && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded p-0.5 text-white/20 opacity-0 transition hover:text-white/60 group-hover/chip:opacity-100"
                      aria-label="Edit"
                    >
                      <PencilSimple className="size-2.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removePatientChronicCondition(pid, c)}
                      className="rounded p-0.5 text-white/20 opacity-0 transition hover:text-red-300 group-hover/chip:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="size-2.5" weight="bold" />
                    </button>
                  </>
                )}
              </span>
            ))}
          </div>
        )}
      </SidebarSection>

      <SidebarSearchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Add chronic condition"
        query={query}
        onQueryChange={setQuery}
        placeholder="Search conditions…"
        onSearchKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault()
            addCondition(query)
          }
        }}
      >
        <div className="space-y-px">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addCondition(s)}
              className="flex w-full rounded-md px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
          {query.trim().length > 1 &&
            !suggestions.some((s) => s.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => addCondition(query)}
                className="mt-1 w-full rounded-md border border-dashed border-white/[0.1] px-3 py-2 text-[11px] font-medium text-amber-300/85 transition-colors hover:bg-amber-500/10"
              >
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            )}
        </div>
      </SidebarSearchPickerDialog>
    </>
  )
}

/* ── medications ──────────────────────────────────────────────── */

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
      fetch(`/api/medications/search?q=${encodeURIComponent(query.trim())}&limit=20`)
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
    <>
      <SidebarSection
        icon={<Pill className="size-3.5" weight="fill" />}
        iconColor="text-sky-400"
        title="Medications"
        count={meds.length}
        defaultOpen={meds.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Search medications"
          >
            <MagnifyingGlass className="size-3" weight="bold" />
          </button>
        }
      >
        {meds.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">None on encounter</p>
        ) : (
          <div className="space-y-1">
            {meds.map((m) => (
              <div
                key={m.id}
                className="group/med flex items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-white/80">{m.name}</p>
                  {(m.dosage || m.frequency) && (
                    <p className="text-[9px] text-white/30">
                      {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => pid && removeSessionMedication(pid, m.id)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-white/15 opacity-0 transition hover:text-red-300 group-hover/med:opacity-100"
                  aria-label="Remove"
                >
                  <X className="size-3" weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SidebarSection>

      <SidebarSearchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Search medications"
        query={query}
        onQueryChange={setQuery}
        placeholder="Type drug name…"
      >
        {loading && <p className="py-6 text-center text-[11px] text-white/30">Searching…</p>}
        {!loading && query.length < 2 && (
          <p className="py-6 text-center text-[11px] text-white/25">Type at least 2 characters</p>
        )}
        {!loading &&
          query.length >= 2 &&
          suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addMed(s)}
              className="flex w-full rounded-md px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
        {!loading && query.length >= 2 && suggestions.length === 0 && (
          <p className="py-6 text-center text-[11px] text-white/25">No matches</p>
        )}
      </SidebarSearchPickerDialog>
    </>
  )
}

/* ── social history ───────────────────────────────────────────── */

export function ClinicalSidebarSocialHistorySection() {
  const { activePatient } = useWorkspace()
  const lines = activePatient?.lifestyle?.socialHistoryLines ?? []

  if (!activePatient || lines.length === 0) return null

  return (
    <SidebarSection
      icon={<span className="text-[10px]">🧬</span>}
      title="Social history"
      count={lines.length}
      defaultOpen={false}
    >
      <ul className="space-y-1 pl-0.5">
        {lines.map((line, i) => (
          <li
            key={`${i}-${line.slice(0, 32)}`}
            className="border-l-2 border-orange-400/25 pl-2 text-[10px] leading-snug text-white/50"
          >
            {line}
          </li>
        ))}
      </ul>
    </SidebarSection>
  )
}

/* ── labs ──────────────────────────────────────────────────────── */

export function ClinicalSidebarLabsSection() {
  const { activePatient, addBlock, removePatientBlock, updateLabOrderBlock, scribeEntities } =
    useWorkspace()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")

  const pid = activePatient?.patientId
  const labs = activePatient?.blocks?.filter((b) => b.type === "LAB") ?? []

  const aiSuggested = useMemo(
    () => matchProcedureLinesToCatalog(scribeEntities?.procedures ?? []),
    [scribeEntities?.procedures]
  )
  const catalogHits = useMemo(() => searchLabCatalog(query, 24), [query])

  const addFromCatalog = useCallback(
    (entry: LabCatalogEntry) => {
      if (!pid) return
      const block = buildLabOrderBlock(pid, entry.label, {
        catalogId: entry.id,
        category: entry.category,
        sourceType: "manual",
      })
      addBlock(pid, block)
      setQuery("")
      setPickerOpen(false)
    },
    [addBlock, pid]
  )

  const addFreeText = useCallback(() => {
    const t = query.trim()
    if (!t || !pid) return
    addBlock(pid, buildLabOrderBlock(pid, t, { sourceType: "manual" }))
    setQuery("")
    setPickerOpen(false)
  }, [addBlock, pid, query])

  const startEdit = useCallback((b: MedicalBlock) => {
    setEditingId(b.id)
    setEditLabel(b.title ?? String(b.metadata.label ?? ""))
  }, [])

  const commitEdit = useCallback(() => {
    if (!pid || !editingId) return
    const t = editLabel.trim()
    if (t) updateLabOrderBlock(pid, editingId, t)
    setEditingId(null)
    setEditLabel("")
  }, [editLabel, editingId, pid, updateLabOrderBlock])

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<Flask className="size-3.5" weight="fill" />}
        iconColor="text-emerald-400"
        title="Labs"
        count={labs.length}
        defaultOpen={labs.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add lab order"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {labs.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">None — search catalog or tap +</p>
        ) : (
          <ul className="space-y-1">
            {labs.map((b) => (
              <li
                key={b.id}
                className="group/lab flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  {editingId === b.id ? (
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit()
                        if (e.key === "Escape") {
                          setEditingId(null)
                          setEditLabel("")
                        }
                      }}
                      className="w-full bg-transparent text-[11px] text-white/90 outline-none"
                    />
                  ) : (
                    <>
                      <p className="text-[11px] font-medium text-white/85">
                        {b.title ?? String(b.metadata.label ?? "Lab")}
                      </p>
                      {typeof b.metadata.labCategory === "string" && (
                        <p className="text-[9px] text-white/35">{b.metadata.labCategory}</p>
                      )}
                    </>
                  )}
                </div>
                {editingId !== b.id && (
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover/lab:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="rounded p-1 text-white/25 hover:text-white/70"
                      aria-label="Edit lab"
                    >
                      <PencilSimple className="size-3" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removePatientBlock(pid, b.id)}
                      className="rounded p-1 text-white/25 hover:text-red-300"
                      aria-label="Remove lab"
                    >
                      <X className="size-3" weight="bold" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SidebarSection>

      <SidebarSearchPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Lab orders"
        query={query}
        onQueryChange={setQuery}
        placeholder="Search FBC, U&E, HbA1c…"
        onSearchKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault()
            addFreeText()
          }
        }}
      >
        <div className="space-y-2 p-1">
          {aiSuggested.length > 0 && (
            <div>
              <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90">
                AI suggested (from transcript)
              </p>
              <div className="flex flex-wrap gap-1 px-1">
                {aiSuggested.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addFromCatalog(s)}
                    className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-200/90"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-px">
            {catalogHits.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => addFromCatalog(entry)}
                className="flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span className="text-[12px] text-white/80">{entry.label}</span>
                <span className="text-[9px] text-white/35">{entry.category}</span>
              </button>
            ))}
          </div>
          {query.trim().length > 1 &&
            !catalogHits.some(
              (e) => e.label.toLowerCase() === query.trim().toLowerCase()
            ) && (
              <button
                type="button"
                onClick={() => addFreeText()}
                className="w-full rounded-md border border-dashed border-white/[0.12] px-3 py-2 text-[11px] font-medium text-emerald-300/90 hover:bg-emerald-500/10"
              >
                Add custom &ldquo;{query.trim()}&rdquo;
              </button>
            )}
        </div>
      </SidebarSearchPickerDialog>
    </>
  )
}

/* ── vitals (manual entry) ─────────────────────────────────────── */

export function ClinicalSidebarVitalsSection() {
  const { activePatient, addVitalReading } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<VitalType>("heart_rate")
  const [primaryValue, setPrimaryValue] = useState("")
  const [secondaryValue, setSecondaryValue] = useState("")

  const pid = activePatient?.patientId
  const cfg = VITAL_CONFIG[selectedType]

  const commit = useCallback(() => {
    if (!pid || !primaryValue.trim()) return
    const v = parseFloat(primaryValue)
    if (!Number.isFinite(v)) return
    const sec =
      cfg.hasSecondary && secondaryValue.trim()
        ? parseFloat(secondaryValue)
        : undefined
    const reading: VitalReading = {
      id: `vital-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: selectedType,
      value: v,
      unit: cfg.unit,
      secondaryValue: Number.isFinite(sec) ? sec : undefined,
      timestamp: new Date(),
      source: "manual",
      committed: true,
    }
    addVitalReading(pid, reading)
    setPrimaryValue("")
    setSecondaryValue("")
    setOpen(false)
  }, [addVitalReading, cfg.hasSecondary, cfg.unit, pid, primaryValue, secondaryValue, selectedType])

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<Heartbeat className="size-3.5" weight="fill" />}
        iconColor="text-rose-400"
        title="Vitals"
        count={activePatient.vitals.length}
        defaultOpen={activePatient.vitals.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add vitals"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {activePatient.vitals.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {activePatient.vitals.slice(-6).map((v) => (
              <div key={v.id} className="rounded-md bg-white/[0.03] px-2 py-1.5">
                <p className="text-[8px] uppercase tracking-wider text-white/20">
                  {v.type.replace("_", " ")}
                </p>
                <p className="text-[12px] font-bold tabular-nums text-white/80">
                  {v.value}
                  {v.secondaryValue ? `/${v.secondaryValue}` : ""}
                  <span className="ml-0.5 text-[8px] font-normal text-white/25">{v.unit}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-0.5 text-[10px] text-white/25">No vitals — tap +</p>
        )}
      </SidebarSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 border border-white/[0.08] bg-zinc-950/98 p-0 text-white sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-white/[0.06] px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-white">Add vitals</DialogTitle>
            <DialogDescription className="sr-only">Record a vital sign</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(VITAL_CONFIG) as VitalType[]).map((t) => {
                const c = VITAL_CONFIG[t]
                const Icon = c.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSelectedType(t)
                      setPrimaryValue("")
                      setSecondaryValue("")
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium",
                      selectedType === t
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-100"
                        : "border-white/[0.08] text-white/50 hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon className="size-3" />
                    {c.label}
                  </button>
                )
              })}
            </div>
            <label className="block text-[10px] text-white/40">
              {cfg.hasSecondary ? "Systolic" : "Value"} ({cfg.unit})
              <input
                value={primaryValue}
                onChange={(e) => setPrimaryValue(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white outline-none"
                placeholder={String(cfg.range[0])}
              />
            </label>
            {cfg.hasSecondary && (
              <label className="block text-[10px] text-white/40">
                Diastolic (mmHg)
                <input
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white outline-none"
                />
              </label>
            )}
            <button
              type="button"
              disabled={!primaryValue.trim()}
              onClick={() => void commit()}
              className="w-full rounded-lg bg-rose-500/25 py-2.5 text-[12px] font-semibold text-rose-100 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ── imaging ──────────────────────────────────────────────────── */

export function ClinicalSidebarImagingSection() {
  const { activePatient, addBlock, removePatientBlock } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [modality, setModality] = useState("")

  const pid = activePatient?.patientId
  const imaging = activePatient?.blocks?.filter((b) => b.type === "IMAGING") ?? []

  const addImaging = useCallback(() => {
    const t = label.trim()
    if (!t || !pid) return
    addBlock(
      pid,
      buildImagingOrderBlock(pid, t, {
        modality: modality.trim() || undefined,
        sourceType: "manual",
      })
    )
    setLabel("")
    setModality("")
    setOpen(false)
  }, [addBlock, label, modality, pid])

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<Scan className="size-3.5" weight="fill" />}
        iconColor="text-rose-300"
        title="Imaging"
        count={imaging.length}
        defaultOpen={imaging.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/60"
            aria-label="Add imaging"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {imaging.length === 0 ? (
          <p className="py-0.5 text-[10px] text-white/25">None — tap + (CXR, US, CT…)</p>
        ) : (
          <ul className="space-y-1">
            {imaging.map((b) => (
              <li
                key={b.id}
                className="group/img flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-white/85">{b.title}</p>
                  {typeof b.metadata?.imagingModality === "string" && (
                    <p className="text-[9px] text-white/35">{b.metadata.imagingModality}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => pid && removePatientBlock(pid, b.id)}
                  className="shrink-0 rounded p-1 text-white/20 opacity-0 transition hover:text-red-300 group-hover/img:opacity-100"
                  aria-label="Remove"
                >
                  <X className="size-3" weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SidebarSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 border border-white/[0.08] bg-zinc-950/98 p-0 text-white sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-white/[0.06] px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-white">Add imaging</DialogTitle>
            <DialogDescription className="sr-only">Imaging request</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. CXR PA, echo, MRI lumbar spine"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30"
            />
            <input
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              placeholder="Modality (optional): XR, US, CT, MRI…"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/30"
            />
            <button
              type="button"
              disabled={!label.trim()}
              onClick={() => void addImaging()}
              className="w-full rounded-lg bg-rose-500/20 py-2.5 text-[12px] font-semibold text-rose-100 disabled:opacity-40"
            >
              Add to chart
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
