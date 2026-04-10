import { createAdminClient } from "@/lib/supabase/admin"
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "./twilio"

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
    .from("whatsapp_templates")
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
} as const

/**
 * Resolve Twilio Content Template SID: env JSON map first, then approved `whatsapp_templates` row.
 * Env: `TWILIO_WHATSAPP_CONTENT_SIDS_JSON={"appointment_reminder_24h":"HXxxxx",...}`
 */
export async function resolveContentSidForTemplate(
  practiceId: string,
  templateName: string
): Promise<string | null> {
  const raw = process.env.TWILIO_WHATSAPP_CONTENT_SIDS_JSON?.trim()
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>
      const sid = map[templateName]?.trim()
      if (sid) return sid
    } catch {
      /* ignore invalid JSON */
    }
  }

  const { data } = await createAdminClient()
    .from("whatsapp_templates")
    .select("template_sid")
    .eq("practice_id", practiceId)
    .eq("template_name", templateName)
    .eq("status", "approved")
    .not("template_sid", "is", null)
    .limit(1)
    .maybeSingle()

  const sid = data?.template_sid?.trim()
  return sid || null
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
  const contentSid = await resolveContentSidForTemplate(opts.practiceId, tmpl.name)

  if (contentSid) {
    const { messageSid } = await sendWhatsAppTemplate({
      to: opts.to,
      from: opts.from,
      contentSid,
      contentVariables: opts.variables,
    })
    return messageSid
  }

  const { messageSid } = await sendWhatsAppMessage({
    to: opts.to,
    from: opts.from,
    body,
  })

  return messageSid
}
