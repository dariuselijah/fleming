/**
 * Cron endpoint for retrying failed webhook deliveries (dead-letter queue).
 * Schedule: every 5 minutes — see vercel.json crons.
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendWhatsAppMessage } from "@/lib/comms/twilio"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const MAX_RETRIES = 5
const BACKOFF_BASE_MS = 60_000 // 1 min, doubles each retry

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const db = createAdminClient()
    const now = new Date().toISOString()
    const stats = { processed: 0, succeeded: 0, failed: 0, exhausted: 0 }

    const { data: events } = await db
      .from("webhook_events")
      .select("*")
      .in("status", ["pending", "processing"])
      .lte("next_retry_at", now)
      .lt("retry_count", MAX_RETRIES)
      .order("next_retry_at")
      .limit(50)

    if (!events || events.length === 0) {
      return NextResponse.json({ ok: true, message: "No pending retries", stats })
    }

    for (const event of events) {
      stats.processed++

      await db
        .from("webhook_events")
        .update({ status: "processing" })
        .eq("id", event.id)

      try {
        const payload = event.payload as Record<string, unknown>

        if (event.event_type === "send_failed" && event.source === "twilio_whatsapp") {
          await sendWhatsAppMessage({
            to: payload.to as string,
            from: payload.from as string || "",
            body: payload.text as string,
          })
        }

        await db
          .from("webhook_events")
          .update({ status: "completed" })
          .eq("id", event.id)

        stats.succeeded++
      } catch (err) {
        const nextRetry = event.retry_count + 1
        const isExhausted = nextRetry >= MAX_RETRIES

        await db
          .from("webhook_events")
          .update({
            status: isExhausted ? "failed" : "pending",
            retry_count: nextRetry,
            error_message: (err as Error).message,
            next_retry_at: isExhausted
              ? null
              : new Date(Date.now() + BACKOFF_BASE_MS * Math.pow(2, nextRetry)).toISOString(),
          })
          .eq("id", event.id)

        if (isExhausted) stats.exhausted++
        else stats.failed++
      }
    }

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[webhook-retry] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
