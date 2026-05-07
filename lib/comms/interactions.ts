import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/app/types/database.types"

export async function logCommunicationInteraction(opts: {
  practiceId: string
  patientId?: string | null
  appointmentId?: string | null
  threadId?: string | null
  voiceCallId?: string | null
  portalSessionId?: string | null
  channel: "whatsapp" | "voice" | "sms" | "rcs" | "portal"
  eventType: string
  provider?: string | null
  providerEventId?: string | null
  payload?: Json | Record<string, unknown>
}): Promise<void> {
  try {
    await createAdminClient().from("communication_interactions").insert({
      practice_id: opts.practiceId,
      patient_id: opts.patientId ?? null,
      appointment_id: opts.appointmentId ?? null,
      thread_id: opts.threadId ?? null,
      voice_call_id: opts.voiceCallId ?? null,
      portal_session_id: opts.portalSessionId ?? null,
      channel: opts.channel,
      event_type: opts.eventType,
      provider: opts.provider ?? null,
      provider_event_id: opts.providerEventId ?? null,
      payload: (opts.payload ?? {}) as Json,
    })
  } catch (err) {
    console.warn("[communication_interactions] insert failed:", err)
  }
}
