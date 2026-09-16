"use client"

import { useCashDrawer } from "@/lib/billing/use-cash-drawer"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { panelSurface } from "@/lib/theme/surfaces"
import { cn } from "@/lib/utils"
import { Bank, Calculator, CashRegister, CheckCircle, ClockClockwise, WarningCircle } from "@phosphor-icons/react"

export function formatCurrency(cents: number) {
  return `R${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CashDrawerBanner() {
  const { practiceId } = usePracticeCrypto()
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

  if (!practiceId) return null

  return (
    <div className={cn("mb-3 overflow-hidden rounded-2xl", panelSurface)}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-[220px]">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-xl border",
                open
                  ? "border-status-success/30 bg-status-success/12 text-status-success-foreground dark:text-status-success"
                  : "border-panel-border bg-panel-muted text-muted-foreground"
              )}
            >
              <CashRegister className="size-4" weight="fill" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Cash Drawer</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className={cn("text-sm font-semibold", open ? "text-status-success-foreground dark:text-status-success" : "text-foreground/80")}>
                  {open ? "Shift live" : "Shift closed"}
                </span>
                {open ? (
                  <span className="rounded-full border border-status-success/25 bg-status-success/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-status-success-foreground dark:text-status-success">
                    Taking cash
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            Keep the front desk honest: open with a float, record cash against the live shift, and close against expected takings.
          </p>
          {message ? <p className="mt-2 text-[10px] text-muted-foreground">{message}</p> : null}
        </div>

        <div className="grid min-w-[280px] flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard icon={<Bank className="size-3.5" weight="fill" />} label="Opening Float" value={formatCurrency(open?.opening_float_cents ?? 0)} />
          <MetricCard icon={<Calculator className="size-3.5" weight="fill" />} label="Cash Sales" value={formatCurrency(cashSalesCents)} />
          <MetricCard icon={<CheckCircle className="size-3.5" weight="fill" />} label="Expected in Drawer" value={formatCurrency(expectedCashCents)} emphasis />
        </div>
      </div>

      <div className="border-t border-panel-border bg-panel-muted/60 px-4 py-3">
        {!open ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-[180px,1fr]">
              <label className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Opening Float</span>
                <input
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-status-success/35"
                />
              </label>
              <div className="flex items-center rounded-xl border border-panel-border bg-panel px-3 py-2 text-[11px] text-muted-foreground">
                Open the desk before taking cash so every receipt is tied to a live shift.
              </div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openShift()}
              className="rounded-xl bg-status-success/20 px-4 py-2 text-[11px] font-semibold text-status-success-foreground transition-colors hover:bg-status-success/30 disabled:opacity-50 dark:text-status-success"
            >
              Open shift
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ClockClockwise className="size-3.5" />
                Opened {open.opened_at ? new Date(open.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}
              </span>
              <span className="font-mono text-muted-foreground/70">{open.id.slice(0, 8)}</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-[180px,180px,1fr,auto]">
              <label className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Counted Cash</span>
                <input
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-status-success/35"
                />
              </label>
              <div className="rounded-xl border border-panel-border bg-panel px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(expectedCashCents)}</p>
              </div>
              <label className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Close-out Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Variance reason, petty cash, manual receipt..."
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-status-success/35"
                />
              </label>
              <button
                type="button"
                disabled={loading || !countedCash.trim()}
                onClick={() => void closeShift()}
                className="rounded-xl bg-secondary px-4 py-2 text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40"
              >
                Close shift
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <WarningCircle className="size-3.5 text-status-warning-foreground dark:text-status-warning" />
              Closing now reconciles against the live session and every cash payment already recorded to it.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function MetricCard({
  icon,
  label,
  value,
  emphasis = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", emphasis ? "border-status-success/20 bg-status-success/[0.08]" : "border-panel-border bg-panel")}>
      <p className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums", emphasis ? "text-status-success-foreground dark:text-status-success" : "text-foreground/80")}>{value}</p>
    </div>
  )
}
