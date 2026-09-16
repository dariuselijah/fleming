import type {
  AdminNotification,
  InboxMessage,
  InventoryItem,
  PracticeAppointment,
  PracticeClaim,
  PracticePatient,
} from "@/lib/clinical-workspace/types"
import { handoffDocTypeLabel, parseDocTypeFromHandoffLabel } from "./front-desk-doc-labels"
import { automationTierForItem } from "./automation-tiers"
import { parseHandoffMetadata } from "@/lib/clinical-workspace/handoff-metadata"
import {
  type FrontDeskInvoiceRow,
  invoiceDueCents,
  invoiceNeedsCollection,
  isInvoiceOverdue,
} from "./front-desk-invoice"
import type {
  CommsThreadRow,
  ImportPayload,
  PracticePulseCounts,
  WorkQueueFilter,
  WorkQueueItem,
  WorkQueuePriority,
} from "./work-queue-types"
import { CLAIM_GROUP_MIN } from "./work-queue-types"

const ACTION_NOTIF_TYPES = new Set([
  "alert",
  "lab_result",
  "claim_status",
  "patient_message",
  "stock_low",
  "payment_overdue",
  "medical_aid_rejection",
])

const SUBMITTED_FOLLOWUP_DAYS = 3

function priorityRank(p: WorkQueuePriority): number {
  if (p === "urgent") return 0
  if (p === "high") return 1
  if (p === "normal") return 2
  return 3
}

function threadPriority(priority: string, status: string): WorkQueuePriority {
  if (status === "closed") return "resolved"
  if (priority === "urgent") return "urgent"
  if (priority === "high" || status === "handoff") return "high"
  return "normal"
}

function threadAiLine(thread: CommsThreadRow): string | undefined {
  if (thread.status === "handoff") {
    return thread.channel === "email"
      ? "Patient email — select to reply"
      : "Patient message — select to reply"
  }
  if (thread.status === "awaiting_input") return "Waiting for patient reply"
  if (thread.status === "active") return "Select to view conversation · reply if needed"
  return undefined
}

function labPriority(lab: InboxMessage): WorkQueuePriority {
  const preview = lab.preview.toLowerCase()
  if (preview.includes("critical") || preview.includes("elevated") || preview.includes("abnormal")) {
    return "urgent"
  }
  if (!lab.read) return "high"
  return "resolved"
}

function labAiLine(lab: InboxMessage, priority: WorkQueuePriority): string | undefined {
  if (priority === "urgent") return "Critical result — notify doctor before patient"
  if (!lab.read) return "Review result · notify patient when ready"
  return "Reviewed · attached to record"
}

function handoffPriority(docType: string | null, unread: boolean): WorkQueuePriority {
  if (!unread) return "resolved"
  if (docType === "prescribe") return "high"
  if (docType === "claim") return "high"
  return "normal"
}

