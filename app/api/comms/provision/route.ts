import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  searchAvailableNumbers,
  purchaseNumber,
  syncPurchasedNumberWebhooks,
  commsWebhookUrls,
  listOwnedIncomingNumbers,
  resolveIncomingPhoneNumberSid,
  getTwilioClient,
} from "@/lib/comms/twilio"
import { getPracticeName } from "@/lib/comms/tools"
import {
  seedPracticeHoursAndFaqsIfEmpty,
  ensureVoiceChannelForNumber,
} from "@/lib/comms/provision-practice-defaults"
import { updateVapiPhoneNumberTwilioCredentials } from "@/lib/comms/vapi"

export async function POST(req: NextRequest) {
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
      .select("practice_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Requires owner or admin role" }, { status: 403 })
    }

    const practiceId = membership.practice_id
    const body = await req.json()
    const {
      action,
      phoneNumber,
      areaCode,
      countryCode,
      incomingPhoneNumberSid,
      practiceDisplayName,
      notes,
    } = body as {
      action:
        | "search"
        | "provision"
        | "sync_webhooks"
        | "sync_vapi_twilio"
        | "list_owned_numbers"
        | "attach_existing"
        | "request_number"
      phoneNumber?: string
      areaCode?: string
      countryCode?: string
      incomingPhoneNumberSid?: string
      practiceDisplayName?: string
      notes?: string
    }

    if (action === "sync_webhooks") {
      const db = createAdminClient()
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin
      const urls = commsWebhookUrls(webhookBase)

      const { data: wa } = await db
        .from("practice_channels")
        .select("phone_number_sid, phone_number")
        .eq("practice_id", practiceId)
        .eq("channel_type", "rcs")
        .maybeSingle()

      const sid = wa?.phone_number_sid as string | undefined
      if (!sid) {
        return NextResponse.json(
          { error: "No messaging (RCS/SMS) channel or missing Twilio number SID. Provision a number first." },
          { status: 400 }
        )
      }

      const twilioResult = await syncPurchasedNumberWebhooks(sid, webhookBase)

      await db
        .from("practice_channels")
        .update({
          webhook_url: urls.messagingInbound,
          updated_at: new Date().toISOString(),
        })
        .eq("practice_id", practiceId)
        .eq("channel_type", "rcs")

      return NextResponse.json({
        ok: true,
        twilio: twilioResult,
        urls,
        message: "Twilio number webhooks updated for SMS and RCS (where supported by the carrier).",
      })
    }

    if (action === "sync_vapi_twilio") {
      const db = createAdminClient()
      const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
      const token = process.env.TWILIO_AUTH_TOKEN?.trim()
      if (!sid || !token) {
        return NextResponse.json(
          { error: "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN on the server (same Twilio account that owns the number)." },
          { status: 400 }
        )
      }

      const { data: voice } = await db
        .from("practice_channels")
        .select("vapi_phone_number_id")
        .eq("practice_id", practiceId)
        .eq("channel_type", "voice")
        .maybeSingle()

      const phoneNumberId = voice?.vapi_phone_number_id as string | undefined
      if (!phoneNumberId) {
        return NextResponse.json(
          { error: "No Vapi phone number ID on this practice. Finish voice provisioning first." },
          { status: 400 }
        )
      }

      try {
        await updateVapiPhoneNumberTwilioCredentials({
          phoneNumberId,
          twilioAccountSid: sid,
          twilioAuthToken: token,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[provision] sync_vapi_twilio failed:", msg)
        return NextResponse.json(
          { error: `Vapi could not update this number: ${msg}` },
          { status: 502 }
        )
      }

      return NextResponse.json({
        ok: true,
        message:
          "Twilio credentials on this Vapi phone number were refreshed from server env. Try your outbound test call again.",
      })
    }

    if (action === "search") {
      // Resolve country: explicit param > practice's stored country > default ZA
      let cc = countryCode?.toUpperCase()
      if (!cc) {
        const db = createAdminClient()
        const { data: practice } = await db
          .from("practices")
          .select("country_code")
          .eq("id", practiceId)
          .maybeSingle()
        cc = (practice?.country_code as string) || "ZA"
      }
      const numbers = await searchAvailableNumbers(cc, { areaCode, limit: 10 })
      return NextResponse.json({ numbers, countryCode: cc })
    }

    if (action === "list_owned_numbers") {
      const numbers = await listOwnedIncomingNumbers({ limit: 80 })
      return NextResponse.json({ numbers })
    }

    if (action === "attach_existing") {
      const db = createAdminClient()
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin
      const practiceName = await getPracticeName(practiceId)

      let sid = incomingPhoneNumberSid?.trim()
      let e164 = phoneNumber?.replace(/\s/g, "").trim()

      if (!sid && !e164) {
        return NextResponse.json(
          { error: "Provide incomingPhoneNumberSid or phoneNumber (E.164) for a number in this Twilio account." },
          { status: 400 }
        )
      }

      if (!sid && e164) {
        const resolved = await resolveIncomingPhoneNumberSid(e164)
        if (!resolved) {
          return NextResponse.json(
            {
              error:
                "That number was not found in your Twilio account. Buy or port it into this Twilio project first, then try again.",
            },
            { status: 404 }
          )
        }
        sid = resolved
      }

      const client = getTwilioClient()
      const incoming = await client.incomingPhoneNumbers(sid!).fetch()
      e164 = incoming.phoneNumber

      await syncPurchasedNumberWebhooks(sid!, webhookBase)

      const displayName = practiceDisplayName?.trim() || practiceName || "Medical Practice"

      await db.from("practice_channels").upsert(
        {
          practice_id: practiceId,
          channel_type: "rcs",
          provider: "twilio",
          phone_number: e164,
          phone_number_sid: sid,
          whatsapp_sender_sid: null,
          whatsapp_waba_id: null,
          status: "active",
          sender_display_name: displayName,
          webhook_url: `${webhookBase}/api/comms/messaging/webhook`,
        },
        { onConflict: "practice_id,channel_type" }
      )

      await seedPracticeHoursAndFaqsIfEmpty(db, practiceId)
      const voice = await ensureVoiceChannelForNumber({
        db,
        practiceId,
        practiceName,
        phoneNumber: e164,
        phoneNumberSid: sid!,
        webhookBase,
      })

      return NextResponse.json({
        ok: true,
        phoneNumber: e164,
        incomingPhoneNumberSid: sid,
        voiceStatus: voice.voiceStatus,
        message:
          "Number linked. Inbound SMS and RCS (carrier-dependent) route to your Inbox; voice uses the same line when Vapi is configured.",
      })
    }

    if (action === "provision") {
      if (!phoneNumber) return NextResponse.json({ error: "phoneNumber required" }, { status: 400 })

      const db = createAdminClient()
      const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin
      const practiceName = await getPracticeName(practiceId)

      const purchased = await purchaseNumber(phoneNumber, webhookBase)
      await syncPurchasedNumberWebhooks(purchased.sid, webhookBase)

      const displayName = practiceDisplayName?.trim() || practiceName || "Medical Practice"

      await db.from("practice_channels").upsert(
        {
          practice_id: practiceId,
          channel_type: "rcs",
          provider: "twilio",
          phone_number: purchased.phoneNumber,
          phone_number_sid: purchased.sid,
          whatsapp_sender_sid: null,
          whatsapp_waba_id: null,
          status: "active",
          sender_display_name: displayName,
          webhook_url: `${webhookBase}/api/comms/messaging/webhook`,
        },
        { onConflict: "practice_id,channel_type" }
      )

      await seedPracticeHoursAndFaqsIfEmpty(db, practiceId)
      const voice = await ensureVoiceChannelForNumber({
        db,
        practiceId,
        practiceName,
        phoneNumber: purchased.phoneNumber,
        phoneNumberSid: purchased.sid,
        webhookBase,
      })

      return NextResponse.json({
        ok: true,
        phoneNumber: purchased.phoneNumber,
        voiceStatus: voice.voiceStatus,
        message:
          "Number provisioned. Patient SMS/RCS and reminders use this line; inbound calls use Vapi when VAPI_DEFAULT_ASSISTANT_ID is set.",
      })
    }

    if (action === "request_number") {
      const db = createAdminClient()
      let cc = countryCode?.toUpperCase()
      if (!cc) {
        const { data: practice } = await db
          .from("practices")
          .select("country_code")
          .eq("id", practiceId)
          .maybeSingle()
        cc = (practice?.country_code as string) || "ZA"
      }

      const { data: existing } = await db
        .from("number_requests")
        .select("id")
        .eq("practice_id", practiceId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({
          ok: true,
          alreadyRequested: true,
          message: "You already have a pending number request. We'll notify you when it's fulfilled.",
        })
      }

      await db.from("number_requests").insert({
        practice_id: practiceId,
        country_code: cc,
        notes: notes || null,
      })

      return NextResponse.json({
        ok: true,
        countryCode: cc,
        message: `Number request for ${cc} submitted. We'll assign a number to your practice soon.`,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("[provision] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
