export async function sendEmailReply(opts: {
  to: string
  subject: string
  body: string
  from?: string
  replyTo?: string
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  const from =
    opts.from?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim()
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
      reply_to: opts.replyTo,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    return { ok: false, error: err || `HTTP ${res.status}` }
  }

  const j = (await res.json().catch(() => ({}))) as { id?: string }
  return { ok: true, messageId: j.id }
}
