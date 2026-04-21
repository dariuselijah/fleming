"use client"

import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { useCallback, useEffect, useState } from "react"

export function CashDrawerBanner() {
  const { practiceId } = usePracticeCrypto()
  const [open, setOpen] = useState<{ id: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!practiceId) return
    try {
      const res = await fetchClient("/api/billing/cash-drawer/status")
      if (!res.ok) return
      const j = (await res.json()) as { open?: { id: string } | null }
      setOpen(j.open ?? null)
    } catch {
      /* ignore */
    }
  }, [practiceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleOpen = async () => {
    setLoading(true)
    try {
      await fetchClient("/api/billing/cash-drawer/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingFloatCents: 0 }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    setLoading(true)
    try {
      await fetchClient("/api/billing/cash-drawer/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countedCashCents: 0, notes: "" }),
      })
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  if (!practiceId) return null

  return (
    <div className="mb-2 flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px]">
      <span className="text-white/50">
        Cash drawer: {open ? <span className="text-emerald-400">Open</span> : <span className="text-white/35">Closed</span>}
      </span>
      <div className="flex gap-2">
        {!open ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleOpen()}
            className="rounded-md bg-emerald-500/20 px-2 py-1 font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            Open shift
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleClose()}
            className="rounded-md bg-white/10 px-2 py-1 font-medium text-white/70 hover:bg-white/15 disabled:opacity-50"
          >
            Close shift
          </button>
        )}
      </div>
    </div>
  )
}
