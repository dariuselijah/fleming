import { fetchClient } from "@/lib/fetch"
import { create } from "zustand"

export type CashDrawerOpenSession = {
  id: string
  opened_at?: string | null
  opening_float_cents?: number | null
} | null

type CashDrawerStatusResponse = {
  open?: CashDrawerOpenSession
  totals?: {
    cashSalesCents?: number
    expectedCashCents?: number
  }
  lastClosedVarianceFlagged?: boolean
}

type CashDrawerState = {
  open: CashDrawerOpenSession
  cashSalesCents: number
  expectedCashCents: number
  lastClosedVarianceFlagged: boolean
  loading: boolean
  openingFloat: string
  countedCash: string
  notes: string
  message: string | null
  /** Ref count for mounted consumers — polling runs while > 0 */
  bindCount: number
  practiceId: string | null
  setPracticeId: (id: string | null) => void
  setOpeningFloat: (v: string) => void
  setCountedCash: (v: string) => void
  setNotes: (v: string) => void
  bind: () => void
  unbind: () => void
  refresh: () => Promise<void>
  openShift: () => Promise<void>
  closeShift: () => Promise<void>
}

const POLL_MS = 30_000
let pollTimer: ReturnType<typeof setInterval> | null = null
let focusHandler: (() => void) | null = null

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (focusHandler && typeof window !== "undefined") {
    window.removeEventListener("focus", focusHandler)
    focusHandler = null
  }
}

function startPolling(get: () => CashDrawerState) {
  stopPolling()
  if (typeof window === "undefined") return
  const run = () => void get().refresh()
  pollTimer = setInterval(run, POLL_MS)
  focusHandler = run
  window.addEventListener("focus", focusHandler)
  void run()
}

export const useCashDrawerStore = create<CashDrawerState>((set, get) => ({
    open: null,
    cashSalesCents: 0,
    expectedCashCents: 0,
    lastClosedVarianceFlagged: false,
    loading: false,
    openingFloat: "0",
    countedCash: "",
    notes: "",
    message: null,
    bindCount: 0,
    practiceId: null,

    setPracticeId: (practiceId) => {
      const prev = get().practiceId
      set({ practiceId })
      const { bindCount } = get()
      if (bindCount > 0) {
        if (practiceId && practiceId !== prev) {
          stopPolling()
          startPolling(get)
        } else if (!practiceId) {
          stopPolling()
        }
      }
    },

    setOpeningFloat: (openingFloat) => set({ openingFloat }),
    setCountedCash: (countedCash) => set({ countedCash }),
    setNotes: (notes) => set({ notes }),

    bind: () => {
      const { bindCount } = get()
      const next = bindCount + 1
      set({ bindCount: next })
      if (next === 1) {
        const pid = get().practiceId
        if (pid) startPolling(get)
      }
    },

    unbind: () => {
      const { bindCount } = get()
      const next = Math.max(0, bindCount - 1)
      set({ bindCount: next })
      if (next === 0) {
        stopPolling()
      }
    },

    refresh: async () => {
      const { practiceId } = get()
      if (!practiceId) return
      try {
        const res = await fetchClient("/api/billing/cash-drawer/status")
        if (!res.ok) return
        const j = (await res.json()) as CashDrawerStatusResponse
        set({
          open: j.open ?? null,
          cashSalesCents: j.totals?.cashSalesCents ?? 0,
          expectedCashCents: j.totals?.expectedCashCents ?? 0,
          lastClosedVarianceFlagged: j.lastClosedVarianceFlagged ?? false,
        })
      } catch {
        /* ignore */
      }
    },

    openShift: async () => {
      const { openingFloat, practiceId, refresh } = get()
      if (!practiceId) return
      set({ loading: true, message: null })
      try {
        const openingFloatCents = Math.round((Number.parseFloat(openingFloat.replace(",", ".")) || 0) * 100)
        const res = await fetchClient("/api/billing/cash-drawer/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ openingFloatCents }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error || "Could not open shift")
        }
        set({ countedCash: "", notes: "", message: "Shift opened" })
        await refresh()
      } catch (error) {
        set({ message: error instanceof Error ? error.message : "Could not open shift" })
      } finally {
        set({ loading: false })
      }
    },

    closeShift: async () => {
      const { countedCash, notes, practiceId, refresh } = get()
      if (!practiceId) return
      set({ loading: true, message: null })
      try {
        const countedCashCents = Math.round((Number.parseFloat(countedCash.replace(",", ".")) || 0) * 100)
        const res = await fetchClient("/api/billing/cash-drawer/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countedCashCents, notes }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error || "Could not close shift")
        }
        set({ message: "Shift closed" })
        await refresh()
      } catch (error) {
        set({ message: error instanceof Error ? error.message : "Could not close shift" })
      } finally {
        set({ loading: false })
      }
    },
}))
