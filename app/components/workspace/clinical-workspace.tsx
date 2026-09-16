"use client"

import {
  buildEncounterAttestation,
  ENCOUNTER_ATTESTATION_STATEMENT,
  useWorkspace,
} from "@/lib/clinical-workspace"
import { flushEncounterPersistenceNow } from "@/lib/clinical-workspace/encounter-persist-bridge"
import { useScribe, ScribeProvider } from "@/lib/scribe"
import { motion, AnimatePresence } from "motion/react"
import { useEffect } from "react"
import { usePrefetchPatientAiSummary } from "@/lib/patient/use-patient-overview"
import { useAssistantStore } from "@/app/components/assistant/assistant-store"
import { AssistantOverlayProvider } from "@/app/components/assistant/assistant-overlay-context"
import { PatientChatSync } from "./patient-chat-sync"
import { ClinicalEncounterHydrate } from "./clinical-encounter-hydrate"
import { ConsultChatTitleSync } from "./consult-chat-title-sync"
import { PatientTabBar } from "./patient-tab-bar"
import { WorkspaceHeader } from "./workspace-header"
import { PaneDocumentCanvas } from "./pane-document-canvas"
import { PaneSidecar } from "./pane-sidecar"
import { AddPatientModalHost } from "@/app/components/admin/add-patient-modal"
import { useUser } from "@/lib/user-store/provider"

import dynamic from "next/dynamic"

const AdminDashboard = dynamic(
  () => import("@/app/components/admin/admin-dashboard").then((m) => m.AdminDashboard),
  { ssr: false }
)
const CommandBar = dynamic(
  () => import("@/app/components/admin/command-bar").then((m) => m.CommandBar),
  { ssr: false }
)
const FloatingAssistant = dynamic(
  () => import("@/app/components/assistant/floating-assistant").then((m) => m.FloatingAssistant),
  { ssr: false }
)

export function ClinicalWorkspace({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const {
    mode,
    setMode,
    setAdminTab,
    activePatient,
    paneVisibility,
    signConsult,
    submitClaim,
    documentSheet,
    closeDocumentSheet,
  } = useWorkspace()

  const hasPatient = !!activePatient
  const prefetchAiSummary = usePrefetchPatientAiSummary()

  useEffect(() => {
    if (activePatient?.patientId) {
      prefetchAiSummary(activePatient.patientId)
    }
  }, [activePatient?.patientId, prefetchAiSummary])

  const scribe = useScribe({
    enabled: hasPatient,
    patientId: activePatient?.patientId ?? null,
  })

  const { commandBarOpen, setCommandBarOpen } = useWorkspace()
  const assistantHistoryOpen = useAssistantStore((s) => s.historyOpen)
  const setAssistantHistoryOpen = useAssistantStore((s) => s.setHistoryOpen)
  const assistantPillOpen = useAssistantStore((s) => s.pillOpen)
  const setAssistantPillOpen = useAssistantStore((s) => s.setPillOpen)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandBarOpen(!commandBarOpen)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        const st = useAssistantStore.getState()
        if (!st.pillOpen) {
          st.setPillOpen(true)
          st.setFocused(true)
        } else {
          st.toggleHistory()
        }
        return
      }
      if (e.shiftKey && e.key === "C" && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
        if (!isInput) {
          e.preventDefault()
          setMode("admin")
          setAdminTab("calendar")
        }
      }
      if (e.key === "Escape") {
        if (assistantHistoryOpen) {
          setAssistantHistoryOpen(false)
        } else if (assistantPillOpen) {
          setAssistantPillOpen(false)
        } else if (commandBarOpen) {
          setCommandBarOpen(false)
        } else if (documentSheet.isOpen) {
          closeDocumentSheet()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    setMode,
    setAdminTab,
    documentSheet.isOpen,
    closeDocumentSheet,
    commandBarOpen,
    setCommandBarOpen,
    assistantHistoryOpen,
    setAssistantHistoryOpen,
    assistantPillOpen,
    setAssistantPillOpen,
    mode,
  ])

  useEffect(() => {
    function handleCommand(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.command) return

      switch (detail.command) {
        case "calendar":
          setMode("admin")
          setAdminTab("calendar")
          break
        case "inventory":
        case "sales":
          setMode("admin")
          setAdminTab(detail.command === "inventory" ? "inventory" : "analytics")
          break
        case "sign":
          if (
            activePatient &&
            user?.id &&
            window.confirm(
              `Sign this encounter as ${user.display_name?.trim() || user.email || "authenticated clinician"}?\n\n${ENCOUNTER_ATTESTATION_STATEMENT}\n\nSigning makes the encounter read-only.`
            )
          ) {
            signConsult(
              activePatient.patientId,
              buildEncounterAttestation({
                signerUserId: user.id,
                signerDisplayName: user.display_name,
                signerEmail: user.email,
              })
            )
            void flushEncounterPersistenceNow()
          }
          break
        case "submit_claim":
          if (activePatient) submitClaim(activePatient.patientId)
          break
        default:
          break
      }
    }

    window.addEventListener("fleming:command", handleCommand)
    return () => window.removeEventListener("fleming:command", handleCommand)
  }, [setMode, setAdminTab, activePatient, signConsult, submitClaim, user])

  const scribeContextValue = {
    transcribeAudioFile: scribe.transcribeAudioFile,
    triggerExtraction: scribe.triggerExtraction,
    isTranscribing: scribe.isTranscribing,
    isExtracting: scribe.isExtracting,
    transcriptionError: scribe.transcriptionError,
    recorderError: scribe.recorderError,
    recorderDuration: scribe.recorderDuration,
    isRecording: scribe.isRecording,
    isPaused: scribe.isPaused,
    pauseRecording: scribe.pauseRecording,
    resumeRecording: scribe.resumeRecording,
  }

  return (
    <ScribeProvider value={scribeContextValue}>
      <PatientChatSync />
      <ClinicalEncounterHydrate />
      <ConsultChatTitleSync />
      <AddPatientModalHost />
      <AssistantOverlayProvider>
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <PatientTabBar />

        <AnimatePresence mode="wait">
          {mode === "chat" ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              {children}
            </motion.div>
          ) : mode === "admin" ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <AdminDashboard />
            </motion.div>
          ) : (
            <motion.div
              key="clinical"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              {hasPatient ? (
                <>
                  <WorkspaceHeader />
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <PaneDocumentCanvas>
                      {children}
                    </PaneDocumentCanvas>

                    <AnimatePresence mode="wait">
                      {paneVisibility.sidecar && (
                        <motion.div
                          key="sidecar"
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 308, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          className="shrink-0 overflow-hidden"
                        >
                          <PaneSidecar />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <ClinicalEmptyState />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {commandBarOpen && <CommandBar />}
        </AnimatePresence>

        <FloatingAssistant />
      </div>
      </AssistantOverlayProvider>
    </ScribeProvider>
  )
}

function ClinicalEmptyState() {
  const { setMode, setAdminTab } = useWorkspace()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border/70 bg-muted/35">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-muted-foreground/35">
          <path d="M16 4v10M16 18v10M4 16h10M18 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground">Select a patient to begin</h3>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Open a patient from the calendar or search with <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">⌘K</kbd>
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode("admin"); setAdminTab("calendar") }}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Open Calendar
        </button>
        <button
          type="button"
          onClick={() => { setMode("admin"); setAdminTab("patients") }}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Patient Directory
        </button>
      </div>
    </div>
  )
}
