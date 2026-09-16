"use client"

import {
  useWorkspace,
  useWorkspaceStore,
  type PracticeClaim,
  type BillingQueueFilter,
} from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchPracticeClaimsForWorkspace } from "@/lib/clinical-workspace/refresh-practice-claims"
import { useCashDrawer } from "@/lib/billing/use-cash-drawer"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BillingSetupDialog } from "./billing-setup-dialog"
import { ClaimDetailPanel, CreateClaimModal } from "./bento-claims"
import {
  ArrowSquareOut,
  Bell,
  Check,
  Copy,
  CreditCard,
  MagnifyingGlass,
  Microphone,
  Money,
  Plus,
  Printer,
  X,
} from "@phosphor-icons/react"

type InvoiceRow = {
  id: string
  claim_id: string | null
  patient_id: string | null
  total_cents: number
  amount_paid_cents: number
  status: string
  billing_mode: string
  patient_snapshot?: { name?: string; phone?: string }
  invoice_number?: string
  due_at?: string | null
  created_at?: string
  line_items?: unknown
}

type PaymentRow = {
  id: string
  invoice_id: string | null
  provider: string | null
  method: string | null
  amount_cents: number
  status: string
  created_at: string
  succeeded_at?: string | null
}

type QueueRow =
  | {
      id: string
      type: "claim"
      claim: PracticeClaim
      patientName: string
      status: string
      totalCents: number
      paidCents: number
      dueCents: number
      createdAt: string
      searchText: string
      needsAction: boolean
      overdue: boolean
      partial: boolean
      paid: boolean
    }
  | {
      id: string
      type: "invoice"
      invoice: InvoiceRow
      patientName: string
      status: string
      totalCents: number
      paidCents: number
      dueCents: number
      createdAt: string
      searchText: string
      needsAction: boolean
      overdue: boolean
      partial: boolean
      paid: boolean
    }

const FILTERS: { id: BillingQueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "analytics", label: "Analytics" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "needs_action", label: "Needs action" },
  { id: "claims", label: "Claims" },
  { id: "unpaid", label: "Unpaid" },
  { id: "partial", label: "Partially paid" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
]

