"use client"

import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { createJSONStorage, persist } from "zustand/middleware"
import type {
  AdminTab,
  AdminNotification,
  ClaimLine,
  ClinicalDocument,
  ConsultStatus,
  DocumentSheetState,
  EvidenceDeepDiveState,
  InboxMessage,
  InventoryItem,
  OverlayType,
  PatientSession,
  PracticeAppointment,
  PracticeClaim,
  PracticeFlowEntry,
  PracticeBusinessHour,
  PracticeProvider,
  SessionDocument,
  SidecarPayload,
  SOAPBodySection,
  SOAPNote,
  VitalReading,
  WorkspaceMode,
  MedicalBlock,
  PatientMedication,
  BillingSubTab,
  InboxNotificationFilter,
  InboxScrollTarget,
} from "./types"
import type { ExtractedEntities, HighlightSpan } from "@/lib/scribe/entity-highlighter"
import {
  buildAcceptedClinicalDocumentBlock,
  buildAcceptedEntityBlock,
  buildLabOrderBlock,
  buildScribeExtractionBlock,
  dedupeVitalReadings,
  parseVitalsFromClinicalText,
  shouldAppendScribeBlock,
  extractionHasSignal,
  uniqStrings,
} from "./ingest-patient-clinical"
import {
  findBestCatalogEntryForLabel,
  isLikelyLabOrderText,
} from "./lab-order-catalog"
import { requestEncounterPersistenceFlush } from "./encounter-persist-bridge"
import { suppressEncounterHydrationForMs } from "./encounter-hydrate-suppress"
import type { PatientRegistrationPrefill } from "@/lib/clinical/smart-import-patient"
import { shouldPromoteDiagnosisToChronic } from "./diagnosis-accept-routing"
import { parseMedicationLine } from "./medication-line-parse"

function sessionMedicalAidFromPractice(
  m: import("./types").PracticePatient["medicalAidStatus"]
): import("./types").PatientSession["medicalAidStatus"] {
  if (m === "verified") return "active"
  if (m === "pending") return "pending"
  if (m === "terminated") return "inactive"
  return "unknown"
}

export interface ScribeSegment {
  speaker: string | null
  startSec: number | null
  endSec: number | null
  text: string
}

const EMPTY_ENTITIES: ExtractedEntities = {
  chief_complaint: [],
  symptoms: [],
  diagnoses: [],
  medications: [],
  allergies: [],
  vitals: [],
  procedures: [],
  social_history: [],
  family_history: [],
  risk_factors: [],
}

const EMPTY_SOAP: SOAPNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
}

const MAX_ACCEPT_HISTORY = 200

function appendAcceptHistory(
  patient: PatientSession,
  entityKey: string,
  item: string,
  action: "accepted" | "unaccepted" | "rejected"
): PatientSession {
  const entry = {
    at: new Date().toISOString(),
    entityKey,
    item,
    action,
  }
  return {
    ...patient,
    acceptHistory: [...(patient.acceptHistory ?? []), entry].slice(-MAX_ACCEPT_HISTORY),
  }
}

/** Remove timeline NOTE/LAB rows tied to an unaccepted extraction item. */
function stripBlocksForUnaccept(
  blocks: MedicalBlock[],
  entityKey: string,
  item: string
): MedicalBlock[] {
  return blocks.filter((b) => {
    if (
      entityKey === "procedures" &&
      b.type === "LAB" &&
      b.metadata?.acceptedProcedureItem === item
    ) {
      return false
    }
    const ent = b.metadata?.entityKey
    const acc = b.metadata?.acceptedEntity
    if (
      (b.type === "NOTE" || b.type === "SCRIBE") &&
      typeof ent === "string" &&
      ent === entityKey &&
      typeof acc === "string" &&
      acc === item
    ) {
      return false
    }
    return true
  })
}

interface WorkspaceState {
  mode: WorkspaceMode
  activePatientId: string | null
  openPatients: PatientSession[]
  practiceFlow: PracticeFlowEntry[]

  // Admin
  activeAdminTab: AdminTab
  activeBillingSubTab: BillingSubTab
  activeDoctorId: string | null
  practiceProviders: PracticeProvider[]
  practiceHours: PracticeBusinessHour[]
  claims: PracticeClaim[]
  inventory: InventoryItem[]
  appointments: PracticeAppointment[]
  inboxMessages: InboxMessage[]
  notifications: AdminNotification[]
  patients: import("./types").PracticePatient[]
  commandBarOpen: boolean
  selectedDate: string

  /** Inbox UI: sidebar ↔ main sync */
  inboxNotificationFilter: InboxNotificationFilter
  activeInboxThreadId: string | null
  inboxNotificationsPanelRequest: number
  inboxScrollRequest: { target: InboxScrollTarget; nonce: number }
  /** Sidebar → calendar: open appointment detail */
  calendarFocusRequest: { appointmentId: string; nonce: number }
  /** Sidebar → billing: open claim detail drawer */
  billingFocusRequest: { claimId: string; nonce: number }
  /** Sidebar → inventory: open Smart Import modal */
  inventoryImportPanelRequest: number

  paneVisibility: {
    timeline: boolean
    sidecar: boolean
  }
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

