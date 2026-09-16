"use client"

import { PAYMENT_PARTNERS } from "@/lib/billing/payment-partners"
import type { BillingAutomationSettings } from "@/lib/billing/automation-settings"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { ArrowSquareOut, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

type BillingSetupDialogProps = {
  open: boolean
  onClose: () => void
}

export function BillingSetupDialog({ open, onClose }: BillingSetupDialogProps) {
  const [settings, setSettings] = useState<BillingAutomationSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/automation-settings")
      const j = (await res.json()) as { settings?: BillingAutomationSettings; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setSettings(j.settings ?? null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/automation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSubmitClaims: settings.autoSubmitClaims,
          autoSendShortfallSms: settings.autoSendShortfallSms,
          autoAiVoiceCall: settings.autoAiVoiceCall,
          overdueSmsHours: settings.overdueSmsHours,
          overdueVoiceHours: settings.overdueVoiceHours,
          escalationHours: settings.escalationHours,
          defaultOpeningFloatCents: settings.defaultOpeningFloatCents,
          cashDrawerVarianceAlertCents: settings.cashDrawerVarianceAlertCents,
        }),
      })
      const j = (await res.json()) as { settings?: BillingAutomationSettings; error?: string }
      if (!res.ok) throw new Error(j.error || "Save failed")
      if (j.settings) setSettings(j.settings)
      setMessage("Saved")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const s = settings

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Billing setup"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-panel-border bg-popover shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
              <h2 className="text-[13px] font-semibold text-foreground/90">Billing setup</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/70"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: "thin" }}>
              {loading && <p className="text-[11px] text-muted-foreground/65">Loading…</p>}
              {message ? <p className="text-[11px] text-muted-foreground/70">{message}</p> : null}
              {s && (
                <>
                  <section className="space-y-3 rounded-xl border border-panel-border bg-panel-muted/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Automation</p>
                    <label className="flex items-center justify-between gap-2 text-[11px] text-foreground/75">
                      <span>Auto-send SMS when shortfall invoice is created</span>
                      <input
                        type="checkbox"
                        checked={s.autoSendShortfallSms}
                        onChange={(e) => setSettings({ ...s, autoSendShortfallSms: e.target.checked })}
                        className="size-4 rounded accent-amber-500"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-[11px] text-foreground/75">
                      <span>Allow AI voice follow-up (manual from queue)</span>
                      <input
                        type="checkbox"
                        checked={s.autoAiVoiceCall}
                        onChange={(e) => setSettings({ ...s, autoAiVoiceCall: e.target.checked })}
                        className="size-4 rounded accent-amber-500"
                      />
                    </label>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Voice calls use your configured Channels assistant. Escalation timers apply to future cron work.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label="SMS after (h)"
                        value={String(s.overdueSmsHours)}
                        onChange={(v) => setSettings({ ...s, overdueSmsHours: parseInt(v, 10) || 72 })}
                      />
                      <Field
                        label="Voice after (h)"
                        value={String(s.overdueVoiceHours)}
                        onChange={(v) => setSettings({ ...s, overdueVoiceHours: parseInt(v, 10) || 72 })}
                      />
                    </div>
                  </section>
                  <section className="space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Payment rails</p>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Connect credentials via environment or future per-practice vault. Dry-run modes work without keys.
                    </p>
                    <div className="space-y-2">
                      {PAYMENT_PARTNERS.slice(0, 10).map((p) => (
                        <PartnerRow key={p.id} partner={p} />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-panel-border px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground/75 hover:text-accent-foreground"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!s || saving}
                onClick={() => void save()}
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] tabular-nums outline-none focus:border-amber-500/30"
      />
    </label>
  )
}

function PartnerRow({ partner }: { partner: (typeof PAYMENT_PARTNERS)[number] }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-panel-border bg-panel-muted/50 px-2.5 py-2">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground/85">{partner.name}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase",
              partner.status === "integrated"
                ? "bg-secondary text-muted-foreground/75"
                : partner.status === "ready"
                  ? "bg-amber-500/15 text-amber-400/90"
                  : "bg-panel-muted text-muted-foreground"
            )}
          >
            {partner.status}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{partner.summary}</p>
      </div>
      <a
        href={partner.href}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/60"
        title="Documentation"
      >
        <ArrowSquareOut className="size-3.5" />
      </a>
    </div>
  )
}
