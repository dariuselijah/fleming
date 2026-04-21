/**
 * Channel-agnostic patient messaging: SMS (RCS-capable on supported devices via carrier).
 */
import { BUILTIN_TEMPLATES, interpolateTemplate } from "./templates"
import { sendSmsMessage } from "./twilio"
import {
  getPracticeMessagingNumber,
  getOrCreateThread,
  appendMessage,
} from "./threads"
import { logCommunicationInteraction } from "./interactions"
import { createPatientAccessToken } from "@/lib/portal/tokens"
import type { VoiceCallOutcome } from "./voice-outcome"

export type TemplateKey = keyof typeof BUILTIN_TEMPLATES

export async function sendPatientTemplatedMessage(opts: {
  practiceId: string
  toE164: string
  templateKey: TemplateKey
  variables: Record<string, string>
  patientId?: string | null
  appointmentId?: string | null
  /** Append portal magic link line (intake / appointment flows) */
  portalLink?: {
    patientId: string
    purpose: "intake" | "appointment" | "check_in" | "general"
    appointmentId?: string | null
  }
}): Promise<{ messageSid: string; threadId: string }> {
  const from = await getPracticeMessagingNumber(opts.practiceId)
  if (!from) {
    throw new Error("No messaging number configured for this practice (RCS/SMS channel)")
  }

  const tmpl = BUILTIN_TEMPLATES[opts.templateKey]
  let body = interpolateTemplate(tmpl.body, opts.variables)

  if (opts.portalLink) {
    const purposeMap = {
      intake: "intake" as const,
      check_in: "check_in" as const,
      general: "general" as const,
      appointment: "appointment" as const,
    }
    const { portalUrl } = await createPatientAccessToken({
      practiceId: opts.practiceId,
      patientId: opts.portalLink.patientId,
      purpose: purposeMap[opts.portalLink.purpose],
      appointmentId: opts.portalLink.appointmentId ?? null,
    })
    body += `\n\nPortal: ${portalUrl}`
  }

  const thread = await getOrCreateThread(opts.practiceId, "rcs", opts.toE164.replace(/^whatsapp:/, ""))
  if (opts.patientId && !thread.patientId) {
    const { updateThreadStatus } = await import("./threads")
    await updateThreadStatus(thread.id, { patientId: opts.patientId })
  }

  const { messageSid } = await sendSmsMessage({
    from,
    to: opts.toE164.replace(/^whatsapp:/, ""),
    body,
  })

  await appendMessage({
    threadId: thread.id,
    practiceId: opts.practiceId,
    direction: "outbound",
    senderType: "system",
    contentType: opts.templateKey.includes("reminder") ? "template" : "text",
    body,
    templateName: tmpl.name,
    providerMessageId: messageSid,
    deliveryStatus: "sent",
  })

  await logCommunicationInteraction({
    practiceId: opts.practiceId,
    patientId: opts.patientId ?? null,
    appointmentId: opts.appointmentId ?? null,
    threadId: thread.id,
    channel: "rcs",
    eventType: "template_sent",
    provider: "twilio",
    providerEventId: messageSid,
    payload: { templateKey: opts.templateKey, body },
  })

  return { messageSid, threadId: thread.id }
}

/** Incomplete profile: follow-up SMS with portal link (voice interaction is logged in webhook). */
export async function dispatchPostVoiceFollowUp(opts: {
  practiceId: string
  customerE164: string
  patientId: string | null
  profileIncomplete: boolean
  patientDisplayName?: string
  outcome: VoiceCallOutcome
}): Promise<boolean> {
  if (!opts.profileIncomplete || !opts.patientId) return false

  if (
    opts.outcome.recommendedNextAction === "send_onboarding" ||
    opts.outcome.intent === "registration" ||
    opts.outcome.intent === "general"
  ) {
    const nameHint = opts.patientDisplayName?.trim() || "there"
    const { getPracticeName } = await import("./tools")
    const practiceName = await getPracticeName(opts.practiceId)
    try {
      const { threadId } = await sendPatientTemplatedMessage({
        practiceId: opts.practiceId,
        toE164: opts.customerE164,
        templateKey: "welcome_onboarding",
        variables: { "1": nameHint, "2": practiceName },
        patientId: opts.patientId,
        portalLink: { patientId: opts.patientId, purpose: "intake" },
      })
      const { updateThreadFlow } = await import("./threads")
      await updateThreadFlow(threadId, "onboarding", { step: "collect_name", collected: {} })
      return true
    } catch (err) {
      console.error("[dispatchPostVoiceFollowUp]", err)
      return false
    }
  }
  return false
}
