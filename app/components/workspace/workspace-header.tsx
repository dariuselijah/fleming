"use client"

import {
  buildEncounterAttestation,
  ENCOUNTER_ATTESTATION_STATEMENT,
  useWorkspace,
} from "@/lib/clinical-workspace"
import { flushEncounterPersistenceNow } from "@/lib/clinical-workspace/encounter-persist-bridge"
import { usePatientAiSummary } from "@/lib/patient/use-patient-overview"
import { MedicalAidHoverPopover } from "./medical-aid-hover-popover"
import { requestMicrophoneAccess, useScribeContext } from "@/lib/scribe"
import { cn } from "@/lib/utils"
import {
  ShieldCheck,
  Sparkle,
  Microphone,
  Layout,
  CheckCircle,
  PaperPlaneTilt,
  PlusCircle,
  CaretDown,
  FileAudio,
  Stop,
  SpinnerGap,
  Pause,
  Play,
  NotePencil,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { useUser } from "@/lib/user-store/provider"

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function PatientAiSummaryHoverCard({
  patientId,
  patientName,
}: {
  patientId: string
  patientName: string
}) {
  const summaryQuery = usePatientAiSummary(patientId)
  const summary = summaryQuery.data ?? null
  const busy = summaryQuery.isLoading
  const findings = summary?.recentKeyFindings.slice(0, 3) ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className="absolute left-0 top-full z-[110] mt-2 w-[360px] rounded-2xl border border-border bg-card p-4 text-left shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)] ring-1 ring-black/5 dark:ring-white/10"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600/80 dark:text-emerald-300/80">
              AI patient summary
            </p>
            <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
              {patientName}
            </h3>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <Sparkle className="size-4" weight="fill" />
          </span>
        </div>

        {summaryQuery.error ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Unable to load patient context right now.
          </p>
        ) : busy && !summary ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Loading chart context...
          </p>
        ) : !summary?.summaryCount ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            No signed visit summaries yet. Sign a consult to build this patient history.
          </p>
        ) : (
          <>
            <p className="mt-3 line-clamp-5 text-xs leading-relaxed text-foreground/85">
              {summary.rollup || summary.latestSummaryText || "No AI summary is available yet."}
            </p>

            {summary.latestChiefComplaint ? (
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/35 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  Latest complaint
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-foreground/80">
                  {summary.latestChiefComplaint}
                </p>
              </div>
            ) : null}

            {findings.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {findings.map((finding, index) => (
                  <span
                    key={`${index}-${finding.slice(0, 16)}`}
                    className="max-w-full truncate rounded-full border border-border/45 bg-background/45 px-2 py-1 text-[10px] text-muted-foreground"
                  >
                    {finding.length > 52 ? `${finding.slice(0, 52)}...` : finding}
                  </span>
                ))}
              </div>
            ) : null}

            {summary.latestFollowUp ? (
              <p className="mt-3 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-200/85">
                Follow-up: {summary.latestFollowUp}
              </p>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  )
}

