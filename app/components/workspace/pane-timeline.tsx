"use client"

import type { ComponentType } from "react"
import { useWorkspace, type MedicalBlockType } from "@/lib/clinical-workspace"
import type { PatientMedication } from "@/lib/clinical-workspace/types"
import { cn } from "@/lib/utils"
import { MedicalTimelinePip } from "./medical-timeline-pip"
import { MedicalTimelineAcceptedCluster } from "./medical-timeline-accepted-cluster"
import {
  formatTimelineDateHeader,
  groupBlocksByDateKey,
  segmentBlocksForOneDay,
  sortedDateKeysDesc,
  type TimelineDaySegment,
} from "@/lib/clinical-workspace/timeline-grouping"
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
  X,
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
  icon: ComponentType<Record<string, unknown>>
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

function EncounterMedicationsRxList({
  meds,
  onRemove,
}: {
  meds: PatientMedication[]
  onRemove: (medicationId: string) => void
}) {
  return (
    <div className="mx-3 mb-4 rounded-xl border border-border/45 bg-muted/15 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Encounter medications
        </p>
        <span className="text-[9px] text-muted-foreground/70">Left chart to edit</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {meds.map((m) => (
          <li
            key={m.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border/35 bg-background/50 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-snug text-foreground">{m.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "Dose / frequency not stated"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(m.id)}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition hover:text-red-500"
              aria-label="Remove medication"
            >
              <X className="size-3.5" weight="bold" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PaneTimeline() {
  const { activePatient, pinToSidecar, removeSessionMedication } = useWorkspace()
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

  const blocksByDate = useMemo(
    () => groupBlocksByDateKey(blocks),
    [blocks]
  )
  const dateKeysDesc = useMemo(
    () => sortedDateKeysDesc(blocksByDate.keys()),
    [blocksByDate]
  )

  const timelineSections = useMemo(() => {
    const sections: {
      dateKey: string
      segments: TimelineDaySegment[]
    }[] = []
    for (const dk of dateKeysDesc) {
      const day = blocksByDate.get(dk)
      if (!day?.length) continue
      sections.push({ dateKey: dk, segments: segmentBlocksForOneDay(day) })
    }
    return sections
  }, [blocksByDate, dateKeysDesc])

  /** Bottom-most single row (not inside a cluster) — hides trailing connector. */
  const lastGlobalSingleBlockId = useMemo(() => {
    const lastDay = timelineSections[timelineSections.length - 1]
    if (!lastDay?.segments.length) return null
    const lastSeg = lastDay.segments[lastDay.segments.length - 1]
    if (lastSeg.type === "single") return lastSeg.block.id
    return null
  }, [timelineSections])

  const encounterMeds = activePatient?.activeMedications ?? []
  const showRxEncounterList =
    filter === "PRESCRIPTION" && !!activePatient && encounterMeds.length > 0

  const showEmptyPlaceholder =
    !activePatient ||
    (blocks.length === 0 && !(filter === "PRESCRIPTION" && encounterMeds.length > 0))

  const emptyTitle =
    !activePatient
      ? "Select a patient"
      : filter === "PRESCRIPTION"
        ? "No medications on this encounter yet"
        : "No history yet"

  const emptySubtitle =
    !activePatient
      ? "Records will appear as you document"
      : filter === "PRESCRIPTION"
        ? "Add medications in the left chart — they appear here automatically."
        : "Records will appear as you document"

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

        {showRxEncounterList && activePatient && (
          <EncounterMedicationsRxList
            meds={encounterMeds}
            onRemove={(id) => removeSessionMedication(activePatient.patientId, id)}
          />
        )}

        {showEmptyPlaceholder ? (
          <div className="flex flex-col items-center justify-center px-4 pt-12 text-center">
            <Clipboard className="size-8 text-muted-foreground/20" />
            <p className="mt-3 text-xs font-medium text-muted-foreground">{emptyTitle}</p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">{emptySubtitle}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {timelineSections.map(({ dateKey, segments }) => (
              <section key={dateKey} className="mb-1">
                <div className="sticky top-0 z-[1] -mx-0.5 mb-2 border-b border-border/25 bg-background/90 px-3 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {formatTimelineDateHeader(dateKey)}
                  </p>
                </div>
                <div className="flex flex-col">
                  {segments.map((seg, segIdx) => {
                    if (seg.type === "cluster") {
                      return (
                        <MedicalTimelineAcceptedCluster
                          key={`${dateKey}-acc-${seg.category}-${seg.blocks[0]?.id ?? segIdx}`}
                          category={seg.category}
                          blocks={seg.blocks}
                          onPin={handlePin}
                        />
                      )
                    }
                    const block = seg.block
                    const isLastGlobally = block.id === lastGlobalSingleBlockId
                    return (
                      <MedicalTimelinePip
                        key={block.id}
                        block={block}
                        isLast={isLastGlobally}
                        onPin={handlePin}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
