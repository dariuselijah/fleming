import { getBillingPdfSignedUrl } from "./storage"

export async function sendReceiptEmail(opts: {
  to: string
  from: string
  subject: string
  textBody: string
  pdfPath: string
  pdfFilename: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY is not configured" }
  }

  const signedUrl = await getBillingPdfSignedUrl(opts.pdfPath, 3600)

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: `${opts.textBody}\n\nReceipt PDF (download): ${signedUrl}`,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    return { ok: false, error: err || `HTTP ${res.status}` }
  }

  return { ok: true }
}
