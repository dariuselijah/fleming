"use client"

import { X, TrendUp, Receipt, CheckCircle, XCircle } from "@phosphor-icons/react"
import { fetchClient } from "@/lib/fetch"
import { motion } from "motion/react"
import { useEffect, useMemo, useState } from "react"

type DailyRevenue = { day: string; amountCents: number; count: number }

function formatZAR(amount: number): string {
  return `R${(amount / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SalesPulse({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<DailyRevenue[]>([])
  useEffect(() => {
    ;(async () => {
      const res = await fetchClient("/api/billing/reports/daily-revenue")
      if (!res.ok) return
      const j = (await res.json()) as { rows?: DailyRevenue[] }
      setRows(j.rows ?? [])
    })()
  }, [])
  const today = new Date().toISOString().slice(0, 10)
  const totalToday = rows.find((r) => r.day === today)?.amountCents ?? 0
  const countToday = rows.find((r) => r.day === today)?.count ?? 0
  const chartRows = useMemo(() => rows.slice(-8), [rows])
  const maxRevenue = Math.max(...chartRows.map((d) => d.amountCents), 1)

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
            {formatZAR(totalToday)}
          </span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {countToday} payments · live billing ledger
          </p>
        </div>

        {/* Sparkline bar chart */}
        <div className="mb-4 flex items-end gap-1.5">
          {chartRows.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative h-16 w-full rounded-t-sm bg-muted/30">
                <div
                  className="absolute bottom-0 w-full rounded-t-sm bg-emerald-500/60"
                  style={{ height: `${(d.amountCents / maxRevenue) * 100}%` }}
                />
              </div>
              <span className="text-[8px] text-muted-foreground">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>

        {/* Claims stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <Receipt className="mx-auto size-4 text-blue-500" />
            <span className="mt-1 block text-lg font-bold tabular-nums">{countToday}</span>
            <span className="text-[10px] text-muted-foreground">Payments</span>
          </div>
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <CheckCircle className="mx-auto size-4 text-emerald-500" weight="fill" />
            <span className="mt-1 block text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{rows.length}</span>
            <span className="text-[10px] text-muted-foreground">Days</span>
          </div>
          <div className="rounded-xl border border-border/30 bg-card p-3 text-center">
            <XCircle className="mx-auto size-4 text-red-500" weight="fill" />
            <span className="mt-1 block text-lg font-bold tabular-nums text-red-600 dark:text-red-400">0</span>
            <span className="text-[10px] text-muted-foreground">Mock</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
