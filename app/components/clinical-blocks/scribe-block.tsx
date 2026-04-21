"use client"

import { assessClinicalContext, useWorkspace } from "@/lib/clinical-workspace"
import { useScribeContext } from "@/lib/scribe"
import { highlightFromExtracted, type HighlightedSegment, type HighlightSpan } from "@/lib/scribe/entity-highlighter"
import { cn } from "@/lib/utils"
import {
  Microphone,
  Stop,
  Pause,
  Play,
  SpinnerGap,
  Warning,
  CaretDown,
  CaretUp,
  UserCircle,
  PencilSimple,
  Check,
  Trash,
  Sparkle,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useMemo, useRef, useEffect, useState, useCallback } from "react"

const ENTITY_COLORS: Record<string, string> = {
  medication: "bg-blue-500/20 text-blue-700 dark:text-blue-300 decoration-blue-500/40",
  diagnosis: "bg-purple-500/20 text-purple-700 dark:text-purple-300 decoration-purple-500/40",
  vital: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 decoration-emerald-500/40",
  procedure: "bg-amber-500/20 text-amber-700 dark:text-amber-300 decoration-amber-500/40",
  symptom: "bg-rose-500/15 text-rose-700 dark:text-rose-300 decoration-rose-500/40",
  history: "bg-orange-500/15 text-orange-700 dark:text-orange-300 decoration-orange-500/40",
}

const ENTITY_DOTS: Record<string, string> = {
  medication: "bg-blue-500",
  diagnosis: "bg-purple-500",
  vital: "bg-emerald-500",
  procedure: "bg-amber-500",
  symptom: "bg-rose-500",
  history: "bg-orange-500",
}

function HighlightedText({ segments }: { segments: HighlightedSegment[] }) {
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.text}</span>
        }
        return (
          <mark
            key={i}
            className={cn(
              "rounded px-0.5 py-px text-[13px] font-medium underline decoration-1 underline-offset-2",
              ENTITY_COLORS[seg.entityType] ?? ""
            )}
            title={seg.entityType}
          >
            {seg.text}
          </mark>
        )
      })}
    </span>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

const SPEAKER_COLORS = [
  "text-indigo-600 dark:text-indigo-400",
  "text-teal-600 dark:text-teal-400",
  "text-amber-600 dark:text-amber-400",
  "text-pink-600 dark:text-pink-400",
]

function SpeakerLabel({ speaker, index }: { speaker: string; index: number }) {
  const colorClass = SPEAKER_COLORS[index % SPEAKER_COLORS.length]
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider", colorClass)}>
      <UserCircle className="size-3" weight="fill" />
      {speaker}
    </span>
  )
}

const NOTE_TEMPLATES = [
  { id: "soap", label: "SOAP" },
  { id: "summary", label: "Summary" },
  { id: "refer", label: "Referral" },
  { id: "prescribe", label: "Rx" },
  { id: "icd", label: "ICD-10" },
]

