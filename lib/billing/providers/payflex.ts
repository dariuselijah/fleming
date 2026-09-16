/**
 * Payflex — BNPL / card flows (ZA). Practice sub-merchant credentials.
 */

export async function createPayflexCheckoutForInvoice(opts: {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  successUrl: string
  cancelUrl?: string
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  void opts
  throw new Error("Payflex checkout is disabled until its order and webhook contract is certified.")
}
