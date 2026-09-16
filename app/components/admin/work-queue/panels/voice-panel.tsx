"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { invoiceDueCents, invoiceNeedsCollection } from "@/lib/admin/front-desk-invoice"
import { fetchClient } from "@/lib/fetch"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelSecondaryButton,
  PanelSectionLabel,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { CircleNotch, CurrencyDollar, PaperPlaneTilt, Phone, PhoneOutgoing } from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

type VoiceCallRow = {
  id: string
  transcript: string | null
  summary: string | null
  durationSeconds: number | null
  recordingUrl: string | null
  intent: string | null
  structuredOutcome: unknown
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

export function VoicePanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "message" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const refreshThreads = useWorkQueueStore((s) => s.refreshThreads)
  const setSmsComposeOpen = useWorkQueueStore((s) => s.setSmsComposeOpen)
  const invoices = useWorkQueueStore((s) => s.invoices)

  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [followUp, setFollowUp] = useState("")

  const phone = payload?.externalParty ?? ""
  const latestCall = voiceCalls[0] ?? null

  const openInvoice = useMemo(() => {
    if (!item.patientId) return null
    return invoices.find((inv) => inv.patient_id === item.patientId && invoiceNeedsCollection(inv)) ?? null
  }, [invoices, item.patientId])

  const loadVoice = useCallback(async () => {
    if (!payload?.threadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comms/threads/${payload.threadId}/messages`)
      if (res.ok) {
        const data = (await res.json()) as { voiceCalls?: VoiceCallRow[] }
        setVoiceCalls(data.voiceCalls ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [payload?.threadId])

  useEffect(() => {
    void loadVoice()
  }, [loadVoice])

  useEffect(() => {
    if (latestCall?.summary && !followUp.trim()) {
      setFollowUp(`Hi${item.patientName ? ` ${item.patientName.split(" ")[0]}` : ""}, following up on our call. ${latestCall.summary.slice(0, 200)}`)
    }
  }, [latestCall?.summary, item.patientName, followUp])

  const sendFollowUpSms = async () => {
    const body = followUp.trim()
    if (!body || !phone) return
    try {
      const res = await fetchClient("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: payload?.threadId, message: body }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send SMS")
        return
      }
      toast.success("Follow-up SMS sent")
      resolveItem(item.id)
      incrementAiResolved()
      await refreshThreads()
    } catch {
      toast.error("Could not send SMS")
    }
  }

  const sendPaymentLink = async () => {
    if (!openInvoice) {
      toast.error("No open invoice for this patient")
      return
    }
    setSendingLink(true)
    try {
      const res = await fetchClient(`/api/billing/invoices/${openInvoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["sms"], issueFirst: openInvoice.status === "draft" }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send payment link")
        return
      }
      toast.success("Payment link sent by SMS")
      resolveItem(item.id)
      incrementAiResolved()
    } finally {
      setSendingLink(false)
    }
  }

  const placeOutboundCall = async () => {
    if (!phone.trim()) return
    setCalling(true)
    try {
      const res = await fetchClient("/api/comms/voice/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientPhone: phone, purpose: "staff_callback" }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not place call")
        return
      }
      toast.success("Outbound call started")
      await refreshThreads()
      await loadVoice()
    } finally {
      setCalling(false)
    }
  }

  const outcome = latestCall?.structuredOutcome as { type?: string; label?: string } | null

  return (
    <PanelShell>
      <PanelHeader
        icon={<Phone className="size-4 text-sky-400" weight="fill" />}
        title={item.patientName ?? phone}
        subtitle={phone}
        meta={`Voice thread${latestCall?.durationSeconds ? ` · ${formatDuration(latestCall.durationSeconds)}` : ""}`}
      />

      <PanelBody>
        {loading ? (
          <div className="flex justify-center py-8">
            <CircleNotch className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {latestCall?.summary && (
              <section>
                <PanelSectionLabel>Call summary</PanelSectionLabel>
                <p className="mt-2 text-[11px] leading-relaxed text-foreground/85">{latestCall.summary}</p>
              </section>
            )}

            {latestCall?.transcript && (
              <section>
                <PanelSectionLabel>Transcript</PanelSectionLabel>
                <pre className="mt-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-panel-border bg-panel-muted/30 p-3 font-sans text-[11px] leading-relaxed text-foreground/80">
                  {latestCall.transcript}
                </pre>
              </section>
            )}

            {latestCall?.recordingUrl && (
              <section>
                <PanelSectionLabel>Recording</PanelSectionLabel>
                <audio controls className="mt-2 w-full" src={latestCall.recordingUrl} preload="none">
                  <track kind="captions" />
                </audio>
              </section>
            )}

            {(latestCall?.intent || outcome?.label) && (
              <section>
                <PanelSectionLabel>Outcome</PanelSectionLabel>
                <p className="mt-2 text-[11px] text-foreground/85">
                  {outcome?.label ?? latestCall?.intent ?? "—"}
                </p>
              </section>
            )}

            {!latestCall?.summary && !latestCall?.transcript && (
              <PanelHint>No transcript yet — call may still be in progress or recording unavailable.</PanelHint>
            )}

            {openInvoice && (
              <p className="text-[10px] text-muted-foreground">
                Outstanding balance: R{(invoiceDueCents(openInvoice) / 100).toFixed(2)}
              </p>
            )}
          </>
        )}

        <section>
          <PanelSectionLabel>SMS follow-up</PanelSectionLabel>
          <textarea
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            rows={3}
            placeholder="Write a follow-up SMS…"
            className="mt-2 w-full resize-none rounded-xl border border-panel-border bg-panel-muted/30 px-3 py-2.5 text-[11px] leading-relaxed outline-none focus:ring-1 focus:ring-sky-400/40"
          />
        </section>
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton disabled={!followUp.trim()} onClick={() => void sendFollowUpSms()}>
          <PaperPlaneTilt className="size-3.5" weight="fill" />
          Send follow-up SMS
        </PanelPrimaryButton>

        {openInvoice && (
          <PanelSecondaryButton disabled={sendingLink} onClick={() => void sendPaymentLink()}>
            {sendingLink ? <CircleNotch className="size-3.5 animate-spin" /> : <CurrencyDollar className="size-3.5" />}
            Send payment link
          </PanelSecondaryButton>
        )}

        <PanelSecondaryButton disabled={calling || !phone} onClick={() => void placeOutboundCall()}>
          {calling ? <CircleNotch className="size-3.5 animate-spin" /> : <PhoneOutgoing className="size-3.5" />}
          Call patient
        </PanelSecondaryButton>

        <PanelSecondaryButton
          onClick={() =>
            setSmsComposeOpen(true, {
              patientId: item.patientId,
              phone,
              message: followUp,
            })
          }
        >
          Open in compose modal
        </PanelSecondaryButton>

        <PanelGhostButton onClick={() => resolveItem(item.id)}>Mark handled</PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}
