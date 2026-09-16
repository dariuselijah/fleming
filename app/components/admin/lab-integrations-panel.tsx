"use client"

import { cn } from "@/lib/utils"
import {
  LAB_PARTNER_DEFS,
  LAB_STATUS_LABEL,
  type LabConnectionStatus,
  type LabPartnerId,
} from "@/lib/comms/lab-partners"
import { CheckCircle, CircleNotch, Copy, Plugs, PaperPlaneTilt } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

type PartnerRow = {
  status: string
  inboundUrl: string | null
  bearerToken: string | null
  lastOutreachAt: string | null
  lastOutreachTo: string | null
  lastOutreachError: string | null
  updatedAt: string
}

type PartnerApi = (typeof LAB_PARTNER_DEFS)[number] & {
  row: PartnerRow | null
}

const STATUS_OPTIONS: LabConnectionStatus[] = [
  "not_started",
  "outreach_sent",
  "awaiting_lab",
  "live",
  "paused",
]
const LAB_INBOUND_ENABLED = false

export function LabIntegrationsPanel() {
  const [loading, setLoading] = useState(true)
  const [partners, setPartners] = useState<PartnerApi[]>([])
  const [baseUrl, setBaseUrl] = useState("")
  const [busyLab, setBusyLab] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBanner(null)
    try {
      const res = await fetch("/api/comms/lab-partners")
      if (!res.ok) return
      const data = (await res.json()) as { partners: PartnerApi[]; baseUrl?: string }
      setPartners(data.partners || [])
      if (data.baseUrl) setBaseUrl(data.baseUrl)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!LAB_INBOUND_ENABLED) {
      setLoading(false)
      return
    }
    void load()
  }, [load])

  if (!LAB_INBOUND_ENABLED) {
    return (
      <div className="mt-auto border-t border-panel-border pt-3">
        <div className="rounded-xl border border-dashed border-panel-border bg-panel-muted/40 px-3 py-3">
          <div className="flex items-center gap-2">
            <Plugs className="size-4 text-muted-foreground" />
            <p className="text-[11px] font-medium text-foreground/75">Lab inbound unavailable</p>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Partner routing stays hidden until authenticated parsing, patient matching, audit logging, and inbox
            creation are released together.
          </p>
        </div>
      </div>
    )
  }

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* silent */
    }
  }

  const requestOutreach = async (labPartner: LabPartnerId) => {
    setBusyLab(labPartner)
    setBanner(null)
    try {
      const res = await fetch("/api/comms/lab-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_outreach", labPartner }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBanner(typeof data.error === "string" ? data.error : "Request failed")
        return
      }
      if (data.emailed === false && data.error) {
        setBanner(`Saved routing credentials. Email not sent: ${data.error}`)
      } else {
        setBanner("Outreach email sent. Status will update when the lab confirms routing.")
      }
      await load()
    } finally {
      setBusyLab(null)
    }
  }

  const setStatus = async (labPartner: LabPartnerId, status: LabConnectionStatus) => {
    setBusyLab(labPartner)
    try {
      const res = await fetch("/api/comms/lab-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", labPartner, status }),
      })
      if (res.ok) await load()
    } finally {
      setBusyLab(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center border-t border-panel-border py-6">
        <CircleNotch className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mt-auto border-t border-panel-border pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Plugs className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">Lab partners (ZA)</span>
      </div>
      <p className="mb-2.5 text-[9px] leading-snug text-muted-foreground">
        Request formal routing for Lancet, Ampath, and PathCare. We email the lab from Fleming with your
        clinicians and a secure inbound URL. Track status here; when the lab confirms, mark{" "}
        <span className="text-muted-foreground">Live</span>.
      </p>
      {baseUrl && (
        <p className="mb-2 font-mono text-[8px] text-muted-foreground">
          App base: {baseUrl}
        </p>
      )}
      {banner && (
        <p className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-100/90">
          {banner}
        </p>
      )}
      <div className="space-y-2.5">
        {partners.map((p) => {
          const row = p.row
          const status = (row?.status ?? "not_started") as LabConnectionStatus
          const disabled = busyLab === p.id
          return (
            <div
              key={p.id}
              className="rounded-xl border border-panel-border bg-panel-muted/50 px-2.5 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground/70">{p.label}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {row?.lastOutreachAt
                      ? `Last outreach ${new Date(row.lastOutreachAt).toLocaleString()}${row.lastOutreachTo ? ` → ${row.lastOutreachTo}` : ""}`
                      : "No outreach logged yet"}
                  </p>
                  {row?.lastOutreachError && (
                    <p className="mt-1 text-[9px] text-amber-200/80">{row.lastOutreachError}</p>
                  )}
                </div>
                <select
                  value={status}
                  disabled={disabled}
                  onChange={(e) => void setStatus(p.id, e.target.value as LabConnectionStatus)}
                  className={cn(
                    "max-w-[118px] shrink-0 cursor-pointer rounded-lg border border-panel-border bg-panel-muted px-1.5 py-1 text-[9px] font-medium outline-none focus:border-ring",
                    "text-foreground/70"
                  )}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {LAB_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              {row?.inboundUrl && row.bearerToken && (
                <div className="mt-2 space-y-1.5 rounded-lg bg-panel-muted p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">Inbound URL</p>
                      <p className="break-all font-mono text-[9px] text-muted-foreground/70">{row.inboundUrl}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(`${p.id}-url`, row.inboundUrl!)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/70"
                      title="Copy URL"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                        Bearer token
                      </p>
                      <p className="break-all font-mono text-[9px] text-muted-foreground/65">{row.bearerToken}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(`${p.id}-tok`, row.bearerToken!)}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/70"
                      title="Copy token"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                  {copied?.startsWith(p.id) && (
                    <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                      <CheckCircle className="size-3" weight="fill" /> Copied
                    </span>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => void requestOutreach(p.id)}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-panel-border bg-panel-muted py-1.5 text-[10px] font-medium text-foreground/70 transition-colors hover:border-white/18 hover:bg-secondary disabled:opacity-50"
              >
                {disabled ? (
                  <CircleNotch className="size-3.5 animate-spin" />
                ) : (
                  <PaperPlaneTilt className="size-3.5" />
                )}
                Send / refresh outreach email
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
