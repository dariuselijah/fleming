"use client"

import { X, CurrencyDollar, TrendUp, Receipt, CheckCircle, XCircle } from "@phosphor-icons/react"
import { motion } from "motion/react"

interface DayMetrics {
  totalRevenue: number
  claimsSubmitted: number
  claimsApproved: number
  claimsRejected: number
  consultations: number
  avgRevenuePerConsult: number
}

const MOCK_METRICS: DayMetrics = {
  totalRevenue: 12450,
  claimsSubmitted: 18,
  claimsApproved: 15,
  claimsRejected: 2,
  consultations: 16,
  avgRevenuePerConsult: 778,
}

const HOURLY_DATA = [
  { hour: "08:00", revenue: 2400 },
  { hour: "09:00", revenue: 1800 },
  { hour: "10:00", revenue: 2200 },
  { hour: "11:00", revenue: 1600 },
  { hour: "12:00", revenue: 450 },
  { hour: "13:00", revenue: 0 },
  { hour: "14:00", revenue: 2100 },
  { hour: "15:00", revenue: 1900 },
]

function formatZAR(amount: number): string {
  return `R${amount.toLocaleString()}`
}

export function SalesPulse({ onClose }: { onClose: () => void }) {
  const maxRevenue = Math.max(...HOURLY_DATA.map((d) => d.revenue), 1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="absolute right-4 bottom-4 z-50 w-[380px] rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendUp className="size-4 text-emerald-500" weight="bold" />
          <h3 className="text-sm font-semibold">Today&apos;s Revenue</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="p-4">
        {/* Main revenue figure */}
        <div className="mb-4 text-center">
          <span className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatZAR(MOCK_METRICS.totalRevenue)}
          </span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {MOCK_METRICS.consultations} consultations · avg {formatZAR(MOCK_METRICS.avgRevenuePerConsult)}/consult
          </p>
        </div>

        {/* Sparkline bar chart */}
        <div className="mb-4 flex items-end gap-1.5">
          {HOURLY_DATA.map((d) => (
            <div key={d.hour} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative h-16 w-full rounded-t-sm bg-muted/30">
                <div
                  className="absolute bottom-0 w-full rounded-t-sm bg-emerald-500/60"
                  style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
                />
              </div>
              <span className="text-[8px] text-muted-foreground">{d.hour.split(":")[0]}</span>
            </div>
          ))}
        </div>

        {/* Claims stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <Receipt className="mx-auto size-4 text-blue-500" />
            <span className="mt-1 block text-lg font-bold tabular-nums">{MOCK_METRICS.claimsSubmitted}</span>
            <span className="text-[10px] text-muted-foreground">Submitted</span>
          </div>
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <CheckCircle className="mx-auto size-4 text-emerald-500" weight="fill" />
            <span className="mt-1 block text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{MOCK_METRICS.claimsApproved}</span>
            <span className="text-[10px] text-muted-foreground">Approved</span>
          </div>
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <XCircle className="mx-auto size-4 text-red-500" weight="fill" />
            <span className="mt-1 block text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{MOCK_METRICS.claimsRejected}</span>
            <span className="text-[10px] text-muted-foreground">Rejected</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
