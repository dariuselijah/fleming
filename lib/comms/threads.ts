import { createAdminClient } from "@/lib/supabase/admin"
import type {
  ChannelType,
  ConversationThread,
  ThreadMessage,
  FlowType,
  FlowState,
  ThreadStatus,
  ThreadPriority,
  threadFromRow,
  messageFromRow,
} from "./types"
import { threadFromRow as _threadFromRow, messageFromRow as _messageFromRow } from "./types"

const supabase = () => createAdminClient()

export async function resolvePracticeFromPhone(phoneNumber: string): Promise<string | null> {
  const cleanNum = phoneNumber.replace("whatsapp:", "")
  const { data } = await supabase()
    .from("practice_channels")
    .select("practice_id")
    .eq("phone_number", cleanNum)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  return data?.practice_id ?? null
}

export async function getPracticeWhatsAppNumber(practiceId: string): Promise<string | null> {
  const { data } = await supabase()
    .from("practice_channels")
    .select("phone_number")
    .eq("practice_id", practiceId)
    .eq("channel_type", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  return data?.phone_number ?? null
}

export async function getOrCreateThread(
  practiceId: string,
  channel: ChannelType,
  externalParty: string
): Promise<ConversationThread> {
  const cleanParty = externalParty.replace("whatsapp:", "")
  const db = supabase()

  const { data: existing } = await db
    .from("conversation_threads")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("channel", channel)
    .eq("external_party", cleanParty)
    .limit(1)
    .maybeSingle()

  if (existing) {
    const sessionExpiry = channel === "whatsapp"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : undefined

    if (sessionExpiry) {
      await db
        .from("conversation_threads")
        .update({ session_expires_at: sessionExpiry, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    }

    return _threadFromRow(existing as Record<string, unknown>)
  }

  // Try to match to an existing patient by phone
  const patientId = await resolvePatientByPhone(practiceId, cleanParty)

  const { data: created, error } = await db
    .from("conversation_threads")
    .insert({
      practice_id: practiceId,
      channel,
      external_party: cleanParty,
      patient_id: patientId,
      status: "active",
      priority: "normal",
      current_flow: "none",
      flow_state: {},
      last_message_at: new Date().toISOString(),
      session_expires_at: channel === "whatsapp"
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      unread_count: 0,
      metadata: {},
    })
    .select("*")
    .single()

  if (error) throw new Error(`Failed to create thread: ${error.message}`)
  return _threadFromRow(created as Record<string, unknown>)
}

export async function appendMessage(opts: {
  threadId: string
  practiceId: string
  direction: "inbound" | "outbound"
  senderType: "patient" | "agent" | "staff" | "system"
  contentType?: string
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaStoragePath?: string
  templateName?: string
  interactivePayload?: unknown
  providerMessageId?: string
  deliveryStatus?: string
  agentToolCalls?: unknown[]
}): Promise<ThreadMessage> {
  const db = supabase()

  const { data, error } = await db
    .from("thread_messages")
    .insert({
      thread_id: opts.threadId,
      practice_id: opts.practiceId,
      direction: opts.direction,
      sender_type: opts.senderType,
      content_type: opts.contentType || "text",
      body: opts.body,
      media_url: opts.mediaUrl,
      media_mime_type: opts.mediaMimeType,
      media_storage_path: opts.mediaStoragePath,
      template_name: opts.templateName,
      interactive_payload: opts.interactivePayload,
      provider_message_id: opts.providerMessageId,
      delivery_status: opts.deliveryStatus || (opts.direction === "outbound" ? "queued" : "delivered"),
      agent_tool_calls: opts.agentToolCalls,
    })
    .select("*")
    .single()

  if (error) throw new Error(`Failed to insert message: ${error.message}`)

  // Update thread
  const updates: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (opts.direction === "inbound") {
    await db.rpc("", {}).catch(() => {})
    // Increment unread
    const { data: thread } = await db
      .from("conversation_threads")
      .select("unread_count")
      .eq("id", opts.threadId)
      .single()
    updates.unread_count = ((thread?.unread_count as number) || 0) + 1
  }

  await db.from("conversation_threads").update(updates).eq("id", opts.threadId)

  return _messageFromRow(data as Record<string, unknown>)
}

export async function updateThreadFlow(
  threadId: string,
  currentFlow: FlowType,
  flowState: FlowState
): Promise<void> {
  await supabase()
    .from("conversation_threads")
    .update({
      current_flow: currentFlow,
      flow_state: flowState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId)
}

export async function updateThreadStatus(
  threadId: string,
  updates: {
    status?: ThreadStatus
    priority?: ThreadPriority
    patientId?: string
    assignedStaffId?: string
    unreadCount?: number
  }
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.status) row.status = updates.status
  if (updates.priority) row.priority = updates.priority
  if (updates.patientId) row.patient_id = updates.patientId
  if (updates.assignedStaffId) row.assigned_staff_id = updates.assignedStaffId
  if (updates.unreadCount !== undefined) row.unread_count = updates.unreadCount

  await supabase().from("conversation_threads").update(row).eq("id", threadId)
}

export async function getThreadMessages(
  threadId: string,
  limit = 20
): Promise<ThreadMessage[]> {
  const { data } = await supabase()
    .from("thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit)

  return (data || []).reverse().map((r) => _messageFromRow(r as Record<string, unknown>))
}

export async function resolvePatientByPhone(
  practiceId: string,
  phone: string
): Promise<string | null> {
  // display_name_hint may contain phone for matching (unencrypted hint field)
  const { data } = await supabase()
    .from("practice_patients")
    .select("id, display_name_hint")
    .eq("practice_id", practiceId)

  if (!data) return null
  const cleanPhone = phone.replace(/\D/g, "").slice(-9)
  for (const patient of data) {
    const hint = (patient.display_name_hint || "").toLowerCase()
    if (hint.includes(cleanPhone)) return patient.id
  }
  return null
}

export async function checkMessageIdempotency(providerMessageId: string): Promise<boolean> {
  const { data } = await supabase()
    .from("thread_messages")
    .select("id")
    .eq("provider_message_id", providerMessageId)
    .limit(1)
    .maybeSingle()
  return !!data
}
