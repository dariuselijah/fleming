"use client"

import {
  useWorkspace,
  type SidecarTab,
  type VitalReading,
  type MedicalBlock,
} from "@/lib/clinical-workspace"
import { BLOCK_COLORS, BLOCK_ICONS } from "./medical-block-timeline-styles"
import { SessionDocumentRow } from "./session-document-row"
import { EvidenceDeepDivePanel } from "./evidence-deep-dive-panel"
import { requestMicrophoneAccess, useScribeContext } from "@/lib/scribe"
import { cn } from "@/lib/utils"
import {
  Brain,
  BookOpen,
  Pill,
  ClockCounterClockwise,
  Heartbeat,
  TrendUp,
  Microphone,
  Flask,
  Upload,
  FileAudio,
  CheckCircle,
  PaperPlaneTilt,
  SpinnerGap,
  Stethoscope,
  FirstAid,
  Lightning,
  ClockClockwise,
  WarningCircle,
  TreeStructure,
  User,
  Check,
  X,
  Files,
  Scan,
  CaretDown,
  CaretRight,
  PencilSimple,
  FileText,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

const SIDECAR_TABS: { id: SidecarTab; label: string; icon: React.ComponentType<any> }[] = [
  { id: "intelligence", label: "AI", icon: Brain },
  { id: "evidence", label: "Evidence", icon: BookOpen },
  { id: "vitals", label: "Vitals", icon: Heartbeat },
  { id: "history", label: "History", icon: ClockCounterClockwise },
  { id: "documents", label: "Docs", icon: Files },
]

type DisplayMode = "pills" | "list"

const ENTITY_SECTION_CONFIG: {
  key: string
  label: string
  icon: React.ComponentType<any>
  color: string
  dotColor: string
  bgColor: string
  display: DisplayMode
  critical?: boolean
}[] = [
  { key: "chief_complaint", label: "Chief Complaint", icon: Stethoscope, color: "text-indigo-600 dark:text-indigo-400", dotColor: "bg-indigo-500", bgColor: "bg-indigo-500/8", display: "list" },
  { key: "symptoms", label: "Symptoms", icon: FirstAid, color: "text-rose-600 dark:text-rose-400", dotColor: "bg-rose-500", bgColor: "bg-rose-500/5", display: "list" },
  { key: "diagnoses", label: "Active & Historical Dx", icon: Stethoscope, color: "text-purple-600 dark:text-purple-400", dotColor: "bg-purple-500", bgColor: "bg-purple-500/5", display: "list" },
  { key: "medications", label: "Medications", icon: Pill, color: "text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500", bgColor: "bg-blue-500/5", display: "list" },
  { key: "allergies", label: "Allergies", icon: WarningCircle, color: "text-red-600 dark:text-red-400", dotColor: "bg-red-500", bgColor: "bg-red-500/8", display: "list", critical: true },
  { key: "vitals", label: "Vitals", icon: Heartbeat, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500", bgColor: "bg-emerald-500/5", display: "pills" },
  { key: "procedures", label: "Procedures & Surgical Hx", icon: Lightning, color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500", bgColor: "bg-amber-500/5", display: "list" },
  { key: "social_history", label: "Social History", icon: User, color: "text-orange-600 dark:text-orange-400", dotColor: "bg-orange-500", bgColor: "bg-orange-500/5", display: "list" },
  { key: "family_history", label: "Family History", icon: TreeStructure, color: "text-cyan-600 dark:text-cyan-400", dotColor: "bg-cyan-500", bgColor: "bg-cyan-500/5", display: "list" },
  { key: "risk_factors", label: "Risk Assessment", icon: WarningCircle, color: "text-red-600 dark:text-red-400", dotColor: "bg-red-500", bgColor: "bg-red-500/8", display: "list", critical: true },
]

function EntityItem({
  entityKey,
  item,
  sectionLabel,
  dotColor,
  critical,
}: {
  entityKey: string
  item: string
  sectionLabel: string
  dotColor: string
  critical?: boolean
}) {
  const {
    scribeEntityStatus,
    setEntityStatus,
    updateEntityText,
    acceptScribeEntity,
    unacceptScribeEntity,
    rejectScribeEntity,
    activePatient,
  } = useWorkspace()
  const statusKey = `${entityKey}:${item}`
  const status = scribeEntityStatus[statusKey] ?? "pending"
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(item)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleAccept = useCallback(() => {
    if (status === "accepted") {
      const pid = activePatient?.patientId
      if (pid) unacceptScribeEntity(pid, entityKey, item)
      setEntityStatus(statusKey, "pending")
      return
    }
    const pid = activePatient?.patientId
    if (pid) {
      acceptScribeEntity(pid, entityKey, item, sectionLabel)
    } else {
      setEntityStatus(statusKey, "accepted")
    }
  }, [
    acceptScribeEntity,
    unacceptScribeEntity,
    activePatient?.patientId,
    entityKey,
    item,
    sectionLabel,
    setEntityStatus,
    status,
    statusKey,
  ])

  const handleReject = useCallback(() => {
    const pid = activePatient?.patientId
    if (status === "accepted" && pid) {
      unacceptScribeEntity(pid, entityKey, item)
      setEntityStatus(statusKey, "rejected")
      return
    }
    if (pid) rejectScribeEntity(pid, entityKey, item)
    else setEntityStatus(statusKey, "rejected")
  }, [
    setEntityStatus,
    statusKey,
    status,
    activePatient?.patientId,
    entityKey,
    item,
    unacceptScribeEntity,
    rejectScribeEntity,
  ])

  const startEdit = useCallback(() => {
    setEditValue(item)
    setEditing(true)
  }, [item])

  const commitEdit = useCallback(() => {
    setEditing(false)
    if (editValue.trim() && editValue.trim() !== item) {
      updateEntityText(entityKey, item, editValue.trim())
    }
  }, [editValue, item, entityKey, updateEntityText])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setEditValue(item)
  }, [item])

  if (status === "rejected") return null

  return (
    <li className="group/entity flex items-start gap-1.5 text-[10.5px] leading-snug">
      <span className={cn("mt-[5px] size-1 shrink-0 rounded-full", dotColor)} />
      {editing ? (
        <textarea
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit() }
            if (e.key === "Escape") cancelEdit()
          }}
          rows={1}
          className="flex-1 resize-none rounded border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10.5px] leading-snug outline-none ring-1 ring-primary/20 focus:ring-primary/40"
        />
      ) : (
        <span
          className={cn(
            "flex-1 cursor-text rounded px-0.5 -mx-0.5 transition-colors hover:bg-muted/40",
            critical ? "font-medium" : "",
            status === "accepted" && "text-emerald-700 dark:text-emerald-400"
          )}
          onDoubleClick={startEdit}
        >
          {item}
        </span>
      )}
      {!editing && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/entity:opacity-100">
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Edit entity"
          >
            <PencilSimple className="size-2.5" weight="bold" />
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className={cn(
              "inline-flex size-4 items-center justify-center rounded transition-colors",
              status === "accepted"
                ? "bg-emerald-500/20 text-emerald-600"
                : "text-muted-foreground/50 hover:bg-emerald-500/10 hover:text-emerald-600"
            )}
            aria-label="Accept entity"
          >
            <Check className="size-2.5" weight="bold" />
          </button>
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-red-500/10 hover:text-red-600"
            aria-label="Dismiss entity"
          >
            <X className="size-2.5" weight="bold" />
          </button>
        </span>
      )}
    </li>
  )
}

