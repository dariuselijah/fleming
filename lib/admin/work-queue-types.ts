import type {
  ClinicalDocType,
  InboxMessage,
  InventoryItem,
  PracticeClaim,
  PrescriptionItem,
  IcdCodeItem,
  ClaimDocumentItem,
} from "@/lib/clinical-workspace/types"
import type { FrontDeskInvoiceRow } from "./front-desk-invoice"

export type WorkQueueItemType =
  | "clinical_handoff"
  | "message"
  | "lab"
  | "claim"
  | "claim_group"
  | "claim_followup"
  | "invoice"
  | "appointment"
  | "inventory"
  | "import"
  | "document"

export type WorkQueuePriority = "urgent" | "high" | "normal" | "resolved"
export type WorkQueueFilter =
  | "all"
  | "urgent"
  | "handoffs"
  | "sms"
  | "voice"
  | "email"
  | "labs"
  | "claims"
  | "billing"
  | "appointments"
  | "documents"
  | "imports"

export interface ThreadPayload {
  threadId: string
  channel: string
  externalParty: string
  status: string
  priority: string
  currentFlow: string
  unreadCount: number
  lastMessagePreview?: string
}

export interface LabPayload {
  inboxMessage: InboxMessage
  partner?: string
  isCritical?: boolean
}

export interface ClaimPayload {
  claim: PracticeClaim
  lineCount: number
}

export interface ClaimGroupPayload {
  claims: PracticeClaim[]
  totalAmount: number
  patientCount: number
}

export interface ClaimFollowupPayload {
  claim: PracticeClaim
  followupKind: "submitted" | "rejected" | "partial" | "approved_unpaid"
  daysSinceUpdate: number
}

export interface ClinicalHandoffPayload {
  inboxMessage: InboxMessage
  docType: ClinicalDocType | null
  fromLabel: string
  hasEncryptedPayload: boolean
  metadata?: {
    sessionDocumentId?: string
    clinicalEncounterId?: string
    prescriberStaffId?: string
    source?: string
  }
  /** Decrypted client-side when viewing the panel */
  decrypted?: {
    docType: ClinicalDocType
    title: string
    content: string
    prescriptionItems?: PrescriptionItem[]
    icdItems?: IcdCodeItem[]
    claimItems?: ClaimDocumentItem[]
    patientName?: string
  }
}

export interface InvoicePayload {
  invoice: FrontDeskInvoiceRow
  dueCents: number
  overdue: boolean
}

export interface AppointmentPayload {
  appointmentId: string
  patientName: string
  startTime: string
  date: string
  status: string
  kind: "upcoming" | "no_show" | "needs_checkin"
}

export interface InventoryPayload {
  item: InventoryItem
  deficit: number
}

export interface ImportPayload {
  importId: string
  fileName?: string
  detectedType?: string
  matchedPatientId?: string
  matchedPatientName?: string
  candidatePatientIds?: string[]
  extractedFields?: Record<string, string>
  autoMatched: boolean
}

export interface DocumentPayload {
  notificationId?: string
  title: string
  detail?: string
}

export type WorkQueuePayload =
  | { type: "clinical_handoff"; data: ClinicalHandoffPayload }
  | { type: "message"; data: ThreadPayload }
  | { type: "lab"; data: LabPayload }
  | { type: "claim"; data: ClaimPayload }
  | { type: "claim_group"; data: ClaimGroupPayload }
  | { type: "claim_followup"; data: ClaimFollowupPayload }
  | { type: "invoice"; data: InvoicePayload }
  | { type: "appointment"; data: AppointmentPayload }
  | { type: "inventory"; data: InventoryPayload }
  | { type: "import"; data: ImportPayload }
  | { type: "document"; data: DocumentPayload }

export interface WorkQueueItem {
  id: string
  type: WorkQueueItemType
  priority: WorkQueuePriority
  patientId?: string
  patientName?: string
  summaryLine: string
  aiActionLine?: string
  timestamp: string
  resolved: boolean
  payload: WorkQueuePayload
  /** Group row — children rendered when expanded */
  isGroup?: boolean
  groupChildIds?: string[]
  automationTier?: 0 | 1 | 2 | 3
}

export interface CommsThreadRow {
  id: string
  channel: string
  externalParty: string
  patientId?: string
  patientName: string
  status: string
  priority: string
  currentFlow: string
  lastMessageAt: string
  unreadCount: number
  lastMessagePreview?: string
}

export interface CommsMessageRow {
  id: string
  direction: string
  senderType: string
  contentType: string
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  deliveryStatus: string
  agentToolCalls?: { tool: string; args: Record<string, unknown>; result?: unknown }[]
  createdAt: string
}

export interface PracticePulseCounts {
  handoffs: number
  draftClaims: number
  claimFollowups: number
  messages: number
  labs: number
  billing: number
  appointments: number
  pendingDocuments: number
  lowStock: number
  maUnknown: number
  urgent: number
  imports: number
  total: number
}

export const CLAIM_GROUP_MIN = 3
