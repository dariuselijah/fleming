export type PaymentPartnerCategory = "online" | "bank" | "cash" | "terminal"
export type PaymentPartnerStatus = "integrated" | "ready" | "planned"

export interface PaymentPartner {
  id: string
  name: string
  category: PaymentPartnerCategory
  status: PaymentPartnerStatus
  summary: string
  capabilities: string[]
  href: string
  notes?: string
}

export const PAYMENT_PARTNERS: PaymentPartner[] = [
  {
    id: "polar",
    name: "Polar",
    category: "online",
    status: "integrated",
    summary: "Primary card and wallet checkout for patient billing links.",
    capabilities: ["Hosted checkout", "Apple Pay / Google Pay", "Embedded checkout"],
    href: "https://polar.sh/docs/features/checkout/session",
    notes: "Use for patient-facing bill payment and branded checkout flows.",
  },
  {
    id: "stitch-card",
    name: "Stitch Card",
    category: "online",
    status: "ready",
    summary: "South African online card payins and hosted redirect flows.",
    capabilities: ["Hosted card payments", "Secure fields", "Webhooks"],
    href: "https://docs.stitch.money/payment-products/payins/card/once-off",
    notes: "Good regional fallback for local card acceptance.",
  },
  {
    id: "stitch-bank",
    name: "Stitch Bank Pay",
    category: "bank",
    status: "integrated",
    summary: "Instant bank and payment-request rails for local collections.",
    capabilities: ["Payment requests", "Bank pay", "Webhook updates"],
    href: "https://docs.stitch.money/payment-products/payins/rest",
    notes: "Current app flow uses Stitch for EFT-style patient links.",
  },
  {
    id: "stitch-cash",
    name: "Stitch Cash",
    category: "cash",
    status: "ready",
    summary: "Cash at till and ATM reference flows for unbanked collections.",
    capabilities: ["Cash at till", "ATM / branch cash", "Reconciliation events"],
    href: "https://docs.stitch.money/payment-products/payins/cash/introduction",
    notes: "Useful for practices serving patients who pay in cash offsite.",
  },
  {
    id: "stitch-terminal",
    name: "Stitch In-Person",
    category: "terminal",
    status: "ready",
    summary: "Terminal API for in-person card machine transactions.",
    capabilities: ["Initiate terminal sale", "Terminal serial mapping", "Card present"],
    href: "https://docs.stitch.money/payment-products/payins/inperson/rest-api",
    notes: "Best current path for directly orchestrated card-present terminal flows.",
  },
  {
    id: "yoco",
    name: "Yoco",
    category: "terminal",
    status: "planned",
    summary: "Disabled until checkout and webhook signature certification are complete.",
    capabilities: ["REST API", "Business portal", "Card machine estate"],
    href: "https://developer.yoco.com/docs/api",
    notes: "No checkout or webhook endpoint accepts transactions in this build.",
  },
  {
    id: "payfast",
    name: "PayFast",
    category: "online",
    status: "planned",
    summary: "Disabled until signed redirects, ITN validation, and tenant credentials are complete.",
    capabilities: ["Hosted payment page", "ITN", "Subscriptions"],
    href: "https://developers.payfast.co.za/docs#home",
    notes: "No checkout or ITN endpoint accepts transactions in this build.",
  },
  {
    id: "payflex",
    name: "Payflex",
    category: "online",
    status: "planned",
    summary: "Disabled until the order and webhook contracts are certified.",
    capabilities: ["BNPL", "Card"],
    href: "https://payflex.co.za",
    notes: "No checkout or webhook endpoint accepts transactions in this build.",
  },
  {
    id: "ikhokha",
    name: "iKhokha",
    category: "terminal",
    status: "planned",
    summary: "Card machine pairing and mobile-led acceptance for smaller practices.",
    capabilities: ["Paired card machine", "Mobile app operations", "In-person acceptance"],
    href: "https://help.ikhokha.com/using-the-ikhokha-app",
    notes: "Operationally useful, but needs a deeper integration path than current billing APIs.",
  },
]

