export async function sendPracticeInviteEmail(opts: {
  to: string
  from: string
  practiceName: string
  roleLabel: string
  acceptUrl: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY is not configured" }
  }

  const text = `You have been invited to join ${opts.practiceName} on Fleming as ${opts.roleLabel}.

Open this link to sign in with the same email address and accept the invitation:
${opts.acceptUrl}

If you did not expect this message, you can ignore it.

— Fleming
`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: `Invitation to ${opts.practiceName} (${opts.roleLabel})`,
      text,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    return { ok: false, error: err || `HTTP ${res.status}` }
  }

  return { ok: true }
}
