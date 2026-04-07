import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall } from "@/lib/comms/vapi"
import { getOrCreateThread, appendMessage } from "@/lib/comms"

export async function POST(req: NextRequest) {
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

    if (!membership) return NextResponse.json({ error: "No practice" }, { status: 403 })
    const practiceId = membership.practice_id

    const body = await req.json()
    const { patientPhone, purpose, appointmentId, message } = body as {
      patientPhone: string
      purpose?: string
      appointmentId?: string
      message?: string
    }

    if (!patientPhone) {
      return NextResponse.json({ error: "patientPhone required" }, { status: 400 })
    }

    // Get voice channel config
    const db = createAdminClient()
    const { data: channel } = await db
      .from("practice_channels")
      .select("vapi_assistant_id, vapi_phone_number_id")
      .eq("practice_id", practiceId)
      .eq("channel_type", "voice")
      .eq("status", "active")
      .limit(1)
      .maybeSingle()

    if (!channel?.vapi_assistant_id || !channel?.vapi_phone_number_id) {
      return NextResponse.json({ error: "Voice not configured" }, { status: 400 })
    }

    // Create outbound call
    const call = await createOutboundCall({
      assistantId: channel.vapi_assistant_id,
      phoneNumberId: channel.vapi_phone_number_id,
      customerNumber: patientPhone,
      metadata: { practiceId, purpose, appointmentId },
    })

    // Track in thread
    const thread = await getOrCreateThread(practiceId, "voice", patientPhone)

    await db.from("voice_calls").insert({
      thread_id: thread.id,
      practice_id: practiceId,
      direction: "outbound",
      vapi_call_id: call.id,
    })

    await appendMessage({
      threadId: thread.id,
      practiceId,
      direction: "outbound",
      senderType: "agent",
      contentType: "audio",
      body: `Outbound call: ${purpose || "general"}`,
      providerMessageId: `call-${call.id}`,
    })

    return NextResponse.json({ ok: true, callId: call.id, threadId: thread.id })
  } catch (err) {
    console.error("[voice-outbound] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
