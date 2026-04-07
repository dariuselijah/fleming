"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  TrendUp,
  TrendDown,
  Clock,
  Timer,
  Hourglass,
  ChartLineUp,
  Receipt,
  Warning,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { useMemo, useState } from "react"

type Period = "today" | "week" | "month" | "quarter"

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function getPeriodRange(period: Period): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start: Date
  let prevStart: Date
  let prevEnd: Date

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      prevEnd = new Date(start.getTime() - 1)
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate())
      break
    }
    case "week": {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
      prevEnd = new Date(start.getTime() - 1)
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - 6)
      break
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      prevEnd = new Date(start.getTime() - 1)
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1)
      break
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      const prevQ = q === 0 ? 3 : q - 1
      const prevY = q === 0 ? now.getFullYear() - 1 : now.getFullYear()
      prevStart = new Date(prevY, prevQ * 3, 1)
      prevEnd = new Date(start.getTime() - 1)
      break
    }
  }

  return { start, end, prevStart, prevEnd }
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `R${(n / 1_000).toFixed(1)}k`
  return `R${n.toLocaleString()}`
}

const DEMO_CHART_MA = [8200, 12400, 9800, 16200, 13800, 20100, 22400, 18600, 25200, 28400, 24600, 30200]
const DEMO_CHART_CASH = [3400, 5100, 4200, 5800, 5200, 7600, 8200, 7400, 8800, 9600, 8100, 10800]
const DEMO_CHART_TOTAL = DEMO_CHART_MA.map((v, i) => v + DEMO_CHART_CASH[i])

const DEMO_PROCEDURES = [
  { code: "0190", description: "Consultation", count: 45, revenue: 20250 },
  { code: "0191", description: "Extended Consultation", count: 12, revenue: 8400 },
  { code: "0023", description: "Follow-up Visit", count: 28, revenue: 5600 },
  { code: "0192", description: "Comprehensive Exam", count: 8, revenue: 7200 },
  { code: "1112", description: "ECG Recording", count: 6, revenue: 2400 },
]

