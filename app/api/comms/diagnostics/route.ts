import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getTwilioClient } from "@/lib/comms/twilio"

/**
 * Inbox “connection checks”: env presence + optional live Twilio API probe.
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

    const probe = req.nextUrl.searchParams.get("probe") === "1"
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
    const token = process.env.TWILIO_AUTH_TOKEN?.trim()
    const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL?.trim()

    const env = {
      twilioAccountSid: Boolean(sid),
      twilioAuthToken: Boolean(token),
      twilioWebhookBaseUrl: Boolean(webhookBase),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    }

    let twilioApiOk: boolean | null = null
    let twilioApiError: string | undefined

    if (probe && sid && token) {
      try {
        const client = getTwilioClient()
        await client.api.accounts(sid).fetch()
        twilioApiOk = true
      } catch (e) {
        twilioApiOk = false
        twilioApiError = (e as Error).message
      }
    }

    const rawBase = webhookBase || req.nextUrl.origin
    const baseUrl = rawBase.replace(/\/$/, "")

    return NextResponse.json({
      env,
      twilioApiOk,
      twilioApiError,
      urls: {
        messagingInbound: `${baseUrl}/api/comms/messaging/webhook`,
        messagingStatus: `${baseUrl}/api/comms/messaging/status`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
