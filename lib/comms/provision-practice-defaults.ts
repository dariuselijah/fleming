import { createAdminClient } from "@/lib/supabase/admin"
import { cloneAssistant, importTwilioNumber } from "@/lib/comms/vapi"

type AdminDb = ReturnType<typeof createAdminClient>

/** Seed hours + starter FAQs when a practice has no comms defaults yet. */
export async function seedPracticeHoursAndFaqsIfEmpty(
  db: AdminDb,
  practiceId: string
): Promise<{ hoursSeeded: boolean; faqsSeeded: boolean }> {
  const { count: hourCount } = await db
    .from("practice_hours")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)

  let hoursSeeded = false
  if (!hourCount || hourCount === 0) {
    const defaultHours = [1, 2, 3, 4, 5].map((day) => ({
      practice_id: practiceId,
      day_of_week: day,
      open_time: "08:00",
      close_time: "17:00",
      is_closed: false,
    }))
    defaultHours.push(
      { practice_id: practiceId, day_of_week: 6, open_time: "08:00", close_time: "12:00", is_closed: false },
      { practice_id: practiceId, day_of_week: 0, open_time: "08:00", close_time: "12:00", is_closed: true },
    )
    await db.from("practice_hours").upsert(defaultHours, { onConflict: "practice_id,day_of_week" })
    hoursSeeded = true
  }

  const { count: faqCount } = await db
    .from("practice_faqs")
    .select("id", { count: "exact", head: true })
    .eq("practice_id", practiceId)

  let faqsSeeded = false
  if (!faqCount || faqCount === 0) {
    await db.from("practice_faqs").insert([
      {
        practice_id: practiceId,
        category: "hours",
        question: "What are your hours?",
        answer: `We are open Monday to Friday 08:00-17:00 and Saturday 08:00-12:00.`,
        keywords: ["hours", "open", "close", "time"],
        sort_order: 0,
      },
      {
        practice_id: practiceId,
        category: "directions",
        question: "Where are you located?",
        answer: "Please contact us for our exact address and directions.",
        keywords: ["location", "address", "where", "directions", "find"],
        sort_order: 1,
      },
      {
        practice_id: practiceId,
        category: "fees",
        question: "How much does a consultation cost?",
        answer: "Our consultation fees vary by service. Please ask about a specific service for pricing.",
        keywords: ["cost", "price", "fee", "charge", "how much"],
        sort_order: 2,
      },
    ])
    faqsSeeded = true
  }

  return { hoursSeeded, faqsSeeded }
}

/** Clone Vapi assistant + upsert voice channel when env is configured. */
export async function ensureVoiceChannelForNumber(opts: {
  db: AdminDb
  practiceId: string
  practiceName: string
  phoneNumber: string
  phoneNumberSid: string
  webhookBase: string
}): Promise<{ vapiAssistantId?: string; voiceStatus: "active" | "not_configured" }> {
  const defaultAssistant = process.env.VAPI_DEFAULT_ASSISTANT_ID
  let vapiAssistantId: string | undefined
  let vapiPhoneNumberId: string | undefined

  if (!defaultAssistant) return { voiceStatus: "not_configured" }

  const voiceServerUrl = `${opts.webhookBase}/api/comms/voice/webhook`

  try {
    const cloned = await cloneAssistant({
      sourceAssistantId: defaultAssistant,
      name: `${opts.practiceName} Assistant`,
      serverUrl: voiceServerUrl,
      firstMessage: `Thank you for calling ${opts.practiceName}. How can I help you today?`,
    })
    vapiAssistantId = cloned.id
  } catch (err) {
    console.error("[provision] Vapi clone failed:", err)
    return { voiceStatus: "not_configured" }
  }

  // Auto-import the Twilio number into Vapi (smsEnabled=false to preserve WhatsApp webhooks)
  try {
    const imported = await importTwilioNumber({
      phoneNumber: opts.phoneNumber,
      name: `${opts.practiceName} Line`,
      assistantId: vapiAssistantId,
      serverUrl: voiceServerUrl,
    })
    vapiPhoneNumberId = imported.id
  } catch (err) {
    console.error("[provision] Vapi Twilio import failed, falling back to env:", err)
    vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || undefined
  }

  await opts.db.from("practice_channels").upsert(
    {
      practice_id: opts.practiceId,
      channel_type: "voice",
      provider: "vapi",
      phone_number: opts.phoneNumber,
      phone_number_sid: opts.phoneNumberSid,
      vapi_assistant_id: vapiAssistantId,
      vapi_phone_number_id: vapiPhoneNumberId,
      status: "active",
      webhook_url: voiceServerUrl,
    },
    { onConflict: "practice_id,channel_type" }
  )
  return { vapiAssistantId, voiceStatus: "active" }
}
