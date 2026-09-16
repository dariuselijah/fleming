/**
 * Resend inbound email webhook → conversation_threads (channel: email) → Front Desk message task.
 * Address format: frontdesk+{slug}@mail.fleming.app
 */
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  appendMessage,
  getOrCreateThread,
  getFAQs,
  getPracticeHours,
  getPracticeName,
  getServices,
  isCurrentlyOpen,
  runCommsAgent,
  updateThreadStatus,
} from "@/lib/comms"
import { getThreadMessages } from "@/lib/comms/threads"
import type { CommsAgentContext } from "@/lib/comms"
import { requireWebhookSecret, verifyResendWebhook } from "@/lib/auth/webhook"

function parseFromAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim().toLowerCase() }
  return { email: raw.trim().toLowerCase() }
}

function slugFromRecipient(to: string): string | null {
  const local = to.split("@")[0]?.toLowerCase() ?? ""
  const plus = local.match(/^frontdesk\+([a-z0-9-]+)$/)
  if (plus) return plus[1]
  const bare = local.match(/^([a-z0-9-]+)$/)
  return bare?.[1] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const auth = requireWebhookSecret("RESEND_WEBHOOK_SECRET")
    if (!auth.ok) return auth.response
    if (auth.secret && !verifyResendWebhook(rawBody, req.headers, auth.secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 })
    }

    const payload = JSON.parse(rawBody)
    const data = (payload.data ?? payload) as Record<string, unknown>

    const toList = Array.isArray(data.to) ? data.to : data.to ? [String(data.to)] : []
    const toRaw = toList[0] ? String(toList[0]) : ""
    const slug = slugFromRecipient(toRaw)
    if (!slug) {
      return NextResponse.json({ ok: true, skipped: "unknown recipient" })
    }

    const db = createAdminClient()
    const { data: emailSettings } = await db
      .from("practice_email_settings")
      .select("practice_id, enabled, reply_from_email")
      .eq("inbound_slug", slug)
      .eq("enabled", true)
      .maybeSingle()

    if (!emailSettings?.practice_id) {
      return NextResponse.json({ ok: true, skipped: "email not enabled" })
    }

    const practiceId = String(emailSettings.practice_id)
    const fromRaw = String(data.from ?? "")
    const { email: fromEmail, name: fromName } = parseFromAddress(fromRaw)
    const subject = String(data.subject ?? "(no subject)")
    const body = String(data.text ?? data.html ?? "").replace(/<[^>]+>/g, " ").trim()

    if (!fromEmail) {
      return NextResponse.json({ ok: true, skipped: "missing from" })
    }

    const thread = await getOrCreateThread(practiceId, "email", fromEmail)
    if (fromName) {
      await updateThreadStatus(thread.id, { metadataPatch: { patientDisplayName: fromName } })
    }

    await appendMessage({
      threadId: thread.id,
      practiceId,
      direction: "inbound",
      senderType: "patient",
      contentType: "text",
      body: body || subject,
      deliveryStatus: "delivered",
    })

    await updateThreadStatus(thread.id, {
      status: "handoff",
      priority: "normal",
      unreadCount: (thread.unreadCount ?? 0) + 1,
    })

    const recentMessages = await getThreadMessages(thread.id, 12)
    const [hours, services, faqs, practiceName] = await Promise.all([
      getPracticeHours(practiceId),
      getServices(practiceId),
      getFAQs(practiceId),
      getPracticeName(practiceId),
    ])

    const agentCtx: CommsAgentContext = {
      practiceId,
      practiceName,
      thread: { ...thread, channel: "email" },
      recentMessages,
      hours,
      services,
      faqs,
      isAfterHours: !isCurrentlyOpen(hours),
      hasConsent: true,
    }

    const agentReply = await runCommsAgent(agentCtx, body || subject)
    if (agentReply.text?.trim()) {
      await appendMessage({
        threadId: thread.id,
        practiceId,
        direction: "outbound",
        senderType: "agent",
        contentType: "text",
        body: agentReply.text,
        deliveryStatus: "queued",
      })
    }

    if (agentReply.threadUpdate?.status) {
      await updateThreadStatus(thread.id, agentReply.threadUpdate)
    }

    return NextResponse.json({ ok: true, threadId: thread.id })
  } catch (err) {
    console.error("[email/inbound]", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
