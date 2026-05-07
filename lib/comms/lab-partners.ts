import type { LabPartnerId } from "./lab-partner-ids"

export { LAB_PARTNER_DEFS, type LabPartnerId } from "./lab-partner-ids"

export type LabConnectionStatus =
  | "not_started"
  | "outreach_sent"
  | "awaiting_lab"
  | "live"
  | "paused"

export const LAB_STATUS_LABEL: Record<LabConnectionStatus, string> = {
  not_started: "Not started",
  outreach_sent: "Outreach sent",
  awaiting_lab: "Awaiting lab",
  live: "Live",
  paused: "Paused",
}

export function labOutreachRecipient(lab: LabPartnerId): string | undefined {
  const map: Record<LabPartnerId, string | undefined> = {
    lancet: process.env.LAB_OUTREACH_LANCET_EMAIL?.trim(),
    ampath: process.env.LAB_OUTREACH_AMPATH_EMAIL?.trim(),
    pathcare: process.env.LAB_OUTREACH_PATHCARE_EMAIL?.trim(),
  }
  return map[lab] || process.env.LAB_INTEGRATIONS_OPS_EMAIL?.trim()
}

export function buildLabOutreachEmail(opts: {
  practiceName: string
  labLabel: string
  inboundUrl: string
  bearerToken: string
  doctors: { display_name: string; role: string | null; email: string | null }[]
}): { subject: string; text: string } {
  const doctorLines = opts.doctors.length
    ? opts.doctors
        .map(
          (d) =>
            `  - ${d.display_name}${d.role ? ` (${d.role})` : ""}${d.email ? ` <${d.email}>` : ""}`
        )
        .join("\n")
    : "  (No clinicians listed in Fleming yet — add staff under Settings.)"

  const text = `Hello ${opts.labLabel} integrations team,

Fleming is requesting HL7 / electronic results delivery for the following practice.

Practice: ${opts.practiceName}

Clinicians to register for result routing (all doctors in this practice should receive results at this endpoint):
${doctorLines}

Inbound HTTPS endpoint (POST raw HL7 ORU/MDM as agreed with your team):
${opts.inboundUrl}

Authorization:
  Header: Authorization: Bearer ${opts.bearerToken}

Please route all results for the above clinicians to this endpoint. Reply to this thread when routing is active on your side.

— Fleming Integrations
`

  return {
    subject: `[Fleming] Lab results routing — ${opts.practiceName} (${opts.labLabel})`,
    text,
  }
}

export async function sendLabOutreachViaResend(opts: {
  to: string[]
  from: string
  subject: string
  text: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY is not configured" }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    return { ok: false, error: err || `HTTP ${res.status}` }
  }

  return { ok: true }
}
