"use client"

import { cn } from "@/lib/utils"
import {
  ArrowsDownUp,
  ChartBar,
  CircleNotch,
  FileText,
  GearSix,
  ShieldCheck,
  Storefront,
} from "@phosphor-icons/react"
import { useState } from "react"
import { BentoTile } from "../bento-tile"
import { ClaimsTab } from "./claims-tab"
import { InvoicesTab } from "./invoices-tab"
import { ReconciliationTab } from "./reconciliation-tab"
import { ReportsTab } from "./reports-tab"
import { SettingsTab } from "./settings-tab"
import { TodayTab } from "./today-tab"
import { useRevenueData } from "./use-revenue-data"
import { formatZarCents } from "./ui/format"

type RevenueTab = "today" | "invoices" | "claims" | "reconciliation" | "reports" | "settings"

const TABS: { id: RevenueTab; label: string; icon: typeof Storefront }[] = [
  { id: "today", label: "Today / POS", icon: Storefront },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "claims", label: "Claims", icon: ShieldCheck },
  { id: "reconciliation", label: "Reconciliation", icon: ArrowsDownUp },
  { id: "reports", label: "Reports", icon: ChartBar },
  { id: "settings", label: "Settings", icon: GearSix },
]

export function RevenueWorkspace() {
  const [tab, setTab] = useState<RevenueTab>("today")
  const data = useRevenueData()
  const monthCollectedCents = data.payments
    .filter((p) => {
      const raw = p.succeeded_at ?? p.created_at
      if (!raw) return false
      const d = new Date(raw)
      const now = new Date()
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && p.status === "succeeded"
    })
    .reduce((sum, p) => sum + p.amount_cents, 0)

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-1 pb-12 2xl:max-w-none 2xl:px-3">
      <header className="rounded-3xl border border-border bg-card/95 p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Revenue cycle</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Practice revenue command center</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage cash, card, EFT, medical-aid claims, reconciliation, reports and dunning from one ledger.
            </p>
          </div>
          <div className="grid min-w-[min(100%,720px)] gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <HeaderMetric label="Today" value={formatZarCents(data.summary.todayCents)} />
            <HeaderMetric label="Outstanding" value={formatZarCents(data.summary.outstandingCents)} />
            <HeaderMetric label="Drawer" value={data.drawer ? "Open" : "Closed"} tone={data.drawer ? "green" : "amber"} />
            <HeaderMetric label="Collected this month" value={formatZarCents(monthCollectedCents)} tone="green" />
          </div>
        </div>
      </header>
      <div className="sticky top-0 z-20 py-1">
        <nav
          className="flex gap-0.5 overflow-x-auto rounded-2xl border border-border/70 bg-muted/60 p-1 shadow-sm backdrop-blur-md dark:border-white/[0.07] dark:bg-card/80"
          style={{ scrollbarWidth: "none" }}
        >
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[11px] font-semibold tracking-tight transition-all duration-150",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/60 dark:bg-white/[0.1] dark:ring-white/[0.1]"
                    : "text-muted-foreground/70 hover:bg-background/50 hover:text-foreground dark:hover:bg-white/[0.05]"
                )}
              >
                <Icon
                  className={cn("size-3.5 shrink-0 transition-all", active ? "text-emerald-400" : "opacity-60")}
                  weight={active ? "fill" : "regular"}
                />
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {data.state === "loading" && data.invoices.length === 0 ? (
        <BentoTile className="flex min-h-[360px] items-center justify-center">
          <CircleNotch className="size-7 animate-spin text-muted-foreground" />
        </BentoTile>
      ) : data.error ? (
        <BentoTile title="Revenue data unavailable" subtitle="Check billing migrations and Supabase credentials">
          <div className="space-y-3">
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {data.error}
            </p>
            <button
              type="button"
              onClick={() => void data.refresh()}
              className="rounded-xl bg-muted px-4 py-2 text-[11px] font-semibold text-muted-foreground"
            >
              Try again
            </button>
          </div>
        </BentoTile>
      ) : (
        <>
          {tab === "today" && (
            <TodayTab
              drawer={data.drawer}
              invoices={data.invoices}
              payments={data.payments}
              summary={data.summary}
              refresh={() => void data.refresh()}
            />
          )}
          {tab === "invoices" && (
            <InvoicesTab invoices={data.invoices} payments={data.payments} refresh={() => void data.refresh()} />
          )}
          {tab === "claims" && <ClaimsTab invoices={data.invoices} payments={data.payments} refresh={() => void data.refresh()} />}
          {tab === "reconciliation" && <ReconciliationTab />}
          {tab === "reports" && <ReportsTab />}
          {tab === "settings" && <SettingsTab />}
        </>
      )}
    </div>
  )
}

function HeaderMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "green" | "amber" | "neutral"
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 px-3 py-2 dark:border-white/[0.06] dark:bg-black/20">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold", tone === "green" && "text-emerald-400", tone === "amber" && "text-amber-400")}>
        {value}
      </p>
    </div>
  )
}
