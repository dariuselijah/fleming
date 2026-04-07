"use client"

import { cn } from "@/lib/utils"
import {
  WhatsappLogo,
  CheckCircle,
  CircleNotch,
  Clock,
  Warning,
  Plugs,
  Question,
  CalendarBlank,
  Copy,
  LinkSimple,
  Phone,
  PhoneOutgoing,
  PhoneIncoming,
  ArrowSquareOut,
  UploadSimple,
  Sparkle,
  FileText,
  ArrowClockwise,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { useState, useEffect, useCallback, useRef } from "react"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

interface ChannelInfo {
  channel_type: string
  provider: string
  phone_number: string
  phone_number_sid?: string | null
  status: string
  vapi_assistant_id?: string | null
  vapi_phone_number_id?: string | null
  webhook_url?: string | null
}

interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

interface FAQRow {
  id: string
  category: string
  question: string
  answer: string
  active: boolean
}

function truncateId(id: string | undefined | null, head = 10, tail = 6): string {
  if (!id) return "—"
  if (id.length <= head + tail + 1) return id
  return `${id.slice(0, head)}…${id.slice(-tail)}`
}

export function ChannelSetup() {
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [hours, setHours] = useState<HoursRow[]>([])
  const [faqs, setFaqs] = useState<FAQRow[]>([])
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState(false)
  const [availableNumbers, setAvailableNumbers] = useState<{ phoneNumber: string; friendlyName: string }[]>([])
  const [searchingNumbers, setSearchingNumbers] = useState(false)
  const [webhookCfg, setWebhookCfg] = useState<{
    baseUrl: string
    urls: {
      whatsappInbound: string
      whatsappStatus: string
      voiceInbound: string
    }
    twilioChecklist: string[]
    vapiChecklist?: string[]
  } | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [webhookTab, setWebhookTab] = useState<"messaging" | "voice">("messaging")
  const [syncWebhookBusy, setSyncWebhookBusy] = useState(false)
  const [syncWebhookMessage, setSyncWebhookMessage] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/comms/provision/status")
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels || [])
        setHours(data.hours || [])
        setFaqs(data.faqs || [])
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/comms/webhook-config")
        if (!res.ok) return
        const j = await res.json()
        if (!cancelled) setWebhookCfg(j)
      } catch {
        /* silent */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const copyUrl = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      /* silent */
    }
  }, [])

  const searchNumbers = useCallback(async () => {
    setSearchingNumbers(true)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search" }),
      })
      if (res.ok) {
        const data = await res.json()
        setAvailableNumbers(data.numbers || [])
      }
    } catch {
      /* silent */
    } finally {
      setSearchingNumbers(false)
    }
  }, [])

  const provisionNumber = useCallback(
    async (phoneNumber: string) => {
      setProvisioning(true)
      try {
        const res = await fetch("/api/comms/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "provision", phoneNumber }),
        })
        if (res.ok) {
          setAvailableNumbers([])
          await fetchStatus()
        }
      } catch {
        /* silent */
      } finally {
        setProvisioning(false)
      }
    },
    [fetchStatus]
  )

  const syncTwilioWebhooks = useCallback(async () => {
    setSyncWebhookBusy(true)
    setSyncWebhookMessage(null)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_webhooks" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncWebhookMessage(typeof data.error === "string" ? data.error : "Sync failed")
        return
      }
      setSyncWebhookMessage(
        typeof data.message === "string" ? data.message : "Twilio webhooks updated."
      )
      await fetchStatus()
    } catch {
      setSyncWebhookMessage("Network error")
    } finally {
      setSyncWebhookBusy(false)
    }
  }, [fetchStatus])

  const whatsappChannel = channels.find((c) => c.channel_type === "whatsapp")
  const voiceChannel = channels.find((c) => c.channel_type === "voice")
  const hasChannels = channels.length > 0
  const voiceReady =
    !!voiceChannel?.vapi_assistant_id && !!voiceChannel?.vapi_phone_number_id

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <CircleNotch className="size-7 animate-spin text-white/25" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-indigo-500/[0.12] via-transparent to-emerald-500/[0.06] px-6 py-8 sm:px-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
            Practice connections
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
            Channels
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
            Wire up WhatsApp (Twilio) and AI phone calls (Vapi). One provisioned number here sets up
            messaging and, when Vapi env vars are set, clones an assistant for inbound and outbound
            voice.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusChip
              label="WhatsApp"
              ok={whatsappChannel?.status === "active"}
              pending={whatsappChannel?.status === "pending_wa_approval"}
              idle={!whatsappChannel}
            />
            <StatusChip
              label="Voice (Vapi)"
              ok={voiceReady}
              pending={!!voiceChannel && !voiceReady}
              idle={!voiceChannel}
            />
          </div>
        </div>
      </div>

      {/* Primary grid: messaging + voice */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
        <BentoTile
          title="WhatsApp messaging"
          icon={<WhatsappLogo className="size-4 text-[#25D366]" weight="fill" />}
          subtitle="Twilio sender · patient chat in Inbox"
          glow={whatsappChannel?.status === "active" ? "green" : undefined}
          className="min-h-[280px]"
        >
          {whatsappChannel ? (
            <div className="space-y-4">
              <ChannelStatusCard channel={whatsappChannel} />
              <div className="rounded-xl border border-[#25D366]/25 bg-[#25D366]/[0.06] p-3.5">
                <p className="text-[11px] font-semibold text-[#a7f3d0]">Twilio webhooks (automated)</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                  Provisioning sets inbound + status URLs on your Twilio number via API. Run sync again
                  after changing <span className="font-mono">TWILIO_WEBHOOK_BASE_URL</span> or if
                  messages are not hitting the app. Meta/WhatsApp sender approval is still required for
                  live WhatsApp.
                </p>
                {whatsappChannel.webhook_url && (
                  <p className="mt-2 break-all font-mono text-[9px] text-white/30">
                    Stored: {whatsappChannel.webhook_url}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void syncTwilioWebhooks()}
                  disabled={syncWebhookBusy || !whatsappChannel.phone_number_sid}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#25D366]/35 bg-[#25D366]/15 px-3 py-2 text-[11px] font-semibold text-[#86efac] transition-colors hover:bg-[#25D366]/22 disabled:opacity-40"
                >
                  {syncWebhookBusy ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowClockwise className="size-3.5" />
                  )}
                  Sync webhooks to Twilio
                </button>
                {syncWebhookMessage && (
                  <p className="mt-2 text-[10px] leading-relaxed text-white/50">{syncWebhookMessage}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl border border-[#25D366]/25 bg-[#25D366]/[0.07] shadow-[0_0_40px_-12px_rgba(37,211,102,0.45)]">
                <WhatsappLogo className="size-9 text-[#25D366]" weight="fill" />
              </div>
              <p className="mb-1 text-sm font-medium text-white/80">No WhatsApp sender yet</p>
              <p className="mb-5 max-w-xs text-xs leading-relaxed text-white/35">
                Search for a practice number. Provisioning creates the Twilio asset and seeds hours &
                FAQs.
              </p>
              {!hasChannels && (
                <button
                  type="button"
                  onClick={searchNumbers}
                  disabled={searchingNumbers}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#25D366]/35 bg-[#25D366]/12 px-5 py-2.5 text-xs font-semibold text-[#86efac] transition-colors hover:border-[#25D366]/50 hover:bg-[#25D366]/18 disabled:opacity-50"
                >
                  {searchingNumbers ? (
                    <CircleNotch className="size-4 animate-spin" />
                  ) : (
                    <Plugs className="size-4" />
                  )}
                  Find a number
                </button>
              )}
            </div>
          )}
        </BentoTile>

        <BentoTile
          title="Voice — Vapi"
          icon={<Phone className="size-4 text-violet-400" weight="fill" />}
          subtitle="Inbound assistant + outbound API"
          glow={voiceReady ? "blue" : undefined}
          className="min-h-[280px]"
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  <PhoneIncoming className="size-3.5 text-sky-400" weight="bold" />
                  Inbound
                </div>
                <p className="text-xs leading-relaxed text-white/45">
                  Callers hit your Vapi number → events POST to your server URL. The assistant is
                  cloned at provision time and tied to this practice.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  <PhoneOutgoing className="size-3.5 text-violet-400" weight="bold" />
                  Outbound
                </div>
                <p className="text-xs leading-relaxed text-white/45">
                  Server route <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10px]">/api/comms/voice/outbound</code>{" "}
                  starts calls via Vapi when assistant + phone IDs are stored.
                </p>
              </div>
            </div>

            {voiceChannel ? (
              <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white/70">Voice channel</span>
                  {voiceReady ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <CheckCircle className="size-3" weight="fill" />
                      Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      <Warning className="size-3" weight="fill" />
                      Finish Vapi setup
                    </span>
                  )}
                </div>
                <p className="font-mono text-sm text-white/75">{voiceChannel.phone_number}</p>
                <dl className="grid gap-2 text-[11px]">
                  <div className="flex justify-between gap-2 border-t border-white/[0.06] pt-2">
                    <dt className="text-white/35">Assistant ID</dt>
                    <dd className="max-w-[65%] truncate font-mono text-white/55" title={voiceChannel.vapi_assistant_id || ""}>
                      {truncateId(voiceChannel.vapi_assistant_id)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/35">Phone number ID</dt>
                    <dd className="max-w-[65%] truncate font-mono text-white/55" title={voiceChannel.vapi_phone_number_id || ""}>
                      {truncateId(voiceChannel.vapi_phone_number_id)}
                    </dd>
                  </div>
                </dl>
                {!voiceReady && (
                  <p className="text-[10px] leading-relaxed text-amber-200/70">
                    Set <span className="font-mono">VAPI_PHONE_NUMBER_ID</span> on the server and ensure
                    the Vapi dashboard links this number to your assistant. Inbound server URL must match
                    the voice webhook below.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center">
                <p className="text-sm text-white/50">Voice channel not created yet</p>
                <p className="mt-2 text-xs leading-relaxed text-white/30">
                  Provision a WhatsApp number first. If <span className="font-mono">VAPI_API_KEY</span>{" "}
                  and <span className="font-mono">VAPI_DEFAULT_ASSISTANT_ID</span> are set, we clone an
                  assistant and open a voice channel automatically.
                </p>
              </div>
            )}

            <a
              href="https://dashboard.vapi.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-medium text-violet-300/90 transition-colors hover:text-violet-200"
            >
              Open Vapi dashboard
              <ArrowSquareOut className="size-3.5" />
            </a>
          </div>
        </BentoTile>
      </div>

      {/* Webhooks */}
      {webhookCfg && (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <LinkSimple className="size-5 text-sky-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Webhook URLs</h2>
                <p className="text-[11px] text-white/40">Paste into Twilio and Vapi · {webhookCfg.baseUrl}</p>
              </div>
            </div>
            <div className="flex rounded-lg bg-black/30 p-0.5">
              {(
                [
                  ["messaging", "WhatsApp / Twilio"],
                  ["voice", "Voice / Vapi"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWebhookTab(id)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                    webhookTab === id
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-white/40 hover:text-white/65"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {webhookTab === "messaging" ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-white/40">
                  Twilio Console → your WhatsApp sender or sandbox → HTTP POST webhooks.
                </p>
                <div className="space-y-2">
                  {(
                    [
                      ["Inbound (messages)", webhookCfg.urls.whatsappInbound],
                      ["Status (delivery)", webhookCfg.urls.whatsappStatus],
                    ] as const
                  ).map(([label, url]) => (
                    <UrlRow key={label} label={label} url={url} onCopy={() => void copyUrl(label, url)} copied={copiedKey === label} />
                  ))}
                </div>
                <ol className="list-decimal space-y-2 pl-4 text-[11px] leading-relaxed text-white/38">
                  {webhookCfg.twilioChecklist.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-white/40">
                  Vapi assistant <strong className="text-white/55">Server URL</strong> — inbound call
                  lifecycle (assistant-request, function-call, status, end-of-call).
                </p>
                <div className="space-y-2">
                  <UrlRow
                    label="Server URL (inbound voice)"
                    url={webhookCfg.urls.voiceInbound}
                    onCopy={() => void copyUrl("vapi", webhookCfg.urls.voiceInbound)}
                    copied={copiedKey === "vapi"}
                  />
                </div>
                {webhookCfg.vapiChecklist && webhookCfg.vapiChecklist.length > 0 && (
                  <ol className="list-decimal space-y-2 pl-4 text-[11px] leading-relaxed text-white/38">
                    {webhookCfg.vapiChecklist.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Number picker */}
      {availableNumbers.length > 0 && (
        <BentoTile title="Choose a number" subtitle="South Africa (+27) inventory" className="border-amber-500/15">
          <div className="space-y-2">
            {availableNumbers.map((n) => (
              <button
                key={n.phoneNumber}
                type="button"
                onClick={() => provisionNumber(n.phoneNumber)}
                disabled={provisioning}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
              >
                <div>
                  <p className="font-mono text-sm font-medium text-white/85">{n.phoneNumber}</p>
                  <p className="text-[11px] text-white/35">{n.friendlyName}</p>
                </div>
                {provisioning ? (
                  <CircleNotch className="size-4 animate-spin text-white/30" />
                ) : (
                  <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-400">
                    Use this number
                  </span>
                )}
              </button>
            ))}
          </div>
        </BentoTile>
      )}

      {/* Intelligent hours + FAQ ingest */}
      <PracticeKnowledgeIngest onApplied={fetchStatus} />

      {/* Hours + FAQ (current saved state) */}
      <div className="grid gap-5 md:grid-cols-2">
        <BentoTile
          title="Practice hours"
          icon={<CalendarBlank className="size-4 text-white/45" />}
          subtitle="Saved schedule · refine with the assistant above"
        >
          <HoursEditor hours={hours} onUpdate={fetchStatus} />
        </BentoTile>
        <BentoTile
          title="Practice FAQs"
          icon={<Question className="size-4 text-white/45" />}
          subtitle="Saved Q&A · replaced when you apply a new FAQ set from a document"
        >
          <FAQEditor faqs={faqs} onUpdate={fetchStatus} />
        </BentoTile>
      </div>
    </div>
  )
}

type KnowledgePreview = {
  hours: {
    day_of_week: number
    open_time: string
    close_time: string
    is_closed: boolean
  }[]
  faqs: {
    category: string
    question: string
    answer: string
    keywords: string[]
  }[]
  notes?: string
}

function PracticeKnowledgeIngest({ onApplied }: { onApplied: () => void }) {
  const [draft, setDraft] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<KnowledgePreview | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSubmit = draft.trim().length >= 15 || !!file

  const runRequest = async (apply: boolean) => {
    setError(null)
    setBanner(null)
    setBusy(true)
    try {
      let res: Response
      if (file) {
        const fd = new FormData()
        if (draft.trim()) fd.append("text", draft.trim())
        fd.append("file", file)
        fd.append("apply", apply ? "true" : "false")
        res = await fetch("/api/comms/practice-knowledge/ingest", {
          method: "POST",
          body: fd,
        })
      } else {
        res = await fetch("/api/comms/practice-knowledge/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: draft.trim(), apply }),
        })
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Request failed")
        return
      }

      if (!apply) {
        setPreview(data.preview as KnowledgePreview)
        setBanner("Review the extraction below, then save if it looks right.")
        return
      }

      const applied = data.applied as { hours?: boolean; faqs?: boolean } | undefined
      const parts: string[] = []
      if (applied?.hours) parts.push("hours updated")
      if (applied?.faqs) parts.push("FAQs replaced")
      setBanner(
        parts.length > 0
          ? `Saved: ${parts.join(" · ")}.`
          : "Nothing to apply — the model found no hours or FAQs in your text."
      )
      setPreview((data.preview as KnowledgePreview) || null)
      await onApplied()
    } finally {
      setBusy(false)
    }
  }

  return (
    <BentoTile
      title="Hours & FAQs — smart import"
      icon={<Sparkle className="size-4 text-amber-400" weight="fill" />}
      subtitle="Paste a blurb, upload a PDF/Word/text file, or both. We structure it for your AI agent."
      className="border-amber-500/10"
    >
      <div className="space-y-4">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setPreview(null)
          }}
          placeholder={`Examples:\n• "We're open Mon–Fri 8–5, Saturday 9–1, closed Sunday. Parking in Lot B."\n• Paste your website "About" or reception desk cheat sheet.\n• Upload a PDF or Word doc with hours and common patient questions.`}
          rows={6}
          className="w-full resize-y rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-white/85 placeholder:text-white/25 focus:border-amber-500/35 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.html,.htm,text/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setFile(f ?? null)
              setPreview(null)
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <UploadSimple className="size-4" />
            {file ? file.name : "Upload file"}
          </button>
          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null)
                if (fileRef.current) fileRef.current.value = ""
              }}
              className="text-xs text-white/40 underline-offset-2 hover:text-white/60 hover:underline"
            >
              Remove file
            </button>
          )}
          <span className="text-[10px] text-white/30">
            PDF, Word (.docx), text, CSV, HTML
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => void runRequest(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-40"
          >
            {busy ? <CircleNotch className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Preview extraction
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => void runRequest(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/28 disabled:opacity-40"
          >
            {busy ? <CircleNotch className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
            Save to practice
          </button>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200/90">
            {error}
          </p>
        )}
        {banner && !error && (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100/90">
            {banner}
          </p>
        )}

        {preview && (
          <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            {preview.notes && (
              <p className="text-[11px] italic text-white/45">Note: {preview.notes}</p>
            )}
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Extracted hours ({preview.hours.length})
              </p>
              {preview.hours.length === 0 ? (
                <p className="text-xs text-white/30">None detected — saved hours stay unchanged.</p>
              ) : (
                <ul className="space-y-1">
                  {preview.hours
                    .slice()
                    .sort((a, b) => a.day_of_week - b.day_of_week)
                    .map((h) => (
                      <li
                        key={h.day_of_week}
                        className="flex justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-xs text-white/65"
                      >
                        <span>{DAY_NAMES[h.day_of_week]}</span>
                        {h.is_closed ? (
                          <span className="text-white/35">Closed</span>
                        ) : (
                          <span className="font-mono text-white/55">
                            {h.open_time} — {h.close_time}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Extracted FAQs ({preview.faqs.length})
              </p>
              {preview.faqs.length === 0 ? (
                <p className="text-xs text-white/30">None detected — saved FAQs stay unchanged.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                  {preview.faqs.map((f, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-xs"
                    >
                      <span className="text-[9px] font-medium uppercase text-amber-200/50">
                        {f.category}
                      </span>
                      <p className="mt-0.5 font-medium text-white/75">{f.question}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/45">{f.answer}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[10px] leading-relaxed text-amber-200/40">
              Saving replaces <strong className="text-amber-200/60">all FAQs</strong> when any FAQs are
              found. Hours merge: days mentioned in your text update; other weekdays keep their previous
              values.
            </p>
          </div>
        )}
      </div>
    </BentoTile>
  )
}

function StatusChip({
  label,
  ok,
  pending,
  idle,
}: {
  label: string
  ok: boolean
  pending: boolean
  idle: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium",
        ok && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        !ok && pending && "border-amber-500/25 bg-amber-500/10 text-amber-200/90",
        !ok && !pending && idle && "border-white/10 bg-white/[0.04] text-white/35",
        !ok && !pending && !idle && "border-white/12 bg-white/[0.05] text-white/45"
      )}
    >
      {ok ? <CheckCircle className="size-3.5" weight="fill" /> : pending ? <Clock className="size-3.5" /> : null}
      {label}
      {idle && " — not connected"}
      {pending && !idle && " — action needed"}
      {ok && " — live"}
    </span>
  )
}

function UrlRow({
  label,
  url,
  onCopy,
  copied,
}: {
  label: string
  url: string
  onCopy: () => void
  copied: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">{label}</p>
        <p className="mt-1 break-all font-mono text-[11px] leading-snug text-white/60">{url}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/75"
        title="Copy"
      >
        <Copy className="size-4" />
      </button>
      {copied && <span className="sr-only">Copied</span>}
    </div>
  )
}

function ChannelStatusCard({ channel }: { channel: ChannelInfo }) {
  const statusMap: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    active: { icon: CheckCircle, color: "text-emerald-400", label: "Active" },
    pending_wa_approval: { icon: Clock, color: "text-amber-400", label: "Pending WhatsApp approval" },
    provisioning: { icon: CircleNotch, color: "text-blue-400", label: "Setting up…" },
    suspended: { icon: Warning, color: "text-red-400", label: "Suspended" },
  }

  const info = statusMap[channel.status] || statusMap.provisioning
  const StatusIcon = info.icon

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusIcon
          className={cn("size-4", info.color)}
          weight={channel.status === "provisioning" ? "regular" : "fill"}
        />
        <span className={cn("text-xs font-medium", info.color)}>{info.label}</span>
      </div>
      <p className="font-mono text-base text-white/75">{channel.phone_number}</p>
      <p className="text-[11px] text-white/30">
        Provider: <span className="capitalize text-white/45">{channel.provider}</span>
        {channel.channel_type === "whatsapp" && (
          <span className="text-white/25"> · Messages flow to Inbox</span>
        )}
      </p>
    </div>
  )
}

function HoursEditor({ hours }: { hours: HoursRow[]; onUpdate: () => void }) {
  if (hours.length === 0) {
    return (
      <p className="py-2 text-xs leading-relaxed text-white/30">
        Hours appear after you provision a number (defaults are seeded automatically).
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => {
        const h = hours.find((hr) => hr.day_of_week === day)
        return (
          <div
            key={day}
            className="flex items-center justify-between rounded-lg px-2 py-2 odd:bg-white/[0.02]"
          >
            <span className="w-24 text-xs text-white/50">{DAY_NAMES[day]}</span>
            {h?.is_closed ? (
              <span className="text-[11px] text-white/25">Closed</span>
            ) : h ? (
              <span className="font-mono text-xs text-white/45">
                {h.open_time} — {h.close_time}
              </span>
            ) : (
              <span className="text-[10px] text-white/20">Not set</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FAQEditor({ faqs }: { faqs: FAQRow[]; onUpdate: () => void }) {
  if (faqs.length === 0) {
    return (
      <p className="py-2 text-xs leading-relaxed text-white/30">
        FAQs are seeded when you provision your first channel.
      </p>
    )
  }

  return (
    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
      {faqs.map((faq) => (
        <div
          key={faq.id}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white/75">{faq.question}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/40">{faq.answer}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-medium capitalize text-white/35">
              {faq.category}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
