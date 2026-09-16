export async function sendPatientMessageEmail(opts: {
  to: string
  subject: string
  body: string
  patientName?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim()
  if (!key || !from) {
    return { ok: false, error: "Email not configured (RESEND_API_KEY / RESEND_FROM)." }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.body,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    return { ok: false, error: err || `HTTP ${res.status}` }
  }
  return { ok: true }
}
