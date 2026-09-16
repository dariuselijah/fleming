import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOutboundCall } from "@/lib/comms/vapi"
import { getOrCreateThread, appendMessage } from "@/lib/comms"
import { normalizePhoneE164Za } from "@/lib/comms/patient-phone"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import {
  BILLING_VOICE_FOLLOW_UP_SCENARIO_ID,
  getVoiceTestScenario,
} from "@/lib/comms/voice-test-scenarios"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: invoiceId } = await context.params

  const { data: inv, error: invErr } = await ctx.supabase
    .from("practice_invoices")
    .select(
      "id, patient_id, appointment_id, total_cents, amount_paid_cents, invoice_number, patient_snapshot, status"
    )
    .eq("id", invoiceId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  if (inv.status === "void" || inv.status === "write_off" || inv.status === "paid") {
    return NextResponse.json({ error: "Invoice cannot receive follow-up" }, { status: 400 })
  }

  const dueCents = (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)
  if (dueCents <= 0) return NextResponse.json({ error: "Nothing due" }, { status: 400 })

  const snap = inv.patient_snapshot as { phone?: string; name?: string } | undefined
  let phone = snap?.phone?.trim()
  if (!phone && inv.patient_id) {
    const { data: pp } = await ctx.supabase
      .from("practice_patients")
      .select("phone_e164")
      .eq("id", inv.patient_id)
      .maybeSingle()
    phone = pp?.phone_e164?.trim() ?? undefined
  }
  if (!phone) return NextResponse.json({ error: "Patient has no phone on file" }, { status: 422 })

  const { data: practiceRow } = await ctx.supabase.from("practices").select("name").eq("id", ctx.practiceId).maybeSingle()
  const practiceName = practiceRow?.name?.trim() || "the practice"
  const amountStr = (dueCents / 100).toFixed(2)
  const patientFirst = (snap?.name ?? "there").split(/\s+/)[0] ?? "there"

  const scenario = getVoiceTestScenario(BILLING_VOICE_FOLLOW_UP_SCENARIO_ID)
  const firstMessage = `Hi ${patientFirst}, this is ${practiceName} about your account. There is an outstanding balance of R${amountStr} for care you received. If you would like, we can send you a secure payment link by SMS. Does that work for you?`

  const db = createAdminClient()
  const { data: channel } = await db
    .from("practice_channels")
    .select("vapi_assistant_id, vapi_phone_number_id")
    .eq("practice_id", ctx.practiceId)
    .eq("channel_type", "voice")
    .not("vapi_assistant_id", "is", null)
    .not("vapi_phone_number_id", "is", null)
    .limit(1)
    .maybeSingle()

  if (!channel?.vapi_assistant_id || !channel?.vapi_phone_number_id) {
    return NextResponse.json({ error: "Voice not configured" }, { status: 400 })
  }

  const { data: followRow, error: fuErr } = await db
    .from("practice_billing_follow_ups")
    .insert({
      practice_id: ctx.practiceId,
      invoice_id: invoiceId,
      channel: "voice",
      status: "queued",
      provider_raw: { purpose: scenario?.purpose ?? "billing_follow_up" } as unknown as Record<string, unknown>,
    })
    .select("id")
    .single()

  if (fuErr || !followRow) {
    return NextResponse.json({ error: fuErr?.message ?? "Follow-up log failed" }, { status: 500 })
  }

  const customerE164 = normalizePhoneE164Za(phone)

  try {
    const call = await createOutboundCall({
      assistantId: channel.vapi_assistant_id,
      phoneNumberId: channel.vapi_phone_number_id,
      customerNumber: customerE164,
      metadata: {
        practiceId: ctx.practiceId,
        invoiceId,
        purpose: scenario?.purpose ?? "billing_follow_up",
        scenarioId: BILLING_VOICE_FOLLOW_UP_SCENARIO_ID,
        amountZar: amountStr,
      },
      assistantOverrides: {
        firstMessage,
        firstMessageMode: "assistant-speaks-first",
      },
    })

    const thread = await getOrCreateThread(ctx.practiceId, "voice", customerE164)

    await db.from("voice_calls").insert({
      thread_id: thread.id,
      practice_id: ctx.practiceId,
      direction: "outbound",
      vapi_call_id: call.id,
      appointment_id: inv.appointment_id,
    })

    await appendMessage({
      threadId: thread.id,
      practiceId: ctx.practiceId,
      direction: "outbound",
      senderType: "agent",
      contentType: "audio",
      body: `Billing follow-up call (invoice ${inv.invoice_number})`,
      providerMessageId: `call-${call.id}`,
    })

    await db
      .from("practice_billing_follow_ups")
      .update({
        status: "sent",
        vapi_call_id: call.id,
        provider_raw: {
          purpose: scenario?.purpose ?? "billing_follow_up",
          vapiCallId: call.id,
        } as unknown as Record<string, unknown>,
      })
      .eq("id", followRow.id)

    return NextResponse.json({ ok: true, callId: call.id, followUpId: followRow.id })
  } catch (e) {
    await db
      .from("practice_billing_follow_ups")
      .update({
        status: "failed",
        provider_raw: { error: e instanceof Error ? e.message : "call_failed" } as unknown as Record<string, unknown>,
      })
      .eq("id", followRow.id)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Call failed" }, { status: 500 })
  }
}
