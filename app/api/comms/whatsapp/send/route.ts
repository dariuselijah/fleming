import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  sendWhatsAppMessage,
  getPracticeWhatsAppNumber,
  getOrCreateThread,
  appendMessage,
} from "@/lib/comms"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get user's practice
    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: "No practice found" }, { status: 403 })
    const practiceId = membership.practice_id

    const body = await req.json()
    const { threadId, patientPhone, message, templateKey, templateVariables } = body as {
      threadId?: string
      patientPhone?: string
      message?: string
      templateKey?: string
      templateVariables?: Record<string, string>
    }

    if (!message && !templateKey) {
      return NextResponse.json({ error: "message or templateKey required" }, { status: 400 })
    }
    if (!threadId && !patientPhone) {
      return NextResponse.json({ error: "threadId or patientPhone required" }, { status: 400 })
    }

    const practiceNumber = await getPracticeWhatsAppNumber(practiceId)
    if (!practiceNumber) {
      return NextResponse.json({ error: "WhatsApp not configured for this practice" }, { status: 400 })
    }

    // Resolve or create thread
    let resolvedThreadId = threadId
    let targetPhone = patientPhone || ""

    if (threadId && !patientPhone) {
      const db = createAdminClient()
      const { data: thread } = await db
        .from("conversation_threads")
        .select("external_party")
        .eq("id", threadId)
        .single()
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })
      targetPhone = thread.external_party
    }

    if (!resolvedThreadId && targetPhone) {
      const thread = await getOrCreateThread(practiceId, "whatsapp", targetPhone)
      resolvedThreadId = thread.id
    }

    // Send message
    const text = message || `[Template: ${templateKey}]`
    const { messageSid } = await sendWhatsAppMessage({
      from: practiceNumber,
      to: targetPhone,
      body: text,
    })

    // Record
    await appendMessage({
      threadId: resolvedThreadId!,
      practiceId,
      direction: "outbound",
      senderType: "staff",
      body: text,
      templateName: templateKey,
      providerMessageId: messageSid,
      deliveryStatus: "sent",
    })

    return NextResponse.json({ ok: true, messageSid, threadId: resolvedThreadId })
  } catch (err) {
    console.error("[whatsapp-send] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
