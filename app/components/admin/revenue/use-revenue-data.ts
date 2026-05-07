"use client"

import { fetchClient } from "@/lib/fetch"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { DrawerStatus, RevenueInvoice, RevenuePayment, RevenueReportSummary } from "./types"

type LoadState = "idle" | "loading" | "ready" | "error"

export function useRevenueData() {
  const [state, setState] = useState<LoadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<RevenueInvoice[]>([])
  const [payments, setPayments] = useState<RevenuePayment[]>([])
  const [drawer, setDrawer] = useState<DrawerStatus | null>(null)

  const refresh = useCallback(async () => {
    setState("loading")
    setError(null)
    try {
      const [invRes, payRes, drawerRes] = await Promise.all([
        fetchClient("/api/billing/invoices"),
        fetchClient("/api/billing/payments"),
        fetchClient("/api/billing/cash-drawer/status"),
      ])

      const invJson = (await invRes.json().catch(() => ({}))) as {
        invoices?: RevenueInvoice[]
        error?: string
      }
      const payJson = (await payRes.json().catch(() => ({}))) as {
        payments?: RevenuePayment[]
        error?: string
      }
      const drawerJson = (await drawerRes.json().catch(() => ({}))) as {
        open?: DrawerStatus | null
        error?: string
      }

      if (!invRes.ok) throw new Error(invJson.error || "Could not load invoices")
      if (!payRes.ok) throw new Error(payJson.error || "Could not load payments")
      if (!drawerRes.ok) throw new Error(drawerJson.error || "Could not load cash drawer")

      setInvoices(invJson.invoices ?? [])
      setPayments(payJson.payments ?? [])
      setDrawer(drawerJson.open ?? null)
      setState("ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revenue data failed")
      setState("error")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const summary = useMemo<RevenueReportSummary>(() => {
    const today = new Date().toISOString().slice(0, 10)
    let todayCents = 0
    let cashCents = 0
    let cardCents = 0
    let eftCents = 0
    let medicalAidCents = 0

    for (const p of payments) {
      if (p.status !== "succeeded") continue
      if ((p.succeeded_at ?? p.created_at).slice(0, 10) === today) todayCents += p.amount_cents ?? 0
      if (p.provider === "cash") cashCents += p.amount_cents ?? 0
      else if (p.provider === "polar") cardCents += p.amount_cents ?? 0
      else if (p.provider === "stitch" || p.provider === "eft_manual") eftCents += p.amount_cents ?? 0
      else if (p.provider === "medical_aid") medicalAidCents += p.amount_cents ?? 0
    }

    const outstandingCents = invoices.reduce(
      (sum, inv) => sum + Math.max(0, (inv.total_cents ?? 0) - (inv.amount_paid_cents ?? 0)),
      0
    )

    return { todayCents, outstandingCents, cashCents, cardCents, eftCents, medicalAidCents }
  }, [invoices, payments])

  return {
    state,
    error,
    invoices,
    payments,
    drawer,
    summary,
    refresh,
  }
}
