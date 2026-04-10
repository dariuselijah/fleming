import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { whatsAppEmbeddedSignupProvisioningEnabled } from "@/lib/comms/twilio"

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
      "**Greenfield (recommended):** Admin → Channels → “New number” searches Twilio inventory, purchases a number, and points webhooks here automatically.",
      "**Existing number:** Use “Link existing number” only if that E.164 is already an **Incoming Phone Number in the same Twilio account** as TWILIO_ACCOUNT_SID (bought earlier or ported into this project). We cannot attach numbers from another Twilio account from this screen.",
      whatsAppEmbeddedSignupProvisioningEnabled()
        ? "**Embedded Signup:** With TWILIO_WHATSAPP_USE_EMBEDDED_SIGNUP=true, the practice admin uses **Connect with Meta** on Channels after the number exists; Fleming then calls the Senders API with the WABA id. Requires Meta app + Twilio Tech Provider (Partner Solution ID)."
        : "After linking any number, complete **WhatsApp sender registration** in Twilio Console (Messaging → WhatsApp senders) or enable Embedded Signup (see TWILIO_WHATSAPP_USE_EMBEDDED_SIGNUP in .env.example). Then use **Sync webhooks** if inbound messages do not hit the app.",
      "TWILIO_WEBHOOK_BASE_URL must be your public HTTPS origin (no path), identical to what Twilio calls — otherwise signature validation fails.",
      "Set status callback to **whatsappStatus** if you configure manually — delivery updates thread_messages in the inbox.",
      "Outbound campaigns and reminders outside the 24h session usually need **approved WhatsApp templates** in Meta/Twilio.",
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
      embeddedWhatsAppSignup: {
        provisioningEnabled: whatsAppEmbeddedSignupProvisioningEnabled(),
        facebookSdkConfigured: Boolean(
          process.env.NEXT_PUBLIC_META_APP_ID &&
            process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID &&
            process.env.NEXT_PUBLIC_TWILIO_PARTNER_SOLUTION_ID
        ),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
