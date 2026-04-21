import { createAdminClient } from "@/lib/supabase/admin"

/** Normalize caller ID to E.164 for South Africa (+27…). Best-effort for other formats. */
export function normalizePhoneE164Za(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length >= 11 && digits.startsWith("27")) {
    return `+${digits.slice(0, 11)}`
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `+27${digits.slice(1)}`
  }
  if (digits.length === 9) {
    return `+27${digits}`
  }
  if (trimmed.startsWith("+")) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return trimmed
}

export type PatientPhoneRow = {
  id: string
  display_name_hint: string | null
  profile_status: string
  phone_e164: string | null
}

export async function findPatientByPracticePhone(
  practiceId: string,
  rawPhone: string
): Promise<PatientPhoneRow | null> {
  const db = createAdminClient()
  const e164 = normalizePhoneE164Za(rawPhone)
  const { data: byCol } = await db
    .from("practice_patients")
    .select("id, display_name_hint, profile_status, phone_e164")
    .eq("practice_id", practiceId)
    .eq("phone_e164", e164)
    .limit(1)
    .maybeSingle()

  if (byCol) return byCol as PatientPhoneRow

  const cleanTail = digitsTail(rawPhone)
  if (!cleanTail) return null

  const { data: candidates } = await db
    .from("practice_patients")
    .select("id, display_name_hint, profile_status, phone_e164")
    .eq("practice_id", practiceId)

  for (const p of candidates || []) {
    const row = p as PatientPhoneRow
    const hint = (row.display_name_hint || "").toLowerCase()
    if (hint.includes(cleanTail)) return row
    const pe = row.phone_e164 ? digitsTail(row.phone_e164) : ""
    if (pe && pe === cleanTail) return row
  }
  return null
}

function digitsTail(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.length >= 9) return d.slice(-9)
  return d
}

/** Resolve E.164 for appointment/voice outbound (patient row, then WhatsApp thread). */
export async function resolvePatientPhoneE164(
  db: ReturnType<typeof createAdminClient>,
  practiceId: string,
  patientId: string | null
): Promise<string | null> {
  if (!patientId) return null

  const { data: patient } = await db
    .from("practice_patients")
    .select("phone_e164, display_name_hint")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (patient?.phone_e164) return patient.phone_e164 as string
  const hint = (patient?.display_name_hint as string) || ""
  const m = hint.match(/\+?\d[\d\s-]{8,}/)
  if (m) return normalizePhoneE164Za(m[0].replace(/[\s-]/g, ""))

  const { data: thread } = await db
    .from("conversation_threads")
    .select("external_party")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (thread?.external_party) {
    return normalizePhoneE164Za(thread.external_party as string)
  }
  return null
}
