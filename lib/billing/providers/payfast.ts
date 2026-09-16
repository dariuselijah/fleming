/**
 * PayFast — South African payment gateway (hosted redirect + ITN webhook).
 * Practice merchant id + key + passphrase; aggregator model keeps funds in practice account.
 */

export async function createPayfastPaymentForInvoice(opts: {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  successUrl: string
  cancelUrl?: string
  itemName?: string
}): Promise<{ checkoutId: string; checkoutUrl: string }> {
  void opts
  throw new Error("PayFast checkout is disabled until signed forms and ITN verification are certified.")
}

export function verifyPayfastItnSignature(_payload: Record<string, string>, _passphrase: string): boolean {
  void _payload
  void _passphrase
  return false
}
