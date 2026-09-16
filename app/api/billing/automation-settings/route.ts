import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { mapAutomationRow } from "@/lib/billing/automation-settings"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await ctx.supabase
    .from("practice_billing_automation_settings")
    .select("*")
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()

  return NextResponse.json({ settings: mapAutomationRow(ctx.practiceId, data) })
}

export async function PUT(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patch = {
    auto_submit_claims: Boolean(body.autoSubmitClaims),
    auto_send_shortfall_sms: Boolean(body.autoSendShortfallSms),
    auto_ai_voice_call: Boolean(body.autoAiVoiceCall),
    overdue_sms_hours: Math.max(1, Number(body.overdueSmsHours) || 72),
    overdue_voice_hours: Math.max(1, Number(body.overdueVoiceHours) || 72),
    escalation_hours: Math.max(1, Number(body.escalationHours) || 168),
    default_opening_float_cents: Math.max(0, Number(body.defaultOpeningFloatCents) || 0),
    cash_drawer_variance_alert_cents: Math.max(0, Number(body.cashDrawerVarianceAlertCents) || 10000),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await ctx.supabase
    .from("practice_billing_automation_settings")
    .upsert(
      {
        practice_id: ctx.practiceId,
        ...patch,
      },
      { onConflict: "practice_id" }
    )
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: mapAutomationRow(ctx.practiceId, data) })
}
