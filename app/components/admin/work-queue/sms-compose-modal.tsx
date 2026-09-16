"use client"

import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { invoiceDueCents, invoiceNeedsCollection } from "@/lib/admin/front-desk-invoice"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { overlayClassName } from "@/lib/theme/surfaces"
import { cn } from "@/lib/utils"
import { PanelPrimaryButton, PanelSecondaryButton } from "@/app/components/ui/panel-primitives"
import {
  CalendarCheck,
  CaretLeft,
  ChatText,
  CircleNotch,
  CurrencyDollar,
  FileText,
  MagnifyingGlass,
  PaperPlaneTilt,
  Phone,
  User,
  X,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

function smsSegments(text: string): number {
  const len = text.length
  if (len === 0) return 0
  if (len <= 160) return 1
  return Math.ceil(len / 153)
}

function patientInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return (parts[0]?.[0] ?? "?").toUpperCase()
}

type PatientPick = {
  id: string
  name: string
  phone?: string
  lastVisit?: string
  balanceCents: number
}

export function SmsComposeModal() {
  const open = useWorkQueueStore((s) => s.smsComposeOpen)
  const prefill = useWorkQueueStore((s) => s.smsComposePrefill)
  const setSmsComposeOpen = useWorkQueueStore((s) => s.setSmsComposeOpen)
  const refreshThreads = useWorkQueueStore((s) => s.refreshThreads)
  const invoices = useWorkQueueStore((s) => s.invoices)
  const patients = useWorkspaceStore((s) => s.patients)
  const appointments = useWorkspaceStore((s) => s.appointments)
  const { practiceId } = usePracticeCrypto()

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<PatientPick | null>(null)
  const [manualPhone, setManualPhone] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [enteredCompose, setEnteredCompose] = useState(false)

  const reset = useCallback(() => {
    setQuery("")
    setSelected(null)
    setManualPhone("")
    setMessage("")
    setBusyAction(null)
    setEnteredCompose(false)
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    if (prefill?.patientId) {
      const p = patients.find((x) => x.id === prefill.patientId)
      if (p) {
        const balanceCents = invoices
          .filter((inv) => inv.patient_id === p.id && invoiceNeedsCollection(inv))
          .reduce((sum, inv) => sum + invoiceDueCents(inv), 0)
        const phone = prefill.phone ?? p.phone ?? ""
        setSelected({
          id: p.id,
          name: p.name,
          phone,
          lastVisit: p.lastVisit,
          balanceCents,
        })
        setManualPhone(phone)
        setEnteredCompose(true)
      }
    } else if (prefill?.phone) {
      setManualPhone(prefill.phone)
      setEnteredCompose(true)
    }
    if (prefill?.message) setMessage(prefill.message)
  }, [open, prefill, patients, invoices, reset])

  const patientOptions = useMemo(() => {
    const qq = query.trim().toLowerCase()
    return patients
      .filter((p) => {
        if (!qq) return true
        return (
          p.name.toLowerCase().includes(qq) ||
          (p.phone ?? "").includes(qq) ||
          p.id.includes(qq)
        )
      })
      .slice(0, 10)
      .map((p) => {
        const balanceCents = invoices
          .filter((inv) => inv.patient_id === p.id && invoiceNeedsCollection(inv))
          .reduce((sum, inv) => sum + invoiceDueCents(inv), 0)
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          lastVisit: p.lastVisit,
          balanceCents,
        } satisfies PatientPick
      })
  }, [patients, query, invoices])

  const toPhone = manualPhone.trim() || selected?.phone?.trim() || ""
  const hasPhone = toPhone.length >= 9

  const openInvoices = useMemo(() => {
    if (!selected) return []
    return invoices.filter((inv) => inv.patient_id === selected.id && invoiceNeedsCollection(inv))
  }, [invoices, selected])

  const nextAppointment = useMemo(() => {
    if (!selected) return null
    const today = new Date().toISOString().slice(0, 10)
    return appointments
      .filter((a) => a.patientId === selected.id && a.date >= today)
      .filter((a) => !["cancelled", "no_show"].includes(a.status))
      .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0] ?? null
  }, [appointments, selected])

  const close = () => setSmsComposeOpen(false)

  const pickPatient = (p: PatientPick) => {
    setSelected(p)
    setManualPhone(p.phone ?? "")
    setEnteredCompose(true)
  }

  const sendSms = async () => {
    const body = message.trim()
    if (!body || !toPhone) {
      toast.error("Enter a message and recipient phone number")
      return
    }
    setSending(true)
    try {
      const res = await fetchClient("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientPhone: toPhone, message: body }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send SMS")
        return
      }
      toast.success("SMS sent")
      await refreshThreads()
      close()
    } finally {
      setSending(false)
    }
  }

  const sendPaymentLink = async () => {
    const inv = openInvoices[0]
    if (!inv) {
      toast.error("No open invoice for this patient")
      return
    }
    setBusyAction("payment")
    try {
      const res = await fetchClient(`/api/billing/invoices/${inv.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: ["sms"],
          issueFirst: inv.status === "draft",
          ...(toPhone ? { phoneE164: toPhone } : {}),
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send payment link")
        return
      }
      toast.success("Payment link sent by SMS")
      await refreshThreads()
      close()
    } finally {
      setBusyAction(null)
    }
  }

  const sendReminder = async () => {
    if (!nextAppointment) {
      toast.error("No upcoming appointment for this patient")
      return
    }
    setBusyAction("reminder")
    try {
      const res = await fetchClient(`/api/practice/appointments/${nextAppointment.id}/reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPhone ? { phoneE164: toPhone } : {}),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send reminder")
        return
      }
      toast.success("Appointment reminder sent")
      await refreshThreads()
      close()
    } finally {
      setBusyAction(null)
    }
  }

  const shareClinicalNote = async () => {
    if (!selected || !practiceId) {
      toast.error("Select a patient first")
      return
    }
    setBusyAction("share")
    try {
      const res = await fetchClient(
        `/api/clinical/patient-documents?patientId=${encodeURIComponent(selected.id)}&practiceId=${encodeURIComponent(practiceId)}`
      )
      if (!res.ok) {
        toast.error("Could not load patient documents")
        return
      }
      const j = (await res.json()) as { items?: { id: string; title: string; preview?: string }[] }
      const doc = j.items?.[0]
      if (!doc) {
        toast.error("No documents to share — paste content in the message field")
        return
      }
      const shareRes = await fetchClient("/api/clinical/share-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selected.id,
          channel: "sms",
          title: doc.title,
          content: (doc.preview ?? doc.title).slice(0, 1400),
        }),
      })
      const sj = (await shareRes.json().catch(() => ({}))) as { error?: string }
      if (!shareRes.ok) {
        toast.error(sj.error ?? "Could not share document")
        return
      }
      toast.success("Clinical note shared by SMS")
      await refreshThreads()
      close()
    } finally {
      setBusyAction(null)
    }
  }

  const step = enteredCompose || selected || prefill?.phone ? "compose" : "pick"

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 380 }}
            className={cn(
              "relative z-10 flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl",
              overlayClassName()
            )}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-panel-border px-5 py-4">
              {step === "compose" && !prefill?.patientId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null)
                    setManualPhone("")
                    setEnteredCompose(false)
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-panel-muted hover:text-foreground"
                >
                  <CaretLeft className="size-4" />
                </button>
              )}
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
                <ChatText className="size-4" weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">
                  {step === "pick" ? "New SMS" : "Compose message"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {step === "pick"
                    ? "Search and select a patient"
                    : selected?.name ?? "Enter recipient details"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-panel-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {step === "pick" ? (
                <div className="space-y-3 p-5">
                  <div className="relative">
                    <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="w-full rounded-xl border border-panel-border bg-panel-muted/30 py-2.5 pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-blue-400/25"
                      autoFocus
                    />
                  </div>

                  {patientOptions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-panel-border px-4 py-8 text-center">
                      <User className="mx-auto size-6 text-muted-foreground/40" />
                      <p className="mt-2 text-[12px] text-muted-foreground">No patients match your search</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {patientOptions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickPatient(p)}
                          className="flex w-full items-center gap-3 rounded-xl border border-panel-border bg-panel-muted/20 px-3 py-3 text-left transition-colors hover:border-panel-border hover:bg-panel-muted/50"
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold text-foreground">
                            {patientInitial(p.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">{p.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {p.phone ?? "No phone on file"}
                            </p>
                          </div>
                          {p.balanceCents > 0 && (
                            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-300">
                              R{(p.balanceCents / 100).toFixed(0)} due
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-panel-border pt-3">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Or send to a number
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={manualPhone}
                        onChange={(e) => setManualPhone(e.target.value)}
                        placeholder="+27 82 123 4567"
                        className="min-w-0 flex-1 rounded-xl border border-panel-border bg-panel-muted/30 px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-blue-400/25"
                      />
                      <button
                        type="button"
                        disabled={!hasPhone}
                        onClick={() => {
                          if (!hasPhone) return
                          setEnteredCompose(true)
                        }}
                        className="shrink-0 rounded-xl bg-foreground px-4 py-2 text-[12px] font-semibold text-background disabled:opacity-40"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-5">
                  {selected && (
                    <div className="flex items-center gap-3 rounded-xl border border-panel-border bg-panel-muted/25 px-4 py-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[12px] font-semibold">
                        {patientInitial(selected.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{selected.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {selected.balanceCents > 0
                            ? `R${(selected.balanceCents / 100).toFixed(2)} outstanding`
                            : "No balance due"}
                          {selected.lastVisit
                            ? ` · Last visit ${new Date(selected.lastVisit).toLocaleDateString([], { month: "short", day: "numeric" })}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null)
                          setManualPhone("")
                          setEnteredCompose(false)
                        }}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Phone className="size-3" />
                      Mobile number
                    </label>
                    <input
                      value={toPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="+27 82 123 4567"
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-blue-400/25",
                        hasPhone
                          ? "border-panel-border bg-panel-muted/30"
                          : "border-amber-400/40 bg-amber-500/[0.04]"
                      )}
                    />
                    {!hasPhone && (
                      <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        Add the patient&apos;s mobile number to send SMS.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Message
                      </label>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {message.length} chars · {smsSegments(message)} SMS segment{smsSegments(message) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      placeholder="Write your message to the patient…"
                      className="w-full resize-none rounded-xl border border-panel-border bg-panel-muted/20 px-3.5 py-3 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-blue-400/25"
                    />
                  </div>

                  {selected && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Quick send
                      </p>
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={!!busyAction || openInvoices.length === 0 || !hasPhone}
                          onClick={() => void sendPaymentLink()}
                          className="flex w-full items-center gap-3 rounded-xl border border-panel-border px-3 py-2.5 text-left transition-colors hover:bg-panel-muted/40 disabled:opacity-50"
                        >
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                            {busyAction === "payment" ? (
                              <CircleNotch className="size-4 animate-spin" />
                            ) : (
                              <CurrencyDollar className="size-4" weight="fill" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-foreground">Send payment link</p>
                            <p className="text-[10px] text-muted-foreground">
                              {openInvoices.length > 0
                                ? `Invoice · R${(invoiceDueCents(openInvoices[0]) / 100).toFixed(2)} due`
                                : "No open invoice"}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={!!busyAction || !nextAppointment || !hasPhone}
                          onClick={() => void sendReminder()}
                          className="flex w-full items-center gap-3 rounded-xl border border-panel-border px-3 py-2.5 text-left transition-colors hover:bg-panel-muted/40 disabled:opacity-50"
                        >
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                            {busyAction === "reminder" ? (
                              <CircleNotch className="size-4 animate-spin" />
                            ) : (
                              <CalendarCheck className="size-4" weight="fill" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-foreground">Appointment reminder</p>
                            <p className="text-[10px] text-muted-foreground">
                              {nextAppointment
                                ? `${nextAppointment.date} at ${nextAppointment.startTime}`
                                : "No upcoming appointment"}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={!!busyAction || !hasPhone}
                          onClick={() => void shareClinicalNote()}
                          className="flex w-full items-center gap-3 rounded-xl border border-panel-border px-3 py-2.5 text-left transition-colors hover:bg-panel-muted/40 disabled:opacity-50"
                        >
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                            {busyAction === "share" ? (
                              <CircleNotch className="size-4 animate-spin" />
                            ) : (
                              <FileText className="size-4" weight="fill" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-medium text-foreground">Share clinical note</p>
                            <p className="text-[10px] text-muted-foreground">Send latest document by SMS</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {step === "compose" && (
              <div className="shrink-0 space-y-2 border-t border-panel-border bg-panel-muted/10 p-5">
                <PanelPrimaryButton disabled={sending || !message.trim() || !hasPhone} onClick={() => void sendSms()}>
                  {sending ? (
                    <CircleNotch className="size-3.5 animate-spin" />
                  ) : (
                    <PaperPlaneTilt className="size-3.5" weight="fill" />
                  )}
                  {sending ? "Sending…" : "Send SMS"}
                </PanelPrimaryButton>
                <PanelSecondaryButton onClick={close}>Cancel</PanelSecondaryButton>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
