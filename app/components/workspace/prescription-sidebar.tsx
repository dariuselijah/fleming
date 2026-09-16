"use client"

import type { ClinicalDocument, PrescriptionItem } from "@/lib/clinical-workspace/types"
import { printPrescription } from "@/lib/clinical-workspace/print-prescription"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EditorShell } from "@/app/components/ui/panel-primitives"
import { Check, CaretDown, CaretUp, Pill, Plus, Printer, X } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"
import { fetchClient } from "@/lib/fetch"

const ROUTES = ["Oral", "IV", "IM", "SC", "Topical", "Inhalation", "PR"]
const FREQ_PRESETS = ["OD", "BD", "TDS", "QID", "PRN", "Nocte", "Weekly"]

export function newPrescriptionItem(): PrescriptionItem {
  return {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    drug: "",
    strength: "",
    route: "Oral",
    frequency: "OD",
    duration: "28 days",
    instructions: "",
    reasoning: "",
  }
}

type RowStatus = "pending" | "accepted" | "rejected"

export function PrescriptionEditorPanel({
  doc,
  updateDocumentContent,
  activePatient,
  acceptSessionDocument,
  addSessionMedication,
}: {
  doc: ClinicalDocument
  updateDocumentContent: (
    content: string,
    isStreaming: boolean,
    patch?: { prescriptionItems?: PrescriptionItem[]; docId?: string }
  ) => void
  activePatient: { patientId: string; name: string } | null
  acceptSessionDocument: (
    patientId: string,
    docId: string,
    opts: { document: ClinicalDocument }
  ) => void
  addSessionMedication: (
    patientId: string,
    med: {
      name: string
      dosage?: string
      frequency?: string
      prescribedBy?: string
      startDate?: string
    }
  ) => void
}) {
  const [items, setItems] = useState<PrescriptionItem[]>(() =>
    doc.prescriptionItems?.length ? [...doc.prescriptionItems] : [newPrescriptionItem()]
  )
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})
  const [openReason, setOpenReason] = useState<Record<string, boolean>>({})
  const [suggestions, setSuggestions] = useState<{ rowId: string; list: string[] } | null>(null)

  useEffect(() => {
    const rows = doc.prescriptionItems
    if (rows?.length) {
      setItems(rows.map((r) => ({ ...r })))
    } else if (!doc.isStreaming) {
      setItems([newPrescriptionItem()])
    }
  }, [doc.id, doc.isStreaming, doc.prescriptionItems])

  const persistItems = useCallback(
    (next: PrescriptionItem[]) => {
      setItems(next)
      updateDocumentContent(doc.content, doc.isStreaming, {
        prescriptionItems: next,
        docId: doc.id,
      })
    },
    [doc.content, doc.id, doc.isStreaming, updateDocumentContent]
  )

  const searchDrugs = useCallback(async (q: string, rowId: string) => {
    const t = q.trim()
    if (t.length < 2) {
      setSuggestions(null)
      return
    }
    try {
      const res = await fetchClient(`/api/medications/search?q=${encodeURIComponent(t)}&limit=20`)
      if (!res.ok) {
        setSuggestions(null)
        return
      }
      const j = (await res.json()) as {
        suggestions?: string[]
        results?: Array<string | { name?: string }>
      }
      const list = Array.isArray(j.suggestions)
        ? j.suggestions
        : Array.isArray(j.results)
          ? j.results
              .map((item) => (typeof item === "string" ? item : item.name ?? ""))
              .filter(Boolean)
          : []
      setSuggestions(list.length ? { rowId, list } : null)
    } catch {
      setSuggestions(null)
    }
  }, [])

  const setField = (id: string, patch: Partial<PrescriptionItem>) => {
    persistItems(items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    persistItems([...items, newPrescriptionItem()])
  }

  const acceptAll = () => {
    if (!activePatient) return
    for (const row of items) {
      const st = rowStatus[row.id] ?? "pending"
      if (st === "rejected" || !row.drug.trim()) continue
      addSessionMedication(activePatient.patientId, {
        name: row.drug.trim(),
        dosage: row.strength,
        frequency: row.frequency,
        prescribedBy: "Fleming assist",
      })
    }
    acceptSessionDocument(activePatient.patientId, doc.id, { document: { ...doc, isStreaming: false } })
  }

  const rejectAll = () => {
    const next: Record<string, RowStatus> = {}
    for (const r of items) next[r.id] = "rejected"
    setRowStatus(next)
  }

  const handlePrint = () => {
    void printPrescription({
      patientName: activePatient?.name ?? doc.patientName ?? "Patient",
      items,
      patientId: activePatient?.patientId,
      sessionDocumentId: doc.id,
    })
  }

  return (
    <EditorShell
      header={
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Pill className="size-4 text-sky-500" weight="duotone" />
              <span className="font-semibold text-foreground">{activePatient?.name ?? "Patient"}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{new Date(doc.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-panel-border text-[12px]"
                onClick={handlePrint}
              >
                <Printer className="size-3.5" />
                Print Rx
              </Button>
              <Button type="button" size="sm" className="h-9 gap-1.5 text-[12px]" onClick={addRow}>
                <Plus className="size-3.5" />
                Add medication
              </Button>
            </div>
          </div>
        </div>
      }
      footer={
        <div className="space-y-2 px-4 py-3.5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1 text-[12px]"
              disabled={!activePatient}
              onClick={acceptAll}
            >
              Accept &amp; save to record
            </Button>
            <Button type="button" size="sm" variant="secondary" className="h-9 text-[12px]" onClick={rejectAll}>
              Reject all
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground/80">
            Decision support only — verify allergies, renal/hepatic function, and local formulary before dispensing.
          </p>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
        <div className="sticky top-0 z-10 mb-2 hidden grid-cols-[minmax(200px,2fr)_100px_96px_96px_100px_minmax(160px,2fr)_64px] gap-2 rounded-lg border border-border/30 bg-background/95 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur lg:grid">
          <span>Drug</span>
          <span>Strength</span>
          <span>Route</span>
          <span>Freq</span>
          <span>Duration</span>
          <span>Instructions</span>
          <span />
        </div>

        <div className="space-y-2">
          {items.map((row) => {
            const st = rowStatus[row.id] ?? "pending"
            if (st === "rejected") return null
            return (
              <div
                key={row.id}
                className={cn(
                  "grid grid-cols-1 items-center gap-2 rounded-xl border border-border/40 bg-background px-2.5 py-2 transition-colors sm:grid-cols-2 lg:grid-cols-[minmax(200px,2fr)_100px_96px_96px_100px_minmax(160px,2fr)_64px]",
                  st === "accepted" && "border-emerald-500/35 bg-emerald-500/[0.05]"
                )}
              >
                <div className="relative">
                  <Input
                    value={row.drug}
                    onChange={(e) => {
                      const v = e.target.value
                      setField(row.id, { drug: v })
                      void searchDrugs(v, row.id)
                    }}
                    onBlur={() => window.setTimeout(() => setSuggestions(null), 120)}
                    placeholder="Drug name"
                    aria-autocomplete="list"
                    aria-expanded={suggestions?.rowId === row.id}
                    className="h-9 border-border/40 bg-background text-[13px] font-medium"
                  />
                  {suggestions?.rowId === row.id && suggestions.list.length > 0 ? (
                    <div
                      role="listbox"
                      aria-label="Medication suggestions"
                      className="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-36 overflow-y-auto rounded-md border border-border bg-background py-0.5 shadow-md"
                    >
                      {suggestions.list.slice(0, 8).map((name) => (
                        <button
                          key={name}
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="block w-full px-2.5 py-2 text-left text-[12px] hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setField(row.id, { drug: name })
                            setSuggestions(null)
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Input
                  value={row.strength ?? ""}
                  onChange={(e) => setField(row.id, { strength: e.target.value })}
                  placeholder="500mg"
                  className="h-9 border-border/40 bg-background text-[13px]"
                />
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  value={row.route ?? "Oral"}
                  onChange={(e) => setField(row.id, { route: e.target.value })}
                >
                  {ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                  value={row.frequency ?? "OD"}
                  onChange={(e) => setField(row.id, { frequency: e.target.value })}
                >
                  {FREQ_PRESETS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <Input
                  value={row.duration ?? ""}
                  onChange={(e) => setField(row.id, { duration: e.target.value })}
                  placeholder="7 days"
                  className="h-9 border-border/40 bg-background text-[13px]"
                />
                <Input
                  value={row.instructions ?? ""}
                  onChange={(e) => setField(row.id, { instructions: e.target.value })}
                  placeholder="After meals"
                  className="h-9 border-border/40 bg-background text-[13px]"
                />
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded transition-colors",
                      st === "accepted"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    aria-label="Accept"
                    onClick={() =>
                      setRowStatus((s) => ({
                        ...s,
                        [row.id]: st === "accepted" ? "pending" : "accepted",
                      }))
                    }
                  >
                    <Check className="size-4" weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    aria-label="Reject"
                    onClick={() => setRowStatus((s) => ({ ...s, [row.id]: "rejected" }))}
                  >
                    <X className="size-4" weight="bold" />
                  </button>
                </div>

                {row.reasoning ? (
                  <div className="col-span-full -mt-0.5 pl-1">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                      onClick={() =>
                        setOpenReason((o) => ({ ...o, [row.id]: !o[row.id] }))
                      }
                    >
                      {openReason[row.id] ? <CaretUp className="size-3" /> : <CaretDown className="size-3" />}
                      Clinical reasoning
                    </button>
                    {openReason[row.id] ? (
                      <p className="mt-1 rounded-md bg-muted/40 px-2.5 py-2 text-[12px] leading-snug text-muted-foreground">
                        {row.reasoning}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </EditorShell>
  )
}
