/** Billing domain types (practice_invoices, practice_payments, etc.) */

export type BillingMode = "cash" | "card" | "eft_instant" | "split" | "scheme_only"

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "refunded"
  | "write_off"
  | "void"

export type PaymentProvider = "cash" | "polar" | "stitch" | "eft_manual" | "medical_aid" | "write_off"

export type PaymentMethod =
  | "apple_pay"
  | "google_pay"
  | "card"
  | "payshap"
  | "eft"
  | "cash"

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "canceled"

export type SequenceKind = "invoice" | "receipt" | "credit_note"

export interface InvoiceLineSnapshot {
  id: string
  description: string
  icdCode?: string
  tariffCode?: string
  nappiCode?: string
  quantity?: number
  amountCents: number
  lineType?: string
}

export interface PracticeSnapshot {
  name: string
  logoStoragePath?: string
  vatNumber?: string
  hpcsaNumber?: string
  bhfNumber?: string
  address?: string
  phone?: string
  email?: string
  website?: string
}

export interface PatientSnapshot {
  name: string
  idNumber?: string
  email?: string
  phone?: string
  address?: string
}
