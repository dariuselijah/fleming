"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { requestMicrophoneAccess, useScribeContext } from "@/lib/scribe"
import { cn } from "@/lib/utils"
import {
  ShieldCheck,
  SidebarSimple,
  Microphone,
  MicrophoneSlash,
  Layout,
  CheckCircle,
  PaperPlaneTilt,
  CaretDown,
  FileAudio,
  Stop,
  SpinnerGap,
  Pause,
  Play,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

function StatusBadge({
  status,
}: {
  status: "active" | "inactive" | "pending" | "unknown" | undefined
}) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    inactive: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
    unknown: "bg-muted text-muted-foreground border-border",
  }
  const label = status ?? "unknown"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        colors[label] ?? colors.unknown
      )}
    >
      <ShieldCheck className="size-2.5" weight="fill" />
      {label}
    </span>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function MicDropdown() {
  const { scribeActive, setScribeActive } = useWorkspace()
  const scribeCtx = useScribeContext()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isTranscribing = scribeCtx?.isTranscribing ?? false
  const recorderDuration = scribeCtx?.recorderDuration ?? 0
  const isPaused = scribeCtx?.isPaused ?? false

  const handleToggleScribe = useCallback(async () => {
    if (scribeActive) {
      setScribeActive(false)
      setOpen(false)
      return
    }
    const ok = await requestMicrophoneAccess()
    if (!ok) {
      toast.error("Microphone access is required for live scribe.")
      setOpen(false)
      return
    }
    setScribeActive(true)
    setOpen(false)
  }, [scribeActive, setScribeActive])

  const handleUploadAudio = useCallback(() => {
    fileRef.current?.click()
    setOpen(false)
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && scribeCtx) {
        scribeCtx.transcribeAudioFile(file)
      }
      if (fileRef.current) fileRef.current.value = ""
    },
    [scribeCtx]
  )

  // Close dropdown on outside click
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false)
    }
  }, [])

  if (scribeActive) {
    return (
      <div className="flex items-center gap-1">
        {recorderDuration > 0 && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-mono font-medium",
              isPaused
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}
          >
            {formatDuration(recorderDuration)}
          </span>
        )}
        {isTranscribing && (
          <SpinnerGap className="size-3 animate-spin text-muted-foreground" />
        )}
        {isPaused ? (
          <button
            type="button"
            onClick={() => scribeCtx?.resumeRecording()}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
            title="Resume recording"
          >
            <Play className="size-3" weight="fill" />
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => scribeCtx?.pauseRecording()}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
            title="Pause recording (encounter stays open)"
          >
            <Pause className="size-3" weight="fill" />
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={() => setScribeActive(false)}
          className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-500/25 dark:text-red-400"
          title="Stop recorder and end this scribe session"
        >
          <Stop className="size-3" weight="fill" />
          End encounter
        </button>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef} onBlur={handleBlur}>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.webm"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleToggleScribe}
          className="inline-flex size-7 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Start live scribe"
        >
          {isTranscribing ? (
            <SpinnerGap className="size-3.5 animate-spin" />
          ) : (
            <Microphone className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex size-5 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Recording options"
        >
          <CaretDown className="size-2.5" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={handleToggleScribe}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted"
            >
              <Microphone className="size-4 text-red-500" weight="fill" />
              <div>
                <div className="font-medium">Live scribe</div>
                <div className="text-[10px] text-muted-foreground">Record & transcribe in real-time</div>
              </div>
            </button>
            <button
              type="button"
              onClick={handleUploadAudio}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted"
            >
              <FileAudio className="size-4 text-indigo-500" />
              <div>
                <div className="font-medium">Upload audio</div>
                <div className="text-[10px] text-muted-foreground">Transcribe an audio file</div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function WorkspaceHeader() {
  const {
    activePatient,
    scribeActive,
    paneVisibility,
    togglePane,
    signConsult,
    submitClaim,
  } = useWorkspace()

  if (!activePatient) return null

  const isSigned = activePatient.consultSigned
  const isClaimSubmitted = activePatient.claimSubmitted

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-7 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
          {activePatient.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{activePatient.name}</h2>
          {activePatient.age && activePatient.sex && (
            <span className="text-xs text-muted-foreground">
              {activePatient.age}{activePatient.sex}
            </span>
          )}
          <StatusBadge status={activePatient.medicalAidStatus} />
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!isSigned ? (
          <button
            type="button"
            onClick={() => signConsult(activePatient.patientId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <CheckCircle className="size-3.5" weight="bold" />
            Sign Consult
          </button>
        ) : !isClaimSubmitted ? (
          <button
            type="button"
            onClick={() => submitClaim(activePatient.patientId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <PaperPlaneTilt className="size-3.5" weight="bold" />
            Submit Claim
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="size-3" weight="fill" />
            Submitted
          </span>
        )}

        <div className="mx-1 h-4 w-px bg-border/50" />

        <MicDropdown />

        <button
          type="button"
          onClick={() => togglePane("timeline")}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md transition-colors",
            paneVisibility.timeline
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          title="Toggle timeline"
        >
          <SidebarSimple className="size-3.5" />
        </button>

        <button
          type="button"
          onClick={() => togglePane("sidecar")}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md transition-colors",
            paneVisibility.sidecar
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          title="Toggle sidecar"
        >
          <Layout className="size-3.5" />
        </button>
      </div>
    </header>
  )
}
