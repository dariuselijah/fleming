"use client"

import { useCashDrawer } from "@/lib/billing/use-cash-drawer"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useWorkspace } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Bank, Calculator, CashRegister, CheckCircle, ClockClockwise } from "@phosphor-icons/react"
import { formatCurrency, MetricCard } from "./cash-drawer-banner"

type CashDrawerPopoverProps = {
  className?: string
}

export function CashDrawerPopover({ className }: CashDrawerPopoverProps) {
  const { practiceId } = usePracticeCrypto()
  const { setAdminTab } = useWorkspace()
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
    <div
      className={cn(
        "w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-panel-border bg-[linear-gradient(180deg,rgba(20,20,24,0.96),rgba(12,12,14,0.98))] shadow-2xl backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-panel-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-xl border",
              open ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-300" : "border-panel-border bg-panel-muted text-muted-foreground/65"
            )}
          >
            <CashRegister className="size-4" weight="fill" />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Cash drawer</p>
            <p className={cn("text-xs font-semibold", open ? "text-emerald-300" : "text-foreground/70")}>{open ? "Shift live" : "Shift closed"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdminTab("billing")}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground/65 transition-colors hover:bg-secondary hover:text-accent-foreground"
        >
          View in Billing →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <MetricCard icon={<Bank className="size-3" weight="fill" />} label="Float" value={formatCurrency(open?.opening_float_cents ?? 0)} />
        <MetricCard icon={<Calculator className="size-3" weight="fill" />} label="Cash" value={formatCurrency(cashSalesCents)} />
        <MetricCard icon={<CheckCircle className="size-3" weight="fill" />} label="Expected" value={formatCurrency(expectedCashCents)} emphasis />
      </div>

      {message ? <p className="px-3 pb-1 text-[10px] text-muted-foreground/66">{message}</p> : null}

      <div className="border-t border-panel-border bg-panel-muted px-3 py-2.5">
        {!open ? (
          <div className="flex flex-col gap-2">
            <label className="space-y-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Opening float</span>
              <input
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-panel-border bg-panel-muted px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void openShift()}
              className="rounded-lg bg-emerald-500/20 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Open shift
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
              <ClockClockwise className="size-3" />
              {open.opened_at ? new Date(open.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Counted</span>
                <input
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-panel-border bg-panel-muted px-2.5 py-1.5 text-[12px] text-foreground outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Notes</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-muted px-2.5 py-1.5 text-[12px] text-foreground outline-none"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={loading || !countedCash.trim()}
              onClick={() => void closeShift()}
              className="w-full rounded-lg bg-secondary py-1.5 text-[11px] font-semibold text-foreground/80 hover:bg-secondary disabled:opacity-40"
            >
              Close shift
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
