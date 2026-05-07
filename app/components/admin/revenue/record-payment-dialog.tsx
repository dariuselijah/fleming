"use client"

import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { X } from "@phosphor-icons/react"
import { useState } from "react"
import { formatZarCents, parseZarToCents } from "./ui/format"
import type { RevenueInvoice } from "./types"

type Provider = "cash" | "polar" | "stitch" | "medical_aid" | "eft_manual" | "write_off"

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: "cash", label: "Cash", hint: "Drawer shift required" },
  { id: "polar", label: "Card link", hint: "Polar checkout" },
  { id: "stitch", label: "Instant EFT", hint: "Stitch / PayShap" },
  { id: "medical_aid", label: "Medical aid", hint: "Remittance receipt" },
  { id: "eft_manual", label: "Manual EFT", hint: "Bank reference" },
  { id: "write_off", label: "Write-off", hint: "Close bad debt" },
]

export function RecordPaymentDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: RevenueInvoice
  onClose: () => void
  onDone: () => void
}) {
  const due = Math.max(0, (invoice.total_cents ?? 0) - (invoice.amount_paid_cents ?? 0))
  const [provider, setProvider] = useState<Provider>("cash")
  const [amount, setAmount] = useState((due / 100).toFixed(2))
  const [reference, setReference] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    const amountCents = parseZarToCents(amount)
    if (amountCents == null || amountCents <= 0) {
      setMessage("Enter a valid amount.")
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const idem = `${provider}-${invoice.id}-${crypto.randomUUID()}`
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": idem },
        body: JSON.stringify({
          provider,
          amountCents,
          reference: reference.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        checkoutUrl?: string
        paymentUrl?: string
      }
      if (!res.ok) throw new Error(j.error || "Payment failed")
      const url = j.checkoutUrl || j.paymentUrl
      if (url) window.open(url, "_blank", "noopener,noreferrer")
      onDone()
      onClose()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Payment failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.1] bg-background p-5 shadow-2xl dark:bg-[#101312]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Record payment</h3>
            <p className="text-[11px] text-muted-foreground">
              {invoice.invoice_number} · Due {formatZarCents(due)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                provider === p.id
                  ? "border-emerald-500/45 bg-emerald-500/10"
                  : "border-border bg-muted/25 hover:bg-muted/50 dark:border-white/[0.08]"
              )}
            >
              <p className="text-[12px] font-semibold">{p.label}</p>
              <p className="text-[10px] text-muted-foreground">{p.hint}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-[11px] font-medium">
            Amount (ZAR)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium">
            Reference / remittance / bank ref.
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
            />
          </label>
          {provider === "write_off" && (
            <label className="grid gap-1 text-[11px] font-medium">
              Write-off reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
              />
            </label>
          )}
        </div>

        {message && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
            {message}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-[11px] text-muted-foreground">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-400 disabled:opacity-50"
          >
            {busy ? "Working…" : "Record"}
          </button>
        </div>
      </div>
    </div>
  )
}
