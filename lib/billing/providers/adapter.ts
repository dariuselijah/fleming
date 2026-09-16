/**
 * Unified payment-provider adapter contract (aggregator model).
 * Implementations: polar.ts, stitch.ts, yoco.ts, payfast.ts, payflex.ts.
 *
 * Each practice connects their own PSP credentials; Fleming orchestrates checkout + webhooks.
 */

import type { PaymentProvider } from "../types"

export type InitCheckoutInput = {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  successUrl: string
  cancelUrl?: string
  /** Patient-facing reference on bank / receipt */
  reference?: string
  customerEmail?: string
  customerName?: string
  metadata?: Record<string, string>
}

export type InitCheckoutResult = {
  checkoutId: string
  checkoutUrl: string
  raw?: Record<string, unknown>
}

export type WebhookVerification = {
  ok: boolean
  /** Parsed provider event id for idempotency (payment_provider_events) */
  eventId?: string
  eventType?: string
}

export interface BillingPaymentProviderAdapter {
  readonly id: PaymentProvider
  /** Human label for setup UI */
  readonly label: string
  initCheckout(input: InitCheckoutInput): Promise<InitCheckoutResult>
  /** Verify webhook signature / body; implementation may be no-op in dev */
  verifyWebhook?(rawBody: string, headers: Headers): WebhookVerification
}
