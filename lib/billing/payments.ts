import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { issueReceipt } from "./receipts"
import { writeBillingAudit } from "./audit"
import type { PaymentMethod, PaymentProvider, PaymentStatus } from "./types"
import { allocateBillingNumber } from "./sequences"
import { createPolarCheckoutForInvoice } from "./providers/polar"
import { createStitchPaymentLink } from "./providers/stitch"

export async function findPaymentByIdempotency(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  idempotencyKey: string
) {
  const { data } = await supabase
    .from("practice_payments")
    .select("id, status, invoice_id")
    .eq("practice_id", practiceId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  return data
}

export async function recordCashPayment(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    amountCents: number
    actorUserId: string | null
    idempotencyKey: string
    cashDrawerSessionId?: string | null
    reference?: string | null
  }
): Promise<{ paymentId: string; receiptId: string; invoiceStatus: string }> {
  const existing = await findPaymentByIdempotency(supabase, opts.practiceId, opts.idempotencyKey)
  if (existing?.id) {
    const { data: inv } = await supabase
      .from("practice_invoices")
      .select("status")
      .eq("id", opts.invoiceId)
      .maybeSingle()
    const { data: rec } = await supabase
      .from("practice_receipts")
      .select("id")
      .eq("payment_id", existing.id)
      .maybeSingle()
    return {
      paymentId: existing.id,
      receiptId: rec?.id ?? existing.id,
      invoiceStatus: inv?.status ?? "paid",
    }
  }

  const { data: inv, error: invErr } = await supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents, status")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found")
  if (inv.status === "void" || inv.status === "write_off") {
    throw new Error("Cannot pay void invoice")
  }

  const now = new Date().toISOString()
  const { data: pay, error: pErr } = await supabase
    .from("practice_payments")
    .insert({
      practice_id: opts.practiceId,
      invoice_id: opts.invoiceId,
      provider: "cash" as PaymentProvider,
      method: "cash",
      amount_cents: opts.amountCents,
      status: "succeeded" as PaymentStatus,
      idempotency_key: opts.idempotencyKey,
      received_by_user_id: opts.actorUserId,
      cash_drawer_session_id: opts.cashDrawerSessionId ?? null,
      reference: opts.reference ?? null,
      succeeded_at: now,
    })
    .select("id")
    .single()
  if (pErr || !pay) throw new Error(pErr?.message ?? "Payment failed")

  const newPaid = (inv.amount_paid_cents ?? 0) + opts.amountCents
  const total = inv.total_cents ?? 0
  let nextStatus = inv.status as string
  if (newPaid >= total) {
    nextStatus = "paid"
  } else if (newPaid > 0) {
    nextStatus = "partially_paid"
  }

  const { error: uErr } = await supabase
    .from("practice_invoices")
    .update({
      amount_paid_cents: newPaid,
      status: nextStatus,
      paid_at: nextStatus === "paid" ? now : null,
      updated_at: now,
    })
    .eq("id", opts.invoiceId)
  if (uErr) throw new Error(uErr.message)

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "payment",
    entityId: pay.id,
    action: "cash_succeeded",
    diff: { amountCents: opts.amountCents },
  })

  const { receiptId } = await issueReceipt(supabase, {
    practiceId: opts.practiceId,
    invoiceId: opts.invoiceId,
    paymentId: pay.id,
    methodLabel: "Cash",
    amountCents: opts.amountCents,
    reference: opts.reference,
  })

  return { paymentId: pay.id, receiptId, invoiceStatus: nextStatus }
}

