/**
 * Cron: poll Twilio Senders API for channels in `registering_sender` state.
 * When a sender transitions to ONLINE, mark the practice channel as `active`.
 *
 * Schedule: every 2 minutes via vercel.json
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getWhatsAppSenderStatus } from "@/lib/comms/twilio"

export const maxDuration = 30
export const dynamic = "force-dynamic"

const STALE_MINUTES = 30

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
    const now = new Date()

    const { data: channels } = await db
      .from("practice_channels")
      .select("id, practice_id, whatsapp_sender_sid, created_at")
      .eq("status", "registering_sender")
      .not("whatsapp_sender_sid", "is", null)

    if (!channels?.length) {
      return NextResponse.json({ ok: true, polled: 0 })
    }

    const results: {
      channelId: string
      practiceId: string
      senderStatus: string
      action: string
    }[] = []

    for (const ch of channels) {
      try {
        const sender = await getWhatsAppSenderStatus(ch.whatsapp_sender_sid!)

        if (sender.status === "ONLINE") {
          await db
            .from("practice_channels")
            .update({
              status: "active",
              sender_registered_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", ch.id)

          results.push({
            channelId: ch.id,
            practiceId: ch.practice_id,
            senderStatus: sender.status,
            action: "activated",
          })
        } else {
          const createdAt = new Date(ch.created_at)
          const minutesWaiting = (now.getTime() - createdAt.getTime()) / 60_000

          if (minutesWaiting > STALE_MINUTES) {
            console.warn(
              `[sender-status] Channel ${ch.id} has been registering_sender for ${Math.round(minutesWaiting)}min (sender: ${sender.status})`
            )
          }

          results.push({
            channelId: ch.id,
            practiceId: ch.practice_id,
            senderStatus: sender.status,
            action: "still_waiting",
          })
        }
      } catch (err) {
        console.error(`[sender-status] Error polling channel ${ch.id}:`, err)
        results.push({
          channelId: ch.id,
          practiceId: ch.practice_id,
          senderStatus: "error",
          action: (err as Error).message,
        })
      }
    }

    return NextResponse.json({ ok: true, polled: channels.length, results })
  } catch (err) {
    console.error("[sender-status] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
