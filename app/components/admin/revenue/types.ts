export type RevenueInvoice = {
  id: string
  invoice_number: string
  patient_id: string | null
  claim_id: string | null
  total_cents: number
  amount_paid_cents: number
  status: string
  billing_mode: string | null
  created_at: string
  due_at: string | null
  last_reminded_at: string | null
  patient_snapshot: { name?: string; email?: string; phone?: string } | null
}

export type RevenuePayment = {
  id: string
  invoice_id: string
  provider: string
  method: string | null
  amount_cents: number
  status: string
  created_at: string
  succeeded_at: string | null
}

export type DrawerStatus = {
  id: string
  openedAt: string
  openingFloatCents: number
  cashSalesCents: number
  cashPaymentCount: number
  expectedCashCents: number
}

export type RevenueReportSummary = {
  todayCents: number
  outstandingCents: number
  cashCents: number
  cardCents: number
  eftCents: number
  medicalAidCents: number
}
