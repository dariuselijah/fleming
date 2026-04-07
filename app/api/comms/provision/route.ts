import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  searchAvailableNumbers,
  purchaseNumber,
  syncPurchasedNumberWebhooks,
  commsWebhookUrls,
} from "@/lib/comms/twilio"
import { cloneAssistant } from "@/lib/comms/vapi"
import { getPracticeName } from "@/lib/comms/tools"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Requires owner or admin role" }, { status: 403 })
    }

    const practiceId = membership.practice_id
    const body = await req.json()
    const { action, phoneNumber, areaCode } = body as {
      action: "search" | "provision" | "sync_webhooks"
      phoneNumber?: string
      areaCode?: string
    }

    if (action === "sync_webhooks") {
      const db = createAdminClient()
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin
      const urls = commsWebhookUrls(webhookBase)

      const { data: wa } = await db
        .from("practice_channels")
        .select("phone_number_sid, phone_number")
        .eq("practice_id", practiceId)
        .eq("channel_type", "whatsapp")
        .maybeSingle()

      const sid = wa?.phone_number_sid as string | undefined
      if (!sid) {
        return NextResponse.json(
          { error: "No WhatsApp channel or missing Twilio number SID. Provision a number first." },
          { status: 400 }
        )
      }

      const twilioResult = await syncPurchasedNumberWebhooks(sid, webhookBase)

      await db
        .from("practice_channels")
        .update({
          webhook_url: urls.whatsappInbound,
          updated_at: new Date().toISOString(),
        })
        .eq("practice_id", practiceId)
        .eq("channel_type", "whatsapp")

      return NextResponse.json({
        ok: true,
        twilio: twilioResult,
        urls,
        message:
          "Twilio number webhooks updated. WhatsApp Business still requires Meta/Twilio approval for this sender.",
      })
    }

    if (action === "search") {
      const numbers = await searchAvailableNumbers("ZA", { areaCode, limit: 10 })
      return NextResponse.json({ numbers })
    }

    if (action === "provision") {
      if (!phoneNumber) return NextResponse.json({ error: "phoneNumber required" }, { status: 400 })

      const db = createAdminClient()
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin
      const practiceName = await getPracticeName(practiceId)

      // 1. Purchase number (webhooks set on create)
      const purchased = await purchaseNumber(phoneNumber, webhookBase)
      // 2. Re-apply via REST so URLs always match current TWILIO_WEBHOOK_BASE_URL
      await syncPurchasedNumberWebhooks(purchased.sid, webhookBase)

      // 3. Create WhatsApp channel
      await db.from("practice_channels").upsert({
        practice_id: practiceId,
        channel_type: "whatsapp",
        provider: "twilio",
        phone_number: purchased.phoneNumber,
        phone_number_sid: purchased.sid,
        status: "pending_wa_approval",
        webhook_url: `${webhookBase}/api/comms/whatsapp/webhook`,
      }, { onConflict: "practice_id,channel_type" })

      // 4. Clone Vapi assistant for this practice
      let vapiAssistantId: string | undefined
      let vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID
      const defaultAssistant = process.env.VAPI_DEFAULT_ASSISTANT_ID

      if (defaultAssistant) {
        try {
          const cloned = await cloneAssistant({
            sourceAssistantId: defaultAssistant,
            name: `${practiceName} Assistant`,
            serverUrl: `${webhookBase}/api/comms/voice/webhook`,
            firstMessage: `Thank you for calling ${practiceName}. How can I help you today?`,
          })
          vapiAssistantId = cloned.id
        } catch (err) {
          console.error("[provision] Vapi clone failed:", err)
        }
      }

      // 5. Create Voice channel
      if (vapiAssistantId) {
        await db.from("practice_channels").upsert({
          practice_id: practiceId,
          channel_type: "voice",
          provider: "vapi",
          phone_number: purchased.phoneNumber,
          phone_number_sid: purchased.sid,
          vapi_assistant_id: vapiAssistantId,
          vapi_phone_number_id: vapiPhoneNumberId,
          status: "active",
          webhook_url: `${webhookBase}/api/comms/voice/webhook`,
        }, { onConflict: "practice_id,channel_type" })
      }

      // 6. Seed default practice hours (Mon-Fri 08:00-17:00)
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

      // 7. Seed starter FAQs
      await db.from("practice_faqs").insert([
        { practice_id: practiceId, category: "hours", question: "What are your hours?", answer: `We are open Monday to Friday 08:00-17:00 and Saturday 08:00-12:00.`, keywords: ["hours", "open", "close", "time"], sort_order: 0 },
        { practice_id: practiceId, category: "directions", question: "Where are you located?", answer: "Please contact us for our exact address and directions.", keywords: ["location", "address", "where", "directions", "find"], sort_order: 1 },
        { practice_id: practiceId, category: "fees", question: "How much does a consultation cost?", answer: "Our consultation fees vary by service. Please ask about a specific service for pricing.", keywords: ["cost", "price", "fee", "charge", "how much"], sort_order: 2 },
      ])

      return NextResponse.json({
        ok: true,
        phoneNumber: purchased.phoneNumber,
        whatsappStatus: "pending_wa_approval",
        voiceStatus: vapiAssistantId ? "active" : "not_configured",
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("[provision] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
