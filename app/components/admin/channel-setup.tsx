"use client"

import { cn } from "@/lib/utils"
import {
  ChatCircle,
  CheckCircle,
  CircleNotch,
  Clock,
  Warning,
  Plugs,
  Question,
  CalendarBlank,
  Phone,
  ArrowSquareOut,
  UploadSimple,
  Sparkle,
  FileText,
  ArrowClockwise,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { ChannelTestLab } from "./channel-test-lab"
import { useState, useEffect, useCallback, useRef } from "react"
import {
  getVoiceCapabilityState,
  isMessagingChannelLive,
  VOICE_PROVIDER_RECOMMENDATIONS,
} from "@/lib/comms/channel-capability"

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
  const [syncWebhookBusy, setSyncWebhookBusy] = useState(false)
  const [syncWebhookMessage, setSyncWebhookMessage] = useState<string | null>(null)
  const [vapiTwilioSyncBusy, setVapiTwilioSyncBusy] = useState(false)
  const [vapiTwilioSyncMessage, setVapiTwilioSyncMessage] = useState<string | null>(null)
  const [waSetupMode, setWaSetupMode] = useState<"new" | "existing">("new")
  const [ownedNumbers, setOwnedNumbers] = useState<
    { sid: string; phoneNumber: string; friendlyName: string }[]
  >([])
  const [loadingOwnedNumbers, setLoadingOwnedNumbers] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachingSid, setAttachingSid] = useState<string | null>(null)
  const [practiceDisplayName, setPracticeDisplayName] = useState("")
  const [selectedCountry, setSelectedCountry] = useState("ZA")
  const [requestingNumber, setRequestingNumber] = useState(false)
  const [numberRequested, setNumberRequested] = useState(false)
  const [searchedOnce, setSearchedOnce] = useState(false)
  const [voiceTechnicalOpen, setVoiceTechnicalOpen] = useState(false)
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

  const searchNumbers = useCallback(async () => {
    setSearchingNumbers(true)
    setAttachError(null)
    setNumberRequested(false)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", countryCode: selectedCountry }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setAvailableNumbers(data.numbers || [])
      } else {
        setAttachError(typeof data.error === "string" ? data.error : "Search failed")
      }
    } catch {
      setAttachError("Network error")
    } finally {
      setSearchingNumbers(false)
      setSearchedOnce(true)
    }
  }, [selectedCountry])

  const requestNumber = useCallback(async () => {
    setRequestingNumber(true)
    setAttachError(null)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_number", countryCode: selectedCountry }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setNumberRequested(true)
      } else {
        setAttachError(typeof data.error === "string" ? data.error : "Request failed")
      }
    } catch {
      setAttachError("Network error")
    } finally {
      setRequestingNumber(false)
    }
  }, [selectedCountry])

  const provisionNumber = useCallback(
    async (phoneNumber: string) => {
      setProvisioning(true)
      setAttachError(null)
      try {
        const res = await fetch("/api/comms/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "provision",
            phoneNumber,
            ...(practiceDisplayName.trim() ? { practiceDisplayName: practiceDisplayName.trim() } : {}),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setAvailableNumbers([])
          await fetchStatus()
        } else {
          setAttachError(typeof data.error === "string" ? data.error : "Provisioning failed")
        }
      } catch {
        setAttachError("Network error")
      } finally {
        setProvisioning(false)
      }
    },
    [fetchStatus, practiceDisplayName]
  )

  const loadOwnedTwilioNumbers = useCallback(async () => {
    setLoadingOwnedNumbers(true)
    setAttachError(null)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_owned_numbers" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAttachError(typeof data.error === "string" ? data.error : "Could not list numbers")
        setOwnedNumbers([])
        return
      }
      setOwnedNumbers(data.numbers || [])
    } catch {
      setAttachError("Network error")
      setOwnedNumbers([])
    } finally {
      setLoadingOwnedNumbers(false)
    }
  }, [])

  const attachExistingNumber = useCallback(
    async (incomingPhoneNumberSid: string) => {
      setAttachingSid(incomingPhoneNumberSid)
      setAttachError(null)
      try {
        const res = await fetch("/api/comms/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "attach_existing",
            incomingPhoneNumberSid,
            ...(practiceDisplayName.trim() ? { practiceDisplayName: practiceDisplayName.trim() } : {}),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setOwnedNumbers([])
          await fetchStatus()
        } else {
          setAttachError(typeof data.error === "string" ? data.error : "Could not link number")
        }
      } catch {
        setAttachError("Network error")
      } finally {
        setAttachingSid(null)
      }
    },
    [fetchStatus, practiceDisplayName]
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

  const syncVapiTwilioCredentials = useCallback(async () => {
    setVapiTwilioSyncBusy(true)
    setVapiTwilioSyncMessage(null)
    try {
      const res = await fetch("/api/comms/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_vapi_twilio" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setVapiTwilioSyncMessage(typeof data.error === "string" ? data.error : "Sync failed")
        return
      }
      setVapiTwilioSyncMessage(
        typeof data.message === "string" ? data.message : "Vapi Twilio credentials updated."
      )
      await fetchStatus()
    } catch {
      setVapiTwilioSyncMessage("Network error")
    } finally {
      setVapiTwilioSyncBusy(false)
    }
  }, [fetchStatus])

  const messagingChannel = channels.find((c) => c.channel_type === "rcs")
  const voiceChannel = channels.find((c) => c.channel_type === "voice")
  const voiceCapability = getVoiceCapabilityState(voiceChannel)
  const voiceReady = voiceCapability.isReady

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <CircleNotch className="size-7 animate-spin text-white/25" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Channels</h1>
          <p className="mt-0.5 text-sm text-white/40">Patient messaging (SMS / RCS) and AI voice on one line.</p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <StatusChip
            label="Messaging"
            ok={isMessagingChannelLive(messagingChannel)}
            pending={
              !!messagingChannel &&
              !isMessagingChannelLive(messagingChannel) &&
              (messagingChannel.status === "pending_waba" ||
                messagingChannel.status === "pending_wa_approval" ||
                messagingChannel.status === "registering_sender" ||
                messagingChannel.status === "provisioning")
            }
            registering={messagingChannel?.status === "registering_sender"}
            idle={!messagingChannel}
          />
          <StatusChip
            label="Voice"
            ok={voiceReady}
            pending={!!voiceChannel && !voiceReady}
            idle={!voiceChannel}
          />
        </div>
      </header>

      {/* Primary grid: messaging + voice */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
        <BentoTile
          title="Patient messaging"
          icon={<ChatCircle className="size-4 text-sky-400" weight="fill" />}
          subtitle="SMS & RCS via Twilio"
          glow={isMessagingChannelLive(messagingChannel) ? "green" : undefined}
          className="min-h-[280px]"
        >
          {messagingChannel ? (
            <div className="space-y-4">
              <ChannelStatusCard channel={messagingChannel} />
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-white/45">
                    Two-way SMS: replies to your Twilio number are delivered to Inbox (same thread as outbound).
                  </p>
                  <button
                    type="button"
                    onClick={() => void syncTwilioWebhooks()}
                    disabled={syncWebhookBusy || !messagingChannel.phone_number_sid}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:border-white/18 hover:bg-white/[0.07] hover:text-white/75 disabled:opacity-40"
                  >
                    {syncWebhookBusy ? (
                      <CircleNotch className="size-3 animate-spin" />
                    ) : (
                      <ArrowClockwise className="size-3" />
                    )}
                    Refresh connection
                  </button>
                </div>
                {syncWebhookMessage && (
                  <p className="text-[10px] text-white/45">{syncWebhookMessage}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col py-2">
              <div className="mb-4 flex size-14 shrink-0 items-center justify-center self-center rounded-2xl border border-sky-500/25 bg-sky-500/[0.07] shadow-[0_0_40px_-12px_rgba(14,165,233,0.35)]">
                <ChatCircle className="size-8 text-sky-400" weight="fill" />
              </div>
              <p className="mb-1 text-center text-sm font-medium text-white/80">Connect messaging</p>
              <p className="mb-4 text-center text-xs leading-relaxed text-white/35">
                Add a Twilio number or link one already in your project. SMS always works; RCS appears on supported
                handsets and carriers.
              </p>

              <div className="mb-4 flex rounded-xl bg-black/25 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setWaSetupMode("new")
                    setAttachError(null)
                  }}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors",
                    waSetupMode === "new"
                      ? "bg-sky-500/20 text-sky-200"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  New number
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWaSetupMode("existing")
                    setAttachError(null)
                  }}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors",
                    waSetupMode === "existing"
                      ? "bg-sky-500/20 text-sky-200"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  Existing in Twilio
                </button>
              </div>

              {attachError && (
                <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-200/90">
                  {attachError}
                </p>
              )}

              <div className="mb-4">
                <label className="mb-1.5 block text-[11px] font-medium text-white/50">
                  Sender display name
                </label>
                <input
                  type="text"
                  value={practiceDisplayName}
                  onChange={(e) => setPracticeDisplayName(e.target.value)}
                  placeholder="e.g. Dr Smith Family Practice"
                  className="w-full rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2 text-sm text-white/85 placeholder:text-white/25 focus:border-sky-500/35 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                />
                <p className="mt-1 text-[10px] text-white/30">
                  Shown on outbound SMS where the carrier supports a sender label; otherwise your practice name is used.
                </p>
              </div>

              {waSetupMode === "new" ? (
                <div className="space-y-4">
                  <p className="text-center text-xs leading-relaxed text-white/35">
                    Choose a country and search for a number to assign to this practice.
                  </p>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium text-white/50">
                      Country
                    </label>
                    <select
                      value={selectedCountry}
                      onChange={(e) => {
                        setSelectedCountry(e.target.value)
                        setAvailableNumbers([])
                        setNumberRequested(false)
                      }}
                      className="w-full rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2 text-sm text-white/85 focus:border-sky-500/35 focus:outline-none focus:ring-1 focus:ring-sky-500/20"
                    >
                      <option value="ZA">South Africa (+27)</option>
                      <option value="US">United States (+1)</option>
                      <option value="GB">United Kingdom (+44)</option>
                      <option value="AU">Australia (+61)</option>
                      <option value="CA">Canada (+1)</option>
                      <option value="DE">Germany (+49)</option>
                      <option value="NG">Nigeria (+234)</option>
                      <option value="KE">Kenya (+254)</option>
                      <option value="GH">Ghana (+233)</option>
                      <option value="IN">India (+91)</option>
                    </select>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={searchNumbers}
                      disabled={searchingNumbers}
                      className="inline-flex items-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/12 px-5 py-2.5 text-xs font-semibold text-sky-200 transition-colors hover:border-sky-400/50 hover:bg-sky-500/18 disabled:opacity-50"
                    >
                      {searchingNumbers ? (
                        <CircleNotch className="size-4 animate-spin" />
                      ) : (
                        <Plugs className="size-4" />
                      )}
                      Search available numbers
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-white/35">
                    The number must already be active in your Twilio project. Use &quot;New number&quot; to
                    purchase one through this app if needed.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadOwnedTwilioNumbers()}
                    disabled={loadingOwnedNumbers}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {loadingOwnedNumbers ? (
                      <CircleNotch className="size-4 animate-spin" />
                    ) : (
                      <Phone className="size-4 text-sky-400" weight="fill" />
                    )}
                    Load numbers from Twilio
                  </button>
                  {ownedNumbers.length > 0 && (
                    <ul className="max-h-48 space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                      {ownedNumbers.map((n) => (
                        <li key={n.sid}>
                          <button
                            type="button"
                            disabled={!!attachingSid}
                            onClick={() => void attachExistingNumber(n.sid)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-sky-500/30 hover:bg-sky-500/[0.06] disabled:opacity-50"
                          >
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-white/85">{n.phoneNumber}</p>
                              <p className="truncate text-[10px] text-white/35">{n.friendlyName}</p>
                            </div>
                            {attachingSid === n.sid ? (
                              <CircleNotch className="size-4 shrink-0 animate-spin text-white/40" />
                            ) : (
                              <span className="shrink-0 rounded-lg bg-sky-500/15 px-2 py-1 text-[10px] font-semibold text-sky-200">
                                Link to practice
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {ownedNumbers.length === 0 && !loadingOwnedNumbers && (
                    <p className="text-[10px] leading-relaxed text-white/25">
                      Load the list after numbers exist in Twilio. Use “New number” to buy one through this
                      app.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </BentoTile>

        <BentoTile
          title="Voice AI"
          icon={<Phone className="size-4 text-violet-400" weight="fill" />}
          subtitle="Calls on your practice line"
          glow={voiceReady ? "blue" : undefined}
          className="min-h-[280px]"
        >
          <div className="space-y-4">
            <p className="text-[11px] leading-relaxed text-white/45">
              One assistant answers inbound calls and can be used for outbound workflows. Setup is tied to your
              telephony stack; you can migrate providers without changing this screen.
            </p>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Faster paths to evaluate</p>
              <ul className="mt-2 space-y-2">
                {VOICE_PROVIDER_RECOMMENDATIONS.map((rec) => (
                  <li key={rec.id} className="rounded-lg border border-white/[0.05] bg-black/20 px-2.5 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-white/75">{rec.name}</span>
                      <a
                        href={rec.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-violet-300/90 hover:text-violet-200"
                      >
                        Docs
                        <ArrowSquareOut className="size-3" />
                      </a>
                    </div>
                    <p className="mt-1 text-[10px] text-white/38">{rec.fit}</p>
                    <p className="mt-1 text-[10px] leading-snug text-white/30">{rec.summary}</p>
                  </li>
                ))}
              </ul>
            </div>

            {voiceChannel ? (
              <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white/70">This practice</span>
                  {voiceReady ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <CheckCircle className="size-3" weight="fill" />
                      Voice ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      <Warning className="size-3" weight="fill" />
                      Finish setup
                    </span>
                  )}
                </div>
                <p className="font-mono text-sm text-white/75">{voiceChannel.phone_number}</p>
                <p className="text-[10px] text-white/40">
                  Connected stack:{" "}
                  <span className="text-white/60">{voiceCapability.connectedProviderLabel}</span>
                </p>
                {!voiceReady && (
                  <p className="text-[10px] leading-relaxed text-amber-200/70">
                    Complete provider linking so this number routes to your assistant. Use your provider dashboard or
                    support if technical refs stay empty after messaging is live.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setVoiceTechnicalOpen((o) => !o)}
                  className="text-[10px] font-medium text-violet-300/90 hover:text-violet-200"
                >
                  {voiceTechnicalOpen ? "Hide technical details" : "Technical details"}
                </button>
                {voiceTechnicalOpen && (
                  <dl className="grid gap-2 border-t border-white/[0.06] pt-3 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/35">Assistant ref.</dt>
                      <dd
                        className="max-w-[65%] truncate font-mono text-white/55"
                        title={voiceChannel.vapi_assistant_id || ""}
                      >
                        {truncateId(voiceChannel.vapi_assistant_id)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/35">Number ref.</dt>
                      <dd
                        className="max-w-[65%] truncate font-mono text-white/55"
                        title={voiceChannel.vapi_phone_number_id || ""}
                      >
                        {truncateId(voiceChannel.vapi_phone_number_id)}
                      </dd>
                    </div>
                  </dl>
                )}
                {voiceReady && voiceChannel.provider === "vapi" && (
                  <div className="space-y-2 border-t border-white/[0.06] pt-3">
                    <p className="text-[10px] leading-relaxed text-white/35">
                      If Twilio was rotated, sync credentials to the connected provider after updating{" "}
                      <span className="font-mono text-white/45">TWILIO_ACCOUNT_SID</span> /{" "}
                      <span className="font-mono text-white/45">TWILIO_AUTH_TOKEN</span> in deployment.
                    </p>
                    <button
                      type="button"
                      onClick={() => void syncVapiTwilioCredentials()}
                      disabled={vapiTwilioSyncBusy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-semibold text-violet-100 transition-colors hover:bg-violet-500/18 disabled:opacity-50 sm:w-auto"
                    >
                      {vapiTwilioSyncBusy ? (
                        <CircleNotch className="size-3.5 animate-spin" />
                      ) : (
                        <ArrowClockwise className="size-3.5" />
                      )}
                      Sync Twilio credentials
                    </button>
                    {vapiTwilioSyncMessage && (
                      <p className="text-[10px] text-white/45">{vapiTwilioSyncMessage}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center">
                <p className="text-sm text-white/55">Voice AI</p>
                <p className="mt-2 text-xs leading-relaxed text-white/35">
                  {isMessagingChannelLive(messagingChannel)
                    ? "Provision voice from Channels (API) or add a voice row for this practice. Patient messaging is already live on this line."
                    : "Connect patient messaging first. Voice uses the same practice line once Twilio is linked."}
                </p>
              </div>
            )}

            {voiceChannel?.provider === "vapi" && (
              <a
                href="https://dashboard.vapi.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-medium text-violet-300/90 transition-colors hover:text-violet-200"
              >
                Open current provider (Vapi)
                <ArrowSquareOut className="size-3.5" />
              </a>
            )}
          </div>
        </BentoTile>
      </div>

      <ChannelTestLab
        messagingReady={isMessagingChannelLive(messagingChannel)}
        voiceReady={voiceReady}
        voiceInboundNumber={voiceChannel?.phone_number?.trim() || null}
      />

      {/* Number picker or request flow */}
      {(availableNumbers.length > 0 || (searchingNumbers === false && availableNumbers.length === 0 && !messagingChannel && searchedOnce)) && (
        <BentoTile
          title={availableNumbers.length > 0 ? "Choose a number" : "No numbers available"}
          subtitle={availableNumbers.length > 0 ? `${selectedCountry} inventory` : `No inventory for ${selectedCountry}`}
          className="border-amber-500/15"
        >
          {availableNumbers.length > 0 ? (
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
          ) : numberRequested ? (
            <div className="py-6 text-center">
              <CheckCircle className="mx-auto mb-2 size-8 text-emerald-400" weight="fill" />
              <p className="text-sm font-medium text-white/75">Number requested</p>
              <p className="mt-1 text-xs text-white/40">
                We&apos;ll assign a {selectedCountry} number to your practice and notify you when it&apos;s
                ready.
              </p>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-white/50">
                No phone numbers are currently available for {selectedCountry} in our Twilio inventory.
              </p>
              <p className="mt-2 text-xs text-white/35">
                Request a number and we&apos;ll provision one for your practice.
              </p>
              <button
                type="button"
                onClick={() => void requestNumber()}
                disabled={requestingNumber}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/12 px-5 py-2.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
              >
                {requestingNumber ? (
                  <CircleNotch className="size-4 animate-spin" />
                ) : (
                  <Phone className="size-4" weight="fill" />
                )}
                Request a {selectedCountry} number
              </button>
            </div>
          )}
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
  registering,
  idle,
}: {
  label: string
  ok: boolean
  pending: boolean
  registering?: boolean
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
      {ok ? (
        <CheckCircle className="size-3.5" weight="fill" />
      ) : registering ? (
        <CircleNotch className="size-3.5 animate-spin" />
      ) : pending ? (
        <Clock className="size-3.5" />
      ) : null}
      {label}
      {idle && " — not connected"}
      {registering && " — connecting messaging"}
      {pending && !registering && !idle && " — action needed"}
      {ok && " — live"}
    </span>
  )
}

function ChannelStatusCard({ channel }: { channel: ChannelInfo }) {
  const statusMap: Record<string, { icon: typeof CheckCircle; color: string; label: string; spin?: boolean }> = {
    active: { icon: CheckCircle, color: "text-emerald-400", label: "Active" },
    registering_sender: { icon: CircleNotch, color: "text-sky-400", label: "Provisioning messaging…", spin: true },
    pending_waba: { icon: Clock, color: "text-amber-400", label: "Finish setup (legacy status)" },
    pending_wa_approval: { icon: Clock, color: "text-amber-400", label: "Awaiting carrier (legacy status)" },
    provisioning: { icon: CircleNotch, color: "text-blue-400", label: "Setting up…", spin: true },
    suspended: { icon: Warning, color: "text-red-400", label: "Suspended" },
  }

  const live = isMessagingChannelLive(channel)
  const info = live
    ? statusMap.active
    : statusMap[channel.status] || statusMap.provisioning
  const StatusIcon = info.icon

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <StatusIcon
          className={cn("size-4", info.color, info.spin && "animate-spin")}
          weight={info.spin ? "regular" : "fill"}
        />
        <span className={cn("text-xs font-medium", info.color)}>{info.label}</span>
      </div>
      <p className="font-mono text-base text-white/75">{channel.phone_number}</p>
      <p className="text-[11px] text-white/30">
        Provider: <span className="capitalize text-white/45">{channel.provider}</span>
        {channel.channel_type === "rcs" && (
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
