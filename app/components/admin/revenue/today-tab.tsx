"use client"

import { fetchClient } from "@/lib/fetch"
import { useWorkspace } from "@/lib/clinical-workspace"
import { CurrencyCircleDollar, Receipt, Warning } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { BentoTile } from "../bento-tile"
import type { DrawerStatus, RevenueInvoice, RevenuePayment, RevenueReportSummary } from "./types"
import { formatDateTime, formatZarCents, parseZarToCents } from "./ui/format"
import { EmptyRevenueState, RevenueTable } from "./ui/primitives"
import { PatientCombobox } from "./patient-combobox"

export function TodayTab({
  drawer,
  invoices,
  payments,
  summary,
  refresh,
}: {
  drawer: DrawerStatus | null
  invoices: RevenueInvoice[]
  payments: RevenuePayment[]
  summary: RevenueReportSummary
  refresh: () => void
}) {
  const { patients } = useWorkspace()
  const [openingFloat, setOpeningFloat] = useState("0.00")
  const [countedCash, setCountedCash] = useState("")
  const [quickPatientId, setQuickPatientId] = useState("")
  const [quickDescription, setQuickDescription] = useState("Consultation")
  const [quickAmount, setQuickAmount] = useState("")
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("")
  const [paymentProvider, setPaymentProvider] = useState<"cash" | "polar" | "stitch" | "eft_manual" | "medical_aid">("cash")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentRef, setPaymentRef] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const recentPayments = useMemo(() => payments.slice(0, 8), [payments])
  const outstandingInvoices = useMemo(
    () =>
      invoices
        .filter((i) => Math.max(0, (i.total_cents ?? 0) - (i.amount_paid_cents ?? 0)) > 0)
        .slice(0, 80),
    [invoices]
  )
  const selectedPaymentInvoice = outstandingInvoices.find((i) => i.id === paymentInvoiceId)

  const openShift = async () => {
    const cents = parseZarToCents(openingFloat)
    if (cents == null) {
      setMessage("Enter a valid opening float.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/cash-drawer/open", {
        method: "POST",
        body: JSON.stringify({ openingFloatCents: cents }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Could not open shift")
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not open shift")
    } finally {
      setBusy(false)
    }
  }

  const closeShift = async () => {
    const cents = parseZarToCents(countedCash)
    if (cents == null) {
      setMessage("Enter counted cash.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/cash-drawer/close", {
        method: "POST",
        body: JSON.stringify({ countedCashCents: cents }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Could not close shift")
      setCountedCash("")
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not close shift")
    } finally {
      setBusy(false)
    }
  }

  const createQuickInvoice = async () => {
    if (!quickPatientId) {
      setMessage("Choose or add a patient profile before checkout.")
      return
    }
    const cents = parseZarToCents(quickAmount)
    if (cents == null || cents <= 0) {
      setMessage("Enter a valid checkout amount.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const patient = patients.find((p) => p.id === quickPatientId)
      const res = await fetchClient("/api/billing/invoices/quick", {
        method: "POST",
        body: JSON.stringify({
          patientId: quickPatientId || null,
          patientName: patient?.name || "Patient",
          description: quickDescription,
          amountCents: cents,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; invoiceId?: string; invoiceNumber?: string }
      if (!res.ok) throw new Error(j.error || "Could not create invoice")
      setQuickAmount("")
      if (j.invoiceId) {
        setPaymentInvoiceId(j.invoiceId)
        setPaymentAmount((cents / 100).toFixed(2))
      }
      setMessage(`Invoice ${j.invoiceNumber ?? ""} created. Record payment below or open Invoices.`)
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create invoice")
    } finally {
      setBusy(false)
    }
  }

  const recordQuickPayment = async () => {
    if (!paymentInvoiceId) {
      setMessage("Choose an invoice to collect.")
      return
    }
    const invoice = outstandingInvoices.find((i) => i.id === paymentInvoiceId)
    const due = invoice ? Math.max(0, invoice.total_cents - invoice.amount_paid_cents) : 0
    const cents = parseZarToCents(paymentAmount) ?? due
    if (cents <= 0) {
      setMessage("Enter a valid payment amount.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${paymentInvoiceId}/payments`, {
        method: "POST",
        headers: { "X-Idempotency-Key": `quick-${paymentInvoiceId}-${crypto.randomUUID()}` },
        body: JSON.stringify({
          provider: paymentProvider,
          amountCents: cents,
          reference: paymentRef.trim() || undefined,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        error?: string
        checkoutUrl?: string
        paymentUrl?: string
      }
      if (!res.ok) throw new Error(j.error || "Could not record payment")
      const url = j.checkoutUrl || j.paymentUrl
      if (url) window.open(url, "_blank", "noopener,noreferrer")
      setPaymentRef("")
      setPaymentAmount("")
      setMessage("Payment recorded.")
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not record payment")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr] 2xl:grid-cols-[2fr_1fr]">
      <BentoTile
        title="Today / POS"
        subtitle="Open shift, collect, close with variance"
        icon={<CurrencyCircleDollar className="size-4 text-emerald-400" weight="fill" />}
        glow={drawer ? "green" : "amber"}
      >
        <div className="space-y-4">
          {drawer ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Shift open</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Started {formatDateTime(drawer.openedAt)}</p>
                </div>
                <div className="text-right text-[11px]">
                  <p>Opening {formatZarCents(drawer.openingFloatCents)}</p>
                  <p>Cash sales {formatZarCents(drawer.cashSalesCents)}</p>
                  <p className="font-semibold text-foreground">Expected {formatZarCents(drawer.expectedCashCents)}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder={(drawer.expectedCashCents / 100).toFixed(2)}
                  inputMode="decimal"
                  className="w-32 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void closeShift()}
                  className="rounded-xl bg-white/10 px-4 py-2 text-[11px] font-semibold text-white/75 hover:bg-white/15 disabled:opacity-50"
                >
                  Close shift
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 dark:border-white/[0.08]">
              <p className="text-sm font-semibold">Open the cash drawer</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                A shift is required before recording cash payments.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  inputMode="decimal"
                  className="w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openShift()}
                  className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-400 disabled:opacity-50"
                >
                  Open shift
                </button>
              </div>
            </div>
          )}

          {message && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <Warning className="mt-0.5 size-3.5 shrink-0" /> {message}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-4">
            <Metric label="Today" value={formatZarCents(summary.todayCents)} />
            <Metric label="Cash" value={formatZarCents(summary.cashCents)} />
            <Metric label="Card" value={formatZarCents(summary.cardCents)} />
            <Metric label="Medical aid" value={formatZarCents(summary.medicalAidCents)} />
          </div>
        </div>
      </BentoTile>

      <BentoTile title="Patient checkout" subtitle="Create invoice first, then collect below">
        <div className="space-y-3">
          <PatientCombobox
            patients={patients}
            value={quickPatientId}
            onChange={setQuickPatientId}
            placeholder="Search or add patient"
          />
          {!quickPatientId ? (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              Every checkout needs a patient profile so portal links, receipts, and statements work cleanly.
            </p>
          ) : null}
          <input
            value={quickDescription}
            onChange={(e) => setQuickDescription(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
          />
          <input
            value={quickAmount}
            onChange={(e) => setQuickAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Amount (ZAR)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
          />
          <button
            type="button"
            disabled={busy || !quickPatientId}
            onClick={() => void createQuickInvoice()}
            className="w-full rounded-xl bg-blue-500/15 px-4 py-2.5 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
          >
            Create checkout invoice
          </button>
        </div>
      </BentoTile>

      <BentoTile
        title="Recent activity"
        subtitle="Collect payment and view the latest receipts"
        icon={<Receipt className="size-4 text-blue-400" weight="fill" />}
        className="xl:col-span-2"
      >
        <div className="mb-4 rounded-2xl border border-border bg-muted/25 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_120px_130px_minmax(140px,0.6fr)_auto]">
            <select
              value={paymentInvoiceId}
              onChange={(e) => {
                const id = e.target.value
                setPaymentInvoiceId(id)
                const inv = outstandingInvoices.find((i) => i.id === id)
                if (inv) setPaymentAmount(((inv.total_cents - inv.amount_paid_cents) / 100).toFixed(2))
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
            >
              <option value="">Select invoice to collect</option>
              {outstandingInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} · {inv.patient_snapshot?.name ?? "Patient"} · {formatZarCents(inv.total_cents - inv.amount_paid_cents)}
                </option>
              ))}
            </select>
            <input
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Amount"
              className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
            />
            <select
              value={paymentProvider}
              onChange={(e) => setPaymentProvider(e.target.value as typeof paymentProvider)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
            >
              <option value="cash">Cash</option>
              <option value="polar">Card link</option>
              <option value="stitch">Instant EFT</option>
              <option value="eft_manual">Manual EFT</option>
              <option value="medical_aid">Medical aid</option>
            </select>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="Reference"
              className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
            />
            <button
              type="button"
              disabled={busy || !selectedPaymentInvoice}
              onClick={() => void recordQuickPayment()}
              className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-400 disabled:opacity-50"
            >
              Collect
            </button>
          </div>
        </div>
        {recentPayments.length === 0 ? (
          <EmptyRevenueState title="No payments yet" body="Payments will appear here as cash, card, EFT, and medical-aid receipts settle." />
        ) : (
          <RevenueTable>
            <thead className="bg-muted/60 text-muted-foreground dark:bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map((p) => (
                <tr key={p.id} className="border-t border-border dark:border-white/[0.06]">
                  <td className="px-3 py-2 capitalize">{p.provider.replace("_", " ")}</td>
                  <td className="px-3 py-2 capitalize">{p.status.replace("_", " ")}</td>
                  <td className="px-3 py-2">{formatZarCents(p.amount_cents)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDateTime(p.succeeded_at ?? p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </RevenueTable>
        )}
      </BentoTile>
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