export function BentoSales() {
  const { claims } = useWorkspace()
  const [period, setPeriod] = useState<Period>("month")

  const isDemo = claims.length === 0

  const { start, end, prevStart, prevEnd } = useMemo(() => getPeriodRange(period), [period])

  const analytics = useMemo(() => {
    if (isDemo) {
      return {
        totalRevenue: 41000,
        maRevenue: 30200,
        cashRevenue: 10800,
        outstanding: 3200,
        prevTotalRevenue: 36500,
        prevMaRevenue: 27000,
        prevCashRevenue: 9500,
        prevOutstanding: 4100,
        paidCount: 93,
        totalClaimCount: 98,
        rejectedCount: 5,
        stuckClaims: 2,
        stuckAmount: 3200,
        highOutstanding: 1,
        highOutstandingAmount: 6200,
      }
    }

    let totalRevenue = 0, maRevenue = 0, cashRevenue = 0, outstanding = 0
    let prevTotalRevenue = 0, prevMaRevenue = 0, prevCashRevenue = 0, prevOutstanding = 0
    let paidCount = 0, totalClaimCount = 0, rejectedCount = 0
    let stuckClaims = 0, stuckAmount = 0
    let highOutstanding = 0, highOutstandingAmount = 0

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    for (const c of claims) {
      const created = new Date(c.createdAt)
      const inPeriod = created >= start && created <= end
      const inPrev = created >= prevStart && created <= prevEnd

      if (inPeriod) {
        totalClaimCount++
        if (c.status === "paid" || c.status === "approved") {
          totalRevenue += c.totalAmount
          maRevenue += c.medicalAidAmount
          cashRevenue += c.cashAmount
          if (c.status === "paid") paidCount++
        }
        if (c.status === "rejected") rejectedCount++
        if (c.status === "submitted" || c.status === "partial") {
          outstanding += c.totalAmount
        }
      }

      if (inPrev) {
        if (c.status === "paid" || c.status === "approved") {
          prevTotalRevenue += c.totalAmount
          prevMaRevenue += c.medicalAidAmount
          prevCashRevenue += c.cashAmount
        }
        if (c.status === "submitted" || c.status === "partial") {
          prevOutstanding += c.totalAmount
        }
      }

      if (c.status === "submitted" && c.submittedAt && new Date(c.submittedAt) < thirtyDaysAgo) {
        stuckClaims++
        stuckAmount += c.totalAmount
      }

      if ((c.status === "submitted" || c.status === "partial") && c.totalAmount > 5000) {
        highOutstanding++
        highOutstandingAmount += c.totalAmount
      }
    }

    return {
      totalRevenue, maRevenue, cashRevenue, outstanding,
      prevTotalRevenue, prevMaRevenue, prevCashRevenue, prevOutstanding,
      paidCount, totalClaimCount, rejectedCount,
      stuckClaims, stuckAmount,
      highOutstanding, highOutstandingAmount,
    }
  }, [claims, isDemo, start, end, prevStart, prevEnd])

  const procedures = useMemo(() => {
    if (isDemo) return DEMO_PROCEDURES

    const map = new Map<string, { code: string; description: string; count: number; revenue: number }>()
    for (const c of claims) {
      const created = new Date(c.createdAt)
      if (created < start || created > end) continue
      if (c.status !== "paid" && c.status !== "approved") continue
      for (const line of c.lines) {
        const key = line.tariffCode || line.description
        const existing = map.get(key)
        if (existing) {
          existing.count++
          existing.revenue += line.amount
        } else {
          map.set(key, {
            code: line.tariffCode || "—",
            description: line.description,
            count: 1,
            revenue: line.amount,
          })
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
  }, [claims, isDemo, start, end])

  const chartData = useMemo(() => {
    if (isDemo) {
      return { ma: DEMO_CHART_MA, cash: DEMO_CHART_CASH, total: DEMO_CHART_TOTAL }
    }

    const now = new Date()
    const ma = new Array(12).fill(0)
    const cash = new Array(12).fill(0)
    for (const c of claims) {
      if (c.status !== "paid" && c.status !== "approved") continue
      const d = new Date(c.createdAt)
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (monthsAgo >= 0 && monthsAgo < 12) {
        const idx = 11 - monthsAgo
        ma[idx] += c.medicalAidAmount
        cash[idx] += c.cashAmount
      }
    }
    return { ma, cash, total: ma.map((v, i) => v + cash[i]) }
  }, [claims, isDemo])

  const chartLabels = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const m = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return MONTHS[m.getMonth()]
    })
  }, [])

  function pctChange(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null
    return ((current - previous) / previous) * 100
  }

  const collectionRate = analytics.totalClaimCount > 0
    ? (analytics.paidCount / analytics.totalClaimCount) * 100
    : isDemo ? 94.9 : 0

  const avgConsultValue = analytics.paidCount > 0
    ? analytics.totalRevenue / analytics.paidCount
    : isDemo ? 441 : 0

  const rejectionRate = analytics.totalClaimCount > 0
    ? (analytics.rejectedCount / analytics.totalClaimCount) * 100
    : isDemo ? 4.8 : 0

  const revenueCards: {
    label: string
    value: number
    prev: number
    color: string
    icon: typeof Receipt
  }[] = [
    { label: "Total Revenue", value: analytics.totalRevenue, prev: analytics.prevTotalRevenue, color: "text-foreground", icon: ChartLineUp },
    { label: "Medical Aid", value: analytics.maRevenue, prev: analytics.prevMaRevenue, color: "text-blue-400", icon: Receipt },
    { label: "Cash Revenue", value: analytics.cashRevenue, prev: analytics.prevCashRevenue, color: "text-[#00E676]", icon: Receipt },
    { label: "Outstanding", value: analytics.outstanding, prev: analytics.prevOutstanding, color: "text-[#FFC107]", icon: Clock },
  ]

  const alertItems: { label: string; detail: string; severity: "amber" | "red" }[] = []
  if (analytics.stuckClaims > 0) {
    alertItems.push({
      label: `${analytics.stuckClaims} claim${analytics.stuckClaims !== 1 ? "s" : ""} pending >30 days`,
      detail: fmtCurrency(analytics.stuckAmount),
      severity: "amber",
    })
  }
  if (analytics.highOutstanding > 0) {
    alertItems.push({
      label: `${analytics.highOutstanding} outstanding >R5,000`,
      detail: fmtCurrency(analytics.highOutstandingAmount),
      severity: "red",
    })
  }
  if (rejectionRate > 5) {
    alertItems.push({
      label: "Rejection rate above 5%",
      detail: `${rejectionRate.toFixed(1)}%`,
      severity: "red",
    })
  }
  if (alertItems.length === 0) {
    alertItems.push({ label: "No alerts", detail: "All clear", severity: "amber" })
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Date range picker */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Analytics</h2>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-0.5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-lg px-3 py-1 text-[11px] font-medium transition-all",
                period === p
                  ? "bg-white/10 text-foreground shadow-sm"
                  : "text-white/40 hover:text-white/60"
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {isDemo && (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
          <ChartLineUp className="size-3.5 text-white/30" />
          <span className="text-[10px] text-white/30">Demo data — submit claims to see real analytics</span>
        </div>
      )}

      {/* Revenue Cards */}
      <div className="grid grid-cols-4 gap-3">
        {revenueCards.map((card) => {
          const change = pctChange(card.value, card.prev)
          const isPositive = change !== null && change >= 0
          const isOutstanding = card.label === "Outstanding"
          return (
            <BentoTile key={card.label} className="!p-0">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <card.icon className={cn("size-3.5", card.color)} weight="fill" />
                  <span className="text-[10px] text-white/40">{card.label}</span>
                </div>
                <span className={cn("text-xl font-bold tabular-nums", card.color)}>
                  {fmtCurrency(card.value)}
                </span>
                {change !== null && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
                      isOutstanding
                        ? isPositive ? "text-[#FFC107]" : "text-[#00E676]"
                        : isPositive ? "text-[#00E676]" : "text-[#EF5350]"
                    )}
                  >
                    {isPositive ? <TrendUp className="size-2.5" /> : <TrendDown className="size-2.5" />}
                    {isPositive ? "+" : ""}{change.toFixed(1)}% vs prev
                  </span>
                )}
              </div>
            </BentoTile>
          )
        })}
      </div>

      {/* Revenue Chart */}
      <BentoTile title="Revenue Trend" subtitle="12-month overview">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {fmtCurrency(analytics.totalRevenue)}
          </span>
          {(() => {
            const change = pctChange(analytics.totalRevenue, analytics.prevTotalRevenue)
            if (change === null) return null
            const up = change >= 0
            return (
              <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-[#00E676]" : "text-[#EF5350]")}>
                {up ? <TrendUp className="size-3" /> : <TrendDown className="size-3" />}
                {up ? "+" : ""}{change.toFixed(1)}%
              </span>
            )
          })()}
        </div>
        <LineChart
          datasets={[
            { data: chartData.total, color: "#ffffff", label: "Total" },
            { data: chartData.ma, color: "#3b82f6", label: "Medical Aid" },
            { data: chartData.cash, color: "#00E676", label: "Cash" },
          ]}
          labels={chartLabels}
        />
        <div className="mt-2 flex gap-5 text-[10px]">
          <Legend color="#3b82f6" label={`Medical Aid: ${fmtCurrency(analytics.maRevenue)}`} />
          <Legend color="#00E676" label={`Cash: ${fmtCurrency(analytics.cashRevenue)}`} />
          <Legend color="#ffffff" label={`Total: ${fmtCurrency(analytics.totalRevenue)}`} />
        </div>
      </BentoTile>

      {/* Bottom Row */}
      <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: "1fr 280px 220px" }}>
        {/* Top Procedures */}
        <BentoTile title="Top Procedures" subtitle={`By revenue · ${PERIOD_LABELS[period]}`}>
          {procedures.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-white/25">No procedure data for this period</p>
          ) : (
            <div className="space-y-2.5">
              {procedures.map((proc, i) => {
                const maxRevenue = procedures[0]?.revenue || 1
                return (
                  <div key={`${proc.code}-${i}`} className="flex items-center gap-3 rounded-lg px-1 -mx-1 transition-colors hover:bg-white/[0.02]">
                    <span className="w-4 text-right text-[10px] tabular-nums text-white/20">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-semibold text-foreground">{proc.description}</span>
                        <span className="text-[9px] tabular-nums text-white/20">{proc.code}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-[#00E676]/50"
                            style={{ width: `${(proc.revenue / maxRevenue) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-white/25">×{proc.count}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-foreground">
                      {fmtCurrency(proc.revenue)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </BentoTile>

        {/* Key Metrics */}
        <BentoTile title="Key Metrics" subtitle="Performance indicators">
          <div className="space-y-3">
            <MetricRow
              icon={TrendUp}
              color="text-[#00E676]"
              value={`${collectionRate.toFixed(1)}%`}
              label="Collection Rate"
              sub="Paid / Total"
            />
            <MetricRow
              icon={Receipt}
              color="text-blue-400"
              value={fmtCurrency(avgConsultValue)}
              label="Avg Consult Value"
              sub="Revenue / Claims"
            />
            <MetricRow
              icon={Timer}
              color="text-white/60"
              value="14.2 days"
              label="Avg Settlement Time"
              sub="Medical Aid"
            />
            <MetricRow
              icon={Hourglass}
              color={rejectionRate > 5 ? "text-[#EF5350]" : "text-[#FFC107]"}
              value={`${rejectionRate.toFixed(1)}%`}
              label="Rejection Rate"
              sub="Rejected / Total"
            />
          </div>
        </BentoTile>

        {/* Alerts */}
        <BentoTile
          title="Alerts"
          glow={alertItems.some((a) => a.severity === "red") ? "red" : alertItems[0]?.label !== "No alerts" ? "amber" : undefined}
        >
          <div className="space-y-2.5">
            {alertItems.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                  alert.severity === "red" ? "bg-[#EF5350]/[0.06]" : "bg-[#FFC107]/[0.06]"
                )}
              >
                <Warning
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    alert.severity === "red" ? "text-[#EF5350]" : "text-[#FFC107]"
                  )}
                  weight="fill"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground">{alert.label}</p>
                  <p className="text-[10px] tabular-nums text-white/30">{alert.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </BentoTile>
      </div>
    </div>
  )
}

function MetricRow({
  icon: Icon,
  color,
  value,
  label,
  sub,
}: {
  icon: typeof TrendUp
  color: string
  value: string
  label: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 -mx-1 transition-colors hover:bg-white/[0.02]">
      <Icon className={cn("size-5 shrink-0", color)} weight="fill" />
      <div className="flex-1">
        <p className="text-[12px] font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-[9px] text-white/25">{label} · {sub}</p>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-white/40">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

interface Dataset {
  data: number[]
  color: string
  label: string
}

function LineChart({ datasets, labels }: { datasets: Dataset[]; labels: string[] }) {
  const W = 600, H = 120, PX = 32, PY = 8
  const plotW = W - PX * 2
  const plotH = H - PY * 2

  const allMax = Math.max(...datasets.flatMap((d) => d.data), 1)
  const stepX = plotW / (labels.length - 1)

  const toPoints = (data: number[]) =>
    data.map((v, i) => ({ x: PX + i * stepX, y: PY + plotH - (v / allMax) * plotH }))

  const toPath = (points: { x: number; y: number }[]) =>
    points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(" ")

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => PY + plotH * (1 - pct))

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
      {gridLines.map((y, i) => (
        <line key={i} x1={PX} y1={y} x2={W - PX} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      ))}
      {labels.map((label, i) => (
        <text
          key={`${label}-${i}`}
          x={PX + i * stepX}
          y={H - 1}
          textAnchor="middle"
          fontSize={8}
          fill="rgba(255,255,255,0.15)"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {label}
        </text>
      ))}
      {datasets.map((ds) => {
        const pts = toPoints(ds.data)
        const d = toPath(pts)
        const fillPath = `${d} L${pts[pts.length - 1].x},${PY + plotH} L${pts[0].x},${PY + plotH} Z`
        return (
          <g key={ds.label}>
            <path d={fillPath} fill={ds.color} fillOpacity={0.04} />
            <path
              d={d}
              fill="none"
              stroke={ds.color}
              strokeWidth={ds.label === "Total" ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={ds.label === "Total" ? 0.3 : 0.8}
            />
            {pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={ds.label === "Total" ? 0 : 2} fill={ds.color} opacity={0.6} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
