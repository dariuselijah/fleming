import { NextRequest, NextResponse } from "next/server"
import { validateTwilioSignature } from "@/lib/comms"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    const signature = req.headers.get("X-Twilio-Signature") || ""
    const url = `${process.env.TWILIO_WEBHOOK_BASE_URL || req.nextUrl.origin}/api/comms/messaging/status`
    if (process.env.TWILIO_AUTH_TOKEN && !validateTwilioSignature(url, params, signature)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const messageSid = params.MessageSid
    const status = params.MessageStatus
    const errorCode = params.ErrorCode

    if (!messageSid || !status) {
      return NextResponse.json({ ok: true })
    }

    const statusMap: Record<string, string> = {
      queued: "queued",
      sent: "sent",
      delivered: "delivered",
      read: "read",
      failed: "failed",
      undelivered: "undelivered",
    }

    const deliveryStatus = statusMap[status] || status
    const db = createAdminClient()

    const update: Record<string, unknown> = { delivery_status: deliveryStatus }
    if (errorCode) update.failure_reason = `Error ${errorCode}: ${params.ErrorMessage || ""}`

    await db.from("thread_messages").update(update).eq("provider_message_id", messageSid)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[messaging-status] Error:", err)
    return NextResponse.json({ ok: true })
  }
}
