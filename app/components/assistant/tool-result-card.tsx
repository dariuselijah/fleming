"use client"

import { cn } from "@/lib/utils"
import { CalendarBlank, CurrencyDollar, Vault, WarningCircle } from "@phosphor-icons/react"

type ToolLike = {
  toolName?: string
  result?: Record<string, unknown> | string | null
}

export function ToolInvocationSummary({ part }: { part: ToolLike }) {
  const name = part.toolName ?? "tool"
  const raw = part.result
  const res =
    raw && typeof raw === "object" && !Array.isArray(raw) && "ok" in raw
      ? (raw as { ok?: boolean; error?: string; clientAction?: unknown; invoiceId?: string })
      : null

  if (name === "list_outstanding_invoices" && res?.ok && raw && typeof raw === "object") {
    const inv = raw as { invoices?: unknown[]; totalDueCents?: number; totalCount?: number }
    const n = inv.totalCount ?? inv.invoices?.length ?? 0
    const due = inv.totalDueCents != null ? ` · R${Math.round(inv.totalDueCents / 100)} due` : ""
    return (
      <div className="flex items-start gap-2 rounded-lg border border-status-warning/15 bg-status-warning/[0.08] px-2.5 py-2 text-[11px] text-status-warning-foreground dark:text-status-warning">
        <CurrencyDollar className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <p className="font-medium">Outstanding invoices</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {n} invoice{n === 1 ? "" : "s"}
            {due}
          </p>
        </div>
      </div>
    )
  }

  if (name === "get_cash_drawer_status" && res?.ok && raw && typeof raw === "object") {
    const d = raw as {
      drawer?: {
        open?: { id?: string; opened_at?: string } | null
        totals?: { cashSalesCents?: number; expectedCashCents?: number }
        lastClosedVarianceFlagged?: boolean
      }
    }
    const open = d.drawer?.open
    const sales = d.drawer?.totals?.cashSalesCents
    const salesLine =
      typeof sales === "number" && open ? ` · cash sales R${Math.round(sales / 100)}` : ""
    const flag = d.drawer?.lastClosedVarianceFlagged ? " · last close variance" : ""
    return (
      <div className="flex items-start gap-2 rounded-lg border border-status-info/15 bg-status-info/[0.08] px-2.5 py-2 text-[11px] text-status-info-foreground dark:text-status-info">
        <Vault className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <p className="font-medium">Cash drawer</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {open ? "Shift open" : "No open shift"}
            {salesLine}
            {flag}
          </p>
        </div>
      </div>
    )
  }

  if (name.includes("appointment")) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-panel-border bg-panel px-2.5 py-2 text-[11px] text-muted-foreground">
        <CalendarBlank className="mt-0.5 size-3.5 shrink-0 text-status-info-foreground dark:text-status-info" />
        <div>
          <p className="font-medium text-foreground/80">{name}</p>
          {res ? <p className="mt-0.5 text-[10px] text-muted-foreground">{res.ok ? "Updated" : res.error}</p> : null}
        </div>
      </div>
    )
  }
  if (name.includes("invoice") || name.includes("payment") || name.includes("cash")) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-status-success/15 bg-status-success/[0.08] px-2.5 py-2 text-[11px] text-status-success-foreground dark:text-status-success">
        <CurrencyDollar className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <p className="font-medium">{name}</p>
          {res?.invoiceId ? <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{String(res.invoiceId).slice(0, 8)}…</p> : null}
          {res && !res.ok ? <p className="mt-0.5 text-[10px] text-status-warning-foreground dark:text-status-warning">{res.error}</p> : null}
        </div>
      </div>
    )
  }
  return (
    <div className={cn("rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 text-[10px] text-muted-foreground")}>
      <span className="text-foreground/70">{name}</span>
      {res && !res.ok ? (
        <span className="ml-2 inline-flex items-center gap-1 text-status-warning-foreground dark:text-status-warning">
          <WarningCircle className="size-3" />
          {res.error}
        </span>
      ) : null}
    </div>
  )
}
