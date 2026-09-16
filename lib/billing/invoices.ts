import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { allocateBillingNumber } from "./sequences"
import { writeBillingAudit } from "./audit"
import { buildInvoicePdfBytes } from "./pdf/invoice-pdf"
import { uploadBillingPdf } from "./storage"
import { zarToCents } from "./money"
import type { BillingMode, InvoiceLineSnapshot, InvoiceStatus, PatientSnapshot, PracticeSnapshot } from "./types"
import type { ClaimResponse } from "@/lib/medikredit/types"
import { applyDispenseOnIssue } from "./dispense"

type ClaimLineLike = {
  id?: string
  description?: string
  icdCode?: string
  tariffCode?: string
  nappiCode?: string
  quantity?: number
  amount?: number
  lineType?: string
}

function linesFromClaimJson(lines: unknown): InvoiceLineSnapshot[] {
  if (!Array.isArray(lines)) return []
  const out: InvoiceLineSnapshot[] = []
  for (const raw of lines) {
    if (typeof raw !== "object" || raw === null) continue
    const l = raw as ClaimLineLike
    const amount = typeof l.amount === "number" ? l.amount : 0
    out.push({
      id: String(l.id ?? randomUUID()),
      description: String(l.description ?? "Line item"),
      icdCode: l.icdCode,
      tariffCode: l.tariffCode,
      nappiCode: l.nappiCode,
      quantity: l.quantity ?? 1,
      amountCents: zarToCents(amount),
      lineType: l.lineType,
    })
  }
  return out
}

function looksAdjudicated(med: ClaimResponse | null | undefined): boolean {
  if (!med || typeof med !== "object") return false
  if (med.txNbr) return true
  if (Array.isArray(med.itemStatuses) && med.itemStatuses.length > 0) return true
  return (
    med.outcome === "approved" ||
    med.outcome === "partially_approved" ||
    med.outcome === "rejected" ||
    med.outcome === "duplicate"
  )
}

function sumInvoiceLines(lines: InvoiceLineSnapshot[]): { subtotal: number; vat: number } {
  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0)
  return { subtotal, vat: 0 }
}

