"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { BentoTile } from "./bento-tile"
import { TEMPLATE_TEST_DEFINITIONS, type TemplateTestKey } from "@/lib/comms/template-test-definitions"
import {
  DEFAULT_VOICE_TEST_SCENARIO_ID,
  VOICE_TEST_SCENARIOS,
  getVoiceTestScenario,
  type VoiceTestScenario,
} from "@/lib/comms/voice-test-scenarios"
import {
  PaperPlaneTilt,
  PhoneOutgoing,
  PhoneIncoming,
  CircleNotch,
  FloppyDisk,
  Copy,
  Check,
} from "@phosphor-icons/react"

const LS_MSG = "fleming.channelTest.messagingPhone"
const LS_VOICE = "fleming.channelTest.voicePhone"
const LS_SCENARIO = "fleming.channelTest.voiceScenario"

function buildInitialTplVars() {
  const o: Record<TemplateTestKey, Record<string, string>> = {} as Record<
    TemplateTestKey,
    Record<string, string>
  >
  for (const def of TEMPLATE_TEST_DEFINITIONS) {
    o[def.key] = { ...def.defaults }
  }
  return o
}

type ChannelTestLabProps = {
  messagingReady: boolean
  voiceReady: boolean
  /** E.164 practice line — dial this for inbound roleplay tests */
  voiceInboundNumber?: string | null
}

