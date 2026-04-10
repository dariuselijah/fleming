"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import type { PatientDocumentListItem } from "@/app/api/clinical/patient-documents/route"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText, Flask, ImageSquare, Pill, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

type Tab = "all" | "notes" | "labs" | "imaging"

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "labs", label: "Labs" },
  { id: "imaging", label: "Imaging" },
]

function iconFor(cat: PatientDocumentListItem["category"]) {
  switch (cat) {
    case "labs":
      return Flask
    case "imaging":
      return ImageSquare
    case "prescriptions":
      return Pill
    default:
      return FileText
  }
}

export function DocumentSelectorModal({
  open,
  onClose,
  onAttach,
}: {
  open: boolean
  onClose: () => void
  onAttach: (promptFragment: string) => void
}) {
  const { activePatient } = useWorkspace()
  const { practiceId } = usePracticeCrypto()
  const [items, setItems] = useState<PatientDocumentListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<Tab>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!activePatient?.patientId || !practiceId) return
    setLoading(true)
    try {
      const res = await fetchClient(
        `/api/clinical/patient-documents?patientId=${encodeURIComponent(activePatient.patientId)}&practiceId=${encodeURIComponent(practiceId)}`
      )
      if (!res.ok) return
      const j = (await res.json()) as { items?: PatientDocumentListItem[] }
      setItems(j.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [activePatient?.patientId, practiceId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const filtered = useMemo(() => {
    let list = items
    if (tab === "notes") list = list.filter((i) => i.category === "notes" || i.category === "prescriptions")
    if (tab === "labs") list = list.filter((i) => i.category === "labs")
    if (tab === "imaging") list = list.filter((i) => i.category === "imaging")
    const qq = q.trim().toLowerCase()
    if (qq) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(qq) ||
          i.preview.toLowerCase().includes(qq)
      )
    }
    return list
  }, [items, tab, q])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const attach = () => {
    const chosen = items.filter((i) => selected.has(i.id))
    if (chosen.length === 0) return
    const block = chosen
      .map(
        (i) =>
          `### Attached: ${i.title} (${i.kind}, ${i.category})\n${i.content.slice(0, 8000)}`
      )
      .join("\n\n---\n\n")
    onAttach(
      `The following chart documents are attached for context:\n\n${block}\n\nAnswer using this context where relevant.`
    )
    setSelected(new Set())
    onClose()
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal
        aria-labelledby="doc-sel-title"
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h2 id="doc-sel-title" className="text-sm font-semibold">
              Attach chart documents
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="border-b border-border/40 px-3 py-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-8 text-[13px]"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {TAB_LABELS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    tab === t.id
                      ? "bg-foreground text-background"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
            {loading ? (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                No documents found. Documents appear as you document encounters.
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((row) => {
                  const Icon = iconFor(row.category)
                  const on = selected.has(row.id)
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                          on
                            ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                            : "border-border/50 bg-muted/20 hover:bg-muted/40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-emerald-500 bg-emerald-500/20" : "border-border"
                          )}
                        >
                          {on ? <span className="text-[10px] text-emerald-600">✓</span> : null}
                        </span>
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium">{row.title}</span>
                          <span className="line-clamp-2 text-[10px] text-muted-foreground">
                            {row.preview}
                          </span>
                          <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-muted-foreground/70">
                            {row.category} · {row.updatedAt.slice(0, 10)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex gap-2 border-t border-border/50 px-3 py-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={selected.size === 0}
              onClick={attach}
            >
              Attach selected ({selected.size})
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