async function buildPracticeSnapshot(
  supabase: SupabaseClient<Database>,
  practiceId: string
): Promise<PracticeSnapshot> {
  const db = supabase as unknown as SupabaseClient
  const { data: p } = await db
    .from("practices")
    .select("name, country_code, logo_storage_path, vat_number, hpcsa_number, bhf_number, address, phone, email, website")
    .eq("id", practiceId)
    .maybeSingle()
  const { data: bs } = await supabase
    .from("practice_billing_settings")
    .select("provider_name")
    .eq("practice_id", practiceId)
    .maybeSingle()
  return {
    name: (bs?.provider_name as string)?.trim() || p?.name || "Practice",
    logoStoragePath: (p as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? undefined,
    vatNumber: (p as { vat_number?: string | null } | null)?.vat_number ?? undefined,
    hpcsaNumber: (p as { hpcsa_number?: string | null } | null)?.hpcsa_number ?? undefined,
    bhfNumber: (p as { bhf_number?: string | null } | null)?.bhf_number ?? undefined,
    address: (p as { address?: string | null } | null)?.address ?? (p?.country_code ? `Country: ${p.country_code}` : undefined),
    phone: (p as { phone?: string | null } | null)?.phone ?? undefined,
    email: (p as { email?: string | null } | null)?.email ?? undefined,
    website: (p as { website?: string | null } | null)?.website ?? undefined,
  }
}

async function buildPatientSnapshot(
  supabase: SupabaseClient<Database>,
  patientId: string | null
): Promise<PatientSnapshot> {
  if (!patientId) return { name: "Patient" }
  const { data } = await supabase
    .from("practice_patients")
    .select("display_name_hint, phone_e164")
    .eq("id", patientId)
    .maybeSingle()
  return {
    name: (data?.display_name_hint as string)?.trim() || "Patient",
    phone: (data?.phone_e164 as string)?.trim() || undefined,
  }
}

export async function createInvoiceFromClaim(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    claimId: string
    billingMode: BillingMode
    actorUserId: string | null
    /** Shortfall-only invoice: single line, this amount in cents */
    shortfallCents?: number
    /** When set, overrides claim.appointment_id (e.g. API caller knows the visit) */
    appointmentId?: string | null
    /**
     * When true with `billingMode: "scheme_only"`, invoices only explicit cash /
     * patient-liability rows from the stored claim JSON (dangerous exceptional path).
     */
    forceFullClaimInvoice?: boolean
  }
): Promise<{ invoiceId: string }> {
  // Do not select practice_claims.appointment_id here: DBs without migration
  // `20260425120000_billing_automation_claim_appointment_providers.sql` will error.
  const { data: claim, error: cErr } = await supabase
    .from("practice_claims")
    .select("id, patient_id, clinical_encounter_id, lines, medikredit_response")
    .eq("id", opts.claimId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (cErr || !claim) throw new Error(cErr?.message ?? "Claim not found")

  const { data: existingInvoices, error: existingInvoiceError } = await supabase
    .from("practice_invoices")
    .select("id, status")
    .eq("practice_id", opts.practiceId)
    .eq("claim_id", opts.claimId)
    .neq("status", "void")
    .order("created_at", { ascending: true })
    .limit(1)
  if (existingInvoiceError) throw new Error(existingInvoiceError.message)
  if (existingInvoices?.[0]?.id) {
    return { invoiceId: existingInvoices[0].id }
  }

  let lineItems: InvoiceLineSnapshot[]
  let subtotalCents: number
  let vatCents = 0

  const med = claim.medikredit_response as ClaimResponse | null | undefined

  if (opts.shortfallCents != null && opts.shortfallCents > 0) {
    lineItems = [
      {
        id: `sf-${opts.claimId}`,
        description: "Patient responsibility (scheme shortfall)",
        amountCents: opts.shortfallCents,
      },
    ]
    subtotalCents = opts.shortfallCents
  } else if (opts.billingMode === "scheme_only") {
    if (opts.forceFullClaimInvoice) {
      const allParsed = linesFromClaimJson(claim.lines)
      lineItems = allParsed.filter(
        (l) => l.lineType === "cash" || l.lineType === "patient_liability" || !l.lineType
      )
      if (lineItems.length === 0) {
        throw new Error("No explicit cash/patient-liability lines on claim for override invoice.")
      }
      const sums = sumInvoiceLines(lineItems)
      subtotalCents = sums.subtotal
      vatCents = sums.vat
    } else if (!looksAdjudicated(med ?? null)) {
      throw new Error("Medical-aid claims must be adjudicated before creating an invoice.")
    } else if (typeof med?.patientResponsibility === "number" && med.patientResponsibility > 0) {
      subtotalCents = zarToCents(med.patientResponsibility)
      lineItems = [
        {
          id: `sf-${opts.claimId}`,
          description: "Patient responsibility (scheme shortfall)",
          amountCents: subtotalCents,
        },
      ]
    } else {
      throw new Error("No patient invoice required — scheme response shows no liability.")
    }
  } else {
    lineItems = linesFromClaimJson(claim.lines)
    const onlyCash = lineItems.filter(
      (l) => l.lineType === "cash" || l.lineType === "patient_liability" || !l.lineType
    )
    const use = onlyCash.length ? onlyCash : lineItems
    const sums = sumInvoiceLines(use)
    lineItems = use
    subtotalCents = sums.subtotal
    vatCents = sums.vat
  }

  if (subtotalCents <= 0) {
    throw new Error("Invoice total must be positive")
  }

  const practiceSnap = await buildPracticeSnapshot(supabase, opts.practiceId)
  const patientSnap = await buildPatientSnapshot(supabase, claim.patient_id)

  const appointmentId = opts.appointmentId?.trim() || null

  const invoiceNumber = await allocateBillingNumber(supabase, opts.practiceId, "invoice")

  const baseInsert = {
    practice_id: opts.practiceId,
    patient_id: claim.patient_id,
    claim_id: opts.claimId,
    clinical_encounter_id: claim.clinical_encounter_id,
    invoice_number: invoiceNumber,
    subtotal_cents: subtotalCents,
    vat_cents: vatCents,
    total_cents: subtotalCents + vatCents,
    amount_paid_cents: 0,
    billing_mode: opts.billingMode,
    status: "draft" as InvoiceStatus,
    practice_snapshot: practiceSnap as unknown as Record<string, unknown>,
    patient_snapshot: patientSnap as unknown as Record<string, unknown>,
    line_items: lineItems as unknown as Record<string, unknown>[],
  }

  const tryInsert = async (row: typeof baseInsert & { appointment_id?: string | null }) => {
    return supabase.from("practice_invoices").insert(row).select("id").single()
  }

  let first = appointmentId
    ? await tryInsert({ ...baseInsert, appointment_id: appointmentId })
    : await tryInsert(baseInsert)

  if (first.error && /appointment_id/i.test(first.error.message ?? "")) {
    console.warn(
      "[billing] Invoice insert failed on appointment_id; apply migration 20260425120000_billing_automation_claim_appointment_providers.sql. Retrying without appointment_id."
    )
    first = await tryInsert(baseInsert)
  }

  const ins = first.data
  const insErr = first.error
  if (insErr || !ins) throw new Error(insErr?.message ?? "Insert invoice failed")

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "invoice",
    entityId: ins.id,
    action: "create_from_claim",
    diff: { claimId: opts.claimId },
  })

  return { invoiceId: ins.id }
}