export function ScribeBlock() {
  const {
    scribeActive,
    scribeCollapsed,
    scribeTranscript,
    scribeSegments,
    scribeEntities,
    scribeHighlights,
    setScribeActive,
    setScribeCollapsed,
    setScribeTranscript,
    clearScribeTranscript,
  } = useWorkspace()

  const scribeCtx = useScribeContext()
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const expanded = !scribeCollapsed
  const setExpanded = useCallback((val: boolean) => setScribeCollapsed(!val), [setScribeCollapsed])
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const highlights: HighlightSpan[] = scribeHighlights

  const segments = useMemo(
    () => highlightFromExtracted(scribeTranscript, highlights),
    [scribeTranscript, highlights]
  )

  const hasDiarization = scribeSegments.length > 0 && scribeSegments.some((s) => s.speaker)
  const speakerMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const seg of scribeSegments) {
      if (seg.speaker && !map.has(seg.speaker)) {
        map.set(seg.speaker, map.size)
      }
    }
    return map
  }, [scribeSegments])

  const entityCount = useMemo(() => {
    return Object.values(scribeEntities).reduce(
      (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
      0
    )
  }, [scribeEntities])

  useEffect(() => {
    if (expanded && scribeTranscript && transcriptEndRef.current && !isEditing) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [scribeTranscript, expanded, isEditing])

  const startEditing = useCallback(() => {
    setEditValue(scribeTranscript)
    setIsEditing(true)
    setTimeout(() => editRef.current?.focus(), 50)
  }, [scribeTranscript])

  const saveEdit = useCallback(() => {
    setScribeTranscript(editValue)
    setIsEditing(false)
    scribeCtx?.triggerExtraction?.()
  }, [editValue, setScribeTranscript, scribeCtx])

  const cancelEdit = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleClear = useCallback(() => {
    if (showClearConfirm) {
      clearScribeTranscript()
      setShowClearConfirm(false)
    } else {
      setShowClearConfirm(true)
      setTimeout(() => setShowClearConfirm(false), 3000)
    }
  }, [showClearConfirm, clearScribeTranscript])

  const [generatingTemplate, setGeneratingTemplate] = useState<string | null>(null)
  const [contextGateTemplate, setContextGateTemplate] = useState<string | null>(null)

  const contextAssessment = useMemo(
    () => assessClinicalContext(scribeTranscript, scribeEntities),
    [scribeTranscript, scribeEntities]
  )

  const handleGenerateNote = useCallback(
    (template: string, force = false) => {
      if (!force && contextAssessment.shouldPrompt) {
        setContextGateTemplate(template)
        return
      }
      if (typeof window !== "undefined") {
        setContextGateTemplate(null)
        setGeneratingTemplate(template)
        window.dispatchEvent(new CustomEvent("fleming:generate-note", { detail: { template } }))
      }
    },
    [contextAssessment.shouldPrompt]
  )

  const appendPromptToTranscript = useCallback(
    (line: string) => {
      const next = scribeTranscript.trim()
        ? `${scribeTranscript.trim()}\n\n${line}`
        : line
      setScribeTranscript(next)
    },
    [scribeTranscript, setScribeTranscript]
  )

  useEffect(() => {
    if (!scribeTranscript) setGeneratingTemplate(null)
  }, [scribeTranscript])

  useEffect(() => {
    if (scribeCollapsed && generatingTemplate) {
      const timer = setTimeout(() => setGeneratingTemplate(null), 800)
      return () => clearTimeout(timer)
    }
  }, [scribeCollapsed, generatingTemplate])

  if (!scribeActive && !scribeTranscript) return null

  const isTranscribing = scribeCtx?.isTranscribing ?? false
  const recorderDuration = scribeCtx?.recorderDuration ?? 0
  const recorderError = scribeCtx?.recorderError
  const transcriptionError = scribeCtx?.transcriptionError
  const isPaused = scribeCtx?.isPaused ?? false
  const isDone = !scribeActive && scribeTranscript.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-3"
    >
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-background/80 shadow-sm backdrop-blur-xl">
        {/* Header */}
        <div className="flex w-full items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex flex-1 items-center gap-2 transition-colors hover:opacity-80"
          >
            {scribeActive && (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className={cn(
                  "size-2 rounded-full",
                  isPaused ? "bg-amber-500" : "bg-red-500"
                )}
              />
            )}
            {isDone && (
              <div className="size-2 rounded-full bg-emerald-500" />
            )}
            <Microphone
              className={cn("size-3.5", scribeActive ? "text-red-500" : isDone ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
              weight={scribeActive ? "fill" : "regular"}
            />
            <span className="text-xs font-semibold">
              {scribeActive ? "Live Scribe" : "Transcript"}
            </span>
            {scribeActive && recorderDuration > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium",
                  isPaused
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                )}
              >
                {formatDuration(recorderDuration)}
              </span>
            )}
            {isTranscribing && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <SpinnerGap className="size-3 animate-spin" />
              </span>
            )}
            {entityCount > 0 && !expanded && (
              <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                {entityCount} entities
              </span>
            )}
            {expanded ? (
              <CaretUp className="size-3.5 text-muted-foreground" />
            ) : (
              <CaretDown className="size-3.5 text-muted-foreground" />
            )}
          </button>

          <div className="flex items-center gap-2 pl-3">
            {isDone && !isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Edit transcript"
              >
                <PencilSimple className="size-3" />
              </button>
            )}

            {scribeActive && (
              <>
                {isPaused ? (
                  <button
                    type="button"
                    onClick={() => scribeCtx?.resumeRecording()}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
                    title="Resume recording"
                  >
                    <Play className="size-3" weight="fill" />
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => scribeCtx?.pauseRecording()}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/80"
                    title="Pause recording"
                  >
                    <Pause className="size-3" weight="fill" />
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScribeActive(false)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/20"
                  title="End encounter"
                >
                  <Stop className="size-3" weight="fill" />
                  End encounter
                </button>
              </>
            )}

            {isDone && !scribeActive && (
              <button
                type="button"
                onClick={handleClear}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                  showClearConfirm
                    ? "bg-red-500/15 text-red-500 hover:bg-red-500/25"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Trash className="size-3" />
                {showClearConfirm ? "Confirm?" : "Clear"}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="overflow-hidden"
            >
              {(recorderError || transcriptionError) && (
                <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2">
                  <div className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
                    <Warning className="size-3.5 shrink-0" weight="fill" />
                    {recorderError || transcriptionError}
                  </div>
                </div>
              )}

              {scribeTranscript ? (
                isEditing ? (
                  <div className="border-t border-border/20 px-4 py-3">
                    <textarea
                      ref={editRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="min-h-[200px] w-full resize-y rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20"
                      style={{ scrollbarWidth: "thin" }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700"
                      >
                        <Check className="size-3" weight="bold" />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="max-h-72 overflow-y-auto border-t border-border/20 px-4 py-3"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {hasDiarization ? (
                      <div className="space-y-2">
                        {scribeSegments.map((seg, i) => {
                          const segHighlighted = highlightFromExtracted(seg.text, highlights)
                          const speakerIdx = seg.speaker ? (speakerMap.get(seg.speaker) ?? 0) : 0
                          return (
                            <div key={i} className="text-[13px] leading-relaxed">
                              {seg.speaker && (
                                <div className="mb-0.5">
                                  <SpeakerLabel speaker={seg.speaker} index={speakerIdx} />
                                </div>
                              )}
                              <HighlightedText segments={segHighlighted} />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-[13px] leading-relaxed">
                        <HighlightedText segments={segments} />
                        {scribeActive && (
                          <motion.span
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="ml-0.5 inline-block h-3.5 w-0.5 bg-foreground"
                          />
                        )}
                      </div>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                )
              ) : scribeActive && !isTranscribing ? (
                <div className="border-t border-border/20 px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    Listening... speak and your transcript will appear here.
                  </p>
                </div>
              ) : null}

              {highlights.length > 0 && !isEditing && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/20 px-4 py-1.5">
                  {(() => {
                    const counts: Record<string, number> = {}
                    for (const h of highlights) {
                      counts[h.type] = (counts[h.type] ?? 0) + 1
                    }
                    return Object.entries(counts).map(([type, count]) => {
                      const dotColor = ENTITY_DOTS[type] ?? "bg-muted-foreground"
                      return (
                        <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", dotColor)} />
                          {count} {type}{count > 1 ? "s" : ""}
                        </span>
                      )
                    })
                  })()}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate Clinical Note banner */}
      <AnimatePresence>
        {isDone && contextGateTemplate && !isEditing && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="mt-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5"
          >
            <p className="text-[11px] font-medium text-amber-900/90 dark:text-amber-200/90">
              Transcript is thin — add a bit of context for a stronger note
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contextAssessment.prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => appendPromptToTranscript(p)}
                  className="rounded-md border border-border/50 bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground/90 transition-colors hover:border-indigo-500/30"
                >
                  + {p}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setContextGateTemplate(null)}
                className="rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => contextGateTemplate && handleGenerateNote(contextGateTemplate, true)}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
              >
                Generate anyway
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDone && !generatingTemplate && !contextGateTemplate && !isEditing && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="mt-2.5"
          >
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/80 px-3 py-2 backdrop-blur-sm">
              <Sparkle className="size-4 shrink-0 text-indigo-500" weight="duotone" />
              <span className="mr-auto text-xs font-medium">Generate</span>
              {NOTE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleGenerateNote(t.id)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-indigo-500/8 hover:text-indigo-600 active:scale-[0.97] dark:hover:text-indigo-400"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
