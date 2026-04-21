import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = process.env.BILLING_STORAGE_BUCKET?.trim() || "billing-documents"

export async function uploadBillingPdf(path: string, bytes: Uint8Array): Promise<string> {
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  })
  if (error) throw new Error(`billing storage: ${error.message}`)
  return path
}

export async function getBillingPdfSignedUrl(path: string, expiresInSec = 300): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSec)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "signed URL failed")
  return data.signedUrl
}

export { BUCKET as BILLING_STORAGE_BUCKET }
