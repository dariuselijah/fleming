"use client"

import type { ClinicalDocument, PrescriptionItem } from "@/lib/clinical-workspace/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, CaretDown, CaretUp, Pill, Plus, X } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"
import { fetchClient } from "@/lib/fetch"

const ROUTES = ["Oral", "IV", "IM", "SC", "Topical", "Inhalation", "PR"]
const FREQ_PRESETS = ["OD", "BD", "TDS", "QID", "PRN", "Nocte", "Weekly"]

function newItem(): PrescriptionItem {
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
    patch?: { prescriptionItems?: PrescriptionItem[] }
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
    doc.prescriptionItems?.length ? [...doc.prescriptionItems] : [newItem()]
  )
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})
  const [openReason, setOpenReason] = useState<Record<string, boolean>>({})
  const [suggestIdx, setSuggestIdx] = useState<{ idx: number; list: { name: string }[] } | null>(null)

  useEffect(() => {
    const rows = doc.prescriptionItems
    if (rows?.length) {
      setItems(rows.map((r) => ({ ...r })))
    } else if (!doc.isStreaming) {
      setItems([newItem()])
    }
  }, [doc.id, doc.isStreaming, doc.prescriptionItems])

  const persistItems = useCallback(
    (next: PrescriptionItem[]) => {
      setItems(next)
      updateDocumentContent(doc.content, doc.isStreaming, { prescriptionItems: next })
    },
    [doc.content, doc.isStreaming, updateDocumentContent]
  )

  const searchDrugs = useCallback(async (q: string, idx: number) => {
    const t = q.trim()
    if (t.length < 2) {
      setSuggestIdx(null)
      return
    }
    try {
      const res = await fetchClient(`/api/medications/search?q=${encodeURIComponent(t)}`)
      if (!res.ok) return
      const j = (await res.json()) as { results?: { name: string }[] }
      const list = j.results ?? []
      setSuggestIdx(list.length ? { idx, list } : null)
    } catch {
      setSuggestIdx(null)
    }
  }, [])

  const setField = (id: string, patch: Partial<PrescriptionItem>) => {
    persistItems(items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    persistItems([...items, newItem()])
  }

  const removeRow = (id: string) => {
    persistItems(items.filter((r) => r.id !== id))
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/40 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Pill className="size-3.5 text-sky-500" weight="duotone" />
          <span>{activePatient?.name ?? "Patient"}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{new Date(doc.timestamp).toLocaleString()}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
        {items.map((row, idx) => {
          const st = rowStatus[row.id] ?? "pending"
          if (st === "rejected") return null
          return (
            <div
              key={row.id}
              className={cn(
                "rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm",
                st === "accepted" && "border-emerald-500/35 bg-emerald-500/[0.04]"
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Line {idx + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-md p-1 transition-colors",
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
                    <Check className="size-3.5" weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    aria-label="Reject"
                    onClick={() => setRowStatus((s) => ({ ...s, [row.id]: "rejected" }))}
                  >
                    <X className="size-3.5" weight="bold" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <Input
                  value={row.drug}
                  onChange={(e) => {
                    const v = e.target.value
                    setField(row.id, { drug: v })
                    void searchDrugs(v, idx)
                  }}
                  placeholder="Drug name"
                  className="mb-1.5 h-8 text-[13px]"
                />
                {suggestIdx?.idx === idx && suggestIdx.list.length > 0 ? (
                  <div className="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-32 overflow-y-auto rounded-md border border-border bg-background py-0.5 shadow-md">
                    {suggestIdx.list.slice(0, 8).map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        className="block w-full px-2 py-1.5 text-left text-[11px] hover:bg-muted"
                        onClick={() => {
                          setField(row.id, { drug: s.name })
                          setSuggestIdx(null)
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={row.strength ?? ""}
                  onChange={(e) => setField(row.id, { strength: e.target.value })}
                  placeholder="Strength"
                  className="h-8 text-[12px]"
                />
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
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
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
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
                  placeholder="Duration"
                  className="h-8 text-[12px]"
                />
              </div>
              <Input
                value={row.instructions ?? ""}
                onChange={(e) => setField(row.id, { instructions: e.target.value })}
                placeholder="Patient instructions"
                className="mt-2 h-8 text-[12px]"
              />

              {row.reasoning ? (
                <div className="mt-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
                    onClick={() =>
                      setOpenReason((o) => ({ ...o, [row.id]: !o[row.id] }))
                    }
                  >
                    {openReason[row.id] ? <CaretUp className="size-3" /> : <CaretDown className="size-3" />}
                    Clinical reasoning
                  </button>
                  {openReason[row.id] ? (
                    <p className="mt-1 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                      {row.reasoning}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-[10px] text-muted-foreground"
                onClick={() => removeRow(row.id)}
              >
                Remove line
              </Button>
            </div>
          )
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1 border-dashed text-[11px]"
          onClick={addRow}
        >
          <Plus className="size-3.5" />
          Add medication
        </Button>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border/40 bg-background/90 px-3 py-3 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 text-[11px]"
            disabled={!activePatient}
            onClick={acceptAll}
          >
            Accept &amp; save to record
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-[11px]"
            onClick={rejectAll}
          >
            Reject all
          </Button>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground/80">
          Decision support only — verify allergies, renal/hepatic function, and local formulary before
          dispensing.
        </p>
      </div>
    </div>
  )
}