function EntityPillItem({
  entityKey,
  item,
  sectionLabel,
  dotColor,
}: {
  entityKey: string
  item: string
  sectionLabel: string
  dotColor: string
}) {
  const {
    scribeEntityStatus,
    setEntityStatus,
    acceptScribeEntity,
    unacceptScribeEntity,
    rejectScribeEntity,
    activePatient,
  } = useWorkspace()
  const statusKey = `${entityKey}:${item}`
  const status = scribeEntityStatus[statusKey] ?? "pending"

  const handleAccept = useCallback(() => {
    if (status === "accepted") {
      const pid = activePatient?.patientId
      if (pid) unacceptScribeEntity(pid, entityKey, item)
      setEntityStatus(statusKey, "pending")
      return
    }
    const pid = activePatient?.patientId
    if (pid) {
      acceptScribeEntity(pid, entityKey, item, sectionLabel)
    } else {
      setEntityStatus(statusKey, "accepted")
    }
  }, [
    acceptScribeEntity,
    unacceptScribeEntity,
    activePatient?.patientId,
    entityKey,
    item,
    sectionLabel,
    setEntityStatus,
    status,
    statusKey,
  ])

  const handleReject = useCallback(() => {
    const pid = activePatient?.patientId
    if (status === "accepted" && pid) {
      unacceptScribeEntity(pid, entityKey, item)
      setEntityStatus(statusKey, "rejected")
      return
    }
    if (pid) rejectScribeEntity(pid, entityKey, item)
    else setEntityStatus(statusKey, "rejected")
  }, [
    setEntityStatus,
    statusKey,
    status,
    activePatient?.patientId,
    entityKey,
    item,
    unacceptScribeEntity,
    rejectScribeEntity,
  ])

  if (status === "rejected") return null

  return (
    <span
      className={cn(
        "group/pill inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        status === "accepted" ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-muted/60"
      )}
    >
      <span className={cn("size-1 shrink-0 rounded-full", dotColor)} />
      {item}
      <button
        type="button"
        onClick={handleAccept}
        className={cn(
          "ml-0.5 hidden size-3 items-center justify-center rounded transition-colors group-hover/pill:inline-flex",
          status === "accepted"
            ? "text-emerald-600"
            : "text-muted-foreground/50 hover:text-emerald-600"
        )}
        aria-label="Accept"
      >
        <Check className="size-2" weight="bold" />
      </button>
      <button
        type="button"
        onClick={handleReject}
        className="ml-0.5 hidden size-3 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-red-600 group-hover/pill:inline-flex"
        aria-label="Dismiss"
      >
        <X className="size-2" weight="bold" />
      </button>
    </span>
  )
}

