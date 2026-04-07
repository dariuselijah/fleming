"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { useWorkspaceStore, type ScribeSegment } from "./workspace-store"
import type { ExtractedEntities, HighlightSpan } from "@/lib/scribe/entity-highlighter"
import type {
  AdminNotification,
  AdminTab,
  BillingSubTab,
  InboxNotificationFilter,
  InboxScrollTarget,
  ClinicalDocument,
  ConsultStatus,
  DocumentSheetState,
  InboxMessage,
  InventoryItem,
  MedicalBlock,
  OverlayType,
  PatientSession,
  PracticeAppointment,
  PracticeClaim,
  PracticeFlowEntry,
  PracticePatient,
  PracticeProvider,
  PatientMedication,
  SessionDocument,
  SidecarPayload,
  SOAPNote,
  VitalReading,
  WorkspaceMode,
} from "./types"

interface WorkspaceContextValue {
  mode: WorkspaceMode
  activePatient: PatientSession | null
  openPatients: PatientSession[]
  isWorkspaceActive: boolean

  activeAdminTab: AdminTab
  activeBillingSubTab: BillingSubTab
  activeDoctorId: string | null
  practiceProviders: PracticeProvider[]
  claims: PracticeClaim[]
  inventory: InventoryItem[]
  inboxMessages: InboxMessage[]
  notifications: AdminNotification[]
  patients: PracticePatient[]
  appointments: PracticeAppointment[]
  selectedDate: string
  commandBarOpen: boolean
  practiceFlow: PracticeFlowEntry[]

  inboxNotificationFilter: InboxNotificationFilter
  activeInboxThreadId: string | null
  inboxNotificationsPanelRequest: number
  inboxScrollRequest: { target: InboxScrollTarget; nonce: number }
  calendarFocusRequest: { appointmentId: string; nonce: number }
  billingFocusRequest: { claimId: string; nonce: number }
  inventoryImportPanelRequest: number

  paneVisibility: { timeline: boolean; sidecar: boolean }
  sidecarContent: SidecarPayload | null
  overlays: Record<OverlayType, boolean>

  scribeActive: boolean
  scribeCollapsed: boolean
  scribeTranscript: string
  scribeSegments: ScribeSegment[]
  scribeEntities: ExtractedEntities
  scribeHighlights: HighlightSpan[]
  scribeEntityStatus: Record<string, "pending" | "accepted" | "rejected">

  documentSheet: DocumentSheetState
  openDocumentSheet: (blockId: string) => void
  openDocumentContent: (doc: ClinicalDocument) => void
  updateDocumentContent: (content: string, isStreaming: boolean) => void
  closeDocumentSheet: () => void
  toggleDocumentEditMode: () => void

  upsertSessionDocument: (patientId: string, entry: SessionDocument) => void
  acceptSessionDocument: (
    patientId: string,
    docId: string,
    options?: { document?: ClinicalDocument; messageId?: string }
  ) => void
  rejectSessionDocument: (
    patientId: string,
    docId: string,
    reason?: string,
    options?: { document?: ClinicalDocument; messageId?: string }
  ) => void
  ingestClinicalNoteText: (
    patientId: string,
    text: string,
    sourceLabel?: string
  ) => void
  ingestScribeExtractionForPatient: (patientId: string) => void

  updatePracticeFlow: (entries: PracticeFlowEntry[]) => void
  updateFlowEntry: (
    patientId: string,
    update: Partial<PracticeFlowEntry>
  ) => void

  openPatient: (patient: PatientSession) => void
  closePatient: (patientId: string) => void
  setActivePatient: (patientId: string) => void
  setPatientSessionChatId: (patientId: string, chatId: string) => void
  setPatientClinicalEncounterId: (patientId: string, encounterId: string) => void
  updatePatientStatus: (patientId: string, status: ConsultStatus) => void
  addPatientChronicCondition: (patientId: string, condition: string) => void
  removePatientChronicCondition: (patientId: string, condition: string) => void
  renamePatientChronicCondition: (
    patientId: string,
    fromLabel: string,
    toLabel: string
  ) => void
  addSessionMedication: (
    patientId: string,
    med: Omit<PatientMedication, "id" | "startDate"> &
      Partial<Pick<PatientMedication, "id" | "startDate">>
  ) => void
  removeSessionMedication: (patientId: string, medicationId: string) => void
  updateSOAPNote: (patientId: string, section: keyof SOAPNote, value: string) => void
  setSOAPGhostText: (patientId: string, section: keyof SOAPNote, text: string) => void
  acceptGhostText: (patientId: string, section: keyof SOAPNote) => void
  addVitalReading: (patientId: string, vital: VitalReading) => void
  commitVital: (patientId: string, vitalId: string) => void
  addBlock: (patientId: string, block: MedicalBlock) => void
  signConsult: (patientId: string) => void
  submitClaim: (patientId: string) => void

