"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import type { CommsMessageRow } from "@/lib/admin/work-queue-types"
import { tierLabel } from "@/lib/admin/automation-tiers"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { openPatientFromAdmin, useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { usePatientOverview } from "@/lib/patient/use-patient-overview"
import { cn } from "@/lib/utils"
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
import { invoiceDueCents, invoiceNeedsCollection } from "@/lib/admin/front-desk-invoice"
import { ChatText, CircleNotch, EnvelopeSimple, PaperPlaneTilt, Robot } from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

function formatVisitDate(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" })
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function senderLabel(m: CommsMessageRow): string {
  if (m.direction === "inbound") return "Patient"
  if (m.senderType === "agent") return "Fleming (draft)"
  if (m.senderType === "staff") return "You"
  return "System"
}

export function MessagePanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "message" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const refreshThreads = useWorkQueueStore((s) => s.refreshThreads)
  const setSmsComposeOpen = useWorkQueueStore((s) => s.setSmsComposeOpen)
  const invoices = useWorkQueueStore((s) => s.invoices)
  const patients = useWorkspaceStore((s) => s.patients)
  const claims = useWorkspaceStore((s) => s.claims)
  const { practiceId, dekKey } = usePracticeCrypto()

  const channel = payload?.channel ?? "rcs"
  const isEmail = channel === "email"
  const isSms = channel === "sms" || channel === "rcs"

  const [messages, setMessages] = useState<CommsMessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [sending, setSending] = useState(false)
  const [seededDraft, setSeededDraft] = useState(false)

  const patient = useMemo(
    () => (item.patientId ? patients.find((p) => p.id === item.patientId) : undefined),
    [item.patientId, patients]
  )
  const overviewQuery = usePatientOverview(item.patientId ?? null)
  const overview = overviewQuery.data ?? null

  const openClaims = useMemo(
    () =>
      item.patientId
        ? claims.filter((c) => c.patientId === item.patientId && ["draft", "submitted", "partial"].includes(c.status))
        : [],
    [claims, item.patientId]
  )

  const openInvoices = useMemo(
    () =>
      item.patientId
        ? invoices.filter((inv) => inv.patient_id === item.patientId && invoiceNeedsCollection(inv))
        : [],
    [invoices, item.patientId]
  )

  const loadMessages = useCallback(async () => {
    if (!payload?.threadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comms/threads/${payload.threadId}/messages`)
      if (res.ok) {
        const data = (await res.json()) as { messages?: CommsMessageRow[] }
        setMessages(data.messages ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [payload?.threadId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  const agentDraft = useMemo(() => {
    return (
      [...messages]
        .reverse()
        .find((m) => m.direction === "outbound" && m.senderType === "agent" && m.body?.trim())?.body ?? ""
    )
  }, [messages])

  // Pre-fill composer once from Fleming draft; staff can edit freely after
  useEffect(() => {
    if (seededDraft || !agentDraft.trim()) return
    setReply(agentDraft)
    setSeededDraft(true)
  }, [agentDraft, seededDraft])

  useEffect(() => {
    if (!isEmail || emailSubject.trim()) return
    const name = item.patientName ?? patient?.name ?? "your enquiry"
    setEmailSubject(`Re: ${name}`)
  }, [isEmail, emailSubject, item.patientName, patient?.name])

  const handleSend = useCallback(async () => {
    const body = reply.trim()
    if (!payload?.threadId || !body || sending) return

    setSending(true)
    try {
      const res = await fetch("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: payload.threadId,
          message: body,
          variables: isEmail ? { subject: emailSubject.trim() || "Message from your practice" } : undefined,
        }),
      })

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(j.error ?? "Could not send message")
        return
      }

      toast.success(isEmail ? "Email sent" : "Message sent")
      setReply("")
      setSeededDraft(false)
      resolveItem(item.id)
      incrementAiResolved()
      await refreshThreads()
      await loadMessages()
    } catch {
      toast.error("Could not send message")
    } finally {
      setSending(false)
    }
  }, [
    reply,
    payload?.threadId,
    sending,
    isEmail,
    emailSubject,
    resolveItem,
    item.id,
    incrementAiResolved,
    refreshThreads,
    loadMessages,
  ])

  const sendLabel = isEmail ? "Send email" : isSms ? "Send SMS" : "Send reply"

  const aiSummary = useMemo(() => {
    if (agentDraft.trim()) {
      return isEmail
        ? "Fleming drafted an email reply below — edit if needed, then send."
        : "Fleming drafted an SMS reply below — edit if needed, then send."
    }
    if (payload?.status === "handoff") {
      return "Patient reached staff — type your reply in the box below and send."
    }
    return "Type your reply below to respond to this patient."
  }, [agentDraft, payload?.status, isEmail])

  const contactLine = isEmail
    ? payload?.externalParty ?? "Unknown email"
    : payload?.externalParty ?? "Unknown number"

  return (
    <PanelShell>
      <PanelHeader
        icon={
          isEmail ? (
            <EnvelopeSimple className="size-4 text-violet-400" weight="fill" />
          ) : (
            <ChatText className="size-4 text-blue-400" weight="fill" />
          )
        }
        title={item.patientName ?? contactLine}
        subtitle={contactLine}
        meta={`${isEmail ? "Email thread" : channel === "voice" ? "Voice follow-up" : "SMS / messaging"} · Reply here${
          item.automationTier != null ? ` · ${tierLabel(item.automationTier)}` : ""
        }`}
      />

      <PanelBody>
        <section>
          <PanelSectionLabel>Patient context</PanelSectionLabel>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-muted-foreground">Last visit</span>
              <p className="font-medium text-foreground/85">
                {formatVisitDate(patient?.lastVisit ?? overview?.encounterSummaries?.[0]?.created_at)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Medical aid</span>
              <p className="font-medium text-foreground/85">
                {patient?.medicalAidScheme ?? "—"} · {patient?.medicalAidStatus ?? "unknown"}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Open claims</span>
              <p className="font-medium text-foreground/85">
                {openClaims.length === 0 ? "none" : `${openClaims.length} draft`}
              </p>
            </div>
          </div>
        </section>

        {openInvoices.length > 0 && (
          <section>
            <PanelSectionLabel>Recent billing</PanelSectionLabel>
            <div className="mt-2 space-y-1">
              {openInvoices.slice(0, 3).map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-muted/30 px-2.5 py-1.5 text-[10px]"
                >
                  <span>{inv.invoice_number ?? "Invoice"} · {inv.status}</span>
                  <span className="tabular-nums font-medium">R{(invoiceDueCents(inv) / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <PanelSectionLabel>Conversation</PanelSectionLabel>
          {loading ? (
            <div className="flex justify-center py-6">
              <CircleNotch className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">No messages loaded yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {messages.map((m) => {
                const isPatient = m.direction === "inbound"
                const isAgentDraft = m.senderType === "agent"
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl border px-3 py-2",
                      isPatient
                        ? "border-panel-border bg-panel-muted/50"
                        : isAgentDraft
                          ? "border-blue-400/20 bg-blue-500/[0.08]"
                          : "border-panel-border bg-panel-muted/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] font-medium text-muted-foreground">{senderLabel(m)}</p>
                      <p className="text-[8px] tabular-nums text-muted-foreground/70">{formatMessageTime(m.createdAt)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/85">{m.body}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {agentDraft.trim() && !reply.trim() && (
          <button
            type="button"
            onClick={() => {
              setReply(agentDraft)
              setSeededDraft(true)
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-blue-400/25 bg-blue-500/[0.08] px-3 py-2 text-left text-[11px] text-blue-200"
          >
            <Robot className="size-3.5 shrink-0" weight="fill" />
            Use Fleming&apos;s draft reply
          </button>
        )}

        <PanelHint>{aiSummary}</PanelHint>
      </PanelBody>

      <PanelFooter>
        <PanelSectionLabel>Your reply</PanelSectionLabel>

        {isEmail && (
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Email subject"
            className="w-full rounded-lg border border-panel-border bg-panel-muted/40 px-3 py-2 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-violet-400/40"
          />
        )}

        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder={
            isEmail
              ? "Write your email reply to the patient…"
              : "Write your SMS reply to the patient…"
          }
          className="w-full resize-none rounded-xl border border-panel-border bg-panel-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-foreground outline-none focus:ring-1 focus:ring-blue-400/40"
        />

        <PanelPrimaryButton disabled={sending || !reply.trim()} onClick={() => void handleSend()}>
          {sending ? (
            <CircleNotch className="size-3.5 animate-spin" />
          ) : (
            <PaperPlaneTilt className="size-3.5" weight="fill" />
          )}
          {sending ? "Sending…" : sendLabel}
        </PanelPrimaryButton>

        {isSms && item.patientId && (
          <PanelSecondaryButton
            onClick={() =>
              setSmsComposeOpen(true, {
                patientId: item.patientId,
                phone: payload?.externalParty,
              })
            }
          >
            New message to this patient
          </PanelSecondaryButton>
        )}

        {item.patientId && (
          <PanelSecondaryButton
            onClick={() =>
              void openPatientFromAdmin({
                patientId: item.patientId!,
                patientName: item.patientName,
                practiceId,
                dekKey,
              })
            }
          >
            Open patient chart
          </PanelSecondaryButton>
        )}

        <PanelGhostButton onClick={() => resolveItem(item.id)}>Mark handled (no reply)</PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}
