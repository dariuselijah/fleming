import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Returns exact webhook URLs to paste into Twilio (and a short console checklist).
 * Auth: any signed-in practice member.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "No practice" }, { status: 403 })
    }

    const rawBase = process.env.TWILIO_WEBHOOK_BASE_URL?.trim() || req.nextUrl.origin
    const baseUrl = rawBase.replace(/\/$/, "")

    const urls = {
      whatsappInbound: `${baseUrl}/api/comms/whatsapp/webhook`,
      whatsappStatus: `${baseUrl}/api/comms/whatsapp/status`,
      voiceInbound: `${baseUrl}/api/comms/voice/webhook`,
    }

    const twilioChecklist = [
      "When you provision a number in Admin → Channels, we set these URLs on the Twilio phone number via API. Use **Sync webhooks** in Channels if you change TWILIO_WEBHOOK_BASE_URL or fix a misconfigured number.",
      "TWILIO_WEBHOOK_BASE_URL must be your public HTTPS origin (no path), identical to what Twilio calls — otherwise inbound requests fail signature validation.",
      "WhatsApp Business: after the number is linked in Twilio / Meta, inbound WhatsApp typically uses the same SMS webhook on that number. Sandbox senders may still need the Twilio console “sandbox” webhook set once.",
      "Set status callback to **whatsappStatus** if you configure manually — delivery ticks update thread_messages in the inbox.",
      "Live traffic may require WhatsApp template approval and Meta business verification outside this app.",
    ]

    const vapiChecklist = [
      "In dashboard.vapi.ai: open the assistant cloned for this practice and set Server URL to the voiceInbound URL below (inbound call events, tools, end-of-call reports).",
      "Attach your Vapi phone number to that assistant. Set VAPI_PHONE_NUMBER_ID in server .env to that number’s ID (required for outbound API calls).",
      "Set VAPI_API_KEY, VAPI_DEFAULT_ASSISTANT_ID (template assistant to clone), and optionally VAPI_SERVER_SECRET for webhook signature verification.",
      "Outbound: POST /api/comms/voice/outbound with customer E.164 number once voice channel has vapi_assistant_id and vapi_phone_number_id.",
    ]

    return NextResponse.json({
      baseUrl,
      urls,
      twilioChecklist,
      vapiChecklist,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