function DismissedEntities() {
  const { scribeEntityStatus, scribeEntities, setEntityStatus } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)

  const dismissed = useMemo(() => {
    const items: { key: string; item: string }[] = []
    for (const [statusKey, status] of Object.entries(scribeEntityStatus)) {
      if (status !== "rejected") continue
      const colonIdx = statusKey.indexOf(":")
      if (colonIdx < 0) continue
      items.push({ key: statusKey.slice(0, colonIdx), item: statusKey.slice(colonIdx + 1) })
    }
    return items
  }, [scribeEntityStatus])

  if (dismissed.length === 0) return null

  return (
    <div className="rounded-xl border border-dashed border-border/30 bg-muted/20">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-muted-foreground/60"
      >
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <CaretDown className="size-2.5" />
        </motion.span>
        {dismissed.length} dismissed
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-2.5 pb-2"
          >
            <div className="flex flex-wrap gap-1">
              {dismissed.map(({ key, item }) => (
                <button
                  key={`${key}:${item}`}
                  type="button"
                  onClick={() => setEntityStatus(`${key}:${item}`, "pending")}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
                >
                  {item}
                  <span className="text-[8px]">↩</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function IntelligenceTab() {
  const {
    activePatient,
    scribeActive,
    setScribeActive,
    scribeEntities,
    scribeTranscript,
    scribeEntityStatus,
    acceptScribeEntity,
  } = useWorkspace()
  const scribeCtx = useScribeContext()
  const audioRef = useRef<HTMLInputElement>(null)
  const isSigned = activePatient?.consultSigned
  const isClaimSubmitted = activePatient?.claimSubmitted
  const isTranscribing = scribeCtx?.isTranscribing ?? false

  const hasEntities = useMemo(() => {
    return Object.values(scribeEntities).some(
      (arr) => Array.isArray(arr) && arr.length > 0
    )
  }, [scribeEntities])

  const pendingExtractionCount = useMemo(() => {
    let n = 0
    for (const { key } of ENTITY_SECTION_CONFIG) {
      const items = (scribeEntities as unknown as Record<string, string[] | undefined>)[key]
      if (!items?.length) continue
      for (const item of items) {
        const sk = `${key}:${item}`
        const st = scribeEntityStatus[sk] ?? "pending"
        if (st === "pending") n++
      }
    }
    return n
  }, [scribeEntities, scribeEntityStatus])

  const acceptAllPendingExtraction = useCallback(() => {
    const pid = activePatient?.patientId
    if (!pid) return
    for (const { key, label } of ENTITY_SECTION_CONFIG) {
      const items = (scribeEntities as unknown as Record<string, string[] | undefined>)[key]
      if (!items?.length) continue
      for (const item of items) {
        const sk = `${key}:${item}`
        const st = scribeEntityStatus[sk] ?? "pending"
        if (st !== "pending") continue
        acceptScribeEntity(pid, key, item, label)
      }
    }
  }, [activePatient?.patientId, scribeEntities, scribeEntityStatus, acceptScribeEntity])

  const handleAudioUpload = useCallback(() => {
    audioRef.current?.click()
  }, [])

  const handleAudioFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && scribeCtx) {
        scribeCtx.transcribeAudioFile(file)
      }
      if (audioRef.current) audioRef.current.value = ""
    },
    [scribeCtx]
  )

  return (
    <div className="flex flex-col gap-2 p-3">
      <input
        ref={audioRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.webm"
        className="hidden"
        onChange={handleAudioFileChange}
      />

      {/* Consult status */}
      {activePatient && (
        <div className={cn(
          "rounded-xl border p-2.5",
          isSigned
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-border/50 bg-card"
        )}>
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold">
              {isSigned ? (
                <><CheckCircle className="size-3 text-emerald-500" weight="fill" /> Signed</>
              ) : (
                <><Brain className="size-3 text-indigo-500" /> Active Consult</>
              )}
            </h4>
            {isSigned && activePatient.consultSignedAt && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(activePatient.consultSignedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {isClaimSubmitted && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <PaperPlaneTilt className="size-2.5" weight="fill" />
              Claim {activePatient.claimId} submitted
            </div>
          )}
        </div>
      )}

      {/* Live extracted entities — collapsible sections to reduce visual noise */}
      {hasEntities && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <Brain className="size-3 text-muted-foreground" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Extraction
              </h4>
              {scribeActive && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="size-1.5 rounded-full bg-red-500"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={acceptAllPendingExtraction}
                disabled={pendingExtractionCount === 0}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                  pendingExtractionCount > 0
                    ? "border-primary/35 bg-primary/10 text-primary hover:bg-primary/15"
                    : "cursor-not-allowed border-border/40 bg-muted/30 text-muted-foreground/50"
                )}
              >
                Accept all
                {pendingExtractionCount > 0 ? (
                  <span className="ml-1 tabular-nums text-muted-foreground">({pendingExtractionCount})</span>
                ) : null}
              </button>
              <span className="text-[9px] text-muted-foreground/60">Reject inaccurate lines below</span>
            </div>
          </div>
          {ENTITY_SECTION_CONFIG.map(
            ({ key, label, dotColor, display, critical }) => {
              const items = (scribeEntities as unknown as Record<string, string[]>)[key]
              if (!items || items.length === 0) return null
              const defaultOpen = key === "chief_complaint" || key === "allergies"
              return (
                <details
                  key={key}
                  open={defaultOpen}
                  className={cn(
                    "group rounded-lg border border-border/35 bg-muted/10 [&_summary::-webkit-details-marker]:hidden"
                  )}
                >
                  <summary
                    className={cn(
                      "flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/25",
                      critical && "text-foreground/90"
                    )}
                  >
                    <CaretRight className="size-2.5 shrink-0 text-muted-foreground/70 transition-transform group-open:rotate-90" />
                    <span className={cn("size-1.5 shrink-0 rounded-full", dotColor)} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground/50">
                      {items.length}
                    </span>
                  </summary>
                  <div className="border-t border-border/25 px-2 py-1.5">
                    {display === "pills" ? (
                      <div className="flex flex-wrap gap-1">
                        {items.map((item, i) => (
                          <EntityPillItem
                            key={i}
                            entityKey={key}
                            item={item}
                            sectionLabel={label}
                            dotColor={dotColor}
                          />
                        ))}
                      </div>
                    ) : (
                      <ul className="space-y-0.5">
                        {items.map((item, i) => (
                          <EntityItem
                            key={i}
                            entityKey={key}
                            item={item}
                            sectionLabel={label}
                            dotColor={dotColor}
                            critical={critical}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )
            }
          )}
          <DismissedEntities />
        </div>
      )}

      {/* Input methods */}
      <div className="rounded-xl border border-border/50 bg-card p-2.5">
        <h4 className="text-[11px] font-semibold mb-1.5">Input</h4>
        <div className="space-y-1">
          <button
            type="button"
            onClick={async () => {
              if (scribeActive) {
                setScribeActive(false)
                return
              }
              const ok = await requestMicrophoneAccess()
              if (!ok) {
                toast.error("Microphone access is required for live scribe.")
                return
              }
              setScribeActive(true)
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors",
              scribeActive
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            <Microphone className="size-3.5" weight={scribeActive ? "fill" : "regular"} />
            <span className="font-medium">{scribeActive ? "Scribe active" : "Live scribe"}</span>
            <span className="ml-auto text-[10px] opacity-60">Real-time</span>
          </button>
          <button
            type="button"
            onClick={handleAudioUpload}
            disabled={isTranscribing}
            className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isTranscribing ? (
              <SpinnerGap className="size-3.5 animate-spin" />
            ) : (
              <FileAudio className="size-3.5" />
            )}
            <span className="font-medium">{isTranscribing ? "Transcribing..." : "Upload audio"}</span>
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">
          Type <code className="rounded bg-muted px-1 text-[9px]">/</code> for commands
        </p>
      </div>

      {/* Placeholder when no entities yet */}
      {!hasEntities && scribeTranscript && (
        <div className="rounded-xl border border-dashed border-border/40 p-3 text-center">
          <SpinnerGap className="mx-auto size-4 animate-spin text-muted-foreground/30" />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Analyzing transcript...
          </p>
        </div>
      )}

      {!hasEntities && !scribeTranscript && (
        <div className="rounded-xl border border-dashed border-border/40 p-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            Entities will auto-populate as you document.
          </p>
        </div>
      )}
    </div>
  )
}

function EvidenceTab() {
  return <EvidenceDeepDivePanel />
}

function VitalsTab() {
  const { activePatient } = useWorkspace()
  const vitals = activePatient?.vitals ?? []

  const grouped = useMemo(() => {
    const groups: Record<string, VitalReading[]> = {}
    vitals.forEach((v) => {
      if (!groups[v.type]) groups[v.type] = []
      groups[v.type].push(v)
    })
    return groups
  }, [vitals])

  const vitalTypes = Object.keys(grouped)

  return (
    <div className="flex flex-col gap-3 p-3">
      {vitalTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 p-4 text-center">
          <Heartbeat className="mx-auto size-6 text-muted-foreground/20" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            No vitals recorded.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            Use <code className="rounded bg-muted px-1 text-[9px]">/vitals</code> or connect a device
          </p>
        </div>
      ) : (
        vitalTypes.map((type) => {
          const readings = grouped[type].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          const latest = readings[0]
          const label = type.replace(/_/g, " ")

          return (
            <div key={type} className="rounded-xl border border-border/50 bg-card p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold capitalize">{label}</h4>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <TrendUp className="size-3" />
                  <span className="text-[10px]">{readings.length}</span>
                </div>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums">
                  {latest.type === "blood_pressure" && latest.secondaryValue
                    ? `${latest.value}/${latest.secondaryValue}`
                    : latest.value}
                </span>
                <span className="text-[11px] text-muted-foreground">{latest.unit}</span>
              </div>
              {readings.length > 1 && (
                <div className="mt-2 flex gap-0.5">
                  {readings.slice(0, 10).map((r) => {
                    const maxVal = Math.max(...readings.map((x) => x.value))
                    const minVal = Math.min(...readings.map((x) => x.value))
                    const range = maxVal - minVal || 1
                    const pct = ((r.value - minVal) / range) * 100
                    return (
                      <div key={r.id} className="flex flex-1 flex-col items-center">
                        <div className="relative h-6 w-full rounded-sm bg-muted/40">
                          <div
                            className="absolute bottom-0 w-full rounded-sm bg-indigo-500/50"
                            style={{ height: `${Math.max(pct, 10)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function HistoryTab() {
  const {
    activePatient,
    pinToSidecar,
    sidecarContent,
    openDocumentContent,
    setSidecarContent,
  } = useWorkspace()

  const goVitals = useCallback(() => {
    setSidecarContent(sidecarContent ? { ...sidecarContent, tab: "vitals" } : { tab: "vitals" })
  }, [setSidecarContent, sidecarContent])

  const goLabsHint = useCallback(() => {
    toast.info("Use Labs (+) in the left chart panel to order labs.", { duration: 4_000 })
  }, [])

  const goImagingHint = useCallback(() => {
    toast.info("Use Imaging (+) in the left chart panel to add imaging.", { duration: 4_000 })
  }, [])

  const openDocumentsTab = useCallback(() => {
    setSidecarContent(sidecarContent ? { ...sidecarContent, tab: "documents" } : { tab: "documents" })
  }, [setSidecarContent, sidecarContent])
  const blocks = useMemo(
    () =>
      [...(activePatient?.blocks ?? [])].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [activePatient?.blocks]
  )

  const pinnedBlock = useMemo(
    () =>
      sidecarContent?.pinnedBlockId
        ? blocks.find((b) => b.id === sidecarContent.pinnedBlockId)
        : null,
    [blocks, sidecarContent?.pinnedBlockId]
  )

  const openLinkedDocument = useCallback(
    (block: MedicalBlock) => {
      const rawId = block.metadata?.clinicalDocumentId
      const docId = typeof rawId === "string" ? rawId : null
      if (!docId || !activePatient?.sessionDocuments?.length) return
      const sd = activePatient.sessionDocuments.find(
        (e) => e.document.id === docId || e.id === docId
      )
      if (!sd) return
      openDocumentContent(sd.document)
      setSidecarContent(
        sidecarContent
          ? { ...sidecarContent, tab: "documents" }
          : { tab: "documents" }
      )
    },
    [
      activePatient?.sessionDocuments,
      openDocumentContent,
      setSidecarContent,
      sidecarContent,
    ]
  )

  const hasLinkedDocument = useCallback(
    (block: MedicalBlock) => {
      const rawId = block.metadata?.clinicalDocumentId
      const docId = typeof rawId === "string" ? rawId : null
      if (!docId) return false
      const docLinkedTypes: MedicalBlock["type"][] = [
        "NOTE",
        "SOAP",
        "PRESCRIPTION",
        "REFERRAL",
      ]
      if (!docLinkedTypes.includes(block.type)) return false
      return Boolean(
        activePatient?.sessionDocuments?.some(
          (e) => e.document.id === docId || e.id === docId
        )
      )
    },
    [activePatient?.sessionDocuments]
  )

  const historyBlocks = useMemo(() => blocks.slice(0, 40), [blocks])

  const acceptLog = useMemo(
    () =>
      [...(activePatient?.acceptHistory ?? [])].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      ),
    [activePatient?.acceptHistory]
  )

  return (
    <div className="flex flex-col gap-3 p-2">
      <div className="mx-1 flex flex-wrap gap-1.5 rounded-xl border border-border/40 bg-muted/20 p-2">
        <button
          type="button"
          onClick={goVitals}
          className="inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <Heartbeat className="size-3.5 text-rose-500" weight="fill" />
          Vitals
        </button>
        <button
          type="button"
          onClick={goLabsHint}
          className="inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <Flask className="size-3.5 text-emerald-500" weight="fill" />
          Labs
        </button>
        <button
          type="button"
          onClick={goImagingHint}
          className="inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <Scan className="size-3.5 text-rose-400" weight="fill" />
          Imaging
        </button>
        <button
          type="button"
          onClick={openDocumentsTab}
          className="inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-1 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <Files className="size-3.5 text-sky-500" weight="fill" />
          Docs
        </button>
      </div>

      {acceptLog.length > 0 && (
        <div className="mx-1 rounded-xl border border-border/40 bg-muted/15 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chart actions (AI extraction)
          </p>
          <ul
            className="mt-1.5 max-h-40 space-y-1.5 overflow-y-auto pr-1"
            style={{ scrollbarWidth: "thin" }}
          >
            {acceptLog.slice(0, 40).map((e, i) => (
              <li key={`${e.at}-${i}-${e.item.slice(0, 24)}`} className="flex gap-2 text-[10px] leading-snug">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    e.action === "accepted" && "bg-emerald-500",
                    e.action === "unaccepted" && "bg-amber-500",
                    e.action === "rejected" && "bg-red-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-semibold capitalize text-foreground">{e.action}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.entityKey.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-[10px] text-foreground/85">{e.item}</p>
                  <p className="text-[9px] tabular-nums text-muted-foreground/80">
                    {new Date(e.at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pinnedBlock && (
        <div className="mx-1 rounded-xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-transparent p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Pinned
          </span>
          <h4 className="mt-0.5 text-xs font-semibold">{pinnedBlock.title ?? pinnedBlock.type}</h4>
          {pinnedBlock.summary && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{pinnedBlock.summary}</p>
          )}
        </div>
      )}

      {blocks.length === 0 && acceptLog.length === 0 ? (
        <div className="mx-1 rounded-xl border border-dashed border-border/40 p-4 text-center">
          <ClockCounterClockwise className="mx-auto size-6 text-muted-foreground/20" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Patient history will appear here.
          </p>
        </div>
      ) : blocks.length > 0 ? (
        <div className="relative px-1">
          <div
            className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-indigo-500/25 via-border/60 to-border/10"
            aria-hidden
          />
          <ul className="relative space-y-0">
            {historyBlocks.map((block) => {
              const Icon = BLOCK_ICONS[block.type] ?? FileText
              const colorClass = BLOCK_COLORS[block.type] ?? "text-muted-foreground bg-muted"
              const time = new Date(block.timestamp)
              const timeStr = time.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
              const dateStr = time.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })
              const isPinned = sidecarContent?.pinnedBlockId === block.id
              const showOpen = hasLinkedDocument(block)

              return (
                <li key={block.id} className="relative flex gap-2.5 pb-4 last:pb-1">
                  <div className="relative z-10 flex w-10 shrink-0 justify-center pt-1">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border border-border/50 shadow-sm",
                        colorClass
                      )}
                    >
                      <Icon className="size-3.5" weight="fill" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (hasLinkedDocument(block)) {
                          openLinkedDocument(block)
                          return
                        }
                        pinToSidecar(block.id)
                      }}
                      className={cn(
                        "w-full rounded-xl border bg-card/90 p-2.5 text-left shadow-sm backdrop-blur-sm transition-all",
                        "hover:border-indigo-500/35 hover:shadow-md",
                        isPinned
                          ? "border-indigo-500/45 ring-1 ring-indigo-500/20"
                          : "border-border/50"
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold leading-tight">
                          {block.title ?? block.type}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {timeStr} · {dateStr}
                        </span>
                      </div>
                      {block.summary && (
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                          {block.summary}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            block.status === "active" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                            block.status === "archived" && "bg-muted text-muted-foreground",
                            block.status === "pending_verification" &&
                              "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                            block.status === "draft" && "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                          )}
                        >
                          {block.status.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-medium text-indigo-500/90">
                          {showOpen ? "Click to open document" : "Click to pin"}
                        </span>
                      </div>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function DocumentsTab() {
  const { activePatient, openDocumentContent, setSidecarContent, sidecarContent } = useWorkspace()

  const docs = useMemo(() => {
    const list = activePatient?.sessionDocuments ?? []
    const statusRank = (s: string) =>
      s === "accepted" ? 0 : s === "draft" ? 1 : 2
    return [...list].sort((a, b) => {
      const rs = statusRank(a.status) - statusRank(b.status)
      if (rs !== 0) return rs
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    })
  }, [activePatient?.sessionDocuments])

  return (
    <div className="flex flex-col gap-2.5 p-3">
      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-muted/5 p-5 text-center">
          <Files className="mx-auto size-7 text-muted-foreground/25" />
          <p className="mt-3 text-[11px] font-medium text-muted-foreground">
            No generated documents yet
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            Notes and letters appear here when the assistant finishes a clinical command.
          </p>
        </div>
      ) : (
        docs.map((sd) => (
          <SessionDocumentRow
            key={sd.id}
            entry={sd}
            variant="sidecar"
            onOpen={() => {
              openDocumentContent(sd.document)
              setSidecarContent(
                sidecarContent ? { ...sidecarContent, tab: "documents" } : { tab: "documents" }
              )
            }}
          />
        ))
      )}
    </div>
  )
}

const TAB_COMPONENTS: Record<SidecarTab, React.ComponentType> = {
  intelligence: IntelligenceTab,
  evidence: EvidenceTab,
  vitals: VitalsTab,
  history: HistoryTab,
  documents: DocumentsTab,
}

function normalizeSidecarTab(tab: SidecarTab | "medications" | undefined): SidecarTab {
  if (tab === "medications") return "intelligence"
  return tab ?? "intelligence"
}

export function PaneSidecar() {
  const { sidecarContent, setSidecarContent } = useWorkspace()
  const [activeTab, setActiveTab] = useState<SidecarTab>(() =>
    normalizeSidecarTab(sidecarContent?.tab as SidecarTab | undefined)
  )

  useEffect(() => {
    const rawTab = sidecarContent?.tab as string | undefined
    if (rawTab === "medications") {
      setSidecarContent(
        sidecarContent ? { ...sidecarContent, tab: "intelligence" } : { tab: "intelligence" }
      )
      setActiveTab("intelligence")
      return
    }
    const next = normalizeSidecarTab(sidecarContent?.tab)
    if (next !== activeTab) setActiveTab(next)
  }, [sidecarContent, activeTab, setSidecarContent])

  const handleTabChange = useCallback(
    (tab: SidecarTab) => {
      setActiveTab(tab)
      setSidecarContent(sidecarContent ? { ...sidecarContent, tab } : { tab })
    },
    [sidecarContent, setSidecarContent]
  )

  const ActiveComponent = TAB_COMPONENTS[activeTab]

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border/40">
      <div className="shrink-0 overflow-x-auto border-b border-border/30 px-2 py-1.5" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center gap-0.5">
          {SIDECAR_TABS.map(({ id, label, icon: TabIcon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleTabChange(id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                activeTab === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <TabIcon className="size-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        <ActiveComponent />
      </div>
    </div>
  )
}
