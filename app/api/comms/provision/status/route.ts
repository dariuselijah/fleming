import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/** Legacy WhatsApp-era statuses; SMS/RCS is live once Twilio SID exists — normalize to active. */
const STALE_RCS_STATUSES = ["registering_sender", "pending_waba", "pending_wa_approval"] as const

export async function GET() {
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

    const practiceId = membership.practice_id
    const db = createAdminClient()

    const { data: rawChannels } = await db
      .from("practice_channels")
      .select(
        "id, channel_type, provider, phone_number, phone_number_sid, status, created_at, updated_at, vapi_assistant_id, vapi_phone_number_id, webhook_url, sender_display_name"
      )
      .eq("practice_id", practiceId)

    for (const ch of rawChannels || []) {
      if (
        ch.channel_type === "rcs" &&
        ch.phone_number_sid &&
        STALE_RCS_STATUSES.includes(ch.status as (typeof STALE_RCS_STATUSES)[number])
      ) {
        await db
          .from("practice_channels")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", ch.id)
      }
    }

    const { data: channels } = await db
      .from("practice_channels")
      .select(
        "channel_type, provider, phone_number, phone_number_sid, status, created_at, updated_at, vapi_assistant_id, vapi_phone_number_id, webhook_url, sender_display_name"
      )
      .eq("practice_id", practiceId)

    // Voice channel creation runs from explicit provision flows (POST /api/comms/provision), not from status polling.
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

    return NextResponse.json({
      channels: channels || [],
      hours: hours || [],
      faqs: faqs || [],
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
