"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import {
  X,
  Folder,
  File,
  FilePdf,
  Image,
  Flask,
  FileText,
  MagnifyingGlass,
  PushPin,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useState, useMemo, useCallback } from "react"
import { cn } from "@/lib/utils"

type ResourceCategory = "notes" | "labs" | "imaging" | "claims" | "all"

interface ResourceItem {
  id: string
  name: string
  category: ResourceCategory
  date: string
  summary?: string
}

function generateMockResources(): ResourceItem[] {
  return [
    { id: "r1", name: "SOAP Note — 2026-03-15", category: "notes", date: "2026-03-15", summary: "Follow-up for hypertension management" },
    { id: "r2", name: "FBC Results", category: "labs", date: "2026-03-10", summary: "WBC 7.2, Hb 14.1, Plt 245" },
    { id: "r3", name: "Lipid Panel", category: "labs", date: "2026-02-20", summary: "LDL 3.2, HDL 1.4, TG 1.8" },
    { id: "r4", name: "Chest X-Ray", category: "imaging", date: "2026-01-05", summary: "No acute cardiopulmonary process" },
    { id: "r5", name: "Claim #4821 — Discovery", category: "claims", date: "2026-03-15", summary: "Approved — R210" },
    { id: "r6", name: "HbA1c Result", category: "labs", date: "2025-12-01", summary: "7.2% — target <7.0%" },
    { id: "r7", name: "Referral Letter — Cardiology", category: "notes", date: "2025-11-15", summary: "Referred for stress ECG" },
    { id: "r8", name: "ECG Report", category: "imaging", date: "2025-11-20", summary: "Normal sinus rhythm" },
    { id: "r9", name: "SOAP Note — 2025-09-01", category: "notes", date: "2025-09-01", summary: "Annual wellness visit" },
    { id: "r10", name: "Claim #3992 — Bonitas", category: "claims", date: "2025-09-01", summary: "Approved — R375" },
  ]
}

const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  notes: FileText,
  labs: Flask,
  imaging: Image,
  claims: File,
  all: Folder,
}

export function ResourceLibrary({ onClose }: { onClose: () => void }) {
  const { pinToSidecar } = useWorkspace()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<ResourceCategory>("all")

  const resources = useMemo(() => generateMockResources(), [])

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

      {/* Search */}
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

      {/* Category filters */}
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

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "none" }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-12 text-center">
            <File className="size-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">No records found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((resource) => {
              const RIcon = CATEGORY_ICONS[resource.category] ?? File
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => handlePin(resource.id)}
                  className="group flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <RIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{resource.name}</span>
                      <PushPin className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                    {resource.summary && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {resource.summary}
                      </p>
                    )}
                    <span className="text-[10px] text-muted-foreground/60">{resource.date}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
