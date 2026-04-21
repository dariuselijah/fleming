"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { useScribe, ScribeProvider } from "@/lib/scribe"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { useEffect } from "react"
import { PatientChatSync } from "./patient-chat-sync"
import { ClinicalEncounterHydrate } from "./clinical-encounter-hydrate"
import { ConsultChatTitleSync } from "./consult-chat-title-sync"
import { PatientTabBar } from "./patient-tab-bar"
import { WorkspaceHeader } from "./workspace-header"
import { PaneTimeline } from "./pane-timeline"
import { PaneCanvas } from "./pane-canvas"
import { PaneSidecar } from "./pane-sidecar"

import dynamic from "next/dynamic"

const CalendarOverlay = dynamic(
  () => import("@/app/components/overlays/calendar-overlay").then((m) => m.CalendarOverlay),
  { ssr: false }
)
const ResourceLibrary = dynamic(
  () => import("@/app/components/overlays/resource-library").then((m) => m.ResourceLibrary),
  { ssr: false }
)
const InventoryOverlay = dynamic(
  () => import("@/app/components/overlays/inventory-overlay").then((m) => m.InventoryOverlay),
  { ssr: false }
)
const SalesPulse = dynamic(
  () => import("@/app/components/overlays/sales-pulse").then((m) => m.SalesPulse),
  { ssr: false }
)
const DocumentSheet = dynamic(
  () => import("./document-sheet").then((m) => m.DocumentSheet),
  { ssr: false }
)
const ScribeBlock = dynamic(
  () => import("@/app/components/clinical-blocks/scribe-block").then((m) => m.ScribeBlock),
  { ssr: false }
)
const AdminDashboard = dynamic(
  () => import("@/app/components/admin/admin-dashboard").then((m) => m.AdminDashboard),
  { ssr: false }
)
const CommandBar = dynamic(
  () => import("@/app/components/admin/command-bar").then((m) => m.CommandBar),
  { ssr: false }
)
const FrontDeskView = dynamic(
  () => import("@/app/components/front-desk/front-desk-view").then((m) => m.FrontDeskView),
  { ssr: false }
)

export function ClinicalWorkspace({ children }: { children: React.ReactNode }) {
  const {
    mode,
    activePatient,
    openPatients,
    paneVisibility,
    overlays,
    toggleOverlay,
    closeAllOverlays,
    signConsult,
    submitClaim,
    documentSheet,
    closeDocumentSheet,
    scribeActive,
  } = useWorkspace()

  const hasPatient = !!activePatient

  const scribe = useScribe({
    enabled: hasPatient,
    patientId: activePatient?.patientId ?? null,
  })

  const { commandBarOpen, setCommandBarOpen } = useWorkspace()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setCommandBarOpen(!commandBarOpen)
        return
      }
      if (e.shiftKey && e.key === "C" && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
        if (!isInput) {
          e.preventDefault()
          toggleOverlay("calendar")
        }
      }
      if (e.key === "Escape") {
        if (commandBarOpen) {
          setCommandBarOpen(false)
        } else if (documentSheet.isOpen) {
          closeDocumentSheet()
        } else {
          closeAllOverlays()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleOverlay, closeAllOverlays, documentSheet.isOpen, closeDocumentSheet, commandBarOpen, setCommandBarOpen])

  useEffect(() => {
    function handleCommand(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail?.command) return

      switch (detail.command) {
        case "calendar":
          toggleOverlay("calendar")
          break
        case "inventory":
          toggleOverlay("inventory")
          break
        case "library":
          toggleOverlay("resource_library")
          break
        case "sales":
          toggleOverlay("sales")
          break
        case "sign":
          if (activePatient) signConsult(activePatient.patientId)
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
  }, [toggleOverlay, activePatient, signConsult, submitClaim])

  const scribeContextValue = {
    transcribeAudioFile: scribe.transcribeAudioFile,
    triggerExtraction: scribe.triggerExtraction,
    isTranscribing: scribe.isTranscribing,
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
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <PatientTabBar />

        <AnimatePresence mode="wait">
          {mode === "admin" ? (
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
          ) : mode === "front_desk" ? (
            <motion.div
              key="front-desk"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <FrontDeskView />
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
                    <AnimatePresence>
                      {paneVisibility.timeline && (
                        <motion.div
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 280, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          className="shrink-0 overflow-hidden"
                        >
                          <PaneTimeline />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <PaneCanvas scribeSlot={<ScribeBlock />}>
                      {children}
                    </PaneCanvas>

                    <AnimatePresence mode="wait">
                      {paneVisibility.sidecar && !documentSheet.isOpen && (
                        <motion.div
                          key="sidecar"
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 320, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          className="shrink-0 overflow-hidden"
                        >
                          <PaneSidecar />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {documentSheet.isOpen && <DocumentSheet />}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <ClinicalEmptyState />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlays */}
        <AnimatePresence>
          {overlays.calendar && <CalendarOverlay onClose={() => toggleOverlay("calendar")} />}
        </AnimatePresence>
        <AnimatePresence>
          {overlays.resource_library && <ResourceLibrary onClose={() => toggleOverlay("resource_library")} />}
        </AnimatePresence>
        <AnimatePresence>
          {overlays.inventory && <InventoryOverlay onClose={() => toggleOverlay("inventory")} />}
        </AnimatePresence>
        <AnimatePresence>
          {overlays.sales && <SalesPulse onClose={() => toggleOverlay("sales")} />}
        </AnimatePresence>

        <AnimatePresence>
          {commandBarOpen && <CommandBar />}
        </AnimatePresence>
      </div>
    </ScribeProvider>
  )
}

function ClinicalEmptyState() {
  const { setMode, setAdminTab } = useWorkspace()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-white/15">
          <path d="M16 4v10M16 18v10M4 16h10M18 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold text-foreground">Select a patient to begin</h3>
        <p className="mt-1 max-w-xs text-xs text-white/30">
          Open a patient from the calendar or search with <kbd className="rounded-md border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode("admin"); setAdminTab("calendar") }}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Open Calendar
        </button>
        <button
          type="button"
          onClick={() => { setMode("admin"); setAdminTab("patients") }}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          Patient Directory
        </button>
      </div>
    </div>
  )
}