function formatCents(cents: number): string {
  return `R${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCompactCents(cents: number): string {
  const zar = cents / 100
  if (Math.abs(zar) >= 1_000_000) return `R${(zar / 1_000_000).toFixed(1)}m`
  if (Math.abs(zar) >= 1_000) return `R${(zar / 1_000).toFixed(1)}k`
  return `R${Math.round(zar).toLocaleString("en-ZA")}`
}

function parseZarToCents(raw: string): number | null {
  const cents = Math.round((Number.parseFloat(raw.replace(",", ".")) || 0) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

function isInvoiceOverdue(invoice: InvoiceRow): boolean {
  if (!invoice.due_at) return false
  if (invoice.status === "paid" || invoice.status === "void") return false
  return new Date(invoice.due_at).getTime() < Date.now()
}

function invoiceStatusLabel(invoice: InvoiceRow): string {
  const due = Math.max(0, (invoice.total_cents ?? 0) - (invoice.amount_paid_cents ?? 0))
  if (invoice.status === "paid" || due <= 0) return "Paid"
  if ((invoice.amount_paid_cents ?? 0) > 0) return "Partially paid"
  if (isInvoiceOverdue(invoice)) return "Overdue"
  if (invoice.status === "draft") return "Draft"
  if (invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "issued") return "Unpaid"
  return invoice.status.replaceAll("_", " ")
}

function statusPillClass(status: string, overdue = false): string {
  if (status === "Paid" || status === "paid" || status === "approved") return "border-emerald-400/20 bg-emerald-400/[0.10] text-emerald-300"
  if (status === "Partially paid" || status === "partial") return "border-amber-400/20 bg-amber-400/[0.10] text-amber-200"
  if (status === "Overdue" || overdue || status === "rejected") return "border-rose-400/20 bg-rose-400/[0.10] text-rose-200"
  if (status === "Draft" || status === "draft") return "border-panel-border bg-panel-muted text-muted-foreground/65"
  return "border-blue-400/20 bg-blue-400/[0.10] text-blue-200"
}

function lineItems(raw: unknown): { description: string; amountCents: number }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row, ix) => {
    const r = row as Record<string, unknown>
    return {
      description: String(r.description ?? `Line ${ix + 1}`),
      amountCents: typeof r.amountCents === "number" ? r.amountCents : 0,
    }
  })
}

type AnalyticsPeriod = "weekly" | "monthly" | "yearly"

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const out = startOfDay(d)
  out.setDate(out.getDate() + diff)
  return out
}

function bucketLabel(date: Date, period: AnalyticsPeriod): string {
  if (period === "weekly") {
    return date.toLocaleDateString("en-ZA", { weekday: "short" })
  }
  if (period === "monthly") {
    return date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
  }
  return date.toLocaleDateString("en-ZA", { month: "short" })
}

function bucketKey(date: Date, period: AnalyticsPeriod): string {
  if (period === "weekly" || period === "monthly") return date.toISOString().slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function buildPeriodBuckets(period: AnalyticsPeriod): { key: string; label: string; start: Date; end: Date }[] {
  const now = new Date()
  if (period === "weekly") {
    const start = startOfWeek(now)
    return Array.from({ length: 7 }, (_, ix) => {
      const s = new Date(start)
      s.setDate(start.getDate() + ix)
      const e = new Date(s)
      e.setDate(s.getDate() + 1)
      return { key: bucketKey(s, period), label: bucketLabel(s, period), start: s, end: e }
    })
  }
  if (period === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const days = Math.ceil((nextMonth.getTime() - start.getTime()) / 86_400_000)
    return Array.from({ length: days }, (_, ix) => {
      const s = new Date(start)
      s.setDate(start.getDate() + ix)
      const e = new Date(s)
      e.setDate(s.getDate() + 1)
      return { key: bucketKey(s, period), label: bucketLabel(s, period), start: s, end: e }
    })
  }
  return Array.from({ length: 12 }, (_, ix) => {
    const s = new Date(now.getFullYear(), ix, 1)
    const e = new Date(now.getFullYear(), ix + 1, 1)
    return { key: bucketKey(s, period), label: bucketLabel(s, period), start: s, end: e }
  })
}

function paymentDate(payment: PaymentRow): Date {
  return new Date(payment.succeeded_at ?? payment.created_at)
}

function invoiceDate(invoice: InvoiceRow): Date {
  return new Date(invoice.created_at ?? new Date().toISOString())
}

type AnalyticsBucketRow = {
  key: string
  label: string
  start: Date
  end: Date
  collectedCents: number
  invoicedCents: number
  outstandingCents: number
}

function LineSeriesChart({
  rows,
  period,
}: {
  rows: AnalyticsBucketRow[]
  period: AnalyticsPeriod
}) {
  const width = 760
  const height = 230
  const pad = { top: 22, right: 82, bottom: 34, left: 56 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const cumulativeRows = rows.reduce<Array<AnalyticsBucketRow & { cumulativeCollectedCents: number }>>((acc, row) => {
    const previous = acc[acc.length - 1]?.cumulativeCollectedCents ?? 0
    acc.push({ ...row, cumulativeCollectedCents: previous + row.collectedCents })
    return acc
  }, [])
  const maxValue = Math.max(
    100,
    ...cumulativeRows.flatMap((r) => [r.collectedCents, r.invoicedCents, r.cumulativeCollectedCents])
  )
  const roundedMax = Math.ceil(maxValue / 10_000) * 10_000
  const yMax = Math.max(roundedMax, maxValue)
  const xFor = (ix: number) => pad.left + (rows.length <= 1 ? plotW / 2 : (ix / (rows.length - 1)) * plotW)
  const yFor = (value: number) => pad.top + plotH - (Math.min(value, yMax) / yMax) * plotH
  const pathFor = () =>
    cumulativeRows
      .map((row, ix) => `${ix === 0 ? "M" : "L"} ${xFor(ix).toFixed(2)} ${yFor(row.cumulativeCollectedCents).toFixed(2)}`)
      .join(" ")
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(yMax * p))
  const showXLabel = (ix: number) => {
    if (period === "weekly" || period === "yearly") return true
    return ix === 0 || ix === rows.length - 1 || ix % 5 === 0
  }
  const barGroupWidth = period === "monthly" ? 12 : 20
  const barWidth = period === "monthly" ? 4 : 7
  const nonZeroRows = rows.filter((r) => r.collectedCents > 0 || r.invoicedCents > 0)

  return (
    <div className="rounded-2xl border border-panel-border bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-3 shadow-inner shadow-white/[0.015]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-foreground/78">Invoiced vs collected</p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">Bars are period activity. Line is cumulative collection.</p>
        </div>
        <div className="flex flex-wrap gap-2 rounded-full bg-panel-muted px-2 py-1">
          <span className="inline-flex items-center gap-1.5 text-[9px] text-muted-foreground/65">
            <span className="h-2 w-1.5 rounded-sm bg-blue-300/85" />
            Invoiced
          </span>
          <span className="inline-flex items-center gap-1.5 text-[9px] text-muted-foreground/65">
            <span className="h-2 w-1.5 rounded-sm bg-emerald-400/90" />
            Collected
          </span>
          <span className="inline-flex items-center gap-1.5 text-[9px] text-muted-foreground/65">
            <span className="h-px w-3 bg-amber-300" />
            Cumulative
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-panel-muted/50" style={{ scrollbarWidth: "thin" }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full">
          <rect x={pad.left} y={pad.top} width={plotW} height={plotH} rx="12" fill="rgba(255,255,255,0.014)" />
          {ticks.map((tick) => {
            const y = yFor(tick)
            return (
              <g key={tick}>
                <line x1={pad.left} x2={pad.left + plotW} y1={y} y2={y} stroke="rgba(255,255,255,0.055)" />
                <text x={pad.left - 8} y={y + 3} textAnchor="end" className="fill-white/30 text-[9px]">
                  {formatCompactCents(tick)}
                </text>
              </g>
            )
          })}
          <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke="rgba(255,255,255,0.13)" />
          {rows.map((row, ix) => {
            const x = xFor(ix)
            const invoicedH = (row.invoicedCents / yMax) * plotH
            const collectedH = (row.collectedCents / yMax) * plotH
            const labelAbove = row.invoicedCents > 0 || row.collectedCents > 0
            return (
              <g key={row.key}>
                <rect
                  x={x - barGroupWidth / 2}
                  y={pad.top + plotH - invoicedH}
                  width={barWidth}
                  height={Math.max(row.invoicedCents > 0 ? 3 : 0, invoicedH)}
                  rx="3"
                  fill="#93c5fd"
                  opacity={row.invoicedCents > 0 ? 0.78 : 0}
                >
                  <title>{`${row.label} invoiced: ${formatCents(row.invoicedCents)}`}</title>
                </rect>
                <rect
                  x={x - barGroupWidth / 2 + barWidth + 3}
                  y={pad.top + plotH - collectedH}
                  width={barWidth}
                  height={Math.max(row.collectedCents > 0 ? 3 : 0, collectedH)}
                  rx="3"
                  fill="#34d399"
                  opacity={row.collectedCents > 0 ? 0.86 : 0}
                >
                  <title>{`${row.label} collected: ${formatCents(row.collectedCents)}`}</title>
                </rect>
                {labelAbove && period !== "monthly" ? (
                  <text x={x} y={Math.min(yFor(Math.max(row.invoicedCents, row.collectedCents)) - 6, pad.top + plotH - 6)} textAnchor="middle" className="fill-white/45 text-[8px]">
                    {formatCompactCents(Math.max(row.invoicedCents, row.collectedCents))}
                  </text>
                ) : null}
              </g>
            )
          })}
          <path d={pathFor()} fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {cumulativeRows.map((row, ix) => (
            <circle key={`cum-${row.key}`} cx={xFor(ix)} cy={yFor(row.cumulativeCollectedCents)} r="2.6" fill="#fbbf24">
              <title>{`${row.label} cumulative collected: ${formatCents(row.cumulativeCollectedCents)}`}</title>
            </circle>
          ))}
          {cumulativeRows.length > 0 ? (
            <text
              x={pad.left + plotW + 10}
              y={yFor(cumulativeRows[cumulativeRows.length - 1]!.cumulativeCollectedCents) + 4}
              fill="#fbbf24"
              className="text-[9px]"
            >
              {formatCompactCents(cumulativeRows[cumulativeRows.length - 1]!.cumulativeCollectedCents)}
            </text>
          ) : null}
          {rows.map((row, ix) => {
            if (!showXLabel(ix)) return null
            return (
              <text key={row.key} x={xFor(ix)} y={height - 12} textAnchor="middle" className="fill-white/30 text-[9px]">
                {row.label}
              </text>
            )
          })}
        </svg>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {nonZeroRows.slice(-3).map((row) => (
          <div key={row.key} className="rounded-xl border border-panel-border bg-panel-muted/50 px-2.5 py-2">
            <p className="text-[9px] font-semibold text-muted-foreground/78">{row.label}</p>
            <div className="mt-1 flex items-center justify-between text-[9px]">
              <span className="text-blue-200/70">Invoiced</span>
              <span className="tabular-nums text-foreground/70">{formatCents(row.invoicedCents)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[9px]">
              <span className="text-emerald-300/70">Collected</span>
              <span className="tabular-nums text-foreground/70">{formatCents(row.collectedCents)}</span>
            </div>
          </div>
        ))}
        {nonZeroRows.length === 0 ? (
          <div className="rounded-2xl border border-panel-border bg-panel-muted/50 px-3 py-3 text-[11px] text-muted-foreground sm:col-span-3">
            No invoiced or collected activity in this period yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BillingAnalyticsPanel({
  invoices,
  payments,
}: {
  invoices: InvoiceRow[]
  payments: PaymentRow[]
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("weekly")
  const buckets = useMemo(() => buildPeriodBuckets(period), [period])
  const rows = useMemo(() => {
    return buckets.map((bucket) => {
      const collectedCents = payments
        .filter((p) => p.status === "succeeded")
        .filter((p) => {
          const d = paymentDate(p)
          return d >= bucket.start && d < bucket.end
        })
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0)
      const invoicedCents = invoices
        .filter((inv) => {
          const d = invoiceDate(inv)
          return d >= bucket.start && d < bucket.end
        })
        .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0)
      const outstandingCents = invoices
        .filter((inv) => {
          const d = invoiceDate(inv)
          return d >= bucket.start && d < bucket.end
        })
        .reduce((sum, inv) => sum + Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)), 0)
      return { ...bucket, collectedCents, invoicedCents, outstandingCents }
    })
  }, [buckets, invoices, payments])

  const totals = useMemo(() => {
    const collectedCents = rows.reduce((sum, r) => sum + r.collectedCents, 0)
    const invoicedCents = rows.reduce((sum, r) => sum + r.invoicedCents, 0)
    const outstandingCents = invoices.reduce((sum, inv) => sum + Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)), 0)
    const succeededPayments = payments.filter((p) => p.status === "succeeded")
    const providerTotals = succeededPayments.reduce<Record<string, number>>((acc, p) => {
      const key = p.provider ?? "unknown"
      acc[key] = (acc[key] ?? 0) + (p.amount_cents ?? 0)
      return acc
    }, {})
    const topProvider = Object.entries(providerTotals).sort((a, b) => b[1] - a[1])[0]
    return {
      collectedCents,
      invoicedCents,
      outstandingCents,
      paymentCount: succeededPayments.length,
      topProvider: topProvider ? `${topProvider[0]} ${formatCents(topProvider[1])}` : "No payments",
    }
  }, [rows, invoices, payments])
  const activeRows = rows.filter((row) => row.collectedCents > 0 || row.invoicedCents > 0 || row.outstandingCents > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-panel-border bg-panel-muted/40">
      <div className="border-b border-panel-border px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-foreground/90">Analytics</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Weekly, monthly, and yearly trends from live billing records.</p>
          </div>
          <div className="flex rounded-full bg-panel-muted p-1">
            {(["weekly", "monthly", "yearly"] as AnalyticsPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[10px] font-semibold capitalize transition-colors",
                  period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground/70 hover:text-accent-foreground/75"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.045] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Collected</p>
            <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-emerald-300">{formatCents(totals.collectedCents)}</p>
          </div>
          <div className="rounded-xl border border-blue-400/10 bg-blue-400/[0.045] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Invoiced</p>
            <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-blue-200">{formatCents(totals.invoicedCents)}</p>
          </div>
          <div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.045] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">A/R open</p>
            <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-amber-200">{formatCents(totals.outstandingCents)}</p>
          </div>
          <div className="rounded-xl border border-panel-border bg-panel-muted/50 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top rail</p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground/70">{totals.topProvider}</p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "thin" }}>
        <LineSeriesChart rows={rows} period={period} />

        <div className="mt-3 overflow-hidden rounded-2xl border border-panel-border">
          <div className="flex items-center justify-between border-b border-panel-border bg-panel-muted/50 px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active periods</p>
            <p className="text-[9px] text-muted-foreground">Zero rows hidden</p>
          </div>
          {activeRows.length > 0 ? (
            activeRows.map((row) => (
              <div key={row.key} className="grid grid-cols-4 gap-3 border-b border-panel-border px-3 py-2 text-[11px] last:border-b-0">
                <span className="text-muted-foreground/85">{row.label}</span>
                <span className="text-right tabular-nums text-emerald-300/80">{formatCents(row.collectedCents)}</span>
                <span className="text-right tabular-nums text-blue-200/75">{formatCents(row.invoicedCents)}</span>
                <span className="text-right tabular-nums text-amber-200/80">{formatCents(row.outstandingCents)}</span>
              </div>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No billing activity in this period yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

type ReconciliationLine = {
  id: string
  importId?: string
  externalRef: string
  amountCents: number
  feesCents: number
  status: string
  matchedPaymentId?: string
  source?: string
}

function ReconciliationPanel() {
  const [source, setSource] = useState<"bank" | "polar" | "stitch">("bank")
  const [csv, setCsv] = useState("external_ref,amount_cents,fees_cents\n")
  const [lines, setLines] = useState<ReconciliationLine[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetchClient("/api/billing/reconciliation/imports")
    const payload = (await response.json()) as { lines?: ReconciliationLine[]; error?: string }
    if (!response.ok) throw new Error(payload.error || "Could not load reconciliation")
    setLines(payload.lines ?? [])
  }, [])

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Could not load reconciliation")
    )
  }, [load])

  const importCsv = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetchClient("/api/billing/reconciliation/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, csv }),
      })
      const payload = (await response.json()) as { lines?: ReconciliationLine[]; error?: string }
      if (!response.ok) throw new Error(payload.error || "Import failed")
      setLines(payload.lines ?? [])
      setMessage(`Imported ${payload.lines?.length ?? 0} settlement lines.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed")
    } finally {
      setBusy(false)
    }
  }

  const autoMatch = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetchClient("/api/billing/reconciliation/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: lines.map((line) => ({ ...line, source })) }),
      })
      const payload = (await response.json()) as { lines?: ReconciliationLine[]; error?: string }
      if (!response.ok) throw new Error(payload.error || "Matching failed")
      setLines(payload.lines ?? [])
      setMessage("Automatic matching complete. Review unmatched and disputed lines.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Matching failed")
    } finally {
      setBusy(false)
    }
  }

  const setLineStatus = async (line: ReconciliationLine, status: "disputed" | "unmatched") => {
    const response = await fetchClient(
      `/api/billing/reconciliation/lines/${encodeURIComponent(line.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentId: null }),
      }
    )
    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      setMessage(payload.error || "Update failed")
      return
    }
    setLines((current) =>
      current.map((row) => (row.id === line.id ? { ...row, status } : row))
    )
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid gap-3 rounded-2xl border border-panel-border bg-panel-muted/50 p-3 lg:grid-cols-[150px_1fr_auto]">
        <select
          value={source}
          onChange={(event) => setSource(event.target.value as typeof source)}
          className="h-10 rounded-xl border border-panel-border bg-panel-muted px-3 text-[11px]"
        >
          <option value="bank">Bank CSV</option>
          <option value="polar">Polar settlement</option>
          <option value="stitch">Stitch settlement</option>
        </select>
        <textarea
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          rows={4}
          aria-label="Settlement CSV"
          className="min-h-24 rounded-xl border border-panel-border bg-panel-muted px-3 py-2 font-mono text-[10px] outline-none"
          placeholder="external_ref,amount_cents,fees_cents"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !csv.trim()}
            onClick={() => void importCsv()}
            className="rounded-xl bg-secondary px-3 py-2 text-[11px] font-semibold disabled:opacity-45"
          >
            Import
          </button>
          <button
            type="button"
            disabled={busy || lines.length === 0}
            onClick={() => void autoMatch()}
            className="rounded-xl bg-emerald-400/[0.14] px-3 py-2 text-[11px] font-semibold text-emerald-300 disabled:opacity-45"
          >
            Auto-match
          </button>
        </div>
      </div>
      {message ? <p className="text-[10px] text-muted-foreground">{message}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-panel-border">
        <div className="grid grid-cols-[1.2fr_.7fr_.5fr_.7fr_1fr] gap-3 border-b border-panel-border bg-panel-muted/50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Reference</span><span>Amount</span><span>Fees</span><span>Status</span><span>Action</span>
        </div>
        {lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[1.2fr_.7fr_.5fr_.7fr_1fr] items-center gap-3 border-b border-panel-border px-3 py-2 text-[10px] last:border-b-0">
            <span className="truncate font-mono">{line.externalRef || "No reference"}</span>
            <span className="tabular-nums">{formatCents(line.amountCents)}</span>
            <span className="tabular-nums text-muted-foreground">{formatCents(line.feesCents)}</span>
            <span className={cn("w-fit rounded-full border px-2 py-0.5 capitalize", statusPillClass(line.status))}>{line.status.replaceAll("_", " ")}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => void setLineStatus(line, "disputed")} className="rounded-md bg-rose-400/[0.08] px-2 py-1 text-rose-200">Dispute</button>
              <button type="button" onClick={() => void setLineStatus(line, "unmatched")} className="rounded-md bg-panel-muted px-2 py-1 text-muted-foreground">Unmatch</button>
            </div>
          </div>
        ))}
        {lines.length === 0 ? <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">Import a settlement CSV to start reconciliation.</p> : null}
      </div>
    </div>
  )
}

function CashShiftControl() {
  const {
    open,
    cashSalesCents,
    expectedCashCents,
    loading,
    openingFloat,
    countedCash,
    notes,
    message,
    setOpeningFloat,
    setCountedCash,
    setNotes,
    openShift,
    closeShift,
  } = useCashDrawer()
  const [closeOpen, setCloseOpen] = useState(false)
  const counted = parseZarToCents(countedCash) ?? 0
  const variance = counted - expectedCashCents

  return (
    <div className="rounded-2xl border border-panel-border bg-panel-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cash shift</p>
          <p className="mt-1 text-[12px] text-foreground/70">
            {open ? "Open" : "Closed"}
            <span className="text-muted-foreground"> · </span>
            <span className="tabular-nums">Expected {formatCents(expectedCashCents)}</span>
          </p>
        </div>
        {open ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => setCloseOpen(true)}
            className="rounded-xl border border-amber-400/15 bg-amber-400/[0.08] px-3 py-2 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/[0.13] disabled:opacity-45"
          >
            Close shift
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              inputMode="decimal"
              placeholder="Opening R"
              className="h-9 w-28 rounded-xl border border-panel-border bg-panel-muted px-3 text-[11px] tabular-nums outline-none placeholder:text-muted-foreground/50 focus:border-emerald-400/25"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void openShift()}
              className="rounded-xl bg-emerald-400/[0.12] px-3 py-2 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-400/[0.18] disabled:opacity-45"
            >
              Open
            </button>
          </div>
        )}
      </div>
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-panel-muted px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Opening</p>
            <p className="mt-0.5 text-[12px] tabular-nums text-foreground/75">{formatCents(open.opening_float_cents ?? 0)}</p>
          </div>
          <div className="rounded-xl bg-panel-muted px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Cash sales</p>
            <p className="mt-0.5 text-[12px] tabular-nums text-emerald-300">{formatCents(cashSalesCents)}</p>
          </div>
          <div className="rounded-xl bg-panel-muted px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Expected</p>
            <p className="mt-0.5 text-[12px] tabular-nums text-amber-200">{formatCents(expectedCashCents)}</p>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-[10px] text-muted-foreground">{message}</p> : null}

      <AnimatePresence>
        {closeOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.98, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 8 }}
              className="w-full max-w-md rounded-3xl border border-panel-border bg-popover p-5 text-foreground shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold tracking-tight">Close cash shift?</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Count the drawer and confirm the variance before closing.
                  </p>
                </div>
                <button type="button" onClick={() => setCloseOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Expected</p>
                  <p className="mt-1 text-[13px] font-semibold tabular-nums">{formatCents(expectedCashCents)}</p>
                </div>
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Variance</p>
                  <p className={cn("mt-1 text-[13px] font-semibold tabular-nums", variance === 0 ? "text-foreground/70" : variance > 0 ? "text-emerald-300" : "text-rose-300")}>
                    {variance >= 0 ? "+" : ""}{formatCents(variance)}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <input
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  inputMode="decimal"
                  placeholder="Counted cash amount"
                  className="h-11 w-full rounded-xl border border-panel-border bg-panel-muted px-3 text-[12px] tabular-nums outline-none placeholder:text-muted-foreground/50 focus:border-amber-400/30"
                />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes, variance reason, handover..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-panel-border bg-panel-muted px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-amber-400/30"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCloseOpen(false)} className="rounded-xl border border-panel-border px-3 py-2 text-[12px] text-muted-foreground/80 hover:bg-panel-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading || countedCash.trim() === ""}
                  onClick={() => {
                    void closeShift().then(() => setCloseOpen(false))
                  }}
                  className="rounded-xl bg-amber-400/[0.16] px-3 py-2 text-[12px] font-semibold text-amber-200 hover:bg-amber-400/[0.24] disabled:opacity-45"
                >
                  Confirm close
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function InvoiceQuickPanel({
  invoiceId,
  initialInvoice,
  practiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string
  initialInvoice?: InvoiceRow | null
  practiceId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [invoice, setInvoice] = useState<InvoiceRow | null>(initialInvoice ?? null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [manualAmount, setManualAmount] = useState("")

  const load = useCallback(async () => {
    if (!practiceId) return
    const res = await fetchClient(`/api/billing/invoices/${invoiceId}`)
    if (!res.ok) return
    const j = (await res.json()) as { invoice?: InvoiceRow }
    if (j.invoice) {
      setInvoice(j.invoice)
      setManualAmount(String(Math.max(0, (j.invoice.total_cents ?? 0) - (j.invoice.amount_paid_cents ?? 0)) / 100))
    }
  }, [practiceId, invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  if (!invoice) {
    return (
      <motion.div
        key="inv-detail-loading"
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: "min(560px, 48vw)", opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className="shrink-0 overflow-hidden"
      >
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-panel-border bg-panel-muted/50">
          <p className="text-[12px] text-muted-foreground">Loading invoice...</p>
        </div>
      </motion.div>
    )
  }

  const dueCents = Math.max(0, (invoice.total_cents ?? 0) - (invoice.amount_paid_cents ?? 0))
  const patientName = invoice.patient_snapshot?.name ?? "Patient"
  const statusLabel = invoiceStatusLabel(invoice)
  const lines = lineItems(invoice.line_items)

  const refresh = async (message?: string) => {
    await load()
    onChanged()
    if (message) setMsg(message)
  }

  const ensureIssued = async () => {
    if (invoice.status !== "draft") return
    const res = await fetchClient(`/api/billing/invoices/${invoice.id}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const j = (await res.json()) as { error?: string }
    if (!res.ok) throw new Error(j.error || "Could not issue invoice")
  }

  const pay = async (provider: "polar") => {
    if (!practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${provider}-${invoice.id}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({ provider }),
      })
      const j = (await res.json()) as {
        error?: string
        checkoutUrl?: string
      }
      if (!res.ok) throw new Error(j.error || "Failed")
      if (j.checkoutUrl) setCheckoutUrl(j.checkoutUrl)
      if (j.checkoutUrl) window.open(j.checkoutUrl, "_blank", "noopener,noreferrer")
      await refresh("Polar checkout opened")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const sendSms = async () => {
    if (!practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      await ensureIssued()
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["sms"], issueFirst: true }),
      })
      const j = (await res.json()) as { error?: string; portalUrl?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      if (j.portalUrl) setPortalUrl(j.portalUrl)
      await refresh("SMS pay link sent")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const copyPayLink = async () => {
    if (!practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      await ensureIssued()
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/portal-link`, { method: "POST" })
      const j = (await res.json()) as { portalUrl?: string; error?: string }
      if (!res.ok || !j.portalUrl) throw new Error(j.error || "No payment link")
      await navigator.clipboard.writeText(j.portalUrl)
      setPortalUrl(j.portalUrl)
      await refresh("Pay link copied")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Copy failed")
    } finally {
      setLoading(false)
    }
  }

  const recordManual = async (kind: "cash" | "paid") => {
    if (!practiceId) return
    const cents = kind === "paid" ? dueCents : parseZarToCents(manualAmount)
    if (!cents) {
      setMsg("Enter a valid amount")
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${kind}-${invoice.id}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          provider: "eft_manual",
          amountCents: cents,
          reference: kind === "cash" ? "Cash collected at practice" : "Marked paid from billing",
        }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      await refresh(kind === "cash" ? "Cash recorded" : "Invoice marked paid")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const voice = async () => {
    if (!practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/voice-follow-up`, { method: "POST" })
      const j = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(j.error || "Failed")
      setMsg("Call started")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      key="inv-detail"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="absolute inset-y-0 right-0 z-10 flex w-[460px] flex-col overflow-hidden border-l border-border/40 bg-background/[0.97] backdrop-blur-xl"
    >
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold text-foreground/90">{patientName}</h3>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60 tabular-nums">
              {invoice.invoice_number ?? invoice.id.slice(0, 8)} · {invoice.billing_mode ?? "invoice"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-[11px] text-muted-foreground/65 hover:bg-secondary hover:text-accent-foreground/75"
          >
            Close
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[11px]" style={{ scrollbarWidth: "none" }}>
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Amount due</p>
                <p className="mt-1 text-[28px] font-semibold tracking-tight text-foreground tabular-nums">{formatCents(dueCents)}</p>
              </div>
              <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", statusPillClass(statusLabel, isInvoiceOverdue(invoice)))}>
                {statusLabel}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-secondary/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-foreground/70">{formatCents(invoice.total_cents ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-secondary/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Paid</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-emerald-300">{formatCents(invoice.amount_paid_cents ?? 0)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Invoice lines</p>
            {lines.length > 0 ? (
              <div className="space-y-1.5">
                {lines.map((line, ix) => (
                  <div key={`${line.description}-${ix}`} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2">
                    <span className="min-w-0 truncate text-[11px] text-foreground/75">{line.description}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground/70">{formatCents(line.amountCents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">No line items captured.</p>
            )}
          </div>

          {msg ? <p className="text-muted-foreground/70">{msg}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading || dueCents <= 0}
              onClick={() => void sendSms()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500/18 px-3 py-2.5 font-semibold text-blue-200 hover:bg-blue-500/28 disabled:opacity-40"
            >
              <Bell className="size-3.5" />
              Send pay link
            </button>
            <button
              type="button"
              disabled={loading || dueCents <= 0}
              onClick={() => void pay("polar")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400/[0.14] px-3 py-2.5 font-semibold text-emerald-300 hover:bg-emerald-400/[0.22] disabled:opacity-40"
            >
              <CreditCard className="size-3.5" />
              Polar checkout
            </button>
            <button
              type="button"
              disabled={loading || dueCents <= 0}
              onClick={() => void recordManual("paid")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2.5 font-medium text-foreground/80 hover:bg-accent disabled:opacity-40"
            >
              <Check className="size-3.5" />
              Mark paid
            </button>
            <button
              type="button"
              disabled={loading || dueCents <= 0}
              onClick={() => void voice()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400/[0.14] px-3 py-2.5 font-semibold text-amber-200 hover:bg-amber-400/[0.22] disabled:opacity-40"
            >
              <Microphone className="size-3.5" />
              AI voice
            </button>
          </div>

          <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Collect cash</p>
            <div className="flex gap-2">
              <input
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                inputMode="decimal"
                className="min-w-0 flex-1 rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 text-[12px] tabular-nums outline-none focus:border-emerald-400/25"
              />
              <button
                type="button"
                disabled={loading || dueCents <= 0}
                onClick={() => void recordManual("cash")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-[11px] font-medium text-foreground/75 hover:bg-secondary disabled:opacity-40"
              >
                <Money className="size-3.5" />
                Record
              </button>
            </div>
            <p className="mt-2 text-[9px] text-muted-foreground">Records a manual cash settlement without blocking on drawer state.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || dueCents <= 0}
              onClick={() => void copyPayLink()}
              className="rounded-lg bg-secondary px-2.5 py-1.5 font-medium text-foreground/75 hover:bg-secondary disabled:opacity-40"
            >
              <Copy className="mr-1 inline size-3.5" />
              Copy link
            </button>
            <button
              type="button"
              disabled
              title="Yoco disabled: certified checkout and webhook signature verification are not implemented."
              className="cursor-not-allowed rounded-lg bg-secondary/50 px-2.5 py-1.5 font-medium text-muted-foreground opacity-45"
            >
              Yoco unavailable
            </button>
            <span className="rounded-lg bg-secondary/40 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">
              iKhokha terminal planned
            </span>
            <a
              href={`/api/billing/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-secondary px-2.5 py-1.5 font-medium text-foreground/75 hover:bg-secondary"
            >
              <Printer className="mr-1 inline size-3.5" />
              PDF
            </a>
          </div>
          {(checkoutUrl || portalUrl) && (
            <p className="break-all rounded-xl border border-border/30 bg-secondary/30 px-3 py-2 text-[10px] text-muted-foreground/65">
              {portalUrl ?? checkoutUrl}
            </p>
          )}
        </div>
    </motion.div>
  )
}

export function BillingWorkQueue() {
  const { practiceId } = usePracticeCrypto()
  const { claims: storeClaims, updateClaimStatus, updateClaim, addClaim, patients } = useWorkspace()
  const activeFilter = useWorkspaceStore((s) => s.activeBillingQueueFilter)
  const setActiveFilter = useWorkspaceStore((s) => s.setBillingQueueFilter)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [setupOpen, setSetupOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedClaim, setSelectedClaim] = useState<PracticeClaim | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [focusIdx, setFocusIdx] = useState(0)
  const focusIdxRef = useRef(0)
  useEffect(() => {
    focusIdxRef.current = focusIdx
  }, [focusIdx])

  useEffect(() => {
    if (!practiceId) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await fetchPracticeClaimsForWorkspace(practiceId)
        if (!cancelled) useWorkspaceStore.getState().setClaims(rows)
      } catch (e) {
        console.warn("[BillingWorkQueue] claims", e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId])

  const reloadInvoices = useCallback(async () => {
    if (!practiceId) return
    const [invRes, payRes] = await Promise.all([
      fetchClient("/api/billing/invoices"),
      fetchClient("/api/billing/payments"),
    ])
    if (invRes.ok) {
      const j = (await invRes.json()) as { invoices?: InvoiceRow[] }
      setInvoices(j.invoices ?? [])
    }
    if (payRes.ok) {
      const j = (await payRes.json()) as { payments?: PaymentRow[] }
      setPayments(j.payments ?? [])
    }
  }, [practiceId])

  useEffect(() => {
    void reloadInvoices()
  }, [reloadInvoices, practiceId, storeClaims.length])

  const flatRows = useMemo<QueueRow[]>(() => {
    const rows: QueueRow[] = []
    for (const c of storeClaims) {
      const needsAction = ["draft", "submitted", "rejected", "partial"].includes(c.status)
      rows.push({
        id: `claim-${c.id}`,
        type: "claim",
        claim: c,
        patientName: c.patientName,
        status: c.status,
        totalCents: Math.round((c.totalAmount ?? 0) * 100),
        paidCents: c.status === "paid" ? Math.round((c.totalAmount ?? 0) * 100) : 0,
        dueCents: needsAction ? Math.round((c.totalAmount ?? 0) * 100) : 0,
        createdAt: c.createdAt,
        searchText: `${c.patientName} ${c.status} ${c.totalAmount}`.toLowerCase(),
        needsAction,
        overdue: false,
        partial: c.status === "partial",
        paid: c.status === "paid" || c.status === "approved",
      })
    }
    for (const inv of invoices) {
      const total = inv.total_cents ?? 0
      const paid = inv.amount_paid_cents ?? 0
      const due = Math.max(0, total - paid)
      const overdue = isInvoiceOverdue(inv)
      const patientName = inv.patient_snapshot?.name ?? "Patient"
      rows.push({
        id: `invoice-${inv.id}`,
        type: "invoice",
        invoice: inv,
        patientName,
        status: invoiceStatusLabel(inv),
        totalCents: total,
        paidCents: paid,
        dueCents: due,
        createdAt: inv.created_at ?? "",
        searchText: `${patientName} ${inv.invoice_number ?? ""} ${inv.status} ${total / 100}`.toLowerCase(),
        needsAction: due > 0 && inv.status !== "void",
        overdue,
        partial: paid > 0 && due > 0,
        paid: due <= 0 || inv.status === "paid",
      })
    }

    const needle = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (activeFilter === "needs_action" && !row.needsAction) return false
        if (activeFilter === "claims" && row.type !== "claim") return false
        if (activeFilter === "unpaid" && !(row.type === "invoice" && row.dueCents > 0 && !row.partial)) return false
        if (activeFilter === "partial" && !row.partial) return false
        if (activeFilter === "paid" && !row.paid) return false
        if (activeFilter === "overdue" && !row.overdue) return false
        if (needle && !row.searchText.includes(needle)) return false
        return true
      })
      .sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || Number(b.overdue) - Number(a.overdue) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [storeClaims, invoices, search, activeFilter])

  const stats = useMemo(() => {
    return flatRows.reduce(
      (acc, row) => {
        acc.totalDue += row.dueCents
        if (row.paid) acc.paid += row.paidCents
        if (row.partial) acc.partial += 1
        if (row.overdue) acc.overdue += 1
        return acc
      },
      { totalDue: 0, paid: 0, partial: 0, overdue: 0 }
    )
  }, [flatRows])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (flatRows.length === 0) return
      if (e.key === "j") {
        e.preventDefault()
        setFocusIdx((i) => Math.min(flatRows.length - 1, i + 1))
      }
      if (e.key === "k") {
        e.preventDefault()
        setFocusIdx((i) => Math.max(0, i - 1))
      }
      if (e.key === "Enter") {
        e.preventDefault()
        const row = flatRows[focusIdxRef.current]
        if (!row) return
        if (row.type === "claim" && row.claim) {
          setSelectedClaim(row.claim)
          setSelectedInvoiceId(null)
        }
        if (row.type === "invoice" && row.invoice) {
          setSelectedInvoiceId(row.invoice.id)
          setSelectedClaim(null)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [flatRows])

  const onPickRow = (idx: number) => {
    setFocusIdx(idx)
    const row = flatRows[idx]
    if (!row) return
    if (row.type === "claim" && row.claim) {
      setSelectedClaim(row.claim)
      setSelectedInvoiceId(null)
    }
    if (row.type === "invoice" && row.invoice) {
      setSelectedInvoiceId(row.invoice.id)
      setSelectedClaim(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 p-5">
      <BillingSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />

      <div className="flex shrink-0 flex-col gap-3 border-b border-panel-border pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-foreground/90">Billing</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Claims, patient balances, payment links and cash shift in one queue.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="rounded-xl border border-panel-border px-3 py-2 text-[11px] font-medium text-foreground/70 hover:bg-panel-muted"
            >
              Setup
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-[11px] font-semibold text-foreground/88 hover:bg-accent"
            >
              <Plus className="size-3.5" weight="bold" />
              New claim
            </button>
          </div>
        </div>
        <CashShiftControl />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden pt-3">
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-2xl border border-panel-border bg-panel-muted/40">
          <div className="border-b border-panel-border px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[220px] flex-1">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patient, invoice, status, amount..."
                  className="h-10 w-full rounded-xl border border-panel-border bg-panel-muted pl-9 pr-3 text-[12px] outline-none placeholder:text-muted-foreground/50 focus:border-panel-border"
                />
              </div>
              <div className="grid grid-cols-4 gap-2 text-right sm:flex">
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Due</p>
                  <p className="text-[11px] font-semibold tabular-nums text-amber-200">{formatCents(stats.totalDue)}</p>
                </div>
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Paid</p>
                  <p className="text-[11px] font-semibold tabular-nums text-emerald-300">{formatCents(stats.paid)}</p>
                </div>
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Partial</p>
                  <p className="text-[11px] font-semibold tabular-nums text-foreground/75">{stats.partial}</p>
                </div>
                <div className="rounded-xl bg-panel-muted px-3 py-2">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Overdue</p>
                  <p className="text-[11px] font-semibold tabular-nums text-rose-300">{stats.overdue}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[10px] font-semibold transition-colors",
                    activeFilter === filter.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-panel-muted text-muted-foreground/70 hover:bg-secondary hover:text-accent-foreground/75"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            <div className="min-w-[600px]">
              {activeFilter !== "analytics" && activeFilter !== "reconciliation" ? (
                <div className="grid grid-cols-[1.2fr_0.65fr_0.6fr_0.6fr_0.6fr_0.25fr] gap-3 border-b border-panel-border px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Patient</span>
                  <span>Status</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Paid</span>
                  <span className="text-right">Due</span>
                  <span />
                </div>
              ) : null}
              {activeFilter === "analytics" ? (
                <div className="p-3">
                  <BillingAnalyticsPanel invoices={invoices} payments={payments} />
                </div>
              ) : activeFilter === "reconciliation" ? (
                <ReconciliationPanel />
              ) : (
                flatRows.map((row, idx) => {
                  const active = focusIdx === idx
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onPickRow(idx)}
                      className={cn(
                        "grid w-full grid-cols-[1.2fr_0.65fr_0.6fr_0.6fr_0.6fr_0.25fr] items-center gap-3 border-b border-panel-border px-4 py-3 text-left transition-colors",
                        active ? "bg-amber-400/[0.08]" : "hover:bg-panel-muted/50"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-foreground/86">{row.patientName}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {row.type === "claim" ? "Medical aid claim" : row.invoice.invoice_number ?? row.invoice.id.slice(0, 8)}
                        </span>
                      </span>
                      <span>
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold capitalize", statusPillClass(row.status, row.overdue))}>
                          {row.status.replaceAll("_", " ")}
                        </span>
                      </span>
                      <span className="text-right text-[11px] tabular-nums text-muted-foreground/80">{formatCents(row.totalCents)}</span>
                      <span className="text-right text-[11px] tabular-nums text-emerald-300/80">{formatCents(row.paidCents)}</span>
                      <span className={cn("text-right text-[11px] font-semibold tabular-nums", row.dueCents > 0 ? "text-amber-200" : "text-muted-foreground")}>{formatCents(row.dueCents)}</span>
                      <span className="text-right text-muted-foreground">
                        <ArrowSquareOut className="ml-auto size-3.5" />
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            {activeFilter !== "analytics" && activeFilter !== "reconciliation" && flatRows.length === 0 && (
              <div className="px-4 py-10 text-center text-[11px] leading-relaxed text-muted-foreground">
                No billing rows match this view. Try another filter or search term.
              </div>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selectedClaim ? (
            <ClaimDetailPanel
              claim={selectedClaim}
              onClose={() => setSelectedClaim(null)}
              onUpdateClaim={(id, update) => {
                updateClaim(id, update)
                setSelectedClaim((prev) => (prev && prev.id === id ? { ...prev, ...update } : prev))
              }}
              onUpdateStatus={(id, status) => {
                updateClaimStatus(id, status)
                setSelectedClaim((prev) => (prev && prev.id === id ? { ...prev, status } : prev))
              }}
              onInvoiceCreated={(id) => {
                setSelectedClaim(null)
                setSelectedInvoiceId(id)
                void reloadInvoices()
              }}
            />
          ) : selectedInvoiceId ? (
            <InvoiceQuickPanel
              invoiceId={selectedInvoiceId}
              initialInvoice={invoices.find((i) => i.id === selectedInvoiceId)}
              practiceId={practiceId}
              onClose={() => setSelectedInvoiceId(null)}
              onChanged={() => void reloadInvoices()}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateClaimModal
            practiceId={practiceId}
            patients={patients}
            onSave={(c) => {
              addClaim(c)
              setShowCreate(false)
            }}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
