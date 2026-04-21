import { createAdminClient } from "@/lib/supabase/admin"

export type NotificationType =
  | "patient_message"
  | "appointment_reminder"
  | "alert"
  | "lab_result"
  | "payment"
  | "system"

export type AdminActionTab = "inbox" | "calendar" | "billing"

/**
 * Inserts a dashboard notification + optional inbox strip preview (read by clinical-data-bootstrap / Live Activity).
 */
export async function notifyAdmins(opts: {
  practiceId: string
  type: NotificationType
  title: string
  detail?: string
  actionTab?: AdminActionTab
  actionEntityId?: string
}): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from("practice_admin_notifications").insert({
    practice_id: opts.practiceId,
    type: opts.type,
    title: opts.title,
    detail: opts.detail ?? null,
    read_flag: false,
    action_tab: opts.actionTab ?? null,
    action_entity_id: opts.actionEntityId ?? null,
    notif_at: new Date().toISOString(),
  })
  if (error) console.error("[notifyAdmins]", error.message)
}

/** Short preview line for the top notification strip (practice_inbox_messages). */
export async function addInboxStripMessage(opts: {
  practiceId: string
  channel: string
  fromLabel: string
  preview: string
  patientId?: string | null
}): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from("practice_inbox_messages").insert({
    practice_id: opts.practiceId,
    channel: opts.channel,
    from_label: opts.fromLabel,
    preview: opts.preview.slice(0, 500),
    read_flag: false,
    patient_id: opts.patientId ?? null,
    message_at: new Date().toISOString(),
  })
  if (error) console.error("[addInboxStripMessage]", error.message)
}
