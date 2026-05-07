import { createHmac, timingSafeEqual } from "node:crypto"

const BASE =
  process.env.POLAR_SH_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.polar.sh/v1"
    : "https://api.polar.sh/v1"

export async function createPolarCheckoutForInvoice(opts: {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  customerEmail?: string
  customerName?: string
  successUrl: string
  cancelUrl?: string
  metadata?: Record<string, string>
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  const token = process.env.POLAR_SH_ACCESS_TOKEN?.trim()
  const productPriceId = process.env.POLAR_SH_PRODUCT_PRICE_ID?.trim()

  if (process.env.POLAR_SH_DRY_RUN === "1" || !token) {
    const checkoutId = `dry_${opts.invoiceId.slice(0, 8)}`
    const u = new URL("https://polar.sh/checkout/dry-run")
    u.searchParams.set("invoice", opts.invoiceId)
    return { checkoutId, checkoutUrl: u.toString() }
  }

  if (!productPriceId) {
    throw new Error("Set POLAR_SH_PRODUCT_PRICE_ID for Polar checkout (or POLAR_SH_DRY_RUN=1 for dev)")
  }

  const body: Record<string, unknown> = {
    product_price_id: productPriceId,
    success_url: opts.successUrl,
    customer_email: opts.customerEmail ?? undefined,
    customer_name: opts.customerName ?? undefined,
    metadata: {
      invoice_id: opts.invoiceId,
      practice_id: opts.practiceId,
      ...opts.metadata,
    },
  }
  if (opts.cancelUrl) body.cancel_url = opts.cancelUrl

  const res = await fetch(`${BASE}/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json: { id?: string; url?: string; checkout_url?: string } = {}
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    /* empty */
  }

  if (!res.ok) {
    throw new Error(`Polar checkout failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const checkoutId = json.id ?? ""
  const checkoutUrl = json.url ?? json.checkout_url ?? ""
  if (!checkoutId || !checkoutUrl) {
    throw new Error("Polar response missing id or url")
  }

  return { checkoutId, checkoutUrl }
}

/**
 * Polar webhook signature: `polar_signature` header, HMAC-SHA256 of raw body.
 * @see https://polar.sh/docs/integrate/webhooks/delivery
 */
export function verifyPolarWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.POLAR_SH_WEBHOOK_SECRET?.trim()
  if (!secret || !signatureHeader) return false
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  try {
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(signatureHeader.replace(/^sha256=/, "").trim(), "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Alternative: compare hex strings if Polar sends full hex */
export function verifyPolarWebhookSignatureLoose(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.POLAR_SH_WEBHOOK_SECRET?.trim()
  if (!secret || !signatureHeader) return process.env.NODE_ENV === "development"
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const got = signatureHeader.replace(/^sha256=/, "").replace(/"/g, "").trim()
  return expected === got || verifyPolarWebhookSignature(rawBody, signatureHeader)
}

export async function refundPolarPayment(opts: {
  providerOrderId?: string | null
  providerCheckoutId?: string | null
  amountCents: number
  reason?: string | null
}): Promise<{ refundId: string }> {
  const token = process.env.POLAR_SH_ACCESS_TOKEN?.trim()
  if (process.env.POLAR_SH_DRY_RUN === "1" || !token) {
    return { refundId: `polar_refund_dry_${Date.now()}` }
  }

  const paymentId = opts.providerOrderId ?? opts.providerCheckoutId
  if (!paymentId) throw new Error("Polar payment id missing")

  const res = await fetch(`${BASE}/refunds/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payment_id: paymentId,
      amount: opts.amountCents,
      reason: opts.reason ?? "requested_by_customer",
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Polar refund failed (${res.status}): ${text.slice(0, 500)}`)
  const json = JSON.parse(text || "{}") as { id?: string }
  return { refundId: json.id ?? paymentId }
}