export async function initCardCheckout(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    idempotencyKey: string
    successUrl: string
    cancelUrl?: string
  }
): Promise<{ checkoutUrl: string; paymentId: string }> {
  const { data: inv, error } = await supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents, currency, patient_snapshot, invoice_number")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (error || !inv) throw new Error(error?.message ?? "Invoice not found")

  const due = (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)
  if (due <= 0) throw new Error("Nothing to pay")

  const patient = inv.patient_snapshot as { email?: string; name?: string } | null
  const existing = await findPaymentByIdempotency(supabase, opts.practiceId, opts.idempotencyKey)
  if (existing?.id && existing.status === "pending") {
    const { data: row } = await supabase
      .from("practice_payments")
      .select("id, provider_checkout_id, provider_raw")
      .eq("id", existing.id)
      .maybeSingle()
    const raw = row?.provider_raw as { checkoutUrl?: string } | null
    if (raw?.checkoutUrl) {
      return { checkoutUrl: raw.checkoutUrl, paymentId: existing.id }
    }
  }

  const polar = await createPolarCheckoutForInvoice({
    amountCents: due,
    currency: inv.currency ?? "ZAR",
    invoiceId: opts.invoiceId,
    practiceId: opts.practiceId,
    customerEmail: patient?.email,
    customerName: patient?.name,
    successUrl: opts.successUrl,
    cancelUrl: opts.cancelUrl,
    metadata: { invoice_number: inv.invoice_number },
  })

  const { data: pay, error: pErr } = await supabase
    .from("practice_payments")
    .insert({
      practice_id: opts.practiceId,
      invoice_id: opts.invoiceId,
      provider: "polar",
      method: "card",
      amount_cents: due,
      currency: inv.currency ?? "ZAR",
      status: "pending",
      provider_checkout_id: polar.checkoutId,
      idempotency_key: opts.idempotencyKey,
      received_by_user_id: opts.actorUserId,
      provider_raw: { checkoutUrl: polar.checkoutUrl } as unknown as Record<string, unknown>,
    })
    .select("id")
    .single()
  if (pErr || !pay) throw new Error(pErr?.message ?? "Payment row failed")

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "payment",
    entityId: pay.id,
    action: "polar_checkout_created",
    diff: { checkoutId: polar.checkoutId },
  })

  return { checkoutUrl: polar.checkoutUrl, paymentId: pay.id }
}

export async function initStitchEft(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    invoiceId: string
    actorUserId: string | null
    idempotencyKey: string
    redirectUrl: string
  }
): Promise<{ paymentUrl: string; paymentId: string }> {
  const { data: inv, error } = await supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents, currency, invoice_number")
    .eq("id", opts.invoiceId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (error || !inv) throw new Error(error?.message ?? "Invoice not found")

  const due = (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)
  if (due <= 0) throw new Error("Nothing to pay")

  const stitch = await createStitchPaymentLink({
    amountCents: due,
    currency: inv.currency ?? "ZAR",
    invoiceId: opts.invoiceId,
    practiceId: opts.practiceId,
    reference: inv.invoice_number,
    redirectUrl: opts.redirectUrl,
  })

  const { data: pay, error: pErr } = await supabase
    .from("practice_payments")
    .insert({
      practice_id: opts.practiceId,
      invoice_id: opts.invoiceId,
      provider: "stitch",
      method: "payshap",
      amount_cents: due,
      currency: inv.currency ?? "ZAR",
      status: "pending",
      provider_checkout_id: stitch.externalId,
      idempotency_key: opts.idempotencyKey,
      received_by_user_id: opts.actorUserId,
      provider_raw: { paymentUrl: stitch.paymentUrl } as unknown as Record<string, unknown>,
    })
    .select("id")
    .single()
  if (pErr || !pay) throw new Error(pErr?.message ?? "Payment row failed")

  return { paymentUrl: stitch.paymentUrl, paymentId: pay.id }
}

/**
 * Mark a pending Polar/Stitch payment succeeded and issue receipt (webhook or redirect confirm).
 */
export async function finalizePendingPaymentSuccess(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    paymentId: string
    providerOrderId?: string | null
    methodLabel: string
    paymentMethod?: PaymentMethod | null
  }
): Promise<{ receiptId: string }> {
  const { data: pay, error: pErr } = await supabase
    .from("practice_payments")
    .select("*")
    .eq("id", opts.paymentId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (pErr || !pay) throw new Error(pErr?.message ?? "Payment not found")
  if (pay.status === "succeeded") {
    const { data: existing } = await supabase
      .from("practice_receipts")
      .select("id")
      .eq("payment_id", pay.id)
      .maybeSingle()
    return { receiptId: existing?.id ?? pay.id }
  }

  const now = new Date().toISOString()
  const { error: upErr } = await supabase
    .from("practice_payments")
    .update({
      status: "succeeded" as PaymentStatus,
      provider_order_id: opts.providerOrderId ?? pay.provider_order_id,
      method: opts.paymentMethod ?? pay.method,
      succeeded_at: now,
      updated_at: now,
    })
    .eq("id", pay.id)
  if (upErr) throw new Error(upErr.message)

  const { data: inv, error: iErr } = await supabase
    .from("practice_invoices")
    .select("total_cents, amount_paid_cents, status")
    .eq("id", pay.invoice_id)
    .maybeSingle()
  if (iErr || !inv) throw new Error(iErr?.message ?? "Invoice not found")

  const newPaid = (inv.amount_paid_cents ?? 0) + (pay.amount_cents ?? 0)
  const total = inv.total_cents ?? 0
  let nextStatus = inv.status as string
  if (newPaid >= total) nextStatus = "paid"
  else if (newPaid > 0) nextStatus = "partially_paid"

  const { error: invErr } = await supabase
    .from("practice_invoices")
    .update({
      amount_paid_cents: newPaid,
      status: nextStatus,
      paid_at: nextStatus === "paid" ? now : null,
      updated_at: now,
    })
    .eq("id", pay.invoice_id)
  if (invErr) throw new Error(invErr.message)

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: null,
    entityType: "payment",
    entityId: pay.id,
    action: "provider_succeeded",
    diff: { providerOrderId: opts.providerOrderId },
  })

  const { receiptId } = await issueReceipt(supabase, {
    practiceId: opts.practiceId,
    invoiceId: pay.invoice_id,
    paymentId: pay.id,
    methodLabel: opts.methodLabel,
    amountCents: pay.amount_cents ?? 0,
    reference: opts.providerOrderId ?? null,
  })

  return { receiptId }
}

