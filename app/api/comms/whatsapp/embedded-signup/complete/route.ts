import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  registerWhatsAppSender,
  TWILIO_WHATSAPP_VERTICAL_MEDICAL,
  whatsAppEmbeddedSignupProvisioningEnabled,
} from "@/lib/comms/twilio"
import { getPracticeName } from "@/lib/comms/tools"

/**
 * After Meta Embedded Signup returns `waba_id`, register the Twilio sender with
 * `configuration.waba_id` (Twilio Tech Provider flow).
 */
export async function POST(req: NextRequest) {
  try {
    if (!whatsAppEmbeddedSignupProvisioningEnabled()) {
      return NextResponse.json(
        { error: "Embedded Signup completion is disabled (set TWILIO_WHATSAPP_USE_EMBEDDED_SIGNUP=true)." },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
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

    const body = await req.json()
    const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : ""
    if (!wabaId || !/^\d+$/.test(wabaId)) {
      return NextResponse.json({ error: "wabaId must be a numeric Meta WABA id" }, { status: 400 })
    }

    const db = createAdminClient()
    const { data: row } = await db
      .from("practice_channels")
      .select("phone_number, status, sender_display_name")
      .eq("practice_id", membership.practice_id)
      .eq("channel_type", "whatsapp")
      .maybeSingle()

    if (!row?.phone_number) {
      return NextResponse.json({ error: "No WhatsApp channel for this practice." }, { status: 400 })
    }

    if (row.status !== "pending_waba") {
      return NextResponse.json(
        {
          error:
            row.status === "registering_sender" || row.status === "active"
              ? "WhatsApp sender registration already started or complete."
              : `Channel is not waiting for Meta (status: ${row.status}).`,
        },
        { status: 400 }
      )
    }

    const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL?.trim() || req.nextUrl.origin
    const practiceName = await getPracticeName(membership.practice_id)
    const displayName = row.sender_display_name?.trim() || practiceName || "Medical Practice"

    const sender = await registerWhatsAppSender({
      phoneNumber: row.phone_number,
      profile: {
        name: displayName,
        about: "Medical practice powered by Fleming",
        vertical: TWILIO_WHATSAPP_VERTICAL_MEDICAL,
      },
      webhookBaseUrl: webhookBase,
      wabaId,
    })

    await db
      .from("practice_channels")
      .update({
        whatsapp_sender_sid: sender.sid,
        whatsapp_waba_id: wabaId,
        status: "registering_sender",
        updated_at: new Date().toISOString(),
      })
      .eq("practice_id", membership.practice_id)
      .eq("channel_type", "whatsapp")

    return NextResponse.json({
      ok: true,
      whatsappSenderSid: sender.sid,
      whatsappSenderStatus: sender.status,
      whatsappStatus: "registering_sender",
    })
  } catch (err) {
    console.error("[embedded-signup/complete] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
