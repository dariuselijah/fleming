export type DisabledPaymentProvider = "yoco" | "payfast" | "payflex"

const DISABLED_REASONS: Record<DisabledPaymentProvider, string> = {
  yoco:
    "Yoco is disabled: this repository does not contain a certified checkout implementation and webhook signature specification.",
  payfast:
    "PayFast is disabled: signed hosted-form creation, ITN source validation, and per-practice merchant credentials are not implemented.",
  payflex:
    "Payflex is disabled: the order API and webhook signature contract are not specified in this repository.",
}

export function disabledPaymentProviderReason(provider: string): string | null {
  return provider in DISABLED_REASONS
    ? DISABLED_REASONS[provider as DisabledPaymentProvider]
    : null
}
