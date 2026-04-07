export type MedicalBlockType =
  | "SCRIBE"
  | "LAB"
  | "IMAGING"
  | "BILLING"
  | "VITAL"
  | "SOAP"
  | "CLAIM"
  | "NOTE"
  | "PRESCRIPTION"
  | "REFERRAL"
  | "ALERT"

export type MedicalBlockStatus =
  | "active"
  | "archived"
  | "pending_verification"
  | "draft"

export type MedicalBlockSource =
  | "hardware"
  | "medprax"
  | "rag"
  | "scribe"
  | "manual"
  | "system"
  | "hl7"
  | "dicom"

export interface MedicalBlock {
  id: string
  type: MedicalBlockType
  timestamp: Date
  patientId: string
  metadata: Record<string, unknown>
  status: MedicalBlockStatus
  sourceType: MedicalBlockSource
  title?: string
  summary?: string
}

export interface VitalReading {
  id: string
  type: "heart_rate" | "blood_pressure" | "spo2" | "temperature" | "respiratory_rate" | "weight" | "glucose"
  value: number
  unit: string
  secondaryValue?: number
  timestamp: Date
  source: "device" | "manual"
  deviceName?: string
  committed: boolean
}

export interface SOAPNote {
  subjective: string
  objective: string
  assessment: string
  plan: string
  ghostText?: {
    subjective?: string
    objective?: string
    assessment?: string
    plan?: string
  }
}

export interface PatientLifestyle {
  smoker?: boolean
  alcohol?: string
  exercise?: string
  diet?: string
}

export interface PatientSession {
  patientId: string
  /** Row id in clinical_encounters when persisted. */
  clinicalEncounterId?: string
  name: string
  age?: number
  sex?: "M" | "F" | "Other"
  medicalAidStatus?: "active" | "inactive" | "pending" | "unknown"
  medicalAidScheme?: string
  memberNumber?: string
  criticalAllergies?: string[]
  chronicConditions?: string[]
  /** Active meds / e-script queue for this encounter (sidebar + Medprax-aware search). */
  activeMedications?: PatientMedication[]
  lifestyle?: PatientLifestyle
  chatId?: string
  appointmentReason?: string
  roomNumber?: string
  status: ConsultStatus
  consultSigned?: boolean
  consultSignedAt?: Date
  claimSubmitted?: boolean
  claimId?: string
  openedAt: Date
  soapNote: SOAPNote
  vitals: VitalReading[]
  blocks: MedicalBlock[]
  sessionDocuments?: SessionDocument[]
}

export type ConsultStatus =
  | "waiting"
  | "checked_in"
  | "scribing"
  | "reviewing"
  | "billing"
  | "finished"
  | "no_show"

export type WorkspaceMode = "clinical" | "front_desk" | "admin"

export type SidecarTab =
  | "intelligence"
  | "evidence"
  | "history"
  | "vitals"
  | "documents"

export interface SidecarPayload {
  tab: SidecarTab
  pinnedBlockId?: string
  query?: string
  data?: Record<string, unknown>
}

export type OverlayType = "calendar" | "inventory" | "resource_library" | "sales"

export type ClinicalDocType = "soap" | "summary" | "evidence" | "interactions" | "drug" | "icd" | "prescribe" | "refer" | "vitals" | "verify" | "claim"

export interface DocumentSheetState {
  isOpen: boolean
  blockId: string | null
  editMode: boolean
  contentDocument: ClinicalDocument | null
}

export type DocumentStatus = "draft" | "accepted" | "rejected"

export interface PrescriptionItem {
  id: string
  drug: string
  strength?: string
  route?: string
  frequency?: string
  duration?: string
  instructions?: string
}

export interface SessionDocument {
  id: string
  messageId: string
  status: DocumentStatus
  document: ClinicalDocument
  rejectReason?: string
  updatedAt: string
}

export interface ClinicalDocument {
  id: string
  type: ClinicalDocType
  title: string
  content: string
  isStreaming: boolean
  timestamp: Date
  patientName?: string
  sources?: ClinicalSource[]
  prescriptionItems?: PrescriptionItem[]
}

export interface ClinicalSource {
  index: number
  title: string
  journal?: string
  year?: string
  /** When present (e.g. from trailing PMID appendix), maps to evidence pills / PubMed. */
  pmid?: string
  url?: string
  snippet?: string
}

export type ShareTarget = "front_desk" | "patient_whatsapp" | "patient_email" | "specialist"

export interface PracticeFlowEntry {
  patientId: string
  patientName: string
  status: ConsultStatus
  doctorId?: string
  roomNumber?: string
  appointmentTime?: Date
  checkInTime?: Date
  startTime?: Date
  endTime?: Date
}

