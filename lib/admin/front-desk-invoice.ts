export type FrontDeskInvoiceRow = {
  id: string
  claim_id: string | null
  patient_id: string | null
  total_cents: number
  amount_paid_cents: number
  status: string
  patient_snapshot?: { name?: string; phone?: string }
  invoice_number?: string
  due_at?: string | null
  created_at?: string
}

export function isInvoiceOverdue(invoice: FrontDeskInvoiceRow): boolean {
  if (!invoice.due_at) return false
  if (invoice.status === "paid" || invoice.status === "void") return false
  return new Date(invoice.due_at).getTime() < Date.now()
}

export function invoiceDueCents(invoice: FrontDeskInvoiceRow): number {
  return Math.max(0, (invoice.total_cents ?? 0) - (invoice.amount_paid_cents ?? 0))
}

export function invoiceNeedsCollection(invoice: FrontDeskInvoiceRow): boolean {
  return invoiceDueCents(invoice) > 0 && invoice.status !== "void"
}

export function invoiceStatusLabel(invoice: FrontDeskInvoiceRow): string {
  const due = invoiceDueCents(invoice)
  if (invoice.status === "paid" || due <= 0) return "Paid"
  if ((invoice.amount_paid_cents ?? 0) > 0) return "Partially paid"
  if (isInvoiceOverdue(invoice)) return "Overdue"
  if (invoice.status === "draft") return "Draft"
  if (invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "issued") return "Unpaid"
  return invoice.status.replaceAll("_", " ")
}