  togglePane: (pane: "timeline" | "sidecar") => void
  setSidecarContent: (content: SidecarPayload | null) => void
  pinToSidecar: (blockId: string) => void

  toggleOverlay: (overlay: OverlayType) => void
  closeAllOverlays: () => void
  setMode: (mode: WorkspaceMode) => void

  setAdminTab: (tab: AdminTab) => void
  setActiveDoctor: (doctorId: string | null) => void
  setBillingSubTab: (tab: BillingSubTab) => void
  addClaim: (claim: PracticeClaim) => void
  updateClaim: (claimId: string, update: Partial<PracticeClaim>) => void
  updateClaimStatus: (claimId: string, status: PracticeClaim["status"]) => void
  upsertInventoryItem: (item: InventoryItem) => void
  deleteInventoryItem: (itemId: string) => void
  decrementInventory: (nappiCode: string, qty?: number) => void
  bulkImportInventory: (items: InventoryItem[]) => void
  setCommandBarOpen: (open: boolean) => void
  setSelectedDate: (date: string) => void
  addAppointment: (appointment: PracticeAppointment) => void
  updateAppointment: (appointmentId: string, update: Partial<PracticeAppointment>) => void
  removeAppointment: (appointmentId: string) => void

  addPatient: (patient: PracticePatient) => void
  updatePatient: (patientId: string, update: Partial<PracticePatient>) => void

  addNotification: (notification: AdminNotification) => void
  markNotificationRead: (notificationId: string) => void
  markAllNotificationsRead: () => void
  markMessageRead: (messageId: string) => void

  setInboxNotificationFilter: (filter: InboxNotificationFilter) => void
  setActiveInboxThreadId: (messageId: string | null) => void
  requestInboxNotificationsPanelOpen: () => void
  requestInboxScrollTo: (target: InboxScrollTarget) => void
  requestCalendarFocusAppointment: (appointmentId: string) => void
  requestBillingFocusClaim: (claimId: string) => void
  requestInventoryImportPanelOpen: () => void
  addInboxMessage: (message: InboxMessage) => void