// ── Admin ──

export type AdminTab =
  | "inbox"
  | "calendar"
  | "billing"
  | "inventory"
  | "analytics"
  | "patients"
  | "settings"
  | "channels"

/** Practice team member — extended in Settings for roles / credential tracking */
export type PracticeStaffRole = "owner" | "physician" | "nurse" | "admin" | "reception"

export type CredentialStatus = "verified" | "pending" | "expired" | "not_on_file"

export type MedicalAidVerification = "verified" | "pending" | "terminated" | "unknown"

export interface PracticePatient {
  id: string
  name: string
  idNumber?: string
  dateOfBirth?: string
  age?: number
  sex?: "M" | "F" | "Other"
  phone?: string
  email?: string
  address?: string
  emergencyContact?: { name: string; relationship: string; phone: string }
  medicalAidStatus: MedicalAidVerification
  medicalAidScheme?: string
  memberNumber?: string
  dependentCode?: string
  mainMemberName?: string
  mainMemberId?: string
  chronicConditions?: string[]
  allergies?: string[]
  currentMedications?: PatientMedication[]
  lastVisit?: string
  outstandingBalance: number
  registeredAt: string
}

export interface PatientMedication {
  id: string
  name: string
  dosage?: string
  frequency?: string
  prescribedBy?: string
  startDate: string
  refillsRemaining?: number
}

export type ClaimStatus = "draft" | "submitted" | "partial" | "approved" | "rejected" | "paid"
export type ClaimLineType = "medical_aid" | "cash" | "patient_liability"

export interface ClaimLine {
  id: string
  description: string
  icdCode?: string
  tariffCode?: string
  nappiCode?: string
  quantity?: number
  amount: number
  lineType: ClaimLineType
  status: ClaimStatus
}

export interface PracticeClaim {
  id: string
  patientId: string
  patientName: string
  doctorId?: string
  sessionDocumentId?: string
  lines: ClaimLine[]
  totalAmount: number
  medicalAidAmount: number
  cashAmount: number
  status: ClaimStatus
  rejectionReason?: string
  paymentMethod?: string
  paymentRef?: string
  paidAt?: string
  submittedAt?: string
  createdAt: string
}

export interface InventoryItem {
  id: string
  name: string
  nappiCode?: string
  category: string
  currentStock: number
  minStock: number
  unit: string
  unitPrice: number
  costPrice?: number
  supplier?: string
  expiresAt?: string
  lastRestocked: string
}

export interface PracticeProvider {
  id: string
  name: string
  specialty?: string
  bhfNumber?: string
  hpcsaNumber?: string
  role?: PracticeStaffRole
  credentialStatus?: CredentialStatus
  email?: string
}

export interface InboxMessage {
  id: string
  channel: "whatsapp" | "voice" | "sms" | "portal" | "lab" | "email"
  from: string
  preview: string
  timestamp: string
  read: boolean
  patientId?: string
  threadId?: string
  status?: "active" | "awaiting_input" | "handoff" | "closed"
  priority?: "low" | "normal" | "high" | "urgent"
  currentFlow?: string
  unreadCount?: number
}

export type NotificationType =
  | "alert"
  | "info"
  | "warning"
  | "lab_result"
  | "claim_status"
  | "appointment_reminder"
  | "patient_message"
  | "stock_low"
  | "payment_received"
  | "payment_overdue"
  | "medical_aid_rejection"

export interface AdminNotification {
  id: string
  type: NotificationType
  title: string
  detail?: string
  timestamp: string
  read: boolean
  actionRoute?: { tab: AdminTab; entityId?: string }
}

export type AppointmentStatus = "booked" | "confirmed" | "checked_in" | "in_progress" | "completed" | "no_show" | "cancelled"
export type PaymentType = "cash" | "medical_aid" | "split"

export interface PracticeAppointment {
  id: string
  patientId: string
  patientName: string
  providerId: string
  date: string
  startTime: string
  endTime: string
  hour: number
  minute: number
  duration: number
  reason?: string
  service?: string
  status: AppointmentStatus
  paymentType: PaymentType
  medicalAid?: string
  memberNumber?: string
  notes?: string
  icdCodes?: string[]
  totalFee?: number
  linkedConsultId?: string
}

export type BillingSubTab = "claims" | "invoices" | "outstanding" | "payments"

/** Filters the main inbox notification strip + panel from the left sidebar */
export type InboxNotificationFilter = "all" | "unread" | "action_required"

export type InboxScrollTarget = "smart-import" | "messages" | "activity" | "labs"
