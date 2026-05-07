import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBillingPdfSignedUrl } from "@/lib/billing/storage"
import { hashPortalToken } from "@/lib/portal/tokens"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("token")?.trim()
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 })
  const tokenHash = hashPortalToken(decodeURIComponent(token))

  const admin = createAdminClient()
  const { data: access, error: accessErr } = await admin
    .from("patient_access_tokens")
    .select("invoice_id, purpose, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (accessErr || !access || access.purpose !== "billing_invoice" || !access.invoice_id) {
    return NextResponse.json({ verified: false, error: "Invalid portal token" }, { status: 404 })
  }
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ verified: false, error: "Portal token expired" }, { status: 410 })
  }

  const { data: inv } = await admin
    .from("practice_invoices")
    .select("id, invoice_number, status, amount_paid_cents, total_cents")
    .eq("id", access.invoice_id)
    .maybeSingle()
  if (!inv) return NextResponse.json({ verified: false, error: "Invoice not found" }, { status: 404 })

  const { data: receipt } = await admin
    .from("practice_receipts")
    .select("pdf_storage_path")
    .eq("invoice_id", inv.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    verified: inv.status === "paid" || inv.status === "partially_paid",
    invoiceNumber: inv.invoice_number,
    status: inv.status,
    amountPaidCents: inv.amount_paid_cents,
    totalCents: inv.total_cents,
    receiptUrl: receipt?.pdf_storage_path ? await getBillingPdfSignedUrl(receipt.pdf_storage_path, 3600) : null,
  })
}
