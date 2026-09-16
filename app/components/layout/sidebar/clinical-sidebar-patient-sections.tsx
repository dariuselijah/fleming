"use client"

import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"
import type { MedicalBlock, PatientMedication, VitalReading } from "@/lib/clinical-workspace/types"
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
import { Field, FieldControl, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import {
  CaretRight,
  Flask,
  Heartbeat,
  ListMagnifyingGlass,
  MagnifyingGlass,
  PencilSimple,
  Pill,
  Plus,
  Scan,
  Stethoscope,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useId, useMemo, useState } from "react"

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
      <div className="flex w-full items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-sidebar-accent/80">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CaretRight
            className={cn(
              "size-3 shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
              open && "rotate-90"
            )}
            weight="bold"
          />
          <span className={cn("flex size-4 items-center justify-center", iconColor)}>{icon}</span>
          <span className="flex-1 truncate text-[12px] font-semibold tracking-tight text-sidebar-foreground/75">
            {title}
          </span>
          {typeof count === "number" && count > 0 && (
            <span className="text-micro rounded-md bg-sidebar-accent px-1.5 py-px font-semibold tabular-nums text-sidebar-foreground/50">
              {count}
            </span>
          )}
        </button>
        {trailing ? (
          <div className="shrink-0 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
            {trailing}
          </div>
        ) : null}
      </div>
      {open ? <div className="px-2 pb-2 pt-1">{children}</div> : null}
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
  const searchId = useId()

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle className="text-sm font-semibold tracking-tight">{title}</ModalTitle>
          <ModalDescription className="sr-only">Search and select an item</ModalDescription>
        </ModalHeader>
        <ModalBody className="p-3">
          <Field>
            <FieldLabel htmlFor={searchId} className="sr-only">
              Search {title}
            </FieldLabel>
            <FieldControl className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={searchId}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={placeholder}
                autoFocus
                className="border-sidebar-border bg-sidebar-accent pl-9 text-[13px] text-sidebar-foreground"
              />
            </FieldControl>
          </Field>
          <div
            className="mt-2 max-h-[min(52vh,22rem)] overflow-y-auto rounded-lg"
            style={{ scrollbarWidth: "thin" }}
          >
            {children}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
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
        iconColor="text-red-600 dark:text-red-400"
        title="Allergies"
        count={allergies.length}
        defaultOpen
        trailing={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Add allergy"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {allergies.length === 0 ? (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">None — tap + (NKDA if applicable)</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {allergies.map((a) => (
              <span
                key={a}
                className="group/al inline-flex max-w-full items-center gap-1 rounded-md border border-red-500/15 bg-red-500/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-red-700 dark:text-red-200"
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
                    className="min-w-0 flex-1 bg-transparent text-[11px] text-red-700 outline-none dark:text-red-100"
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
                      className="rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-sidebar-accent-foreground/75 group-hover/al:opacity-100"
                      aria-label="Edit"
                    >
                      <PencilSimple className="size-2.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removeCriticalAllergy(pid, a)}
                      className="rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-red-700 dark:hover:text-red-200 group-hover/al:opacity-100"
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
          className="gap-0 border border-sidebar-border bg-popover/98 p-0 text-sidebar-foreground sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-sidebar-border px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground">Add allergy</DialogTitle>
            <DialogDescription className="sr-only">Record drug or other allergy</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 p-4">
            <input
              value={addValue}
              onChange={(e) => setAddValue(e.target.value)}
              placeholder="e.g. Penicillin — rash"
              autoFocus
              className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
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
                className="flex-1 rounded-lg border border-sidebar-border py-2 text-[12px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent"
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
                className="flex-1 rounded-lg bg-red-500/15 py-2 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-500/20 disabled:opacity-40 dark:text-red-100"
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

/* ── active visit (structured consult snapshot) ───────────────── */

function normVisitLabel(s: string): string {
  return s.trim().toLowerCase()
}

function categorizeVisitFindings(
  problems: string[],
  entities: ExtractedEntities,
  chronic: string[]
) {
  const chronicSet = new Set(chronic.map(normVisitLabel))
  const ccPool = new Set(entities.chief_complaint.map(normVisitLabel))
  const symPool = new Set(entities.symptoms.map(normVisitLabel))
  const dxPool = new Set(entities.diagnoses.map(normVisitLabel))
  const riskPool = new Set(entities.risk_factors.map(normVisitLabel))

  let chiefComplaint: string | null = null
  const symptoms: string[] = []
  const workingDx: string[] = []
  const risks: string[] = []
  const other: string[] = []
  const seen = new Set<string>()

  for (const p of problems) {
    const n = normVisitLabel(p)
    if (!n || seen.has(n)) continue
    seen.add(n)

    if (ccPool.has(n)) {
      if (!chiefComplaint) chiefComplaint = p
      continue
    }
    if (symPool.has(n)) {
      symptoms.push(p)
      continue
    }
    if (dxPool.has(n)) {
      if (!chronicSet.has(n)) workingDx.push(p)
      continue
    }
    if (riskPool.has(n)) {
      risks.push(p)
      continue
    }
    other.push(p)
  }

  if (!chiefComplaint && entities.chief_complaint[0]) {
    chiefComplaint = entities.chief_complaint[0]
  }

  return { chiefComplaint, symptoms, workingDx, risks, other }
}

function countPendingEntities(
  entities: ExtractedEntities,
  entityStatus: Record<string, "pending" | "accepted" | "rejected">
): number {
  let n = 0
  const keys = [
    "chief_complaint",
    "symptoms",
    "diagnoses",
    "medications",
    "allergies",
    "vitals",
    "procedures",
    "social_history",
    "family_history",
    "risk_factors",
  ] as const
  for (const key of keys) {
    for (const item of entities[key] ?? []) {
      const st = entityStatus[`${key}:${item}`]
      if (!st || st === "pending") n++
    }
  }
  return n
}

function VisitChipRow({
  label,
  items,
  tone,
  limit = 6,
  expanded,
  onToggleExpand,
  onRemove,
}: {
  label: string
  items: string[]
  tone: "rose" | "sky" | "amber" | "slate"
  limit?: number
  expanded?: boolean
  onToggleExpand?: () => void
  onRemove?: (item: string) => void
}) {
  if (items.length === 0) return null
  const toneClass =
    tone === "rose"
      ? "border-rose-500/15 bg-rose-500/10 text-rose-800 dark:text-rose-200/90"
      : tone === "sky"
        ? "border-sky-500/15 bg-sky-500/10 text-sky-800 dark:text-sky-200/90"
        : tone === "amber"
          ? "border-amber-500/15 bg-amber-500/10 text-amber-800 dark:text-amber-200/90"
          : "border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground/80"

  const visible = expanded ? items : items.slice(0, limit)
  const hidden = items.length - visible.length

  return (
    <div className="space-y-1">
      <p className="text-micro font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {visible.map((item) => (
          <span
            key={item}
            className={cn(
              "group/chip inline-flex max-w-full items-center gap-0.5 rounded-md border py-0.5 pl-2 pr-1 text-[11px] font-medium leading-tight",
              toneClass
            )}
          >
            <span className="truncate">{item}</span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="rounded p-0.5 opacity-0 transition hover:text-red-600 group-hover/chip:opacity-100 dark:hover:text-red-300"
                aria-label={`Remove ${item}`}
              >
                <X className="size-2.5" weight="bold" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {hidden > 0 && onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-[11px] font-medium text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/75"
        >
          {expanded ? "Show fewer" : `+${hidden} more`}
        </button>
      ) : null}
    </div>
  )
}

export function ClinicalSidebarActiveVisitSection() {
  const {
    activePatient,
    scribeEntities,
    scribeEntityStatus,
    scribeTranscript,
    removeEncounterProblem,
    addEncounterProblem,
  } = useWorkspace()
  const setSidecarContent = useWorkspaceStore((s) => s.setSidecarContent)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [symptomsExpanded, setSymptomsExpanded] = useState(false)
  const pid = activePatient?.patientId
  const problems = useMemo(
    () => activePatient?.encounterProblems ?? [],
    [activePatient?.encounterProblems]
  )
  const chronic = useMemo(
    () => activePatient?.chronicConditions ?? [],
    [activePatient?.chronicConditions]
  )

  const groups = useMemo(
    () => categorizeVisitFindings(problems, scribeEntities, chronic),
    [problems, scribeEntities, chronic]
  )

  const pendingReview = useMemo(
    () => countPendingEntities(scribeEntities, scribeEntityStatus),
    [scribeEntities, scribeEntityStatus]
  )

  const findingCount =
    (groups.chiefComplaint ? 1 : 0) +
    groups.symptoms.length +
    groups.workingDx.length +
    groups.risks.length +
    groups.other.length

  const hasTranscript = scribeTranscript.trim().length > 20

  const commitAdd = useCallback(() => {
    const t = draft.trim()
    if (!t || !pid) return
    addEncounterProblem(pid, t)
    setDraft("")
    setAddOpen(false)
  }, [addEncounterProblem, draft, pid])

  const openExtraction = useCallback(() => {
    setSidecarContent({ tab: "intelligence" })
  }, [setSidecarContent])

  const removeProblem = useCallback(
    (item: string) => {
      if (pid) removeEncounterProblem(pid, item)
    },
    [pid, removeEncounterProblem]
  )

  if (!activePatient) return null

  return (
    <>
      <SidebarSection
        icon={<Stethoscope className="size-3.5" weight="fill" />}
        iconColor="text-emerald-600 dark:text-emerald-400"
        title="Active visit"
        count={findingCount}
        defaultOpen
        trailing={
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={openExtraction}
              className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
              aria-label="Open extraction panel"
              title="Review AI extraction"
            >
              <ListMagnifyingGlass className="size-3" weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
              aria-label="Add finding"
            >
              <Plus className="size-3" weight="bold" />
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          {(hasTranscript || pendingReview > 0) && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.07] to-transparent px-2 py-1.5">
              <span className="text-[11px] font-medium text-emerald-800/90 dark:text-emerald-300/90">
                {hasTranscript ? "Transcript live" : "Awaiting transcript"}
              </span>
              {pendingReview > 0 ? (
                <button
                  type="button"
                  onClick={openExtraction}
                  className="text-micro shrink-0 rounded-md bg-emerald-500/12 px-1.5 py-0.5 font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  {pendingReview} to review →
                </button>
              ) : null}
            </div>
          )}

          {groups.chiefComplaint ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-2.5 py-2">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-emerald-700/75 dark:text-emerald-400/80">
                Chief complaint
              </p>
              <p className="mt-0.5 text-[12px] font-semibold leading-snug tracking-tight text-sidebar-foreground/90">
                {groups.chiefComplaint}
              </p>
            </div>
          ) : null}

          {findingCount === 0 ? (
            <div className="rounded-lg border border-dashed border-sidebar-border/80 px-2.5 py-3 text-center">
              <p className="text-[11px] leading-relaxed text-sidebar-foreground/50">
                Findings appear here as you scribe or accept AI extraction.
              </p>
              {pendingReview > 0 ? (
                <button
                  type="button"
                  onClick={openExtraction}
                  className="mt-2 text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Review {pendingReview} extracted items
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <VisitChipRow
                label="Presenting symptoms"
                items={groups.symptoms}
                tone="rose"
                expanded={symptomsExpanded}
                onToggleExpand={() => setSymptomsExpanded((e) => !e)}
                onRemove={removeProblem}
              />
              <VisitChipRow
                label="Working diagnosis"
                items={groups.workingDx}
                tone="sky"
                onRemove={removeProblem}
              />
              <VisitChipRow
                label="Risk factors"
                items={groups.risks}
                tone="amber"
                limit={4}
                onRemove={removeProblem}
              />
              <VisitChipRow
                label="Other notes"
                items={groups.other}
                tone="slate"
                limit={4}
                onRemove={removeProblem}
              />
            </>
          )}
        </div>
      </SidebarSection>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="gap-0 border border-sidebar-border bg-popover/98 p-0 text-sidebar-foreground sm:max-w-md"
          hasCloseButton
        >
          <DialogHeader className="border-b border-sidebar-border px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              Add visit finding
            </DialogTitle>
            <DialogDescription className="sr-only">Encounter-only clinical finding</DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Symptom, working diagnosis, or clinical concern…"
              className="w-full resize-none rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => void commitAdd()}
              className="mt-3 w-full rounded-lg bg-emerald-500/15 py-2 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-100"
            >
              Add to visit
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** @deprecated Use ClinicalSidebarActiveVisitSection */
export const ClinicalSidebarEncounterProblemsSection = ClinicalSidebarActiveVisitSection

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
        iconColor="text-amber-600 dark:text-amber-400"
        title="Chronic"
        count={conditions.length}
        defaultOpen={conditions.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Add chronic condition"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {conditions.length === 0 ? (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">None — tap + to add</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {conditions.map((c) => (
              <span
                key={c}
                className="group/chip inline-flex items-center gap-1 rounded-md border border-amber-500/15 bg-amber-500/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-amber-700 dark:text-amber-200/90"
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
                    className="min-w-0 flex-1 bg-transparent px-0.5 text-[11px] text-amber-700 outline-none dark:text-amber-100"
                  />
                ) : (
                  <span className="truncate">{c}</span>
                )}
                {editing !== c && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-sidebar-accent-foreground/60 group-hover/chip:opacity-100"
                      aria-label="Edit"
                    >
                      <PencilSimple className="size-2.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removePatientChronicCondition(pid, c)}
                      className="rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-red-700 dark:hover:text-red-300 group-hover/chip:opacity-100"
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
              className="flex w-full rounded-md px-3 py-2 text-left text-[12px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {s}
            </button>
          ))}
          {query.trim().length > 1 &&
            !suggestions.some((s) => s.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => addCondition(query)}
                className="mt-1 w-full rounded-md border border-dashed border-sidebar-border px-3 py-2 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300/85"
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
  const { activePatient, addSessionMedication, removeSessionMedication, updateSessionMedication } =
    useWorkspace()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDosage, setEditDosage] = useState("")
  const [editFreq, setEditFreq] = useState("")

  const pid = activePatient?.patientId
  const meds = activePatient?.activeMedications ?? []

  const startEdit = useCallback((m: PatientMedication) => {
    setEditingId(m.id)
    setEditName(m.name)
    setEditDosage(m.dosage ?? "")
    setEditFreq(m.frequency ?? "")
  }, [])

  const commitEdit = useCallback(() => {
    if (!pid || !editingId) return
    const n = editName.trim()
    if (!n) return
    updateSessionMedication(pid, editingId, {
      name: n,
      dosage: editDosage,
      frequency: editFreq,
    })
    setEditingId(null)
  }, [editDosage, editFreq, editName, editingId, pid, updateSessionMedication])

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
        iconColor="text-sky-600 dark:text-sky-400"
        title="Medications"
        count={meds.length}
        defaultOpen={meds.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Search medications"
          >
            <MagnifyingGlass className="size-3" weight="bold" />
          </button>
        }
      >
        {meds.length === 0 ? (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">None on encounter</p>
        ) : (
          <div className="space-y-1">
            {meds.map((m) => (
              <div
                key={m.id}
                className="group/med flex items-start gap-2 rounded-md px-1 py-1 transition-colors hover:bg-sidebar-accent"
              >
                {editingId === m.id ? (
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit()
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="w-full rounded border border-sidebar-border bg-sidebar-accent px-2 py-1 text-[12px] text-sidebar-foreground/90 outline-none"
                      placeholder="Drug name"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        value={editDosage}
                        onChange={(e) => setEditDosage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        className="min-w-0 flex-1 rounded border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[11px] text-sidebar-foreground/80 outline-none"
                        placeholder="Dose"
                      />
                      <input
                        value={editFreq}
                        onChange={(e) => setEditFreq(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit()
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        className="min-w-0 flex-1 rounded border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[11px] text-sidebar-foreground/80 outline-none"
                        placeholder="Frequency"
                      />
                      <button
                        type="button"
                        onClick={commitEdit}
                        className="rounded bg-sidebar-accent px-2 py-0.5 text-[11px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-sidebar-foreground/80">{m.name}</p>
                      {(m.dosage || m.frequency) && (
                        <p className="text-micro text-sidebar-foreground/45">
                          {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-sidebar-accent-foreground/75 group-hover/med:opacity-100"
                      aria-label="Edit"
                    >
                      <PencilSimple className="size-3" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removeSessionMedication(pid, m.id)}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-sidebar-foreground/45 opacity-0 transition hover:text-red-700 dark:hover:text-red-300 group-hover/med:opacity-100"
                      aria-label="Remove"
                    >
                      <X className="size-3" weight="bold" />
                    </button>
                  </>
                )}
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
        {loading && <p className="py-6 text-center text-[12px] text-sidebar-foreground/45">Searching…</p>}
        {!loading && query.length < 2 && (
          <p className="py-6 text-center text-[12px] text-sidebar-foreground/45">Type at least 2 characters</p>
        )}
        {!loading &&
          query.length >= 2 &&
          suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addMed(s)}
              className="flex w-full rounded-md px-3 py-2 text-left text-[12px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {s}
            </button>
          ))}
        {!loading && query.length >= 2 && suggestions.length === 0 && (
          <p className="py-6 text-center text-[12px] text-sidebar-foreground/45">No matches</p>
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
      icon={<span className="text-[11px]">🧬</span>}
      title="Social history"
      count={lines.length}
      defaultOpen={false}
    >
      <ul className="space-y-1 pl-0.5">
        {lines.map((line, i) => (
          <li
            key={`${i}-${line.slice(0, 32)}`}
            className="border-l-2 border-orange-400/25 pl-2 text-[11px] leading-snug text-sidebar-foreground/70"
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
        iconColor="text-emerald-600 dark:text-emerald-400"
        title="Labs"
        count={labs.length}
        defaultOpen={labs.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Add lab order"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {labs.length === 0 ? (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">None — search catalog or tap +</p>
        ) : (
          <ul className="space-y-1">
            {labs.map((b) => (
              <li
                key={b.id}
                className="group/lab flex items-start gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2 py-1.5"
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
                      className="w-full bg-transparent text-[12px] text-sidebar-foreground/90 outline-none"
                    />
                  ) : (
                    <>
                      <p className="text-[12px] font-medium text-sidebar-foreground/85">
                        {b.title ?? String(b.metadata.label ?? "Lab")}
                      </p>
                      {typeof b.metadata.labCategory === "string" && (
                        <p className="text-micro text-sidebar-foreground/45">{b.metadata.labCategory}</p>
                      )}
                    </>
                  )}
                </div>
                {editingId !== b.id && (
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover/lab:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="rounded p-1 text-sidebar-foreground/45 hover:text-sidebar-accent-foreground/75"
                      aria-label="Edit lab"
                    >
                      <PencilSimple className="size-3" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => pid && removePatientBlock(pid, b.id)}
                      className="rounded p-1 text-sidebar-foreground/45 hover:text-red-700 dark:hover:text-red-300"
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
              <p className="text-micro mb-1 px-2 font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300/90">
                AI suggested (from transcript)
              </p>
              <div className="flex flex-wrap gap-1 px-1">
                {aiSuggested.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addFromCatalog(s)}
                    className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-200/90"
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
                className="flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
              >
                <span className="text-[12px] text-sidebar-foreground/80">{entry.label}</span>
                <span className="text-micro text-sidebar-foreground/45">{entry.category}</span>
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
                className="w-full rounded-md border border-dashed border-sidebar-border px-3 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300/90"
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
        iconColor="text-rose-600 dark:text-rose-400"
        title="Vitals"
        count={activePatient.vitals.length}
        defaultOpen={activePatient.vitals.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Add vitals"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {activePatient.vitals.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {activePatient.vitals.slice(-6).map((v) => (
              <div key={v.id} className="rounded-md bg-sidebar-accent px-2 py-1.5">
                <p className="text-micro uppercase tracking-wider text-sidebar-foreground/45">
                  {v.type.replace("_", " ")}
                </p>
                <p className="text-[12px] font-bold tabular-nums text-sidebar-foreground/80">
                  {v.value}
                  {v.secondaryValue ? `/${v.secondaryValue}` : ""}
                  <span className="text-micro ml-0.5 font-normal text-sidebar-foreground/45">{v.unit}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">No vitals — tap +</p>
        )}
      </SidebarSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 border border-sidebar-border bg-popover/98 p-0 text-sidebar-foreground sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-sidebar-border px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground">Add vitals</DialogTitle>
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
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
                      selectedType === t
                        ? "border-rose-500/35 bg-rose-500/12 text-rose-700 dark:text-rose-100"
                        : "border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent"
                    )}
                  >
                    <Icon className="size-3" />
                    {c.label}
                  </button>
                )
              })}
            </div>
            <label className="block text-[11px] text-sidebar-foreground/45">
              {cfg.hasSecondary ? "Systolic" : "Value"} ({cfg.unit})
              <input
                value={primaryValue}
                onChange={(e) => setPrimaryValue(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2 text-[13px] text-sidebar-foreground outline-none"
                placeholder={String(cfg.range[0])}
              />
            </label>
            {cfg.hasSecondary && (
              <label className="block text-[11px] text-sidebar-foreground/45">
                Diastolic (mmHg)
                <input
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2 text-[13px] text-sidebar-foreground outline-none"
                />
              </label>
            )}
            <button
              type="button"
              disabled={!primaryValue.trim()}
              onClick={() => void commit()}
              className="w-full rounded-lg bg-rose-500/15 py-2.5 text-[12px] font-semibold text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-100"
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
        iconColor="text-rose-600 dark:text-rose-300"
        title="Imaging"
        count={imaging.length}
        defaultOpen={imaging.length > 0}
        trailing={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/60"
            aria-label="Add imaging"
          >
            <Plus className="size-3" weight="bold" />
          </button>
        }
      >
        {imaging.length === 0 ? (
          <p className="py-0.5 text-[11px] text-sidebar-foreground/45">None — tap + (CXR, US, CT…)</p>
        ) : (
          <ul className="space-y-1">
            {imaging.map((b) => (
              <li
                key={b.id}
                className="group/img flex items-start gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-sidebar-foreground/85">{b.title}</p>
                  {typeof b.metadata?.imagingModality === "string" && (
                    <p className="text-micro text-sidebar-foreground/45">{b.metadata.imagingModality}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => pid && removePatientBlock(pid, b.id)}
                  className="shrink-0 rounded p-1 text-sidebar-foreground/45 opacity-0 transition hover:text-red-700 dark:hover:text-red-300 group-hover/img:opacity-100"
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
          className="gap-0 border border-sidebar-border bg-popover/98 p-0 text-sidebar-foreground sm:max-w-sm"
          hasCloseButton
        >
          <DialogHeader className="border-b border-sidebar-border px-5 py-3.5 text-left">
            <DialogTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground">Add imaging</DialogTitle>
            <DialogDescription className="sr-only">Imaging request</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. CXR PA, echo, MRI lumbar spine"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
            />
            <input
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              placeholder="Modality (optional): XR, US, CT, MRI…"
              className="w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
            />
            <button
              type="button"
              disabled={!label.trim()}
              onClick={() => void addImaging()}
              className="w-full rounded-lg bg-rose-500/15 py-2.5 text-[12px] font-semibold text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-100"
            >
              Add to chart
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