function handoffAiLine(docType: string | null, hasPayload: boolean): string | undefined {
  if (!hasPayload) return "Missing clinical payload — ask clinician to re-send from consult"
  if (docType === "prescribe") return "Print script · check allergies · dispense or file"
  if (docType === "claim") return "Review claim lines · submit to scheme or invoice patient"
  if (docType === "icd") return "Attach ICD codes to billing record"
  if (docType === "vitals") return "File vitals to patient chart"
  if (docType === "verify") return "Verify patient details with front desk"
  if (docType === "soap") return "File clinical note · share with patient if needed"
  return "Review clinical handoff from consult"
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function claimFollowupKind(claim: PracticeClaim): "submitted" | "rejected" | "partial" | "approved_unpaid" | null {
  if (claim.status === "rejected") return "rejected"
  if (claim.status === "partial") return "partial"
  if (claim.status === "submitted" && daysSince(claim.submittedAt ?? claim.createdAt) >= SUBMITTED_FOLLOWUP_DAYS) {
    return "submitted"
  }
  if (claim.status === "approved") return "approved_unpaid"
  return null
}

function followupAiLine(kind: NonNullable<ReturnType<typeof claimFollowupKind>>, claim: PracticeClaim): string {
  if (kind === "rejected") {
    return claim.rejectionReason ? `Rejected — ${claim.rejectionReason}` : "Medical aid rejection — review and resubmit"
  }
  if (kind === "partial") return "Partial approval — invoice patient co-pay"
  if (kind === "submitted") return "Awaiting scheme response — check status or follow up"
  return "Approved — record payment or invoice balance"
}

function sortItems(items: WorkQueueItem[]): WorkQueueItem[] {
  return items.sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority)
    if (pr !== 0) return pr
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

export function assembleWorkQueueItems(input: {
  threads: CommsThreadRow[]
  inboxMessages: InboxMessage[]
  claims: PracticeClaim[]
  notifications: AdminNotification[]
  importItems: ImportPayload[]
  patients: PracticePatient[]
  inventory: InventoryItem[]
  appointments: PracticeAppointment[]
  invoices: FrontDeskInvoiceRow[]
  resolvedIds: Set<string>
}): WorkQueueItem[] {
  const {
    threads,
    inboxMessages,
    claims,
    notifications,
    importItems,
    patients,
    inventory,
    appointments,
    invoices,
    resolvedIds,
  } = input
  const items: WorkQueueItem[] = []

  // Clinical handoffs from consult (document channel)
  const seenSessionDocs = new Set<string>()
  for (const msg of inboxMessages.filter((m) => m.channel === "document")) {
    const meta = parseHandoffMetadata(msg.metadata)
    if (meta.sessionDocumentId) {
      if (seenSessionDocs.has(meta.sessionDocumentId)) continue
      seenSessionDocs.add(meta.sessionDocumentId)
    }
    const docType = meta.docType ?? parseDocTypeFromHandoffLabel(msg.from)
    const hasPayload = Boolean(msg.payloadCiphertext && msg.payloadIv)
    const priority = handoffPriority(docType, !msg.read)
    const resolved = resolvedIds.has(`handoff-${msg.id}`) || msg.read
    const patientFromMeta = msg.patientId
      ? patients.find((p) => p.id === msg.patientId)?.name
      : undefined
    items.push({
      id: `handoff-${msg.id}`,
      type: "clinical_handoff",
      priority: resolved ? "resolved" : !hasPayload ? "high" : priority,
      patientId: msg.patientId,
      patientName: patientFromMeta ?? msg.from.split("·").pop()?.trim() ?? msg.from,
      summaryLine: msg.preview,
      aiActionLine: resolved ? "Completed" : handoffAiLine(docType, hasPayload),
      timestamp: msg.timestamp,
      resolved,
      payload: {
        type: "clinical_handoff",
        data: {
          inboxMessage: msg,
          docType,
          fromLabel: msg.from,
          hasEncryptedPayload: hasPayload,
          metadata: meta,
        },
      },
    })
  }

  // Patient messages (comms threads)
  for (const thread of threads) {
    if (thread.status === "closed") continue
    const needsAttention =
      thread.status === "handoff" ||
      thread.status === "awaiting_input" ||
      thread.unreadCount > 0 ||
      thread.priority === "urgent" ||
      thread.priority === "high"
    if (!needsAttention) continue

    const stripPreview = inboxMessages.find((m) => m.threadId === thread.id)?.preview
    const priority = threadPriority(thread.priority, thread.status)
    const resolved = resolvedIds.has(`thread-${thread.id}`)

    items.push({
      id: `thread-${thread.id}`,
      type: "message",
      priority: resolved ? "resolved" : priority,
      patientId: thread.patientId,
      patientName: thread.patientName,
      summaryLine: stripPreview || thread.lastMessagePreview || `${thread.patientName} — ${thread.channel === "email" ? "email" : thread.channel} message`,
      aiActionLine: resolved ? "Resolved" : threadAiLine(thread),
      timestamp: thread.lastMessageAt,
      resolved,
      payload: {
        type: "message",
        data: {
          threadId: thread.id,
          channel: thread.channel,
          externalParty: thread.externalParty,
          status: thread.status,
          priority: thread.priority,
          currentFlow: thread.currentFlow,
          unreadCount: thread.unreadCount,
          lastMessagePreview: thread.lastMessagePreview,
        },
      },
    })
  }

  // Lab results
  for (const lab of inboxMessages.filter((m) => m.channel === "lab")) {
    const priority = labPriority(lab)
    const resolved = resolvedIds.has(`lab-${lab.id}`) || (lab.read && priority !== "urgent")
    items.push({
      id: `lab-${lab.id}`,
      type: "lab",
      priority: resolved ? "resolved" : priority,
      patientId: lab.patientId,
      patientName: lab.from,
      summaryLine: lab.preview,
      aiActionLine: resolved ? "Patient notified · attached to record" : labAiLine(lab, priority),
      timestamp: lab.timestamp,
      resolved,
      payload: {
        type: "lab",
        data: { inboxMessage: lab, partner: lab.from, isCritical: priority === "urgent" },
      },
    })
  }

  // Claims — drafts (grouped) + follow-ups
  const draftClaims = claims.filter((c) => c.status === "draft")
  const followupClaims = claims.filter((c) => claimFollowupKind(c) !== null)

  if (draftClaims.length >= CLAIM_GROUP_MIN) {
    const totalAmount = draftClaims.reduce((s, c) => s + (c.totalAmount ?? 0), 0)
    const patientIds = new Set(draftClaims.map((c) => c.patientId).filter(Boolean))
    const resolved = resolvedIds.has("claim-group-draft")
    items.push({
      id: "claim-group-draft",
      type: "claim_group",
      isGroup: true,
      groupChildIds: draftClaims.map((c) => `claim-${c.id}`),
      priority: resolved ? "resolved" : "high",
      patientName: `${patientIds.size} patients`,
      summaryLine: `${draftClaims.length} draft claims · R${Math.round(totalAmount).toLocaleString()} total`,
      aiActionLine: resolved ? "Reviewed" : `Batch review · submit validated claims together`,
      timestamp: draftClaims[0]?.createdAt ?? new Date().toISOString(),
      resolved,
      payload: {
        type: "claim_group",
        data: {
          claims: draftClaims,
          totalAmount,
          patientCount: patientIds.size,
        },
      },
    })
  } else {
    for (const claim of draftClaims) {
      const resolved = resolvedIds.has(`claim-${claim.id}`)
      const lineCount = claim.lines?.length ?? 0
      items.push({
        id: `claim-${claim.id}`,
        type: "claim",
        priority: resolved ? "resolved" : "high",
        patientId: claim.patientId,
        patientName: claim.patientName,
        summaryLine: `Draft claim R${Math.round(claim.totalAmount).toLocaleString()} · ${lineCount} lines`,
        aiActionLine: resolved ? "Reviewed" : "Review lines · submit when ready",
        timestamp: claim.createdAt,
        resolved,
        payload: { type: "claim", data: { claim, lineCount } },
      })
    }
  }

  for (const claim of followupClaims) {
    const kind = claimFollowupKind(claim)!
    const resolved = resolvedIds.has(`followup-${claim.id}`)
    const days = daysSince(claim.submittedAt ?? claim.createdAt)
    const priority: WorkQueuePriority =
      kind === "rejected" ? "urgent" : kind === "partial" ? "high" : "normal"
    items.push({
      id: `followup-${claim.id}`,
      type: "claim_followup",
      priority: resolved ? "resolved" : priority,
      patientId: claim.patientId,
      patientName: claim.patientName,
      summaryLine:
        kind === "rejected"
          ? `Rejected claim R${Math.round(claim.totalAmount).toLocaleString()}`
          : kind === "partial"
            ? `Partial approval · R${Math.round(claim.totalAmount).toLocaleString()}`
            : kind === "submitted"
              ? `Submitted claim · ${days}d awaiting response`
              : `Approved claim · collect payment`,
      aiActionLine: resolved ? "Resolved" : followupAiLine(kind, claim),
      timestamp: claim.submittedAt ?? claim.createdAt,
      resolved,
      payload: {
        type: "claim_followup",
        data: { claim, followupKind: kind, daysSinceUpdate: days },
      },
    })
  }

  // Unpaid / overdue invoices
  for (const invoice of invoices.filter(invoiceNeedsCollection)) {
    const dueCents = invoiceDueCents(invoice)
    const overdue = isInvoiceOverdue(invoice)
    const resolved = resolvedIds.has(`invoice-${invoice.id}`)
    const patientName = invoice.patient_snapshot?.name ?? "Patient"
    items.push({
      id: `invoice-${invoice.id}`,
      type: "invoice",
      priority: resolved ? "resolved" : overdue ? "urgent" : "normal",
      patientId: invoice.patient_id ?? undefined,
      patientName,
      summaryLine: `${overdue ? "Overdue" : "Unpaid"} invoice R${(dueCents / 100).toLocaleString()} · ${invoice.invoice_number ?? "—"}`,
      aiActionLine: resolved ? "Collected" : overdue ? "Send payment link · call patient" : "Send portal link or record payment",
      timestamp: invoice.created_at ?? new Date().toISOString(),
      resolved,
      payload: {
        type: "invoice",
        data: { invoice, dueCents, overdue },
      },
    })
  }

  // Appointments needing attention today
  const today = new Date().toISOString().slice(0, 10)
  const nowMs = Date.now()
  for (const appt of appointments.filter((a) => a.date === today)) {
    if (appt.status === "no_show") {
      const resolved = resolvedIds.has(`appt-${appt.id}`)
      items.push({
        id: `appt-${appt.id}`,
        type: "appointment",
        priority: resolved ? "resolved" : "high",
        patientId: appt.patientId,
        patientName: appt.patientName,
        summaryLine: `No-show · ${appt.startTime} appointment`,
        aiActionLine: resolved ? "Handled" : "Reschedule or send follow-up message",
        timestamp: appt.startTime,
        resolved,
        payload: {
          type: "appointment",
          data: {
            appointmentId: appt.id,
            patientName: appt.patientName,
            startTime: appt.startTime,
            date: appt.date,
            status: appt.status,
            kind: "no_show",
          },
        },
      })
      continue
    }

    if (["booked", "confirmed"].includes(appt.status)) {
      const apptMs = new Date(`${appt.date}T${appt.startTime}`).getTime()
      const minsUntil = (apptMs - nowMs) / 60_000
      if (minsUntil >= 0 && minsUntil <= 60) {
        const resolved = resolvedIds.has(`appt-${appt.id}`)
        items.push({
          id: `appt-${appt.id}`,
          type: "appointment",
          priority: resolved ? "resolved" : minsUntil <= 15 ? "high" : "normal",
          patientId: appt.patientId,
          patientName: appt.patientName,
          summaryLine: `Arriving soon · ${appt.startTime} · ${appt.patientName}`,
          aiActionLine: resolved ? "Checked in" : "Confirm arrival · check medical aid",
          timestamp: appt.startTime,
          resolved,
          payload: {
            type: "appointment",
            data: {
              appointmentId: appt.id,
              patientName: appt.patientName,
              startTime: appt.startTime,
              date: appt.date,
              status: appt.status,
              kind: "upcoming",
            },
          },
        })
      }
    }
  }

  // Low stock inventory
  for (const item of inventory.filter((i) => i.currentStock <= i.minStock)) {
    const resolved = resolvedIds.has(`stock-${item.id}`)
    const deficit = item.minStock - item.currentStock
    items.push({
      id: `stock-${item.id}`,
      type: "inventory",
      priority: resolved ? "resolved" : item.currentStock === 0 ? "urgent" : "normal",
      patientName: item.name,
      summaryLine: `Low stock · ${item.name} (${item.currentStock}/${item.minStock})`,
      aiActionLine: resolved ? "Reorder placed" : deficit > 0 ? `Reorder ${deficit} units` : "At minimum — review reorder",
      timestamp: item.lastRestocked ?? new Date().toISOString(),
      resolved,
      payload: {
        type: "inventory",
        data: { item, deficit: Math.max(0, deficit) },
      },
    })
  }

  // Document imports
  for (const imp of importItems) {
    const resolved = resolvedIds.has(`import-${imp.importId}`) || imp.autoMatched
    items.push({
      id: `import-${imp.importId}`,
      type: "import",
      priority: resolved ? "resolved" : imp.autoMatched ? "resolved" : "normal",
      patientId: imp.matchedPatientId,
      patientName: imp.matchedPatientName ?? imp.fileName ?? "Import",
      summaryLine: imp.detectedType
        ? `${imp.detectedType} uploaded · ${imp.autoMatched ? "matched" : "needs review"}`
        : "Document uploaded · needs review",
      aiActionLine: resolved
        ? "Auto-attached to patient record"
        : "Confirm patient match before attaching",
      timestamp: new Date().toISOString(),
      resolved,
      payload: { type: "import", data: imp },
    })
  }

  // Admin notifications (alerts, billing rejections, stock — not duplicated above)
  for (const n of notifications) {
    if (!ACTION_NOTIF_TYPES.has(n.type) || n.type === "lab_result" || n.type === "patient_message") continue
    if (n.type === "stock_low") continue // handled via inventory items
    if (n.type === "payment_overdue") continue // handled via invoices
    if (n.type === "medical_aid_rejection") continue // handled via claim followup
    const resolved = resolvedIds.has(`doc-${n.id}`) || n.read
    items.push({
      id: `doc-${n.id}`,
      type: "document",
      priority: resolved ? "resolved" : n.type === "alert" ? "urgent" : "normal",
      patientName: n.title,
      summaryLine: n.title,
      aiActionLine: n.detail,
      timestamp: n.timestamp,
      resolved,
      payload: {
        type: "document",
        data: { notificationId: n.id, title: n.title, detail: n.detail },
      },
    })
  }

  void patients

  return sortItems(items.map((item) => ({ ...item, automationTier: automationTierForItem(item) })))
}

/** Expand group rows to include child items for list rendering. */
export function flattenWorkQueueList(items: WorkQueueItem[], expandedGroupIds: Set<string>): WorkQueueItem[] {
  const out: WorkQueueItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.isGroup && expandedGroupIds.has(item.id)) {
      const children = buildClaimChildItems(item)
      for (const child of children) {
        out.push({ ...child, summaryLine: `↳ ${child.summaryLine}` })
      }
    }
  }
  return out
}

