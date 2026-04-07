"use client"

import { cn } from "@/lib/utils"
import { BentoTile } from "./bento-tile"
import { CheckCircle, CircleNotch, Copy, Warning, Plugs } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

type Diagnostics = {
  env: {
    twilioAccountSid: boolean
    twilioAuthToken: boolean
    twilioWebhookBaseUrl: boolean
    supabaseServiceRoleKey: boolean
  }
  twilioApiOk: boolean | null
  twilioApiError?: string
  urls: { whatsappInbound: string; whatsappStatus: string }
}

export function CommsHealthPanel({ hasChannels }: { hasChannels: boolean }) {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [checklist, setChecklist] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [probing, setProbing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async (probe: boolean) => {
    setLoading(!probe)
    if (probe) setProbing(true)
    try {
      const [dRes, wRes] = await Promise.all([
        fetch(`/api/comms/diagnostics${probe ? "?probe=1" : ""}`),
        fetch("/api/comms/webhook-config"),
      ])
      if (dRes.ok) setData((await dRes.json()) as Diagnostics)
      if (wRes.ok) {
        const w = (await wRes.json()) as { twilioChecklist?: string[] }
        if (w.twilioChecklist) setChecklist(w.twilioChecklist)
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
      setProbing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* silent */
    }
  }, [])

  const envOk =
    data &&
    data.env.twilioAccountSid &&
    data.env.twilioAuthToken &&
    data.env.twilioWebhookBaseUrl &&
    data.env.supabaseServiceRoleKey

  return (
    <BentoTile
      title="Connection & webhooks"
      subtitle={hasChannels ? "Twilio checklist + copy-paste URLs" : "Configure channels first, then paste URLs in Twilio"}
      icon={<Plugs className="size-4 text-[#25D366]" />}
      className="border border-white/[0.06] bg-white/[0.015]"
    >
      {loading && !data ? (
        <div className="flex items-center justify-center py-8">
          <CircleNotch className="size-5 animate-spin text-white/20" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                envOk ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              )}
            >
              {envOk ? (
                <>
                  <CheckCircle className="size-3" weight="fill" />
                  Env vars
                </>
              ) : (
                <>
                  <Warning className="size-3" weight="fill" />
                  Fix .env
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={probing}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/60 transition-colors hover:bg-white/[0.07] disabled:opacity-40"
            >
              {probing ? <CircleNotch className="inline size-3 animate-spin" /> : null}
              {probing ? " Probing Twilio…" : "Test Twilio API"}
            </button>
            {data?.twilioApiOk === true && (
              <span className="text-[10px] text-emerald-400">Twilio credentials accepted</span>
            )}
            {data?.twilioApiOk === false && (
              <span className="max-w-[200px] truncate text-[10px] text-red-400" title={data.twilioApiError}>
                API check failed
              </span>
            )}
          </div>

          {!envOk && data && (
            <ul className="list-inside list-disc space-y-1 text-[10px] text-white/35">
              {!data.env.twilioAccountSid && <li>Set TWILIO_ACCOUNT_SID</li>}
              {!data.env.twilioAuthToken && <li>Set TWILIO_AUTH_TOKEN</li>}
              {!data.env.twilioWebhookBaseUrl && <li>Set TWILIO_WEBHOOK_BASE_URL (public https, no path)</li>}
              {!data.env.supabaseServiceRoleKey && <li>Set SUPABASE_SERVICE_ROLE_KEY (webhooks + bootstrap)</li>}
            </ul>
          )}

          {data?.urls && (
            <div className="space-y-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/30">Webhook URLs</p>
              {(
                [
                  ["Inbound WhatsApp", data.urls.whatsappInbound],
                  ["Status callback", data.urls.whatsappStatus],
                ] as const
              ).map(([label, url]) => (
                <div
                  key={label}
                  className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] text-white/35">{label}</p>
                    <p className="break-all font-mono text-[10px] text-white/55">{url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy(label, url)}
                    className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                    title="Copy"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  {copied === label && <span className="text-[9px] text-emerald-400">Copied</span>}
                </div>
              ))}
            </div>
          )}

          {checklist.length > 0 && (
            <div>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">Twilio Console</p>
              <ol className="list-decimal space-y-1.5 pl-4 text-[10px] leading-relaxed text-white/40">
                {checklist.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </BentoTile>
  )
}
