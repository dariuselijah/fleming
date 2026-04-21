import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall } from "@/lib/comms/vapi"
import { getOrCreateThread, appendMessage } from "@/lib/comms"
import { normalizePhoneE164Za } from "@/lib/comms/patient-phone"
import {
  DEFAULT_VOICE_TEST_SCENARIO_ID,
  getVoiceTestScenario,
} from "@/lib/comms/voice-test-scenarios"

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
    const {
      patientPhone,
      scenarioId: rawScenarioId,
      purpose: legacyPurpose,
      appointmentId,
      message,
    } = body as {
      patientPhone: string
      scenarioId?: string
      purpose?: string
      appointmentId?: string
      message?: string
    }

    if (!patientPhone?.trim()) {
      return NextResponse.json({ error: "patientPhone required" }, { status: 400 })
    }

    let scenarioId: string | undefined
    if (typeof rawScenarioId === "string" && rawScenarioId.trim()) {
      scenarioId = rawScenarioId.trim()
    } else if (!legacyPurpose?.trim()) {
      scenarioId = DEFAULT_VOICE_TEST_SCENARIO_ID
    }

    const scenario = scenarioId ? getVoiceTestScenario(scenarioId) : undefined
    if (scenarioId && !scenario) {
      return NextResponse.json({ error: "Unknown scenarioId" }, { status: 400 })
    }

    const purpose =
      scenario?.purpose ?? legacyPurpose?.trim() ?? "channel_test"

    const customerE164 = normalizePhoneE164Za(patientPhone)

    // Get voice channel config (any status if Vapi IDs exist — supports testing before status flipped to active)
    const db = createAdminClient()
    const { data: channel } = await db
      .from("practice_channels")
      .select("vapi_assistant_id, vapi_phone_number_id")
      .eq("practice_id", practiceId)
      .eq("channel_type", "voice")
      .not("vapi_assistant_id", "is", null)
      .not("vapi_phone_number_id", "is", null)
      .limit(1)
      .maybeSingle()

    if (!channel?.vapi_assistant_id || !channel?.vapi_phone_number_id) {
      return NextResponse.json({ error: "Voice not configured" }, { status: 400 })
    }

    const metadata: Record<string, unknown> = {
      practiceId,
      purpose,
      ...(scenario ? { scenarioId: scenario.id } : {}),
      ...(appointmentId ? { appointmentId } : {}),
      ...(message ? { message } : {}),
      ...(scenario?.metadataExtra ?? {}),
    }

    const assistantOverrides =
      scenario &&
      (scenario.outboundFirstMessage || scenario.outboundFirstMessageMode)
        ? {
            ...(scenario.outboundFirstMessage
              ? { firstMessage: scenario.outboundFirstMessage }
              : {}),
            ...(scenario.outboundFirstMessageMode
              ? { firstMessageMode: scenario.outboundFirstMessageMode }
              : {}),
          }
        : undefined

    // Create outbound call
    const call = await createOutboundCall({
      assistantId: channel.vapi_assistant_id,
      phoneNumberId: channel.vapi_phone_number_id,
      customerNumber: customerE164,
      metadata,
      ...(assistantOverrides && Object.keys(assistantOverrides).length > 0
        ? { assistantOverrides }
        : {}),
    })

    // Track in thread
    const thread = await getOrCreateThread(practiceId, "voice", customerE164)

    await db.from("voice_calls").insert({
      thread_id: thread.id,
      practice_id: practiceId,
      direction: "outbound",
      vapi_call_id: call.id,
    })

    const label = scenario?.shortLabel ?? purpose
    await appendMessage({
      threadId: thread.id,
      practiceId,
      direction: "outbound",
      senderType: "agent",
      contentType: "audio",
      body: `Outbound test call (${label})`,
      providerMessageId: `call-${call.id}`,
    })

    return NextResponse.json({
      ok: true,
      callId: call.id,
      threadId: thread.id,
      scenarioId: scenario?.id ?? null,
      purpose,
    })
  } catch (err) {
    console.error("[voice-outbound] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