  setScribeActive: (active: boolean) => void
  setScribeCollapsed: (collapsed: boolean) => void
  appendScribeTranscript: (text: string) => void
  setScribeTranscript: (text: string) => void
  appendScribeSegments: (segments: ScribeSegment[]) => void
  setScribeEntities: (entities: ExtractedEntities) => void
  setScribeHighlights: (highlights: HighlightSpan[]) => void
  setEntityStatus: (key: string, status: "pending" | "accepted" | "rejected") => void
  acceptScribeEntity: (
    patientId: string,
    entityKey: string,
    item: string,
    sectionLabel: string
  ) => void
  updateEntityText: (category: string, oldText: string, newText: string) => void
  clearScribeTranscript: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    useWorkspaceStore.persist.rehydrate()
  }, [])

  const store = useWorkspaceStore()

  const activePatient = useMemo(
    () =>
      store.openPatients.find(
        (p) => p.patientId === store.activePatientId
      ) ?? null,
    [store.openPatients, store.activePatientId]
  )

  const value: WorkspaceContextValue = useMemo(
    () => ({
      mode: store.mode,
      activePatient,
      openPatients: store.openPatients,
      isWorkspaceActive: store.openPatients.length > 0,

      activeAdminTab: store.activeAdminTab,
      activeBillingSubTab: store.activeBillingSubTab,
      activeDoctorId: store.activeDoctorId,
      practiceProviders: store.practiceProviders,
      claims: store.claims,
      inventory: store.inventory,
      inboxMessages: store.inboxMessages,
      notifications: store.notifications,
      patients: store.patients,
      appointments: store.appointments,
      selectedDate: store.selectedDate,
      commandBarOpen: store.commandBarOpen,
      practiceFlow: store.practiceFlow,

      inboxNotificationFilter: store.inboxNotificationFilter,
      activeInboxThreadId: store.activeInboxThreadId,
      inboxNotificationsPanelRequest: store.inboxNotificationsPanelRequest,
      inboxScrollRequest: store.inboxScrollRequest,
      calendarFocusRequest: store.calendarFocusRequest,
      billingFocusRequest: store.billingFocusRequest,
      inventoryImportPanelRequest: store.inventoryImportPanelRequest,

      paneVisibility: store.paneVisibility,
      sidecarContent: store.sidecarContent,
      overlays: store.overlays,

      scribeActive: store.scribeActive,
      scribeCollapsed: store.scribeCollapsed,
      scribeTranscript: store.scribeTranscript,
      scribeSegments: store.scribeSegments,
      scribeEntities: store.scribeEntities,
      scribeHighlights: store.scribeHighlights,
      scribeEntityStatus: store.scribeEntityStatus,

      documentSheet: store.documentSheet,
      openDocumentSheet: store.openDocumentSheet,
      openDocumentContent: store.openDocumentContent,
      updateDocumentContent: store.updateDocumentContent,
      closeDocumentSheet: store.closeDocumentSheet,
      toggleDocumentEditMode: store.toggleDocumentEditMode,

      upsertSessionDocument: store.upsertSessionDocument,
      acceptSessionDocument: store.acceptSessionDocument,
      rejectSessionDocument: store.rejectSessionDocument,

      ingestClinicalNoteText: store.ingestClinicalNoteText,
      ingestScribeExtractionForPatient: store.ingestScribeExtractionForPatient,

      updatePracticeFlow: store.updatePracticeFlow,
      updateFlowEntry: store.updateFlowEntry,

      openPatient: store.openPatient,
      closePatient: store.closePatient,
      setActivePatient: store.setActivePatient,
      setPatientSessionChatId: store.setPatientSessionChatId,
      setPatientClinicalEncounterId: store.setPatientClinicalEncounterId,
      updatePatientStatus: store.updatePatientStatus,
      addPatientChronicCondition: store.addPatientChronicCondition,
      removePatientChronicCondition: store.removePatientChronicCondition,
      renamePatientChronicCondition: store.renamePatientChronicCondition,
      addSessionMedication: store.addSessionMedication,
      removeSessionMedication: store.removeSessionMedication,
      updateSOAPNote: store.updateSOAPNote,
      setSOAPGhostText: store.setSOAPGhostText,
      acceptGhostText: store.acceptGhostText,
      addVitalReading: store.addVitalReading,
      commitVital: store.commitVital,
      addBlock: store.addBlock,
      signConsult: store.signConsult,
      submitClaim: store.submitClaim,

      togglePane: store.togglePane,
      setSidecarContent: store.setSidecarContent,
      pinToSidecar: store.pinToSidecar,

      toggleOverlay: store.toggleOverlay,
      closeAllOverlays: store.closeAllOverlays,
      setMode: store.setMode,

      setAdminTab: store.setAdminTab,
      setActiveDoctor: store.setActiveDoctor,
      setBillingSubTab: store.setBillingSubTab,
      addClaim: store.addClaim,
      updateClaim: store.updateClaim,
      updateClaimStatus: store.updateClaimStatus,
      upsertInventoryItem: store.upsertInventoryItem,
      deleteInventoryItem: store.deleteInventoryItem,
      decrementInventory: store.decrementInventory,
      bulkImportInventory: store.bulkImportInventory,
      setCommandBarOpen: store.setCommandBarOpen,
      setSelectedDate: store.setSelectedDate,
      addAppointment: store.addAppointment,
      updateAppointment: store.updateAppointment,
      removeAppointment: store.removeAppointment,

      addPatient: store.addPatient,
      updatePatient: store.updatePatient,

      addNotification: store.addNotification,
      markNotificationRead: store.markNotificationRead,
      markAllNotificationsRead: store.markAllNotificationsRead,
      markMessageRead: store.markMessageRead,

      setInboxNotificationFilter: store.setInboxNotificationFilter,
      setActiveInboxThreadId: store.setActiveInboxThreadId,
      requestInboxNotificationsPanelOpen: store.requestInboxNotificationsPanelOpen,
      requestInboxScrollTo: store.requestInboxScrollTo,
      requestCalendarFocusAppointment: store.requestCalendarFocusAppointment,
      requestBillingFocusClaim: store.requestBillingFocusClaim,
      requestInventoryImportPanelOpen: store.requestInventoryImportPanelOpen,
      addInboxMessage: store.addInboxMessage,

      setScribeActive: store.setScribeActive,
      setScribeCollapsed: store.setScribeCollapsed,
      appendScribeTranscript: store.appendScribeTranscript,
      setScribeTranscript: store.setScribeTranscript,
      appendScribeSegments: store.appendScribeSegments,
      setScribeEntities: store.setScribeEntities,
      setScribeHighlights: store.setScribeHighlights,
      setEntityStatus: store.setEntityStatus,
      acceptScribeEntity: store.acceptScribeEntity,
      updateEntityText: store.updateEntityText,
      clearScribeTranscript: store.clearScribeTranscript,
    }),
    [store, activePatient]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider")
  }
  return ctx
}

export function useActivePatient(): PatientSession | null {
  const { activePatient } = useWorkspace()
  return activePatient
}

export function useSOAPNote(): {
  note: SOAPNote
  update: (section: keyof SOAPNote, value: string) => void
  acceptGhost: (section: keyof SOAPNote) => void
} {
  const { activePatient, updateSOAPNote, acceptGhostText } = useWorkspace()

  const note = activePatient?.soapNote ?? {
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  }

  const update = useCallback(
    (section: keyof SOAPNote, value: string) => {
      if (!activePatient) return
      updateSOAPNote(activePatient.patientId, section, value)
    },
    [activePatient, updateSOAPNote]
  )

  const acceptGhost = useCallback(
    (section: keyof SOAPNote) => {
      if (!activePatient) return
      acceptGhostText(activePatient.patientId, section)
    },
    [activePatient, acceptGhostText]
  )

  return { note, update, acceptGhost }
}
