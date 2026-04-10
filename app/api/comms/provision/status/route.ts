import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { whatsAppEmbeddedSignupProvisioningEnabled } from "@/lib/comms/twilio"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ channels: [], hours: [], faqs: [], noPractice: true })
    }

    const { data: channels } = await supabase
      .from("practice_channels")
      .select(
        "channel_type, provider, phone_number, phone_number_sid, status, created_at, updated_at, vapi_assistant_id, vapi_phone_number_id, webhook_url, sender_display_name"
      )
      .eq("practice_id", membership.practice_id)

    const { data: hours } = await supabase
      .from("practice_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("practice_id", membership.practice_id)
      .order("day_of_week")

    const { data: faqs } = await supabase
      .from("practice_faqs")
      .select("id, category, question, answer, active")
      .eq("practice_id", membership.practice_id)
      .order("sort_order")

    const embeddedSignup = {
      provisioningEnabled: whatsAppEmbeddedSignupProvisioningEnabled(),
      facebookSdkConfigured: Boolean(
        process.env.NEXT_PUBLIC_META_APP_ID &&
          process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID &&
          process.env.NEXT_PUBLIC_TWILIO_PARTNER_SOLUTION_ID
      ),
    }

    return NextResponse.json({
      channels: channels || [],
      hours: hours || [],
      faqs: faqs || [],
      embeddedSignup,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
