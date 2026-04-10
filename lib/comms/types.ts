export type ChannelType = "whatsapp" | "voice" | "sms"
export type ThreadStatus = "active" | "awaiting_input" | "handoff" | "closed"
export type ThreadPriority = "low" | "normal" | "high" | "urgent"
export type FlowType = "none" | "booking" | "onboarding" | "triage" | "faq" | "patient_lookup"
export type MessageDirection = "inbound" | "outbound"
export type SenderType = "patient" | "agent" | "staff" | "system"
export type ContentType = "text" | "audio" | "image" | "document" | "template" | "interactive" | "location"
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered"
export type ChannelStatus = "provisioning" | "pending_wa_approval" | "active" | "suspended"
export type ConsentType = "ai_communication" | "data_processing" | "marketing"
export type CampaignType = "appointment_reminder" | "payment_reminder" | "onboarding" | "follow_up" | "custom"
export type FAQCategory = "hours" | "services" | "fees" | "insurance" | "directions" | "parking" | "preparation" | "general"

export interface PracticeChannel {
  id: string
  practiceId: string
  channelType: ChannelType
  provider: "twilio" | "vapi"
  phoneNumber: string
  phoneNumberSid?: string
  whatsappSenderSid?: string
  vapiAssistantId?: string
  vapiPhoneNumberId?: string
  status: ChannelStatus
  webhookUrl?: string
  createdAt: string
  updatedAt: string
}