  // Patient management
  openPatient: (patient: PatientSession) => void
  closePatient: (patientId: string) => void
  setActivePatient: (patientId: string) => void
  setPatientSessionChatId: (patientId: string, chatId: string) => void
  setPatientClinicalEncounterId: (patientId: string, encounterId: string) => void
  updatePatientStatus: (patientId: string, status: ConsultStatus) => void
  addPatientChronicCondition: (patientId: string, condition: string) => void
  removePatientChronicCondition: (patientId: string, condition: string) => void
  renamePatientChronicCondition: (patientId: string, fromLabel: string, toLabel: string) => void
  removeEncounterProblem: (patientId: string, problem: string) => void
  addEncounterProblem: (patientId: string, problem: string) => void
  addCriticalAllergy: (patientId: string, allergy: string) => void
  removeCriticalAllergy: (patientId: string, allergy: string) => void
  renameCriticalAllergy: (patientId: string, fromLabel: string, toLabel: string) => void
  removePatientBlock: (patientId: string, blockId: string) => void
  updateLabOrderBlock: (patientId: string, blockId: string, newLabel: string) => void
  rejectScribeEntity: (patientId: string, entityKey: string, item: string) => void
  setPatientEvidenceDeepDive: (
    patientId: string,
    state: EvidenceDeepDiveState | null
  ) => void
  addSessionMedication: (
    patientId: string,
    med: Omit<PatientMedication, "id" | "startDate"> &
      Partial<Pick<PatientMedication, "id" | "startDate">>
  ) => void
  removeSessionMedication: (patientId: string, medicationId: string) => void
  updateSessionMedication: (
    patientId: string,
    medicationId: string,
    patch: Partial<
      Pick<
        PatientMedication,
        "name" | "dosage" | "frequency" | "prescribedBy" | "refillsRemaining"
      >
    >
  ) => void
  updateSOAPNote: (patientId: string, section: SOAPBodySection, value: string) => void
  setSOAPGhostText: (patientId: string, section: SOAPBodySection, text: string) => void
  acceptGhostText: (patientId: string, section: SOAPBodySection) => void
  addVitalReading: (patientId: string, vital: VitalReading) => void
  commitVital: (patientId: string, vitalId: string) => void
  addBlock: (patientId: string, block: MedicalBlock) => void
  signConsult: (patientId: string) => void
  /** Reopen MediKredit claim preview (after dismiss or from header). */
  submitClaim: (patientId: string) => void
  setClaimDraftLines: (patientId: string, lines: ClaimLine[] | null) => void
  dismissClaimPreview: (patientId: string) => void
  recordClaimSubmissionSuccess: (patientId: string, claimId?: string) => void
  /** Link session to a saved server draft (practice_claims id) for upsert on "Save for later". */
  setPatientRemoteDraftClaimId: (patientId: string, claimId: string | null) => void
  /** Open clinical workspace with draft lines so the MediKredit preview modal appears. */
  resumeMedikreditClaimDraft: (args: {
    patientId: string
    patientName: string
    lines: ClaimLine[]
    remoteClaimId: string
    clinicalEncounterId?: string
  }) => void
  beginNewVisitForPatient: (patientId: string) => void

  // Pane control
  togglePane: (pane: "timeline" | "sidecar") => void
  setSidecarContent: (content: SidecarPayload | null) => void
  pinToSidecar: (blockId: string) => void

  // Overlays
  toggleOverlay: (overlay: OverlayType) => void
  closeAllOverlays: () => void

  // Mode
  setMode: (mode: WorkspaceMode) => void

  // Scribe
  setScribeActive: (active: boolean) => void
  setScribeCollapsed: (collapsed: boolean) => void
  appendScribeTranscript: (text: string) => void
  setScribeTranscript: (text: string) => void
  appendScribeSegments: (segments: ScribeSegment[]) => void
  setScribeEntities: (entities: ExtractedEntities) => void
  setScribeHighlights: (highlights: HighlightSpan[]) => void
  setEntityStatus: (key: string, status: "pending" | "accepted" | "rejected") => void
  /** Reverse an accepted entity — removes the item from the session arrays it was pushed into. */
  unacceptScribeEntity: (
    patientId: string,
    entityKey: string,
    item: string
  ) => void
  acceptScribeEntity: (
    patientId: string,
    entityKey: string,
    item: string,
    sectionLabel: string
  ) => void
  updateEntityText: (category: string, oldText: string, newText: string) => void
  clearScribeTranscript: () => void

  // Document sheet
  openDocumentSheet: (blockId: string) => void
  openDocumentContent: (doc: ClinicalDocument) => void
  updateDocumentContent: (
    content: string,
    isStreaming: boolean,
    patch?: Pick<ClinicalDocument, "sources" | "prescriptionItems">
  ) => void
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

  // Admin
  setAdminTab: (tab: AdminTab) => void
  setBillingSubTab: (tab: BillingSubTab) => void
  setActiveDoctor: (doctorId: string | null) => void
  setSelectedDate: (date: string) => void
  addClaim: (claim: PracticeClaim) => void
  /** Replace claims list from server (e.g. practice_claims hydrate). */
  setClaims: (claims: PracticeClaim[]) => void
  updateClaim: (claimId: string, update: Partial<PracticeClaim>) => void
  updateClaimStatus: (claimId: string, status: PracticeClaim["status"]) => void
  upsertInventoryItem: (item: InventoryItem) => void
  deleteInventoryItem: (itemId: string) => void
  decrementInventory: (nappiCode: string, qty?: number) => void
  bulkImportInventory: (items: InventoryItem[]) => void
  setCommandBarOpen: (open: boolean) => void

  // Patients
  addPatient: (patient: import("./types").PracticePatient) => void
  updatePatient: (patientId: string, update: Partial<import("./types").PracticePatient>) => void
  patientAddModalPrefill: PatientRegistrationPrefill | null
  patientAddModalOpenNonce: number
  openPatientAddModalWithPrefill: (prefill: PatientRegistrationPrefill) => void
  clearPatientAddModalPrefill: () => void

  // Appointments
  addAppointment: (appointment: PracticeAppointment) => void
  updateAppointment: (appointmentId: string, update: Partial<PracticeAppointment>) => void
  removeAppointment: (appointmentId: string) => void

  // Notifications
  addNotification: (notification: AdminNotification) => void
  markNotificationRead: (notificationId: string) => void
  markAllNotificationsRead: () => void

  // Messages
  markMessageRead: (messageId: string) => void