function messageChannel(item: WorkQueueItem): string | null {
  if (item.type !== "message" || item.payload.type !== "message") return null
  return item.payload.data.channel
}

export function filterWorkQueueItems(items: WorkQueueItem[], filter: WorkQueueFilter): WorkQueueItem[] {
  if (filter === "all") return items
  if (filter === "urgent") return items.filter((i) => i.priority === "urgent" && !i.resolved)
  if (filter === "handoffs") return items.filter((i) => i.type === "clinical_handoff")
  if (filter === "sms") {
    return items.filter(
      (i) => i.type === "message" && ["sms", "rcs"].includes(messageChannel(i) ?? "")
    )
  }
  if (filter === "voice") {
    return items.filter((i) => i.type === "message" && messageChannel(i) === "voice")
  }
  if (filter === "email") {
    return items.filter((i) => i.type === "message" && messageChannel(i) === "email")
  }
  if (filter === "labs") return items.filter((i) => i.type === "lab")
  if (filter === "claims") {
    return items.filter((i) => i.type === "claim" || i.type === "claim_group" || i.type === "claim_followup")
  }
  if (filter === "billing") return items.filter((i) => i.type === "invoice" || i.type === "claim_followup")
  if (filter === "appointments") return items.filter((i) => i.type === "appointment")
  if (filter === "documents") return items.filter((i) => i.type === "document" || i.type === "import")
  if (filter === "imports") return items.filter((i) => i.type === "import")
  return items
}

