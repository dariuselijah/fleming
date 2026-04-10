/**
 * Cron endpoint for cleaning up expired WhatsApp sessions and stale threads.
 *
 * WhatsApp Business API has a 24-hour session window. After 24h of inactivity,
 * you can only send pre-approved template messages (not free-form).
 * This cron resets expired threads so the agent knows to use templates.
 *
 * Vercel cron config:
 *   { "crons": [{ "path": "/api/cron/session-cleanup", "schedule": "0 * * * *" }] }
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 30
export const dynamic = "force-dynamic"

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
    const stats = { expiredSessions: 0, staleThreadsClosed: 0 }

    // Reset flow state on threads with expired sessions
    const { data: expired } = await db
      .from("conversation_threads")
      .update({
        current_flow: "none",
        flow_state: {},
        updated_at: now,
      })
      .lt("session_expires_at", now)
      .neq("current_flow", "none")
      .select("id")

    stats.expiredSessions = expired?.length || 0

    // Close threads that have been inactive for 7+ days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: stale } = await db
      .from("conversation_threads")
      .update({
        status: "closed",
        current_flow: "none",
        flow_state: {},
        updated_at: now,
      })
      .lt("last_message_at", sevenDaysAgo)
      .in("status", ["active", "awaiting_input"])
      .select("id")

    stats.staleThreadsClosed = stale?.length || 0

    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error("[session-cleanup] Fatal:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
