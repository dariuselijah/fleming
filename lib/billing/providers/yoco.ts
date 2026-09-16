/**
 * Yoco remains unavailable until checkout and webhook certification are complete.
 */

export async function createYocoCheckoutForInvoice(opts: {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  successUrl: string
  cancelUrl?: string
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  void opts
  throw new Error("Yoco checkout is disabled until its checkout and webhook contract is certified.")
}

export function verifyYocoWebhookSignature(_rawBody: string, _headers: Headers): boolean {
  void _rawBody
  void _headers
  return false
}