export function computePracticePulse(
  items: WorkQueueItem[],
  claims: PracticeClaim[],
  inventory: InventoryItem[],
  patients: PracticePatient[]
): PracticePulseCounts {
  const handoffs = items.filter((i) => i.type === "clinical_handoff" && !i.resolved).length
  const draftClaims = claims.filter((c) => c.status === "draft").length
  const claimFollowups = items.filter((i) => i.type === "claim_followup" && !i.resolved).length
  const messages = items.filter((i) => i.type === "message" && !i.resolved).length
  const labs = items.filter((i) => i.type === "lab" && !i.resolved).length
  const billing = items.filter((i) => (i.type === "invoice" || i.type === "claim_followup") && !i.resolved).length
  const appointments = items.filter((i) => i.type === "appointment" && !i.resolved).length
  const pendingDocuments = items.filter((i) => i.type === "document" && !i.resolved).length
  const lowStock = inventory.filter((i) => i.currentStock <= i.minStock).length
  const maUnknown = patients.filter((p) => p.medicalAidStatus === "unknown" || p.medicalAidStatus === "pending").length
  const urgent = items.filter((i) => i.priority === "urgent" && !i.resolved).length
  const imports = items.filter((i) => i.type === "import" && !i.resolved).length

  return {
    handoffs,
    draftClaims,
    claimFollowups,
    messages,
    labs,
    billing,
    appointments,
    pendingDocuments,
    lowStock,
    maUnknown,
    urgent,
    imports,
    total: items.filter((i) => !i.resolved).length,
  }
}

