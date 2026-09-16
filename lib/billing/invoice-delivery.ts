import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { createPatientAccessToken } from "@/lib/portal/tokens"
import { sendPatientTemplatedMessage } from "@/lib/comms/communication-service"
import { issueInvoice } from "./invoices"
import { resolvePatientPhoneForComms } from "@/lib/comms/patient-phone"

export type IssueAndSendSmsResult =
  | { ok: true; portalUrl: string }
  | { ok: false; reason: "not_found" | "no_phone" | "error"; message?: string }

/**
 * Issue draft invoice if needed, send SMS with portal pay link (same behaviour as POST .../send).
 */
export async function issueAndSendInvoiceSms(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    /** Client-known phone (decrypted profile) when DB column is empty */
    fallbackPhone?: string | null
  }
): Promise<IssueAndSendSmsResult> {
  const { data: inv, error } = await supabase
    .from("practice_invoices")
    .select("id, patient_id, status, total_cents, invoice_number, patient_snapshot")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()

  if (error || !inv) {
    return { ok: false, reason: "not_found", message: error?.message }
  }

  if (inv.status === "draft") {
    await issueInvoice(supabase, {
      practiceId: opts.practiceId,
      invoiceId: opts.invoiceId,
      actorUserId: opts.actorUserId,
    })
  }

  const { data: refreshed } = await supabase
    .from("practice_invoices")
    .select("id, patient_id, status, total_cents, invoice_number, patient_snapshot")
    .eq("id", opts.invoiceId)
    .maybeSingle()

  const row = refreshed ?? inv
  const patient = row.patient_snapshot as { phone?: string; name?: string } | undefined

  const phone = await resolvePatientPhoneForComms(supabase, opts.practiceId, row.patient_id as string, {
    userId: opts.actorUserId,
    fallbackPhone: opts.fallbackPhone ?? patient?.phone ?? null,
  })

  if (!phone) {
    return { ok: false, reason: "no_phone" }
  }

  const { portalUrl } = await createPatientAccessToken({
    practiceId: opts.practiceId,
    patientId: row.patient_id as string,
    purpose: "billing_invoice",
    invoiceId: opts.invoiceId,
    expiresInHours: 72,
  })

  const { data: practiceRow } = await supabase.from("practices").select("name").eq("id", opts.practiceId).maybeSingle()
  const practiceName = practiceRow?.name?.trim() || "Your practice"
  const amountStr = ((row.total_cents ?? 0) / 100).toFixed(2)

  await sendPatientTemplatedMessage({
    practiceId: opts.practiceId,
    toE164: phone,
    templateKey: "invoice_issued",
    variables: {
      "1": amountStr,
      "2": practiceName,
      "3": portalUrl,
    },
    patientId: row.patient_id as string,
  })

  const now = new Date().toISOString()
  await supabase
    .from("practice_invoices")
    .update({ status: "sent", last_reminded_at: now, updated_at: now })
    .eq("id", opts.invoiceId)

  return { ok: true, portalUrl }
}