  setInboxNotificationFilter: (filter: InboxNotificationFilter) => void
  setActiveInboxThreadId: (messageId: string | null) => void
  requestInboxNotificationsPanelOpen: () => void
  requestInboxScrollTo: (target: InboxScrollTarget) => void
  requestCalendarFocusAppointment: (appointmentId: string) => void
  requestBillingFocusClaim: (claimId: string) => void
  requestInventoryImportPanelOpen: () => void
  addInboxMessage: (message: InboxMessage) => void

  // Practice flow
  updatePracticeFlow: (entries: PracticeFlowEntry[]) => void
  updateFlowEntry: (patientId: string, update: Partial<PracticeFlowEntry>) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  subscribeWithSelector(
  persist(
    (set, get) => ({
      mode: "clinical",
      activePatientId: null,
      openPatients: [],
      practiceFlow: [],

      activeAdminTab: "calendar",
      activeBillingSubTab: "claims",
      activeDoctorId: null,
      selectedDate: new Date().toISOString().slice(0, 10),
      practiceProviders: [],
      practiceHours: [],
      claims: [],
      inventory: [],
      appointments: [],
      inboxMessages: [],
      notifications: [],
      patients: [],
      commandBarOpen: false,

      patientAddModalPrefill: null,
      patientAddModalOpenNonce: 0,

      inboxNotificationFilter: "all",
      activeInboxThreadId: null,
      inboxNotificationsPanelRequest: 0,
      inboxScrollRequest: { target: "smart-import", nonce: 0 },

      calendarFocusRequest: { appointmentId: "", nonce: 0 },
      billingFocusRequest: { claimId: "", nonce: 0 },
      inventoryImportPanelRequest: 0,

      paneVisibility: { timeline: true, sidecar: true },
      sidecarContent: null,
      overlays: {
        calendar: false,
        inventory: false,
        resource_library: false,
        sales: false,
      },
      scribeActive: false,
      scribeCollapsed: false,
      scribeTranscript: "",
      scribeSegments: [],
      scribeEntities: EMPTY_ENTITIES,
      scribeHighlights: [],
      scribeEntityStatus: {},
      documentSheet: { isOpen: false, blockId: null, editMode: false, contentDocument: null },

      openPatient: (patient) => {
        const { openPatients } = get()
        const exists = openPatients.find((p) => p.patientId === patient.patientId)
        if (exists) {
          set({ activePatientId: patient.patientId })
          return
        }
        set({
          openPatients: [...openPatients, patient],
          activePatientId: patient.patientId,
        })
      },

      closePatient: (patientId) => {
        const { openPatients, activePatientId } = get()
        const filtered = openPatients.filter((p) => p.patientId !== patientId)
        const newActive =
          activePatientId === patientId
            ? filtered[filtered.length - 1]?.patientId ?? null
            : activePatientId
        set({ openPatients: filtered, activePatientId: newActive })
      },

      setActivePatient: (patientId) => set({ activePatientId: patientId }),

      setPatientSessionChatId: (patientId, chatId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, chatId } : p
          ),
        }))
      },

      setPatientClinicalEncounterId: (patientId, encounterId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, clinicalEncounterId: encounterId } : p
          ),
        }))
      },

      addPatientChronicCondition: (patientId, condition) => {
        const c = condition.trim()
        if (!c) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  chronicConditions: uniqStrings([...(p.chronicConditions ?? []), c]),
                }
          ),
        }))
      },

      removePatientChronicCondition: (patientId, condition) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  chronicConditions: (p.chronicConditions ?? []).filter((x) => x !== condition),
                }
          ),
        }))
      },

      renamePatientChronicCondition: (patientId, fromLabel, toLabel) => {
        const next = toLabel.trim()
        if (!next) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  chronicConditions: uniqStrings(
                    (p.chronicConditions ?? []).map((x) => (x === fromLabel ? next : x))
                  ),
                }
          ),
        }))
      },

      removeEncounterProblem: (patientId, problem) => {
        const t = problem.trim()
        if (!t) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  encounterProblems: (p.encounterProblems ?? []).filter((x) => x !== t),
                }
          ),
        }))
      },

      addSessionMedication: (patientId, med) => {
        const id =
          med.id?.trim() ||
          `med-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const row: PatientMedication = {
          id,
          name: med.name.trim(),
          dosage: med.dosage,
          frequency: med.frequency,
          prescribedBy: med.prescribedBy,
          startDate: med.startDate ?? new Date().toISOString().slice(0, 10),
          refillsRemaining: med.refillsRemaining,
        }
        if (!row.name) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  activeMedications: [...(p.activeMedications ?? []), row],
                }
          ),
        }))
      },

      removeSessionMedication: (patientId, medicationId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId !== patientId
              ? p
              : {
                  ...p,
                  activeMedications: (p.activeMedications ?? []).filter(
                    (m) => m.id !== medicationId
                  ),
                }
          ),
        }))
      },

      updateSessionMedication: (patientId, medicationId, patch) => {
        if ("name" in patch) {
          const t = patch.name?.trim() ?? ""
          if (!t) return
        }
        set((state) => ({
          openPatients: state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p
            return {
              ...p,
              activeMedications: (p.activeMedications ?? []).map((m) => {
                if (m.id !== medicationId) return m
                let next = { ...m }
                if ("name" in patch && patch.name !== undefined) {
                  next.name = patch.name.trim()
                }
                if ("dosage" in patch) {
                  next.dosage = patch.dosage?.trim() || undefined
                }
                if ("frequency" in patch) {
                  next.frequency = patch.frequency?.trim() || undefined
                }
                if ("prescribedBy" in patch) {
                  next.prescribedBy = patch.prescribedBy?.trim() || undefined
                }
                if ("refillsRemaining" in patch) {
                  next.refillsRemaining = patch.refillsRemaining
                }
                return next
              }),
            }
          }),
        }))
      },

      updatePatientStatus: (patientId, status) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, status } : p
          ),
        }))
      },

      updateSOAPNote: (patientId, section, value) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  soapNote: {
                    ...p.soapNote,
                    [section]: value,
                    ghostText: {
                      ...p.soapNote.ghostText,
                      [section]: undefined,
                    },
                  },
                }
              : p
          ),
        }))
      },

      setSOAPGhostText: (patientId, section, text) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  soapNote: {
                    ...p.soapNote,
                    ghostText: { ...p.soapNote.ghostText, [section]: text },
                  },
                }
              : p
          ),
        }))
      },

      acceptGhostText: (patientId, section) => {
        const patient = get().openPatients.find((p) => p.patientId === patientId)
        if (!patient?.soapNote.ghostText?.[section]) return
        const ghostValue = patient.soapNote.ghostText[section] || ""
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  soapNote: {
                    ...p.soapNote,
                    [section]: p.soapNote[section] + ghostValue,
                    ghostText: { ...p.soapNote.ghostText, [section]: undefined },
                  },
                }
              : p
          ),
        }))
      },

      addVitalReading: (patientId, vital) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? { ...p, vitals: [...p.vitals, vital] }
              : p
          ),
        }))
      },

      commitVital: (patientId, vitalId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  vitals: p.vitals.map((v) =>
                    v.id === vitalId ? { ...v, committed: true } : v
                  ),
                }
              : p
          ),
        }))
      },

      addBlock: (patientId, block) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? { ...p, blocks: [...p.blocks, block] }
              : p
          ),
        }))
      },

      signConsult: (patientId) => {
        const state = get()
        const patient = state.openPatients.find((p) => p.patientId === patientId)
        if (!patient) return

        set({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  consultSigned: true,
                  consultSignedAt: new Date(),
                  status: "reviewing" as const,
                  claimDraftLines: null,
                  claimPreviewDismissed: false,
                  remoteDraftClaimId: undefined,
                }
              : p
          ),
          mode: "admin" as const,
          activeAdminTab: "billing" as const,
        })
        requestEncounterPersistenceFlush()
      },

      submitClaim: (patientId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, claimPreviewDismissed: false } : p
          ),
        }))
      },

      setClaimDraftLines: (patientId, lines) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, claimDraftLines: lines } : p
          ),
        }))
      },

      dismissClaimPreview: (patientId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, claimPreviewDismissed: true } : p
          ),
        }))
      },

      recordClaimSubmissionSuccess: (patientId, claimId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  claimSubmitted: true,
                  claimId: claimId ?? p.claimId,
                  status: "billing" as const,
                  claimPreviewDismissed: true,
                  remoteDraftClaimId: undefined,
                }
              : p
          ),
        }))
      },

      setPatientRemoteDraftClaimId: (patientId, claimId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, remoteDraftClaimId: claimId ?? undefined } : p
          ),
        }))
      },

      resumeMedikreditClaimDraft: ({
        patientId,
        patientName,
        lines,
        remoteClaimId,
        clinicalEncounterId,
      }) => {
        const state = get()
        const pp = state.patients.find((p) => p.id === patientId)
        const existing = state.openPatients.find((p) => p.patientId === patientId)

        const medicalAidStatus = pp
          ? sessionMedicalAidFromPractice(pp.medicalAidStatus)
          : existing?.medicalAidStatus ?? "unknown"

        const base =
          existing ??
          createPatientSession({
            patientId,
            name: patientName,
            medicalAidStatus,
            medicalAidScheme: pp?.medicalAidScheme,
            memberNumber: pp?.memberNumber,
            sex: pp?.sex,
            age: pp?.age,
          })

        const merged: PatientSession = {
          ...base,
          name: pp?.name?.trim() ? pp.name : patientName,
          consultSigned: true,
          clinicalEncounterId: clinicalEncounterId ?? base.clinicalEncounterId,
          claimDraftLines: lines,
          claimPreviewDismissed: false,
          claimSubmitted: false,
          remoteDraftClaimId: remoteClaimId,
          status: "reviewing",
        }

        set({
          mode: "clinical",
          activePatientId: patientId,
          openPatients: existing
            ? state.openPatients.map((p) => (p.patientId === patientId ? merged : p))
            : [...state.openPatients, merged],
        })
      },

      beginNewVisitForPatient: (patientId) => {
        suppressEncounterHydrationForMs(15_000)
        const state = get()
        const patient = state.openPatients.find((p) => p.patientId === patientId)
        if (!patient) return
        get().clearScribeTranscript()
        const next = createPatientSession({
          patientId: patient.patientId,
          name: patient.name,
          age: patient.age,
          sex: patient.sex,
          medicalAidStatus: patient.medicalAidStatus,
          medicalAidScheme: patient.medicalAidScheme,
          memberNumber: patient.memberNumber,
          criticalAllergies: patient.criticalAllergies,
          chronicConditions: patient.chronicConditions,
          encounterProblems: [],
          activeMedications: patient.activeMedications,
          lifestyle: patient.lifestyle,
          chatId: patient.chatId,
          appointmentReason: patient.appointmentReason,
          roomNumber: patient.roomNumber,
          status: "checked_in",
          consultSigned: false,
          consultSignedAt: undefined,
          claimSubmitted: false,
          claimId: undefined,
          clinicalEncounterId: undefined,
          claimDraftLines: null,
          claimPreviewDismissed: false,
          remoteDraftClaimId: undefined,
          acceptHistory: [],
          evidenceDeepDive: null,
        })
        set({
          openPatients: state.openPatients.map((p) => (p.patientId === patientId ? next : p)),
        })
        requestEncounterPersistenceFlush()
      },

      togglePane: (pane) => {
        set((state) => ({
          paneVisibility: {
            ...state.paneVisibility,
            [pane]: !state.paneVisibility[pane],
          },
        }))
      },

      setSidecarContent: (content) => set({ sidecarContent: content }),

      pinToSidecar: (blockId) => {
        set({
          sidecarContent: { tab: "history", pinnedBlockId: blockId },
          paneVisibility: { ...get().paneVisibility, sidecar: true },
        })
      },

      toggleOverlay: (overlay) => {
        set((state) => ({
          overlays: { ...state.overlays, [overlay]: !state.overlays[overlay] },
        }))
      },

      closeAllOverlays: () => {
        set({
          overlays: {
            calendar: false,
            inventory: false,
            resource_library: false,
            sales: false,
          },
        })
      },

      setMode: (mode) => set({ mode }),

      setScribeActive: (active) => set({ scribeActive: active }),
      setScribeCollapsed: (collapsed) => set({ scribeCollapsed: collapsed }),
      appendScribeTranscript: (text) =>
        set((state) => ({
          scribeTranscript: state.scribeTranscript + text,
        })),
      setScribeTranscript: (text) => set({ scribeTranscript: text }),
      appendScribeSegments: (segments) =>
        set((state) => ({
          scribeSegments: [...state.scribeSegments, ...segments],
        })),
      setScribeEntities: (entities) => {
        set({ scribeEntities: entities })
        const pid = get().activePatientId
        if (pid) {
          get().ingestScribeExtractionForPatient(pid)
        }
      },
      setScribeHighlights: (highlights) => set({ scribeHighlights: highlights }),
      setEntityStatus: (key, status) =>
        set((state) => ({
          scribeEntityStatus: { ...state.scribeEntityStatus, [key]: status },
        })),

      unacceptScribeEntity: (patientId, entityKey, item) => {
        set((state) => {
          const openPatients = state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p
            let next = { ...p }
            if (entityKey === "diagnoses") {
              next.chronicConditions = (p.chronicConditions ?? []).filter((x) => x !== item)
              next.encounterProblems = (p.encounterProblems ?? []).filter((x) => x !== item)
            } else if (
              entityKey === "chief_complaint" ||
              entityKey === "symptoms" ||
              entityKey === "risk_factors"
            ) {
              next.encounterProblems = (p.encounterProblems ?? []).filter((x) => x !== item)
            } else if (entityKey === "allergies") {
              next.criticalAllergies = (p.criticalAllergies ?? []).filter((x) => x !== item)
            } else if (entityKey === "medications") {
              const nameLower = item.split(/\s+/)[0]?.toLowerCase() ?? item.toLowerCase()
              next.activeMedications = (p.activeMedications ?? []).filter(
                (m) => m.name.toLowerCase() !== nameLower && m.name.toLowerCase() !== item.toLowerCase()
              )
            } else if (entityKey === "social_history") {
              next.lifestyle = {
                ...p.lifestyle,
                socialHistoryLines: (p.lifestyle?.socialHistoryLines ?? []).filter((x) => x !== item),
              }
            }
            next = {
              ...next,
              blocks: stripBlocksForUnaccept(next.blocks, entityKey, item),
            }
            return appendAcceptHistory(next, entityKey, item, "unaccepted")
          })
          return { openPatients }
        })
      },

      acceptScribeEntity: (patientId, entityKey, item, sectionLabel) => {
        const statusKey = `${entityKey}:${item}`
        set((state) => {
          const block = buildAcceptedEntityBlock(
            patientId,
            entityKey,
            item,
            sectionLabel
          )
          const extraLabBlocks: MedicalBlock[] = []
          if (entityKey === "procedures" && isLikelyLabOrderText(item)) {
            const cat = findBestCatalogEntryForLabel(item)
            const label = cat?.label ?? item.trim()
            extraLabBlocks.push(
              buildLabOrderBlock(patientId, label, {
                catalogId: cat?.id,
                category: cat?.category,
                fromProcedureAccept: item,
                sourceType: "scribe",
              })
            )
          }
          const openPatients = state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p
            let next: PatientSession = {
              ...p,
              blocks: [...p.blocks, block, ...extraLabBlocks],
            }
            if (entityKey === "diagnoses") {
              if (shouldPromoteDiagnosisToChronic(item)) {
                next = {
                  ...next,
                  chronicConditions: uniqStrings([...(p.chronicConditions ?? []), item]),
                }
              } else {
                next = {
                  ...next,
                  encounterProblems: uniqStrings([...(p.encounterProblems ?? []), item]),
                }
              }
            } else if (
              entityKey === "chief_complaint" ||
              entityKey === "symptoms" ||
              entityKey === "risk_factors"
            ) {
              next = {
                ...next,
                encounterProblems: uniqStrings([...(p.encounterProblems ?? []), item]),
              }
            } else if (entityKey === "allergies") {
              const al = uniqStrings([...(p.criticalAllergies ?? []), item])
              next = { ...next, criticalAllergies: al }
            } else if (entityKey === "medications") {
              const parsed = parseMedicationLine(item)
              if (parsed.name) {
                const id = `med-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
                const row: PatientMedication = {
                  id,
                  name: parsed.name,
                  dosage: parsed.dosage,
                  frequency: parsed.frequency,
                  startDate: new Date().toISOString().slice(0, 10),
                }
                next = {
                  ...next,
                  activeMedications: [...(p.activeMedications ?? []), row],
                }
              }
            } else if (entityKey === "social_history") {
              next = {
                ...next,
                lifestyle: {
                  ...p.lifestyle,
                  socialHistoryLines: uniqStrings([
                    ...(p.lifestyle?.socialHistoryLines ?? []),
                    item,
                  ]),
                },
              }
            }
            return appendAcceptHistory(next, entityKey, item, "accepted")
          })
          return {
            scribeEntityStatus: { ...state.scribeEntityStatus, [statusKey]: "accepted" },
            openPatients,
          }
        })
      },

      rejectScribeEntity: (patientId, entityKey, item) => {
        const statusKey = `${entityKey}:${item}`
        set((state) => ({
          scribeEntityStatus: { ...state.scribeEntityStatus, [statusKey]: "rejected" },
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? appendAcceptHistory(p, entityKey, item, "rejected")
              : p
          ),
        }))
      },

      addEncounterProblem: (patientId, problem) => {
        const t = problem.trim()
        if (!t) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  encounterProblems: uniqStrings([...(p.encounterProblems ?? []), t]),
                }
              : p
          ),
        }))
      },

      addCriticalAllergy: (patientId, allergy) => {
        const t = allergy.trim()
        if (!t) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  criticalAllergies: uniqStrings([...(p.criticalAllergies ?? []), t]),
                }
              : p
          ),
        }))
      },

      removeCriticalAllergy: (patientId, allergy) => {
        const t = allergy.trim()
        if (!t) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  criticalAllergies: (p.criticalAllergies ?? []).filter((x) => x !== t),
                }
              : p
          ),
        }))
      },

      renameCriticalAllergy: (patientId, fromLabel, toLabel) => {
        const from = fromLabel.trim()
        const to = toLabel.trim()
        if (!from || !to) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  criticalAllergies: uniqStrings(
                    (p.criticalAllergies ?? []).map((x) => (x === from ? to : x))
                  ),
                }
              : p
          ),
        }))
      },

      removePatientBlock: (patientId, blockId) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }
              : p
          ),
        }))
      },

      updateLabOrderBlock: (patientId, blockId, newLabel) => {
        const t = newLabel.trim()
        if (!t) return
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId
              ? {
                  ...p,
                  blocks: p.blocks.map((b) =>
                    b.id === blockId && b.type === "LAB"
                      ? {
                          ...b,
                          title: t,
                          metadata: { ...b.metadata, label: t },
                        }
                      : b
                  ),
                }
              : p
          ),
        }))
      },

      setPatientEvidenceDeepDive: (patientId, dive) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) =>
            p.patientId === patientId ? { ...p, evidenceDeepDive: dive } : p
          ),
        }))
      },
      updateEntityText: (category, oldText, newText) => {
        if (!newText.trim()) return
        set((state) => {
          const entities = { ...state.scribeEntities }
          const arr = [...((entities as any)[category] ?? [])]
          const idx = arr.indexOf(oldText)
          if (idx >= 0) arr[idx] = newText.trim()
          ;(entities as any)[category] = arr
          const statusUpdate = { ...state.scribeEntityStatus }
          const oldKey = `${category}:${oldText}`
          const newKey = `${category}:${newText.trim()}`
          if (statusUpdate[oldKey]) {
            statusUpdate[newKey] = statusUpdate[oldKey]
            delete statusUpdate[oldKey]
          }
          return { scribeEntities: entities, scribeEntityStatus: statusUpdate }
        })
      },
      clearScribeTranscript: () =>
        set({ scribeTranscript: "", scribeSegments: [], scribeEntities: EMPTY_ENTITIES, scribeHighlights: [], scribeEntityStatus: {}, scribeCollapsed: false }),

      openDocumentSheet: (blockId) => {
        const prev = get().paneVisibility
        set({
          documentSheet: { isOpen: true, blockId, editMode: false, contentDocument: null },
          paneVisibility: { ...prev, sidecar: false },
        })
      },

      openDocumentContent: (doc) => {
        const prev = get().paneVisibility
        set({
          documentSheet: { isOpen: true, blockId: null, editMode: false, contentDocument: doc },
          paneVisibility: { ...prev, sidecar: false },
        })
      },

      updateDocumentContent: (content, isStreaming, patch) => {
        set((state) => {
          if (!state.documentSheet.contentDocument) return state
          const prevDoc = state.documentSheet.contentDocument
          const nextDoc = {
            ...prevDoc,
            content,
            isStreaming,
            ...(patch?.sources !== undefined ? { sources: patch.sources } : {}),
            ...(patch?.prescriptionItems !== undefined
              ? { prescriptionItems: patch.prescriptionItems }
              : {}),
          }
          const pid = state.activePatientId
          let openPatients = state.openPatients
          if (pid) {
            openPatients = state.openPatients.map((p) => {
              if (p.patientId !== pid) return p
              const docs = [...(p.sessionDocuments ?? [])]
              const idx = docs.findIndex((s) => s.id === prevDoc.id)
              if (idx < 0) return p
              docs[idx] = {
                ...docs[idx],
                document: nextDoc,
                updatedAt: new Date().toISOString(),
              }
              return { ...p, sessionDocuments: docs }
            })
          }
          return {
            openPatients,
            documentSheet: {
              ...state.documentSheet,
              contentDocument: nextDoc,
            },
          }
        })
      },

      upsertSessionDocument: (patientId, entry) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p
            const list = [...(p.sessionDocuments ?? [])]
            const idx = list.findIndex((s) => s.id === entry.id)
            if (idx >= 0) list[idx] = entry
            else list.push(entry)
            return { ...p, sessionDocuments: list }
          }),
        }))
      },

      acceptSessionDocument: (patientId, docId, options) => {
        const state = get()
        let resolvedDocForSideEffects: ClinicalDocument | null = null

        const openPatients = state.openPatients.map((p) => {
          if (p.patientId !== patientId) return p

          const docs = [...(p.sessionDocuments ?? [])]
          const idx = docs.findIndex((s) => s.id === docId)
          const now = new Date().toISOString()
          const fallbackDoc = options?.document
          const messageId =
            options?.messageId ?? (docId.replace(/^cdoc-/, "") || docId)

          let resolvedDoc: ClinicalDocument | null = null
          if (idx >= 0) {
            resolvedDoc = { ...docs[idx].document, isStreaming: false }
            docs[idx] = {
              ...docs[idx],
              status: "accepted",
              rejectReason: undefined,
              document: resolvedDoc,
              updatedAt: now,
            }
          } else if (fallbackDoc) {
            resolvedDoc = { ...fallbackDoc, isStreaming: false }
            docs.push({
              id: docId,
              messageId,
              status: "accepted",
              document: resolvedDoc,
              updatedAt: now,
            })
          } else {
            return p
          }

          resolvedDocForSideEffects = resolvedDoc

          let nextPatient: PatientSession = { ...p, sessionDocuments: docs }

          if (resolvedDoc) {
            const hasBlock = nextPatient.blocks.some(
              (b) => b.metadata?.clinicalDocumentId === resolvedDoc!.id
            )
            if (!hasBlock) {
              nextPatient = {
                ...nextPatient,
                blocks: [
                  ...nextPatient.blocks,
                  buildAcceptedClinicalDocumentBlock(resolvedDoc, patientId),
                ],
              }
            }

            const fromNote = parseVitalsFromClinicalText(resolvedDoc.content, "Accepted note")
            const newVitals = dedupeVitalReadings(fromNote, nextPatient.vitals)
            if (newVitals.length > 0) {
              nextPatient = {
                ...nextPatient,
                vitals: [...nextPatient.vitals, ...newVitals],
              }
            }
          }

          return nextPatient
        })

        set({ openPatients })

        if (resolvedDocForSideEffects) {
          const doc = resolvedDocForSideEffects as ClinicalDocument
          if (doc.type === "prescribe" && doc.prescriptionItems && doc.prescriptionItems.length > 0) {
            for (const rx of doc.prescriptionItems) {
              const match = state.inventory.find(
                (inv) =>
                  inv.name.toLowerCase().includes(rx.drug.toLowerCase()) ||
                  (rx.drug.toLowerCase().includes(inv.name.split(" ")[0].toLowerCase()) && inv.name.split(" ")[0].length > 3)
              )
              if (match?.nappiCode) {
                get().decrementInventory(match.nappiCode, 1)
              }
            }
          }
        }
      },

      rejectSessionDocument: (patientId, docId, reason, options) => {
        set((state) => ({
          openPatients: state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p

            const docs = [...(p.sessionDocuments ?? [])]
            const idx = docs.findIndex((s) => s.id === docId)
            const now = new Date().toISOString()
            const fallbackDoc = options?.document
            const messageId =
              options?.messageId ?? (docId.replace(/^cdoc-/, "") || docId)

            if (idx >= 0) {
              docs[idx] = {
                ...docs[idx],
                status: "rejected",
                rejectReason: reason,
                updatedAt: now,
              }
            } else if (fallbackDoc) {
              docs.push({
                id: docId,
                messageId,
                status: "rejected",
                rejectReason: reason,
                document: { ...fallbackDoc, isStreaming: false },
                updatedAt: now,
              })
            } else {
              return p
            }

            return { ...p, sessionDocuments: docs }
          }),
        }))
      },

      ingestClinicalNoteText: (patientId, text, sourceLabel) => {
        if (!text?.trim()) return
        set((state) => ({
          openPatients: state.openPatients.map((p) => {
            if (p.patientId !== patientId) return p
            const parsed = parseVitalsFromClinicalText(
              text,
              sourceLabel ?? "Assistant note"
            )
            const newVitals = dedupeVitalReadings(parsed, p.vitals)
            if (newVitals.length === 0) return p
            return { ...p, vitals: [...p.vitals, ...newVitals] }
          }),
        }))
      },

      ingestScribeExtractionForPatient: (patientId) => {
        const { scribeEntities, openPatients } = get()
        const patient = openPatients.find((x) => x.patientId === patientId)
        if (!patient) return

        let nextPatient = patient

        const fromEntities = scribeEntities.vitals.flatMap((line) =>
          parseVitalsFromClinicalText(line, "Transcript vital")
        )
        const fromTranscript = parseVitalsFromClinicalText(
          get().scribeTranscript,
          "Transcript"
        )
        const combined = dedupeVitalReadings(
          [...fromEntities, ...fromTranscript],
          nextPatient.vitals
        )
        if (combined.length > 0) {
          const merged = combined.map((v) => ({ ...v, committed: true }))
          nextPatient = {
            ...nextPatient,
            vitals: [...nextPatient.vitals, ...merged],
          }
        }

        let blocks = nextPatient.blocks
        if (
          shouldAppendScribeBlock(blocks, scribeEntities) &&
          extractionHasSignal(scribeEntities)
        ) {
          blocks = [
            ...blocks,
            buildScribeExtractionBlock(patientId, scribeEntities),
          ]
        }

        set({
          openPatients: openPatients.map((p) =>
            p.patientId === patientId ? { ...nextPatient, blocks } : p
          ),
        })
      },

      closeDocumentSheet: () => {
        const prev = get().paneVisibility
        set({
          documentSheet: { isOpen: false, blockId: null, editMode: false, contentDocument: null },
          paneVisibility: { ...prev, sidecar: true },
        })
      },

      toggleDocumentEditMode: () => {
        set((state) => ({
          documentSheet: { ...state.documentSheet, editMode: !state.documentSheet.editMode },
        }))
      },

      setAdminTab: (tab) => set({ activeAdminTab: tab }),
      setBillingSubTab: (tab) => set({ activeBillingSubTab: tab }),
      setActiveDoctor: (doctorId) => set({ activeDoctorId: doctorId }),
      setSelectedDate: (date) => set({ selectedDate: date }),

      addClaim: (claim) =>
        set((state) => ({ claims: [...state.claims, claim] })),

      setClaims: (claims) => set({ claims }),

      updateClaim: (claimId, update) =>
        set((state) => ({
          claims: state.claims.map((c) =>
            c.id === claimId ? { ...c, ...update } : c
          ),
        })),

      updateClaimStatus: (claimId, status) =>
        set((state) => ({
          claims: state.claims.map((c) =>
            c.id === claimId
              ? {
                  ...c,
                  status,
                  ...(status === "submitted" ? { submittedAt: new Date().toISOString() } : {}),
                  ...(status === "paid" ? { paidAt: new Date().toISOString() } : {}),
                }
              : c
          ),
        })),

      upsertInventoryItem: (item) =>
        set((state) => {
          const idx = state.inventory.findIndex((i) => i.id === item.id)
          if (idx >= 0) {
            const next = [...state.inventory]
            next[idx] = item
            return { inventory: next }
          }
          return { inventory: [...state.inventory, item] }
        }),

      deleteInventoryItem: (itemId) =>
        set((state) => ({
          inventory: state.inventory.filter((i) => i.id !== itemId),
        })),

      decrementInventory: (nappiCode, qty = 1) =>
        set((state) => ({
          inventory: state.inventory.map((i) =>
            i.nappiCode === nappiCode
              ? { ...i, currentStock: Math.max(0, i.currentStock - qty) }
              : i
          ),
        })),

      bulkImportInventory: (items) =>
        set((state) => {
          const map = new Map(state.inventory.map((i) => [i.id, i]))
          for (const item of items) map.set(item.id, item)
          return { inventory: Array.from(map.values()) }
        }),

      setCommandBarOpen: (open) => set({ commandBarOpen: open }),

      addPatient: (patient) =>
        set((state) => ({ patients: [...state.patients, patient] })),

      openPatientAddModalWithPrefill: (prefill) =>
        set((s) => ({
          patientAddModalPrefill: prefill,
          patientAddModalOpenNonce: s.patientAddModalOpenNonce + 1,
        })),

      clearPatientAddModalPrefill: () => set({ patientAddModalPrefill: null }),

      updatePatient: (patientId, update) =>
        set((state) => ({
          patients: state.patients.map((p) =>
            p.id === patientId ? { ...p, ...update } : p
          ),
        })),

      addAppointment: (appointment) =>
        set((state) => ({ appointments: [...state.appointments, appointment] })),

      updateAppointment: (appointmentId, update) =>
        set((state) => ({
          appointments: state.appointments.map((a) =>
            a.id === appointmentId ? { ...a, ...update } : a
          ),
        })),

      removeAppointment: (appointmentId) =>
        set((state) => ({
          appointments: state.appointments.filter((a) => a.id !== appointmentId),
        })),

      addNotification: (notification) =>
        set((state) => ({ notifications: [notification, ...state.notifications] })),

      markNotificationRead: (notificationId) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
        })),

      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      markMessageRead: (messageId) =>
        set((state) => ({
          inboxMessages: state.inboxMessages.map((m) =>
            m.id === messageId ? { ...m, read: true } : m
          ),
        })),

      setInboxNotificationFilter: (filter) => set({ inboxNotificationFilter: filter }),

      setActiveInboxThreadId: (messageId) => set({ activeInboxThreadId: messageId }),

      requestInboxNotificationsPanelOpen: () =>
        set((s) => ({
          mode: "admin",
          activeAdminTab: "inbox",
          inboxNotificationsPanelRequest: s.inboxNotificationsPanelRequest + 1,
        })),

      requestInboxScrollTo: (target) =>
        set((s) => ({
          mode: "admin",
          activeAdminTab: "inbox",
          inboxScrollRequest: { target, nonce: s.inboxScrollRequest.nonce + 1 },
        })),

      requestCalendarFocusAppointment: (appointmentId) =>
        set((s) => ({
          mode: "admin",
          activeAdminTab: "calendar",
          calendarFocusRequest: {
            appointmentId,
            nonce: s.calendarFocusRequest.nonce + 1,
          },
        })),

      requestBillingFocusClaim: (claimId) =>
        set((s) => ({
          mode: "admin",
          activeAdminTab: "billing",
          billingFocusRequest: {
            claimId,
            nonce: s.billingFocusRequest.nonce + 1,
          },
        })),

      requestInventoryImportPanelOpen: () =>
        set((s) => ({
          mode: "admin",
          activeAdminTab: "inventory",
          inventoryImportPanelRequest: s.inventoryImportPanelRequest + 1,
        })),

      addInboxMessage: (message) =>
        set((state) => ({
          inboxMessages: [message, ...state.inboxMessages],
        })),

      updatePracticeFlow: (entries) => set({ practiceFlow: entries }),
      updateFlowEntry: (patientId, update) => {
        set((state) => ({
          practiceFlow: state.practiceFlow.map((e) =>
            e.patientId === patientId ? { ...e, ...update } : e
          ),
        }))
      },
    }),
    {
      name: "fleming:workspace",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return sessionStorage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          length: 0,
          clear: () => {},
          key: () => null,
        } satisfies Storage
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<WorkspaceState> | undefined
        const merged = { ...current, ...p } as WorkspaceState
        if ((merged.activeAdminTab as string) === "settings") {
          merged.activeAdminTab = "calendar"
        }
        return merged
      },
      partialize: (state) => ({
        mode: state.mode,
        activePatientId: state.activePatientId,
        activeAdminTab: state.activeAdminTab,
        activeDoctorId: state.activeDoctorId,
        paneVisibility: state.paneVisibility,
        openPatients: state.openPatients.map((p) => ({
          ...p,
          openedAt: p.openedAt instanceof Date ? p.openedAt.toISOString() : p.openedAt,
          consultSignedAt:
            p.consultSignedAt instanceof Date
              ? p.consultSignedAt.toISOString()
              : p.consultSignedAt,
        })),
      }),
      skipHydration: true,
    }
  )
  )
)

export function getActivePatient(): PatientSession | null {
  const { activePatientId, openPatients } = useWorkspaceStore.getState()
  if (!activePatientId) return null
  return openPatients.find((p) => p.patientId === activePatientId) ?? null
}

export function createPatientSession(
  overrides: Partial<PatientSession> & Pick<PatientSession, "patientId" | "name">
): PatientSession {
  return {
    status: "waiting",
    openedAt: new Date(),
    soapNote: { ...EMPTY_SOAP },
    vitals: [],
    blocks: [],
    sessionDocuments: [],
    acceptHistory: [],
    evidenceDeepDive: null,
    ...overrides,
    chronicConditions: overrides.chronicConditions ?? [],
    encounterProblems: overrides.encounterProblems ?? [],
    criticalAllergies: overrides.criticalAllergies ?? [],
    activeMedications: overrides.activeMedications ?? [],
  }
}