export async function recordRefund(
  supabase: SupabaseClient<Database>,
  opts: {
    practiceId: string
    paymentId: string
    amountCents: number
    actorUserId: string | null
    reason?: string | null
  }
): Promise<{ creditNoteId: string; creditNoteNumber: string }> {
  const { data: pay, error: pErr } = await supabase
    .from("practice_payments")
    .select("*")
    .eq("id", opts.paymentId)
    .eq("practice_id", opts.practiceId)
    .maybeSingle()
  if (pErr || !pay) throw new Error(pErr?.message ?? "Payment not found")
  if (pay.status !== "succeeded") throw new Error("Can only refund succeeded payments")
  if (opts.amountCents <= 0 || opts.amountCents > (pay.amount_cents ?? 0)) {
    throw new Error("Invalid refund amount")
  }

  const cn = await allocateBillingNumber(supabase, opts.practiceId, "credit_note")
  const { data: inv } = await supabase
    .from("practice_invoices")
    .select("amount_paid_cents, invoice_number, patient_snapshot, practice_snapshot, line_items")
    .eq("id", pay.invoice_id)
    .maybeSingle()

  const { data: cnRow, error: cnErr } = await supabase
    .from("practice_credit_notes")
    .insert({
      practice_id: opts.practiceId,
      invoice_id: pay.invoice_id,
      payment_id: pay.id,
      credit_note_number: cn,
      amount_cents: opts.amountCents,
      reason: opts.reason ?? null,
      snapshot: {
        invoiceNumber: inv?.invoice_number,
        paymentId: pay.id,
      } as unknown as Record<string, unknown>,
    })
    .select("id")
    .single()
  if (cnErr || !cnRow) throw new Error(cnErr?.message ?? "Credit note failed")

  const newPaid = Math.max(0, (inv?.amount_paid_cents ?? 0) - opts.amountCents)
  const { error: invErr } = await supabase
    .from("practice_invoices")
    .update({
      amount_paid_cents: newPaid,
      status: newPaid <= 0 ? "issued" : "partially_paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pay.invoice_id)
  if (invErr) throw new Error(invErr.message)

  const refundStatus: PaymentStatus =
    opts.amountCents >= (pay.amount_cents ?? 0) ? "refunded" : "partially_refunded"
  const { error: payErr } = await supabase
    .from("practice_payments")
    .update({
      status: refundStatus,
      refunded_at: new Date().toISOString(),
    })
    .eq("id", pay.id)
  if (payErr) throw new Error(payErr.message)

  await writeBillingAudit(supabase, {
    practiceId: opts.practiceId,
    actorUserId: opts.actorUserId,
    entityType: "payment",
    entityId: pay.id,
    action: "refund",
    diff: { amountCents: opts.amountCents, creditNoteId: cnRow.id },
    reason: opts.reason ?? null,
  })

  return { creditNoteId: cnRow.id, creditNoteNumber: cn }
}