export function ChannelTestLab({
  messagingReady,
  voiceReady,
  voiceInboundNumber,
}: ChannelTestLabProps) {
  const [messagingPhone, setMessagingPhone] = useState("")
  const [voicePhone, setVoicePhone] = useState("")
  const [voiceScenarioId, setVoiceScenarioId] = useState(DEFAULT_VOICE_TEST_SCENARIO_ID)
  const [plainBody, setPlainBody] = useState("Test message from your practice (SMS/RCS).")
  const [tplVars, setTplVars] = useState(buildInitialTplVars)
  const [sendingPlain, setSendingPlain] = useState(false)
  const [sendingTpl, setSendingTpl] = useState<TemplateTestKey | null>(null)
  const [calling, setCalling] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [copiedInbound, setCopiedInbound] = useState(false)

  useEffect(() => {
    try {
      const m = localStorage.getItem(LS_MSG)
      const v = localStorage.getItem(LS_VOICE)
      const s = localStorage.getItem(LS_SCENARIO)
      if (m) setMessagingPhone(m)
      if (v) setVoicePhone(v)
      if (s && getVoiceTestScenario(s)) setVoiceScenarioId(s)
    } catch {
      /* ignore */
    }
  }, [])

  const activeScenario = useMemo((): VoiceTestScenario => {
    return getVoiceTestScenario(voiceScenarioId) ?? VOICE_TEST_SCENARIOS[0]!
  }, [voiceScenarioId])

  const persistMessaging = useCallback(() => {
    try {
      localStorage.setItem(LS_MSG, messagingPhone.trim())
    } catch {
      /* ignore */
    }
  }, [messagingPhone])

  const persistVoice = useCallback(() => {
    try {
      localStorage.setItem(LS_VOICE, voicePhone.trim())
    } catch {
      /* ignore */
    }
  }, [voicePhone])

  const persistScenario = useCallback(() => {
    try {
      localStorage.setItem(LS_SCENARIO, voiceScenarioId)
    } catch {
      /* ignore */
    }
  }, [voiceScenarioId])

  const showResult = useCallback((ok: boolean, text: string) => {
    setNotice({ kind: ok ? "ok" : "err", text })
    if (ok) {
      window.setTimeout(() => setNotice(null), 8000)
    }
  }, [])

  const copyInboundNumber = useCallback(async () => {
    const n = voiceInboundNumber?.trim()
    if (!n) return
    try {
      await navigator.clipboard.writeText(n)
      setCopiedInbound(true)
      window.setTimeout(() => setCopiedInbound(false), 2000)
    } catch {
      showResult(false, "Could not copy — select the number manually.")
    }
  }, [voiceInboundNumber, showResult])

  const sendPlain = useCallback(async () => {
    const to = messagingPhone.trim()
    if (!to) {
      showResult(false, "Enter a mobile number for messaging tests.")
      return
    }
    setSendingPlain(true)
    setNotice(null)
    try {
      const res = await fetch("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientPhone: to, message: plainBody.trim() || "Test" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showResult(false, typeof data.error === "string" ? data.error : "Send failed")
        return
      }
      showResult(true, `Sent · ${data.messageSid ?? "ok"}`)
      persistMessaging()
    } catch (e) {
      showResult(false, (e as Error).message)
    } finally {
      setSendingPlain(false)
    }
  }, [messagingPhone, plainBody, persistMessaging, showResult])

  const sendTemplate = useCallback(
    async (key: TemplateTestKey) => {
      const to = messagingPhone.trim()
      if (!to) {
        showResult(false, "Enter a mobile number for messaging tests.")
        return
      }
      setSendingTpl(key)
      setNotice(null)
      try {
        const variables = tplVars[key]
        const res = await fetch("/api/comms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientPhone: to,
            templateKey: key,
            variables,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showResult(false, typeof data.error === "string" ? data.error : "Send failed")
          return
        }
        showResult(true, `Template sent · ${data.messageSid ?? "ok"}`)
        persistMessaging()
      } catch (e) {
        showResult(false, (e as Error).message)
      } finally {
        setSendingTpl(null)
      }
    },
    [messagingPhone, tplVars, persistMessaging, showResult]
  )

  const placeTestCall = useCallback(async () => {
    const to = voicePhone.trim()
    if (!to) {
      showResult(false, "Enter a number for the AI voice test call.")
      return
    }
    setCalling(true)
    setNotice(null)
    try {
      const res = await fetch("/api/comms/voice/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientPhone: to,
          scenarioId: voiceScenarioId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showResult(false, typeof data.error === "string" ? data.error : "Call failed")
        return
      }
      const mode =
        activeScenario.outboundFirstMessageMode === "assistant-waits-for-user"
          ? "The assistant will wait for you to speak first — follow the roleplay lines."
          : "The assistant will greet you first — then follow the roleplay lines."
      showResult(
        true,
        `Outbound started · ${data.callId ?? "?"} · thread ${data.threadId ?? "?"} — ${mode} Check Comms Inbox for the thread.`
      )
      persistVoice()
      persistScenario()
    } catch (e) {
      showResult(false, (e as Error).message)
    } finally {
      setCalling(false)
    }
  }, [
    voicePhone,
    voiceScenarioId,
    activeScenario.outboundFirstMessageMode,
    persistVoice,
    persistScenario,
    showResult,
  ])

  const tplFieldUpdater = useCallback((key: TemplateTestKey, idx: string, value: string) => {
    setTplVars((prev) => ({
      ...prev,
      [key]: { ...prev[key], [idx]: value },
    }))
  }, [])

  const resetTemplates = useCallback(() => {
    setTplVars(buildInitialTplVars())
  }, [])

  const canShow = messagingReady || voiceReady
  const gridClass = useMemo(
    () =>
      cn(
        "grid gap-6",
        messagingReady && voiceReady ? "lg:grid-cols-2" : "grid-cols-1"
      ),
    [messagingReady, voiceReady]
  )

  if (!canShow) return null

  return (
    <BentoTile
      title="Channel tests"
      icon={<PaperPlaneTilt className="size-4 text-cyan-400" weight="fill" />}
      subtitle="SMS/RCS samples, outbound AI callbacks, and inbound call roleplay — numbers saved in this browser"
      className="border-cyan-500/10"
    >
      <div className="space-y-4">
        {notice && (
          <p
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              notice.kind === "ok"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100/90"
                : "border-red-500/25 bg-red-500/10 text-red-200/90"
            )}
          >
            {notice.text}
          </p>
        )}

        <div className={gridClass}>
          {messagingReady && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-white/50">
                  Test number (SMS / RCS)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+27… or local 0…"
                    value={messagingPhone}
                    onChange={(e) => setMessagingPhone(e.target.value)}
                    onBlur={persistMessaging}
                    className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2 text-sm text-white/85 placeholder:text-white/25 focus:border-cyan-500/35 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
                  />
                  <button
                    type="button"
                    onClick={persistMessaging}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[10px] font-medium text-white/50 hover:bg-white/[0.05]"
                  >
                    <FloppyDisk className="size-3.5" />
                    Save
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-white/30">
                  Two-way SMS: patients reply to this same practice number; messages land in Inbox. For South Africa,
                  use a Twilio number with <span className="text-white/45">+27</span> inventory (purchase or port in
                  Twilio). Messaging Service / Content SIDs are optional for rich routing.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  Plain text
                </p>
                <textarea
                  value={plainBody}
                  onChange={(e) => setPlainBody(e.target.value)}
                  rows={2}
                  className="mb-2 w-full resize-y rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-xs text-white/80 placeholder:text-white/25"
                />
                <button
                  type="button"
                  disabled={sendingPlain}
                  onClick={() => void sendPlain()}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/28 disabled:opacity-50"
                >
                  {sendingPlain ? <CircleNotch className="size-4 animate-spin" /> : <PaperPlaneTilt className="size-4" />}
                  Send plain text
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                    Built-in templates
                  </p>
                  <button
                    type="button"
                    onClick={resetTemplates}
                    className="text-[10px] text-white/35 underline-offset-2 hover:text-white/55 hover:underline"
                  >
                    Reset sample text
                  </button>
                </div>
                <ul className="max-h-[min(520px,55vh)] space-y-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                  {TEMPLATE_TEST_DEFINITIONS.map((def) => {
                    const busy = sendingTpl === def.key
                    const keys = Object.keys(def.defaults).sort(
                      (a, b) => Number(a) - Number(b)
                    )
                    return (
                      <li
                        key={def.key}
                        className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5"
                      >
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-white/80">{def.title}</p>
                            <p className="text-[10px] text-white/35">{def.description}</p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void sendTemplate(def.key)}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/12 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                          >
                            {busy ? (
                              <CircleNotch className="size-3.5 animate-spin" />
                            ) : (
                              <PaperPlaneTilt className="size-3.5" weight="fill" />
                            )}
                            Send
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {keys.map((idx, i) => (
                            <label key={idx} className="block min-w-0">
                              <span className="mb-0.5 block text-[9px] font-medium uppercase tracking-wide text-white/30">
                                {def.fieldLabels[i] ?? `Field ${idx}`}
                              </span>
                              <input
                                type="text"
                                value={tplVars[def.key]?.[idx] ?? ""}
                                onChange={(e) => tplFieldUpdater(def.key, idx, e.target.value)}
                                className="w-full rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1.5 text-[11px] text-white/80"
                              />
                            </label>
                          ))}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}

          {voiceReady && (
            <div className="space-y-4 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-white/50">
                  Scenario
                </label>
                <select
                  value={voiceScenarioId}
                  onChange={(e) => {
                    setVoiceScenarioId(e.target.value)
                    try {
                      localStorage.setItem(LS_SCENARIO, e.target.value)
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="w-full rounded-xl border border-white/[0.1] bg-black/35 px-3 py-2.5 text-sm text-white/90 focus:border-violet-500/35 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                >
                  {VOICE_TEST_SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortLabel} — {s.title}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] leading-relaxed text-white/45">{activeScenario.description}</p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">
                  <PhoneIncoming className="size-3.5" weight="fill" />
                  Inbound — you dial the practice
                </p>
                {voiceInboundNumber ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-white/85">{voiceInboundNumber}</span>
                    <button
                      type="button"
                      onClick={() => void copyInboundNumber()}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-2 py-1 text-[10px] font-medium text-white/55 hover:bg-white/[0.06]"
                    >
                      {copiedInbound ? (
                        <Check className="size-3.5 text-emerald-400" weight="bold" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedInbound ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-200/70">
                    Practice line not loaded — refresh Channels or finish voice provisioning to see your inbound number.
                  </p>
                )}
                <p className="mt-2 text-[10px] text-white/35">
                  From your mobile, call this number and follow the roleplay steps below. Same scenario as outbound —
                  use it to compare behaviour when you initiate the call vs when the AI calls you.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">
                  <PhoneOutgoing className="size-3.5" weight="fill" />
                  Outbound — AI calls your test handset
                </p>
                <label className="mb-1.5 block text-[11px] font-medium text-white/50">
                  Your mobile (rings for this test)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+27…"
                    value={voicePhone}
                    onChange={(e) => setVoicePhone(e.target.value)}
                    onBlur={persistVoice}
                    className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/25 px-3 py-2 text-sm text-white/85 placeholder:text-white/25 focus:border-violet-500/35 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                  />
                  <button
                    type="button"
                    onClick={persistVoice}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[10px] font-medium text-white/50 hover:bg-white/[0.05]"
                  >
                    <FloppyDisk className="size-3.5" />
                    Save
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-white/35">
                  Uses your practice Vapi assistant + Twilio caller ID. E.164 or local 082… — we normalize to +27.
                </p>
                <button
                  type="button"
                  disabled={calling}
                  onClick={() => void placeTestCall()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/25 disabled:opacity-50"
                >
                  {calling ? (
                    <CircleNotch className="size-5 animate-spin" />
                  ) : (
                    <PhoneOutgoing className="size-5" weight="fill" />
                  )}
                  Place outbound test call
                </button>
              </div>

              <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Roleplay — say this on the call
                </p>
                <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-white/70">
                  {activeScenario.roleplayLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
                {activeScenario.verifyHint && (
                  <p className="mt-3 border-t border-white/[0.06] pt-2 text-[10px] leading-relaxed text-white/35">
                    <span className="text-white/45">Verify:</span> {activeScenario.verifyHint}
                  </p>
                )}
                <p className="mt-2 text-[10px] text-white/30">
                  Outbound mode:{" "}
                  {activeScenario.outboundFirstMessageMode === "assistant-waits-for-user"
                    ? "assistant waits for you to speak first (good for cancel/reschedule drills)."
                    : "assistant greets first, then you respond."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Automated appointment SMS
          </p>
          <ul className="list-inside list-disc space-y-1 text-[10px] leading-relaxed text-white/40">
            <li>
              24h / 1h reminders run on the{" "}
              <span className="font-mono text-white/45">/api/cron/appointment-reminders</span> schedule (every 15 min in
              production). Requires <span className="text-white/50">CRON_SECRET</span> on the request in production.
            </li>
            <li>
              Appointments must be <span className="text-white/50">booked</span> or{" "}
              <span className="text-white/50">confirmed</span>, with a patient mobile on{" "}
              <span className="font-mono text-white/45">practice_patients.phone_e164</span> (or an existing SMS thread).
            </li>
            <li>Times use SAST (UTC+2) to match typical ZA appointment storage.</li>
          </ul>
        </div>
      </div>
    </BentoTile>
  )
}