function MicDropdown() {
  const { scribeActive, setScribeActive } = useWorkspace()
  const scribeCtx = useScribeContext()
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isTranscribing = scribeCtx?.isTranscribing ?? false
  const isExtracting = scribeCtx?.isExtracting ?? false
  const isProcessing = isTranscribing || isExtracting
  const recorderDuration = scribeCtx?.recorderDuration ?? 0
  const isPaused = scribeCtx?.isPaused ?? false

  const handleToggleScribe = useCallback(async () => {
    if (isTranscribing) {
      toast.message("Audio upload is transcribing", {
        description: "Wait for processing to finish before starting live mic capture.",
      })
      return
    }
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
  }, [isTranscribing, scribeActive, setScribeActive])

  const handleUploadAudio = useCallback(() => {
    if (isTranscribing) return
    fileRef.current?.click()
    setOpen(false)
  }, [isTranscribing])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && scribeCtx) {
        void scribeCtx.transcribeAudioFile(file)
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
          disabled={isTranscribing}
          className="inline-flex size-7 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={isTranscribing}
          className="inline-flex size-5 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title="Recording options"
        >
          <CaretDown className="size-2.5" />
        </button>
      </div>
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          className="absolute right-0 top-full z-[95] mt-1 w-[168px] overflow-hidden rounded-lg border border-border/60 bg-card px-2.5 py-2 shadow-lg"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
            <SpinnerGap className="size-3 shrink-0 animate-spin text-indigo-500" />
            <span className="truncate">
              {isTranscribing ? "Transcribing…" : "Extracting…"}
            </span>
          </div>
          <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full w-1/3 rounded-full bg-indigo-500/80"
              animate={{ x: ["-100%", "320%"] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-[90] mt-1 w-48 rounded-xl border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={handleToggleScribe}
              disabled={isTranscribing}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted disabled:opacity-50"
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
              disabled={isTranscribing}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-muted disabled:opacity-50"
            >
              <FileAudio className="size-4 text-emerald-500" />
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
  const { user } = useUser()
  const {
    activePatient,
    paneVisibility,
    togglePane,
    signConsult,
    submitClaim,
    beginNewVisitForPatient,
    beginAmendmentForPatient,
  } = useWorkspace()
  const [signing, setSigning] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const handleSignConsult = useCallback(async () => {
    if (!activePatient || signing) return
    if (!user?.id) {
      toast.error("Your signer identity is unavailable")
      return
    }
    const confirmed = window.confirm(
      `Sign this encounter as ${user.display_name?.trim() || user.email || "authenticated clinician"}?\n\n${ENCOUNTER_ATTESTATION_STATEMENT}\n\nSigning makes this encounter read-only. Later corrections must be recorded as an amendment.`
    )
    if (!confirmed) return
    setSigning(true)
    try {
      signConsult(
        activePatient.patientId,
        buildEncounterAttestation({
          signerUserId: user.id,
          signerDisplayName: user.display_name,
          signerEmail: user.email,
        })
      )
      await flushEncounterPersistenceNow()
      toast.success("Consult signed and saved")
    } catch {
      /* ClinicalPersistence surfaces specific save errors */
    } finally {
      setSigning(false)
    }
  }, [activePatient, signConsult, signing, user])

  if (!activePatient) return null

  const isSigned = activePatient.consultSigned
  const isClaimSubmitted = activePatient.claimSubmitted

  return (
    <header className="relative z-[60] flex h-11 shrink-0 items-center gap-2 overflow-visible border-b border-border/40 bg-background/95 px-3 backdrop-blur-xl">
      {/* Patient identity */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-[10px] font-semibold text-foreground/70">
          {activePatient.name.charAt(0).toUpperCase()}
        </div>

        <div className="relative flex min-w-0 items-center gap-1.5">
          <div
            className="relative flex min-w-0 items-center gap-1.5"
            onMouseEnter={() => setSummaryOpen(true)}
            onMouseLeave={() => setSummaryOpen(false)}
          >
            <button
              type="button"
              className="block max-w-[180px] truncate text-left text-[13px] font-semibold text-foreground underline-offset-4 transition hover:text-emerald-700 focus-visible:outline-none dark:hover:text-emerald-300"
              onFocus={() => setSummaryOpen(true)}
              onBlur={() => setSummaryOpen(false)}
            >
              {activePatient.name}
            </button>
            {activePatient.age && activePatient.sex && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {activePatient.age}{activePatient.sex}
              </span>
            )}
            <AnimatePresence>
              {summaryOpen ? (
                <PatientAiSummaryHoverCard
                  patientId={activePatient.patientId}
                  patientName={activePatient.name}
                />
              ) : null}
            </AnimatePresence>
          </div>
          <MedicalAidHoverPopover
            patientId={activePatient.patientId}
            status={activePatient.medicalAidStatus}
            scheme={activePatient.medicalAidScheme}
            memberNumber={activePatient.memberNumber}
          />
        </div>
      </div>

      <div className="flex-1" />

      {/* Actions — right */}
      <div className="flex items-center gap-1">
        {isSigned ? (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
            title={
              activePatient.signatureAttestation
                ? `Signed by ${activePatient.signatureAttestation.signerDisplayName} at ${new Date(activePatient.signatureAttestation.signedAt).toLocaleString()}`
                : "Signed encounter"
            }
          >
            <ShieldCheck className="size-3" weight="fill" />
            Read-only · v{activePatient.encounterVersion ?? 1}
          </span>
        ) : (
          <MicDropdown />
        )}

        <div className="mx-0.5 h-4 w-px bg-border/40" />

        {!isSigned ? (
          <button
            type="button"
            disabled={signing}
            onClick={() => void handleSignConsult()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-emerald-950/15 transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {signing ? (
              <SpinnerGap className="size-3 animate-spin" weight="bold" />
            ) : (
              <CheckCircle className="size-3" weight="bold" />
            )}
            {signing ? "Saving…" : "Sign Consult"}
          </button>
        ) : !isClaimSubmitted ? (
          <button
            type="button"
            onClick={() => submitClaim(activePatient.patientId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-emerald-950/15 transition-colors hover:bg-emerald-700"
          >
            <PaperPlaneTilt className="size-3" weight="bold" />
            Submit Claim
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="size-3" weight="fill" />
            Submitted
          </span>
        )}

        <button
          type="button"
          title="New visit"
          onClick={() => {
            if (
              activePatient.consultSigned &&
              !activePatient.claimSubmitted &&
              !window.confirm(
                "Claim not sent yet. Start a new visit anyway? Current draft will be cleared."
              )
            ) {
              return
            }
            beginNewVisitForPatient(activePatient.patientId)
            toast.success("New visit started")
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PlusCircle className="size-3" weight="bold" />
          New visit
        </button>

        {isSigned && activePatient.clinicalEncounterId ? (
          <button
            type="button"
            title="Create a linked amendment without changing the signed original"
            onClick={() => {
              const reason = window.prompt("Reason for amendment")
              if (!reason?.trim()) return
              beginAmendmentForPatient(activePatient.patientId, reason)
              toast.success("Amendment started", {
                description: "The signed original remains unchanged.",
              })
            }}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
          >
            <NotePencil className="size-3" weight="bold" />
            Amend
          </button>
        ) : null}

        <div className="mx-0.5 h-4 w-px bg-border/40" />

        <button
          type="button"
          onClick={() => togglePane("sidecar")}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded transition-colors",
            paneVisibility.sidecar
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          )}
          title="Toggle intelligence panel"
        >
          <Layout className="size-3" />
        </button>
      </div>
    </header>
  )
}
