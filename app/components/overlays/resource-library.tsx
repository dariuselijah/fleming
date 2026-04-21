"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import type { PatientDocumentListItem } from "@/app/api/clinical/patient-documents/route"
import {
  X,
  Folder,
  File,
  Image,
  Flask,
  FileText,
  MagnifyingGlass,
  PushPin,
  PaperPlaneRight,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useState, useMemo, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"

type ResourceCategory = "notes" | "labs" | "imaging" | "claims" | "all"

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  notes: FileText,
  labs: Flask,
  imaging: Image,
  claims: File,
  all: Folder,
}

function mapCategory(c: PatientDocumentListItem["category"]): ResourceCategory {
  if (c === "labs") return "labs"
  if (c === "imaging") return "imaging"
  if (c === "prescriptions") return "claims"
  return "notes"
}

export function ResourceLibrary({ onClose }: { onClose: () => void }) {
  const { pinToSidecar, activePatient, openDocumentContent } = useWorkspace()
  const { practiceId } = usePracticeCrypto()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<ResourceCategory>("all")
  const [items, setItems] = useState<PatientDocumentListItem[]>([])
  const [loading, setLoading] = useState(false)

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
    void load()
  }, [load])

  const resources = useMemo(() => {
    return items.map((r) => ({
      raw: r,
      id: r.id,
      name: r.title,
      category: mapCategory(r.category),
      date: r.updatedAt.slice(0, 10),
      summary: r.preview,
    }))
  }, [items])

  const filtered = useMemo(() => {
    let result = resources
    if (category !== "all") {
      result = result.filter((r) => r.category === category)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.summary?.toLowerCase().includes(q)
      )
    }
    return result
  }, [resources, category, search])

  const handlePin = useCallback(
    (resourceId: string) => {
      pinToSidecar(resourceId)
    },
    [pinToSidecar]
  )

  const handleOpen = useCallback(
    (row: PatientDocumentListItem) => {
      openDocumentContent({
        id: `lib-${row.id}`,
        type: "summary",
        title: row.title,
        content: row.content.slice(0, 48000),
        isStreaming: false,
        timestamp: new Date(row.updatedAt),
      })
      onClose()
    },
    [openDocumentContent, onClose]
  )

  const handleAttachChat = useCallback((row: PatientDocumentListItem) => {
    const prompt = `Chart document attached — ${row.title} (${row.category}):\n\n${row.content.slice(0, 12000)}\n\nUse this context in your next reasoning.`
    window.dispatchEvent(
      new CustomEvent("fleming:attach-chart-context", { detail: { prompt } })
    )
    onClose()
  }, [onClose])

  const categories: ResourceCategory[] = ["all", "notes", "labs", "imaging", "claims"]

  return (
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute inset-y-0 left-0 z-50 flex w-96 flex-col border-r border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Folder className="size-4 text-indigo-500" weight="fill" />
          <h3 className="text-sm font-semibold">Patient Library</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5">
          <MagnifyingGlass className="size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border/30 px-4 py-2">
        {categories.map((cat) => {
          const CatIcon = CATEGORY_ICONS[cat] ?? Folder
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium capitalize transition-colors",
                category === cat
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <CatIcon className="size-3" />
              {cat}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading chart…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-12 text-center">
            <File className="size-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">No records found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((resource) => {
              const RIcon = CATEGORY_ICONS[resource.category] ?? File
              return (
                <div
                  key={resource.id}
                  className="group flex w-full flex-col gap-1 rounded-xl p-2 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <RIcon className="size-4 text-muted-foreground" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePin(resource.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium">{resource.name}</span>
                        <PushPin className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      {resource.summary && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {resource.summary}
                        </p>
                      )}
                      <span className="text-[10px] text-muted-foreground/60">{resource.date}</span>
                    </button>
                  </div>
                  <div className="flex gap-1 pl-11">
                    <button
                      type="button"
                      onClick={() => handleOpen(resource.raw)}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAttachChat(resource.raw)}
                      className="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      <PaperPlaneRight className="size-3" />
                      Attach to chat
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
