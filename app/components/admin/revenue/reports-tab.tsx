"use client"

import { fetchClient } from "@/lib/fetch"
import { ChartLineUp, Printer } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { BentoTile } from "../bento-tile"
import { formatZarCents } from "./ui/format"
import { EmptyRevenueState, RevenueTable } from "./ui/primitives"

type AgingBucket = { bucket: string; amountCents: number; count: number }
type PayerMix = { provider: string; amountCents: number; count: number }
type DailyRevenue = { day: string; amountCents: number; count: number }
type Summary = { monthRevenueCents: number; monthLastCents: number; arBalanceCents: number; topPayer: string }

const PAYER_COLORS = ["#10b981", "#60a5fa", "#a78bfa", "#f59e0b", "#f87171"]

export function ReportsTab() {
  const [aging, setAging] = useState<AgingBucket[]>([])
  const [payerMix, setPayerMix] = useState<PayerMix[]>([])
  const [daily, setDaily] = useState<DailyRevenue[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [a, p, d, s] = await Promise.all([
        fetchClient("/api/billing/reports/aging"),
        fetchClient("/api/billing/reports/payer-mix"),
        fetchClient("/api/billing/reports/daily-revenue"),
        fetchClient("/api/billing/reports/summary"),
      ])
      if (a.ok) setAging(((await a.json()) as { buckets?: AgingBucket[] }).buckets ?? [])
      if (p.ok) setPayerMix(((await p.json()) as { rows?: PayerMix[] }).rows ?? [])
      if (d.ok) setDaily(((await d.json()) as { rows?: DailyRevenue[] }).rows ?? [])
      if (s.ok) setSummary((await s.json()) as Summary)
    })()
  }, [])

  const exportCsv = (name: string, rows: Record<string, string | number>[]) => {
    const headers = Object.keys(rows[0] ?? {})
    const body = [headers.join(","), ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const printMonthlyPack = async () => {
    const month = new Date().toISOString().slice(0, 7)
    const res = await fetchClient(`/api/billing/statements?month=${month}`, { method: "POST", body: JSON.stringify({}) })
    const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (res.ok && j.url) window.open(j.url, "_blank", "noopener,noreferrer")
    setMessage(res.ok ? "Monthly pack generated." : j.error ?? "Could not generate monthly pack.")
  }

  const hasData = aging.length + payerMix.length + daily.length > 0

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Month revenue" value={formatZarCents(summary?.monthRevenueCents ?? 0)} accent="#10b981" />
        <Kpi label="Last month" value={formatZarCents(summary?.monthLastCents ?? 0)} accent="#60a5fa" />
        <Kpi label="AR balance" value={formatZarCents(summary?.arBalanceCents ?? 0)} accent="#f59e0b" />
        <Kpi label="Top payer" value={summary?.topPayer?.replace(/_/g, " ") ?? "—"} accent="#a78bfa" />
      </div>

      {!hasData ? (
        <BentoTile>
          <EmptyRevenueState
            title="Reports fill up as revenue flows"
            body="Open a shift, send an invoice, or post a payment and this dashboard will populate with aging, payer mix and daily revenue trends."
            action={
              <button type="button" className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/30">
                Open Today / POS
              </button>
            }
          />
        </BentoTile>
      ) : null}

      {/* Chart row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <BentoTile
          title="AR aging"
          subtitle="Outstanding by age bucket"
          icon={<ChartLineUp className="size-4 text-amber-400" weight="fill" />}
          action={<CsvButton onClick={() => exportCsv("ar-aging.csv", aging)} />}
        >
          <AgingBar rows={aging} />
          <DataTable
            headers={["Bucket", "Invoices", "Amount"]}
            rows={aging.map((r) => [r.bucket, String(r.count), formatZarCents(r.amountCents)])}
          />
        </BentoTile>

        <BentoTile
          title="Payer mix"
          subtitle="Succeeded payments by provider"
          action={<CsvButton onClick={() => exportCsv("payer-mix.csv", payerMix)} />}
        >
          <Donut rows={payerMix} />
          <DataTable
            headers={["Provider", "Count", "Amount"]}
            rows={payerMix.map((r) => [r.provider.replace(/_/g, " "), String(r.count), formatZarCents(r.amountCents)])}
          />
        </BentoTile>

        <BentoTile
          title="Daily revenue"
          subtitle="Last 30 days"
          action={<CsvButton onClick={() => exportCsv("daily-revenue.csv", daily)} />}
        >
          <AreaChart rows={daily} />
          <DataTable
            headers={["Day", "Payments", "Amount"]}
            rows={daily.slice(-7).map((r) => [r.day, String(r.count), formatZarCents(r.amountCents)])}
          />
        </BentoTile>
      </div>

      {/* Per-doctor */}
      <BentoTile
        title="Per-doctor breakdown"
        subtitle="Preview — attribution coming soon"
        action={
          <button
            type="button"
            onClick={() => void printMonthlyPack()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-white/[0.15] hover:text-foreground dark:border-white/[0.08]"
          >
            <Printer className="size-3.5" />
            Print monthly pack
          </button>
        }
      >
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-foreground/60">Per-doctor reporting is next</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Groups by received_by_user_id once provider attribution is wired up</p>
        </div>
        {message ? <p className="mt-2 text-center text-[11px] text-muted-foreground">{message}</p> : null}
      </BentoTile>
    </div>
  )
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-white/[0.15] hover:text-foreground dark:border-white/[0.08]"
    >
      Export CSV
    </button>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 dark:border-white/[0.07] dark:bg-white/[0.03]">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: accent }} />
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2.5 text-2xl font-semibold tracking-tight">{value}</p>
      <svg viewBox="0 0 120 28" className="mt-3 h-7 w-full">
        <path d="M0 20 C18 4, 32 22, 52 12 S88 8, 120 16" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      </svg>
    </div>
  )
}

