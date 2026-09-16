import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"

export type BillingAutomationSettings = {
  practiceId: string
  autoSubmitClaims: boolean
  autoSendShortfallSms: boolean
  autoAiVoiceCall: boolean
  overdueSmsHours: number
  overdueVoiceHours: number
  escalationHours: number
  defaultOpeningFloatCents: number
  cashDrawerVarianceAlertCents: number
}

const DEFAULTS: Omit<BillingAutomationSettings, "practiceId"> = {
  autoSubmitClaims: false,
  autoSendShortfallSms: true,
  autoAiVoiceCall: false,
  overdueSmsHours: 72,
  overdueVoiceHours: 72,
  escalationHours: 168,
  defaultOpeningFloatCents: 0,
  cashDrawerVarianceAlertCents: 10000,
}

export function mapAutomationRow(
  practiceId: string,
  row: Database["public"]["Tables"]["practice_billing_automation_settings"]["Row"] | null
): BillingAutomationSettings {
  if (!row) {
    return { practiceId, ...DEFAULTS }
  }
  return {
    practiceId,
    autoSubmitClaims: row.auto_submit_claims,
    autoSendShortfallSms: row.auto_send_shortfall_sms,
    autoAiVoiceCall: row.auto_ai_voice_call,
    overdueSmsHours: row.overdue_sms_hours,
    overdueVoiceHours: row.overdue_voice_hours,
    escalationHours: row.escalation_hours,
    defaultOpeningFloatCents: Number(row.default_opening_float_cents),
    cashDrawerVarianceAlertCents: Number(row.cash_drawer_variance_alert_cents),
  }
}

export async function getBillingAutomationSettings(
  supabase: SupabaseClient<Database>,
  practiceId: string
): Promise<BillingAutomationSettings> {
  const { data } = await supabase
    .from("practice_billing_automation_settings")
    .select("*")
    .eq("practice_id", practiceId)
    .maybeSingle()
  return mapAutomationRow(practiceId, data)
}