export function filterCounts(items: WorkQueueItem[]): Record<WorkQueueFilter, number> {
  return {
    all: items.filter((i) => !i.resolved).length,
    urgent: items.filter((i) => i.priority === "urgent" && !i.resolved).length,
    handoffs: items.filter((i) => i.type === "clinical_handoff" && !i.resolved).length,
    sms: items.filter(
      (i) => i.type === "message" && !i.resolved && ["sms", "rcs"].includes(messageChannel(i) ?? "")
    ).length,
    voice: items.filter(
      (i) => i.type === "message" && !i.resolved && messageChannel(i) === "voice"
    ).length,
    email: items.filter(
      (i) => i.type === "message" && !i.resolved && messageChannel(i) === "email"
    ).length,
    labs: items.filter((i) => i.type === "lab" && !i.resolved).length,
    claims: items.filter(
      (i) => (i.type === "claim" || i.type === "claim_group" || i.type === "claim_followup") && !i.resolved
    ).length,
    billing: items.filter((i) => (i.type === "invoice" || i.type === "claim_followup") && !i.resolved).length,
    appointments: items.filter((i) => i.type === "appointment" && !i.resolved).length,
    documents: items.filter((i) => (i.type === "document" || i.type === "import") && !i.resolved).length,
    imports: items.filter((i) => i.type === "import" && !i.resolved).length,
  }
}

export function buildClaimChildItems(group: WorkQueueItem): WorkQueueItem[] {
  if (group.payload.type !== "claim_group") return []
  return group.payload.data.claims.map((claim) => {
    const lineCount = claim.lines?.length ?? 0
    return {
      id: `claim-${claim.id}`,
      type: "claim" as const,
      priority: group.priority,
      patientId: claim.patientId,
      patientName: claim.patientName,
      summaryLine: `Draft claim R${Math.round(claim.totalAmount).toLocaleString()} · ${lineCount} lines`,
      aiActionLine: "Review lines · submit when ready",
      timestamp: claim.createdAt,
      resolved: false,
      payload: { type: "claim" as const, data: { claim, lineCount } },
    }
  })
}

export { handoffDocTypeLabel }
