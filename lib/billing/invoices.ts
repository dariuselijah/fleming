import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { allocateBillingNumber } from "./sequences"
import { writeBillingAudit } from "./audit"
import { buildInvoicePdfBytes } from "./pdf/invoice-pdf"
import { uploadBillingPdf } from "./storage"
import { zarToCents } from "./money"
import type { BillingMode, InvoiceLineSnapshot, InvoiceStatus, PatientSnapshot, PracticeSnapshot } from "./types"
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
    .select("display_name_hint")
    .eq("id", patientId)
    .maybeSingle()
  return {
    name: (data?.display_name_hint as string)?.trim() || "Patient",
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
  }
): Promise<{ invoiceId: string }> {
  const { data: claim, error: cErr } = await supabase
    .from("practice_claims")
    .select("id, patient_id, clinical_encounter_id, lines")
    .eq("id", opts.claimId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (cErr || !claim) throw new Error(cErr?.message ?? "Claim not found")

  let lineItems: InvoiceLineSnapshot[]
  let subtotalCents: number
  let vatCents = 0

  if (opts.shortfallCents != null && opts.shortfallCents > 0) {
    lineItems = [
      {
        id: `sf-${opts.claimId}`,
        description: "Patient responsibility (scheme shortfall)",
        amountCents: opts.shortfallCents,
      },
    ]
    subtotalCents = opts.shortfallCents
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

  const invoiceNumber = await allocateBillingNumber(supabase, opts.practiceId, "invoice")

  const { data: ins, error: insErr } = await supabase
    .from("practice_invoices")
    .insert({
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
    })
    .select("id")
    .single()

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