export interface ConversationThread {
  id: string
  practiceId: string
  channel: ChannelType
  externalParty: string
  patientId?: string
  patientName?: string
  status: ThreadStatus
  priority: ThreadPriority
  currentFlow: FlowType
  flowState: FlowState
  lastMessageAt: string
  sessionExpiresAt?: string
  unreadCount: number
  assignedStaffId?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ThreadMessage {
  id: string
  threadId: string
  practiceId: string
  direction: MessageDirection
  senderType: SenderType
  contentType: ContentType
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaStoragePath?: string
  templateName?: string
  interactivePayload?: InteractivePayload
  providerMessageId?: string
  deliveryStatus: DeliveryStatus
  failureReason?: string
  agentToolCalls?: AgentToolCall[]
  createdAt: string
}

export interface VoiceCall {
  id: string
  threadId: string
  practiceId: string
  direction: MessageDirection
  vapiCallId?: string
  twilioCallSid?: string
  durationSeconds?: number
  recordingUrl?: string
  recordingStoragePath?: string
  transcript?: string
  summary?: string
  toolCallsLog?: AgentToolCall[]
  endedReason?: string
  costCents?: number
  createdAt: string
}

export interface PracticeHours {
  id: string
  practiceId: string
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
  label?: string
}

export interface PracticeFAQ {
  id: string
  practiceId: string
  category: FAQCategory
  question: string
  answer: string
  keywords: string[]
  sortOrder: number
  active: boolean
}

export interface PracticeService {
  id: string
  practiceId: string
  name: string
  description?: string
  durationMinutes: number
  fee?: number
  category?: string
  requiresReferral: boolean
  preparationInstructions?: string
  active: boolean
}

export interface WhatsAppTemplate {
  id: string
  practiceId: string
  templateName: string
  templateSid?: string
  language: string
  category: "marketing" | "utility" | "authentication"
  bodyTemplate: string
  variables: unknown[]
  status: "pending" | "approved" | "rejected"
}

export interface PatientConsent {
  id: string
  practiceId: string
  patientId?: string
  externalParty: string
  channel: string
  consentType: ConsentType
  granted: boolean
  grantedAt?: string
  revokedAt?: string
}

export interface InteractivePayload {
  type: "buttons" | "list"
  buttons?: InteractiveButton[]
  sections?: InteractiveSection[]
  selectedId?: string
}

export interface InteractiveButton {
  id: string
  title: string
}

export interface InteractiveSection {
  title: string
  rows: { id: string; title: string; description?: string }[]
}

export interface AgentToolCall {
  tool: string
  args: Record<string, unknown>
  result?: unknown
  timestamp: string
}

// Flow state shapes
export interface FlowState {
  step?: string
  collected?: Record<string, unknown>
  failureCount?: number
  lastError?: string
  [key: string]: unknown
}

export interface BookingFlowState extends FlowState {
  step?: "detect_reason" | "collect_reason" | "check_patient" | "offer_slots" | "confirm" | "booked"
  collected?: {
    reason?: string
    serviceId?: string
    serviceName?: string
    preferredDate?: string
    selectedSlot?: { date: string; startTime: string; endTime: string; providerId?: string }
    patientId?: string
    patientName?: string
  }
}

export interface OnboardingFlowState extends FlowState {
  step?: "welcome" | "collect_name" | "collect_id" | "collect_contact" | "collect_medical_aid" | "collect_aid_details" | "collect_allergies" | "collect_chronic" | "confirm" | "created"
  collected?: {
    name?: string
    idNumber?: string
    dateOfBirth?: string
    sex?: string
    email?: string
    hasMedicalAid?: boolean
    medicalAidScheme?: string
    memberNumber?: string
    dependentCode?: string
    mainMemberName?: string
    allergies?: string[]
    chronicConditions?: string[]
    medicalAidCardPath?: string
  }
}

export interface TriageFlowState extends FlowState {
  step?: "collect_symptoms" | "assess_urgency" | "route"
  collected?: {
    symptoms?: string
    duration?: string
    severity?: string
    urgency?: "low" | "medium" | "high" | "emergency"
  }
}

export interface CommsAgentContext {
  practiceId: string
  practiceName: string
  thread: ConversationThread
  recentMessages: ThreadMessage[]
  patientContext?: {
    name: string
    lastVisit?: string
    upcomingAppointments?: { date: string; time: string; service?: string }[]
    outstandingBalance?: number
  }
  hours: PracticeHours[]
  services: PracticeService[]
  faqs: PracticeFAQ[]
  isAfterHours: boolean
  hasConsent: boolean
}

export interface CommsAgentResponse {
  text: string
  interactive?: InteractivePayload
  toolCalls?: AgentToolCall[]
  flowUpdate?: {
    currentFlow: FlowType
    flowState: FlowState
  }
  threadUpdate?: {
    status?: ThreadStatus
    priority?: ThreadPriority
    patientId?: string
  }
}

// DB row ↔ app type mappers
export function threadFromRow(row: Record<string, unknown>): ConversationThread {
  return {
    id: row.id as string,
    practiceId: row.practice_id as string,
    channel: row.channel as ChannelType,
    externalParty: row.external_party as string,
    patientId: (row.patient_id as string) || undefined,
    status: row.status as ThreadStatus,
    priority: row.priority as ThreadPriority,
    currentFlow: row.current_flow as FlowType,
    flowState: (row.flow_state as FlowState) || {},
    lastMessageAt: row.last_message_at as string,
    sessionExpiresAt: (row.session_expires_at as string) || undefined,
    unreadCount: (row.unread_count as number) || 0,
    assignedStaffId: (row.assigned_staff_id as string) || undefined,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function messageFromRow(row: Record<string, unknown>): ThreadMessage {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    practiceId: row.practice_id as string,
    direction: row.direction as MessageDirection,
    senderType: row.sender_type as SenderType,
    contentType: row.content_type as ContentType,
    body: (row.body as string) || undefined,
    mediaUrl: (row.media_url as string) || undefined,
    mediaMimeType: (row.media_mime_type as string) || undefined,
    mediaStoragePath: (row.media_storage_path as string) || undefined,
    templateName: (row.template_name as string) || undefined,
    interactivePayload: (row.interactive_payload as InteractivePayload) || undefined,
    providerMessageId: (row.provider_message_id as string) || undefined,
    deliveryStatus: row.delivery_status as DeliveryStatus,
    failureReason: (row.failure_reason as string) || undefined,
    agentToolCalls: (row.agent_tool_calls as AgentToolCall[]) || undefined,
    createdAt: row.created_at as string,
  }
}