export async function issueInvoice(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    dueAt?: string | null
  }
): Promise<{ pdfPath: string }> {
  const { data: inv, error } = await supabase
    .from("practice_invoices")
    .select("*")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (error || !inv) throw new Error(error?.message ?? "Invoice not found")

  if (inv.status !== "draft") {
    throw new Error("Only draft invoices can be issued")
  }

  const practiceSnap = inv.practice_snapshot as unknown as PracticeSnapshot
  const patientSnap = inv.patient_snapshot as unknown as PatientSnapshot
  const lines = (inv.line_items as unknown as InvoiceLineSnapshot[]) ?? []
  const issuedAt = new Date().toISOString()
  const dueCents = Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0))
  const shouldAttachPayQr =
    inv.patient_id &&
    inv.billing_mode !== "scheme_only" &&
    dueCents > 0 &&
    lines.some((line) => line.lineType !== "medical_aid")
  let payUrl: string | undefined
  if (shouldAttachPayQr) {
    const { createPatientAccessToken } = await import("@/lib/portal/tokens")
    const token = await createPatientAccessToken({
      practiceId: opts.practiceId,
      patientId: inv.patient_id as string,
      purpose: "billing_invoice",
      invoiceId: opts.invoiceId,
      expiresInHours: 168,
    })
    payUrl = token.portalUrl
  }

  const pdfBytes = await buildInvoicePdfBytes({
    invoiceNumber: inv.invoice_number,
    issuedAtIso: issuedAt,
    practice: practiceSnap,
    patient: patientSnap,
    lines,
    subtotalCents: inv.subtotal_cents,
    vatCents: inv.vat_cents,
    totalCents: inv.total_cents,
    amountPaidCents: inv.amount_paid_cents,
    payUrl,
  })

  const path = `${opts.practiceId}/invoices/${issuedAt.slice(0, 7)}/${inv.invoice_number}.pdf`
  await uploadBillingPdf(path, pdfBytes)

  const { error: uErr } = await supabase
    .from("practice_invoices")
    .update({
      status: "issued",
      issued_at: issuedAt,
      due_at: opts.dueAt ?? null,
      pdf_storage_path: path,
      updated_at: issuedAt,
    })
    .eq("id", opts.invoiceId)

  if (uErr) throw new Error(uErr.message)

  await applyDispenseOnIssue(supabase, {
    practiceId: opts.practiceId,
    invoiceId: opts.invoiceId,
    lines,
    actorUserId: opts.actorUserId,
  })

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "invoice",
    entityId: opts.invoiceId,
    action: "issue",
    diff: { pdfPath: path },
  })

  return { pdfPath: path }
}

export async function voidInvoice(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    reason?: string
    forceRefundPayments?: boolean
  }
): Promise<void> {
  const { data: payments, error: pErr } = await supabase
    .from("practice_payments")
    .select("id")
    .eq("practice_id", opts.practiceId)
    .eq("invoice_id", opts.invoiceId)
    .eq("status", "succeeded")
    .limit(1)
  if (pErr) throw new Error(pErr.message)
  if ((payments?.length ?? 0) > 0 && !opts.forceRefundPayments) {
    throw new Error("Cannot void an invoice with succeeded payments. Refund payments first.")
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from("practice_invoices")
    .update({
      status: "void",
      voided_at: now,
      write_off_reason: opts.reason ?? null,
      updated_at: now,
    })
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
  if (error) throw new Error(error.message)

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "invoice",
    entityId: opts.invoiceId,
    action: "void",
    reason: opts.reason ?? null,
  })
}
