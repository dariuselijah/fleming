import { createAdminClient } from "@/lib/supabase/admin"
import {
  getTwilioClient,
  sendSmsMessage,
  normalizeMessagingE164,
  getTwilioMessagingServiceSid,
} from "./twilio"

export function interpolateTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    return variables[idx] || variables[`${idx}`] || `{{${idx}}}`
  })
}

export async function getTemplatesForPractice(practiceId: string) {
  const { data } = await createAdminClient()
    .from("message_templates")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("status", "approved")

  return data || []
}

// Pre-defined template bodies (registered during provisioning)
export const BUILTIN_TEMPLATES = {
  appointment_reminder_24h: {
    name: "appointment_reminder_24h",
    category: "utility" as const,
    body: "Reminder: You have an appointment tomorrow at {{1}} with {{2}} at {{3}}. Reply CONFIRM to keep your slot or RESCHEDULE to change.",
    variables: ["time", "doctor_name", "practice_name"],
  },
  appointment_reminder_1h: {
    name: "appointment_reminder_1h",
    category: "utility" as const,
    body: "Your appointment is in 1 hour at {{1}}. See you soon!",
    variables: ["practice_name"],
  },
  appointment_confirmation: {
    name: "appointment_confirmation",
    category: "utility" as const,
    body: "Confirmed: {{1}} on {{2}} at {{3}} with {{4}}. Reply CANCEL if you need to change.",
    variables: ["service", "date", "time", "doctor_name"],
  },
  welcome_onboarding: {
    name: "welcome_onboarding",
    category: "utility" as const,
    body: "Hi {{1}}, welcome to {{2}}! Reply START to complete your registration and upload your medical aid card.",
    variables: ["patient_name", "practice_name"],
  },
  payment_reminder: {
    name: "payment_reminder",
    category: "utility" as const,
    body: "Hi {{1}}, you have an outstanding balance of R{{2}} from your visit on {{3}}. Reply PAY for payment options.",
    variables: ["patient_name", "amount", "visit_date"],
  },
  post_visit_followup: {
    name: "post_visit_followup",
    category: "utility" as const,
    body: "Hi {{1}}, how are you feeling after your visit to {{2}}? Reply here if you have any concerns.",
    variables: ["patient_name", "practice_name"],
  },
  lab_results_ready: {
    name: "lab_results_ready",
    category: "utility" as const,
    body: "Hi {{1}}, your lab results are ready at {{2}}. Please call us or reply here to discuss with your doctor.",
    variables: ["patient_name", "practice_name"],
  },
  invoice_issued: {
    name: "invoice_issued",
    category: "utility" as const,
    body: "Your invoice: R{{1}} from {{2}}. Pay securely: {{3}}",
    variables: ["amount", "practice_name", "pay_link"],
  },
  payment_received: {
    name: "payment_received",
    category: "utility" as const,
    body: "Payment of R{{1}} received. Receipt: {{2}}",
    variables: ["amount", "receipt_link"],
  },
  payment_failed: {
    name: "payment_failed",
    category: "utility" as const,
    body: "We could not process your payment. Try again: {{1}}",
    variables: ["pay_link"],
  },
} as const

/**
 * Resolve Twilio Content Template SID: env JSON map first, then approved `message_templates` row
 * (`provider_template_id` for SMS/RCS).
 * Env: `TWILIO_WHATSAPP_CONTENT_SIDS_JSON={"appointment_reminder_24h":"HXxxxx",...}` (legacy key name)
 */
export async function resolveContentSidForTemplate(
  practiceId: string,
  templateKey: string
): Promise<string | null> {
  const raw = process.env.TWILIO_WHATSAPP_CONTENT_SIDS_JSON?.trim()
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>
      const sid = map[templateKey]?.trim()
      if (sid) return sid
    } catch {
      /* ignore invalid JSON */
    }
  }

  const { data } = await createAdminClient()
    .from("message_templates")
    .select("provider_template_id")
    .eq("practice_id", practiceId)
    .eq("template_key", templateKey)
    .eq("status", "approved")
    .not("provider_template_id", "is", null)
    .limit(1)
    .maybeSingle()

  const sid = data?.provider_template_id?.trim()
  return sid || null
}

/**
 * When `true`, skip Twilio Content (`contentSid`) and send interpolated text as plain SMS only.
 * Default is `false`: use Content template SIDs when configured (RCS where supported + SMS fallback).
 */
function forcePlainSmsForTemplates(): boolean {
  return process.env.TWILIO_PREFER_PLAIN_SMS_FOR_TEMPLATES === "true"
}

export async function sendTemplateMessage(opts: {
  practiceId: string
  from: string
  to: string
  templateKey: keyof typeof BUILTIN_TEMPLATES
  variables: Record<string, string>
}): Promise<string> {
  const tmpl = BUILTIN_TEMPLATES[opts.templateKey]
  const body = interpolateTemplate(tmpl.body, opts.variables)

  const to = normalizeMessagingE164(opts.to)
  const from = normalizeMessagingE164(opts.from)

  const contentSid = forcePlainSmsForTemplates()
    ? null
    : await resolveContentSidForTemplate(opts.practiceId, tmpl.name)

  if (contentSid) {
    const client = getTwilioClient()
    const ms = getTwilioMessagingServiceSid()
    const msg = await client.messages.create({
      to,
      ...(ms ? { messagingServiceSid: ms } : { from }),
      contentSid,
      ...(Object.keys(opts.variables).length > 0
        ? { contentVariables: JSON.stringify(opts.variables) }
        : {}),
    })
    return msg.sid
  }

  const { messageSid } = await sendSmsMessage({ to, from, body })
  return messageSid
}
