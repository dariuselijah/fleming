"use client"

import { fetchClient } from "@/lib/fetch"
import { FileText, PaperPlaneTilt } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { BentoTile } from "../bento-tile"
import { RecordPaymentDialog } from "./record-payment-dialog"
import type { RevenueInvoice, RevenuePayment } from "./types"
import { formatDate, formatZarCents } from "./ui/format"
import { EmptyRevenueState, RevenueBadge, RevenueTable } from "./ui/primitives"

export function InvoicesTab({
  invoices,
  payments,
  refresh,
}: {
  invoices: RevenueInvoice[]
  payments: RevenuePayment[]
  refresh: () => void
}) {
  const [status, setStatus] = useState("all")
  const [selected, setSelected] = useState<RevenueInvoice | null>(null)
  const [paying, setPaying] = useState<RevenueInvoice | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const filtered = useMemo(
    () => (status === "all" ? invoices : invoices.filter((i) => i.status === status)),
    [invoices, status]
  )

  const selectedPayments = useMemo(
    () => (selected ? payments.filter((p) => p.invoice_id === selected.id) : []),
    [payments, selected]
  )

  const sendReminder = async (invoice: RevenueInvoice) => {
    setMessage(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/send`, {
        method: "POST",
        body: JSON.stringify({ channels: ["sms"], issueFirst: invoice.status === "draft" }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Send failed")
      setMessage(`Reminder sent for ${invoice.invoice_number}.`)
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Send failed")
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,0.6fr)]">
      <BentoTile
        title="Invoices"
        subtitle={`${filtered.length} visible`}
        icon={<FileText className="size-4 text-blue-400" weight="fill" />}
        action={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
          >
            {["all", "draft", "issued", "sent", "partially_paid", "paid", "write_off", "void", "refunded"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        }
      >
        {message && (
          <p className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            {message}
          </p>
        )}
        {filtered.length === 0 ? (
          <EmptyRevenueState title="No invoices" body="Invoices created from claims, shortfalls, or walk-in checkout will land here." />
        ) : (
          <RevenueTable>
            <thead className="bg-muted/60 text-muted-foreground dark:bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const due = Math.max(0, inv.total_cents - inv.amount_paid_cents)
                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    className="cursor-pointer border-t border-border hover:bg-muted/40 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2 font-medium">{inv.invoice_number}</td>
                    <td className="px-3 py-2">{inv.patient_snapshot?.name ?? "Patient"}</td>
                    <td className="px-3 py-2"><RevenueBadge tone={inv.status === "paid" ? "green" : due > 0 ? "amber" : "neutral"}>{inv.status.replace("_", " ")}</RevenueBadge></td>
                    <td className="px-3 py-2">{formatZarCents(due)}</td>
                    <td className="px-3 py-2">{formatZarCents(inv.total_cents)}</td>
                  </tr>
                )
              })}
            </tbody>
          </RevenueTable>
        )}
      </BentoTile>

      <BentoTile title="Invoice detail" subtitle={selected?.invoice_number ?? "Select an invoice"} className="xl:sticky xl:top-16 xl:self-start">
        {!selected ? (
          <EmptyRevenueState title="Select an invoice" body="Open payments, refunds, reminders, write-off and PDF actions from the invoice detail." />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold">{selected.invoice_number}</p>
              <p className="text-[11px] text-muted-foreground">{selected.patient_snapshot?.name ?? "Patient"} · {formatDate(selected.created_at)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Total" value={formatZarCents(selected.total_cents)} />
              <Metric label="Paid" value={formatZarCents(selected.amount_paid_cents)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPaying(selected)}
                className="rounded-xl bg-emerald-500/20 px-3 py-2 text-[11px] font-semibold text-emerald-400"
              >
                Record payment
              </button>
              <button
                type="button"
                onClick={() => void sendReminder(selected)}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-500/15 px-3 py-2 text-[11px] font-semibold text-blue-400"
              >
                <PaperPlaneTilt className="size-3.5" />
                Send portal
              </button>
              <a
                href={`/api/billing/invoices/${selected.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-muted px-3 py-2 text-[11px] font-semibold text-muted-foreground"
              >
                PDF
              </a>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment ledger</p>
              {selectedPayments.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No payments posted yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[11px] dark:bg-white/[0.04]">
                      <span className="capitalize">{p.provider.replace("_", " ")} · {p.status.replace("_", " ")}</span>
                      <span>{formatZarCents(p.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </BentoTile>
      {paying && <RecordPaymentDialog invoice={paying} onClose={() => setPaying(null)} onDone={refresh} />}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/25 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  )
}
