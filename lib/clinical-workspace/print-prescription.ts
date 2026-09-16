import QRCode from "qrcode"
import { fetchClient } from "@/lib/fetch"
import type { PrescriptionItem } from "./types"

type PracticeBranding = {
  practiceName?: string
  tradingName?: string
  displayName?: string
  address?: string
  phone?: string
  hpcsaNumber?: string
  bhfNumber?: string
  logoUrl?: string
}

export type PrintPrescriptionArgs = {
  patientName: string
  items: PrescriptionItem[]
  prescriberName?: string
  date?: Date
  patientId?: string
  handoffMessageId?: string
  sessionDocumentId?: string
  clinicalEncounterId?: string
  /** Skip token creation (e.g. preview) */
  skipVerification?: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function loadBranding(): Promise<PracticeBranding> {
  try {
    const res = await fetchClient("/api/practices/branding")
    if (!res.ok) return {}
    return (await res.json()) as PracticeBranding
  } catch {
    return {}
  }
}

async function createVerificationToken(args: PrintPrescriptionArgs): Promise<{ verifyUrl?: string; qrDataUrl?: string }> {
  if (args.skipVerification) return {}
  const validItems = args.items.filter((i) => i.drug?.trim())
  if (validItems.length === 0) return {}

  try {
    const res = await fetchClient("/api/clinical/prescriptions/verify-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: args.patientId,
        prescriberName: args.prescriberName,
        items: validItems,
        handoffMessageId: args.handoffMessageId,
        sessionDocumentId: args.sessionDocumentId,
        clinicalEncounterId: args.clinicalEncounterId,
      }),
    })
    if (!res.ok) return {}
    const j = (await res.json()) as { verifyUrl?: string }
    if (!j.verifyUrl) return {}
    const qrDataUrl = await QRCode.toDataURL(j.verifyUrl, { margin: 1, width: 120 })
    return { verifyUrl: j.verifyUrl, qrDataUrl }
  } catch {
    return {}
  }
}

export async function printPrescription(args: PrintPrescriptionArgs) {
  const branding = await loadBranding()
  const practice = branding.displayName ?? branding.tradingName ?? branding.practiceName ?? "Practice"
  const date = args.date ?? new Date()
  const dateStr = date.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const validItems = args.items.filter((i) => i.drug.trim())

  const { verifyUrl, qrDataUrl } = await createVerificationToken(args)

  const rows = validItems
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;width:28px;font-weight:600;color:#64748b">${idx + 1}.</td>
        <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(item.drug)}${item.strength ? ` <span style="font-weight:500;color:#475569">${escapeHtml(item.strength)}</span>` : ""}</div>
          <div style="margin-top:4px;font-size:12px;color:#64748b;line-height:1.5">
            ${[item.route, item.frequency, item.duration].filter(Boolean).map((part) => escapeHtml(String(part))).join(" · ")}
          </div>
          ${item.instructions ? `<div style="margin-top:4px;font-size:11.5px;color:#334155">${escapeHtml(item.instructions)}</div>` : ""}
        </td>
      </tr>`
    )
    .join("")

  const logoBlock = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="" style="max-height:52px;max-width:180px;object-fit:contain" />`
    : `<div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0f172a">${escapeHtml(practice)}</div>`

  const qrBlock =
    qrDataUrl && verifyUrl
      ? `<div style="text-align:center">
          <img src="${qrDataUrl}" alt="Verify prescription" width="120" height="120" style="display:block;margin:0 auto" />
          <div style="margin-top:6px;font-size:8px;color:#64748b;line-height:1.4">Scan to verify authenticity</div>
        </div>`
      : `<div style="font-size:9px;color:#94a3b8;text-align:right;max-width:240px;line-height:1.5">
          Verify allergies, interactions, and formulary before dispensing.
        </div>`

  const w = window.open("", "_blank")
  if (!w) return

  w.document.write(`<!DOCTYPE html><html><head><title>Prescription — ${escapeHtml(args.patientName)}</title>
<style>
  * { margin:0;padding:0;box-sizing:border-box }
  body { font-family: system-ui, -apple-system, sans-serif; color:#1e293b; background:#fff; padding:48px 56px; max-width:720px; margin:0 auto; line-height:1.5 }
  @media print { body { padding:32px 40px } @page { margin:18mm 14mm } }
</style></head><body>
  <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;border-bottom:2px solid #0f172a;margin-bottom:28px">
    <div>${logoBlock}
      <div style="margin-top:8px;font-size:11px;color:#64748b;line-height:1.6">
        ${branding.address ? `${escapeHtml(branding.address)}<br/>` : ""}
        ${branding.phone ? `${escapeHtml(branding.phone)} · ` : ""}
        ${branding.hpcsaNumber ? `HPCSA ${escapeHtml(branding.hpcsaNumber)}` : ""}
        ${branding.bhfNumber ? ` · BHF ${escapeHtml(branding.bhfNumber)}` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6366f1">Prescription</div>
      <div style="margin-top:4px;font-size:11px;color:#94a3b8">${dateStr}</div>
    </div>
  </header>

  <section style="margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8">Patient</div>
    <div style="margin-top:4px;font-size:20px;font-weight:700;color:#0f172a">${escapeHtml(args.patientName)}</div>
  </section>

  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tbody>${rows || `<tr><td colspan="2" style="padding:24px 0;color:#94a3b8;font-size:13px">No medications listed.</td></tr>`}</tbody>
  </table>

  <footer style="margin-top:48px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:flex-end;gap:24px">
    <div>
      <div style="width:200px;border-bottom:1px solid #334155;height:32px;margin-bottom:6px"></div>
      <div style="font-size:11px;color:#64748b">${escapeHtml(args.prescriberName ?? "Prescriber signature")}</div>
    </div>
    ${qrBlock}
  </footer>
</body></html>`)
  w.document.close()
  setTimeout(() => {
    w.print()
    w.close()
  }, 400)
}