const AGING_COLORS = ["#10b981", "#f59e0b", "#f97316", "#ef4444"]

function AgingBar({ rows }: { rows: AgingBucket[] }) {
  const total = rows.reduce((sum, r) => sum + r.amountCents, 0) || 1
  if (rows.every((r) => r.amountCents === 0)) {
    return (
      <div className="mb-4 flex h-8 items-center justify-center rounded-lg bg-muted/30">
        <span className="text-[10px] text-muted-foreground">No overdue invoices</span>
      </div>
    )
  }
  let x = 0
  return (
    <div className="mb-4">
      <svg viewBox="0 0 320 36" className="h-9 w-full">
        {rows.map((row, i) => {
          const width = Math.max((row.amountCents / total) * 316, row.amountCents > 0 ? 12 : 0)
          const rect = (
            <rect
              key={row.bucket}
              x={x + (i > 0 ? 2 : 0)}
              y="8"
              width={width}
              height="20"
              rx="5"
              style={{ fill: AGING_COLORS[i] }}
              opacity={0.85}
            />
          )
          x += width + (i > 0 ? 2 : 0)
          return rect
        })}
      </svg>
      <div className="mt-1.5 flex gap-4">
        {rows.map((row, i) => (
          <div key={row.bucket} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full flex-shrink-0" style={{ background: AGING_COLORS[i] }} />
            <span className="text-[10px] text-muted-foreground">{row.bucket} days</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Donut({ rows }: { rows: PayerMix[] }) {
  const total = rows.reduce((sum, r) => sum + r.amountCents, 0) || 1
  const R = 38
  const C = 2 * Math.PI * R
  let offset = 0
  const slices = rows.map((row, i) => {
    const frac = row.amountCents / total
    const el = (
      <circle
        key={row.provider}
        cx="50"
        cy="50"
        r={R}
        fill="none"
        strokeWidth="20"
        strokeDasharray={`${frac * C} ${C}`}
        strokeDashoffset={-offset * C}
        style={{ stroke: PAYER_COLORS[i % PAYER_COLORS.length] }}
      />
    )
    offset += frac
    return el
  })

  return (
    <div className="mb-3 flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="20" style={{ stroke: "rgba(255,255,255,0.05)" }} />
        {slices}
      </svg>
      <div className="space-y-1.5">
        {rows.slice(0, 5).map((row, i) => (
          <div key={row.provider} className="flex items-center gap-2">
            <span className="size-2 rounded-full shrink-0" style={{ background: PAYER_COLORS[i % PAYER_COLORS.length] }} />
            <span className="text-[11px] capitalize">{row.provider.replace(/_/g, " ")}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{Math.round((row.amountCents / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AreaChart({ rows }: { rows: DailyRevenue[] }) {
  if (rows.length < 2) return <div className="mb-4 h-24 rounded-xl bg-muted/20" />
  const max = Math.max(...rows.map((r) => r.amountCents), 1)
  const W = 320
  const H = 80
  const pts = rows.map((r, i) => {
    const x = (i / (rows.length - 1)) * W
    const y = H - (r.amountCents / max) * (H - 12)
    return `${x},${y}`
  })
  const line = pts.join(" ")
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mb-4 h-24 w-full overflow-visible">
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#area-grad)" />
      <polyline points={line} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <RevenueTable>
      <thead className="bg-muted/40 text-muted-foreground dark:bg-white/[0.03]">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join(":")} className="border-t border-border/60 dark:border-white/[0.06]">
            {row.map((cell, ci) => (
              <td key={ci} className="px-3 py-2 text-[11px]">{cell}</td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={headers.length} className="px-3 py-6 text-center text-[11px] text-muted-foreground">No data yet</td>
          </tr>
        )}
      </tbody>
    </RevenueTable>
  )
}
