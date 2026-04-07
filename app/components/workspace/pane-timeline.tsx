"use client"

import type { ComponentType } from "react"
import { useWorkspace, type MedicalBlockType } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { MedicalTimelinePip } from "./medical-timeline-pip"
import {
  Flask,
  Heartbeat,
  FileText,
  Receipt,
  Pill,
  Image,
  Clipboard,
  User,
  Brain,
} from "@phosphor-icons/react"
import { useCallback, useMemo, useState } from "react"

function uniqLower(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const s = raw.trim()
    if (s.length < 2) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

type FilterType = MedicalBlockType | "ALL"

const FILTER_OPTIONS: {
  value: FilterType
  label: string
  icon: ComponentType<{ className?: string; weight?: string }>
}[] = [
  { value: "ALL", label: "All", icon: Clipboard },
  { value: "LAB", label: "Labs", icon: Flask },
  { value: "VITAL", label: "Vitals", icon: Heartbeat },
  { value: "IMAGING", label: "Imaging", icon: Image },
  { value: "SOAP", label: "Notes", icon: FileText },
  { value: "CLAIM", label: "Claims", icon: Receipt },
  { value: "PRESCRIPTION", label: "Rx", icon: Pill },
]

function PatientProfileCard() {
  const {
    activePatient,
    scribeEntities,
    setSidecarContent,
    paneVisibility,
    togglePane,
  } = useWorkspace()
  if (!activePatient) return null

  /** EHR allergies/chronic live in the main sidebar only; scribe-only here. */
  const transcriptAllergies = uniqLower(scribeEntities.allergies ?? [])
  const transcriptDiagnoses = uniqLower(scribeEntities.diagnoses ?? [])
  const lifestyle = activePatient.lifestyle
  const chiefComplaint = scribeEntities.chief_complaint?.[0]
  const symptoms = scribeEntities.symptoms ?? []
  const meds = scribeEntities.medications ?? []

  const hasTranscriptBlock =
    symptoms.length > 0 ||
    meds.length > 0 ||
    transcriptAllergies.length > 0 ||
    transcriptDiagnoses.length > 0

  const transcriptFindingCount =
    symptoms.length +
    meds.length +
    transcriptAllergies.length +
    transcriptDiagnoses.length

  const openAiExtraction = useCallback(() => {
    if (!paneVisibility.sidecar) togglePane("sidecar")
    setSidecarContent({ tab: "intelligence" })
  }, [paneVisibility.sidecar, setSidecarContent, togglePane])

  const hasProfileData =
    hasTranscriptBlock || lifestyle || chiefComplaint

  if (!hasProfileData) return null

  return (
    <div className="mx-3 mb-3 space-y-2">
      {chiefComplaint && (
        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
          <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
            Chief complaint
          </div>
          <p className="mt-1 text-[11px] leading-snug text-foreground/90">{chiefComplaint}</p>
        </div>
      )}

      {hasTranscriptBlock && (
        <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground">
                From transcript
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
                {transcriptFindingCount} finding
                {transcriptFindingCount === 1 ? "" : "s"} detected. Review and accept in the
                AI tab to update the chart.
              </p>
            </div>
            <button
              type="button"
              onClick={openAiExtraction}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-700 transition-colors hover:bg-indigo-500/15 dark:text-indigo-300"
            >
              <Brain className="size-3" weight="bold" />
              AI tab
            </button>
          </div>
        </div>
      )}

      {lifestyle && (
        <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <User className="size-3.5" />
            Lifestyle
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            {lifestyle.smoker !== undefined && (
              <div><span className="text-muted-foreground">Smoking:</span> <span className="font-medium">{lifestyle.smoker ? "Yes" : "No"}</span></div>
            )}
            {lifestyle.alcohol !== undefined && (
              <div><span className="text-muted-foreground">Alcohol:</span> <span className="font-medium">{lifestyle.alcohol}</span></div>
            )}
            {lifestyle.exercise !== undefined && (
              <div><span className="text-muted-foreground">Exercise:</span> <span className="font-medium">{lifestyle.exercise}</span></div>
            )}
            {lifestyle.diet !== undefined && (
              <div><span className="text-muted-foreground">Diet:</span> <span className="font-medium">{lifestyle.diet}</span></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function PaneTimeline() {
  const { activePatient, pinToSidecar } = useWorkspace()
  const [filter, setFilter] = useState<FilterType>("ALL")

  const blocks = useMemo(() => {
    if (!activePatient) return []
    const sorted = [...activePatient.blocks].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    if (filter === "ALL") return sorted
    return sorted.filter((b) => b.type === filter)
  }, [activePatient?.blocks, filter])

  const handlePin = useCallback(
    (blockId: string) => {
      pinToSidecar(blockId)
    },
    [pinToSidecar]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border/40">
      <div className="shrink-0 overflow-x-auto border-b border-border/30 px-2 py-1.5" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center gap-0.5">
          {FILTER_OPTIONS.map(({ value, label, icon: FIcon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                filter === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <FIcon className="size-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-3" style={{ scrollbarWidth: "thin" }}>
        <PatientProfileCard />

        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pt-12 text-center">
            <Clipboard className="size-8 text-muted-foreground/20" />
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              {activePatient ? "No history yet" : "Select a patient"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Records will appear as you document
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {blocks.map((block, idx) => (
              <MedicalTimelinePip
                key={block.id}
                block={block}
                isLast={idx === blocks.length - 1}
                onPin={handlePin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
