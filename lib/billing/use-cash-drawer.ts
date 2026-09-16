"use client"

import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useEffect } from "react"
import { useCashDrawerStore } from "./cash-drawer-store"

/**
 * Shared cash drawer state + one poll (30s + focus) while any consumer is mounted.
 */
export function useCashDrawer() {
  const { practiceId } = usePracticeCrypto()

  const open = useCashDrawerStore((s) => s.open)
  const cashSalesCents = useCashDrawerStore((s) => s.cashSalesCents)
  const expectedCashCents = useCashDrawerStore((s) => s.expectedCashCents)
  const lastClosedVarianceFlagged = useCashDrawerStore((s) => s.lastClosedVarianceFlagged)
  const loading = useCashDrawerStore((s) => s.loading)
  const openingFloat = useCashDrawerStore((s) => s.openingFloat)
  const countedCash = useCashDrawerStore((s) => s.countedCash)
  const notes = useCashDrawerStore((s) => s.notes)
  const message = useCashDrawerStore((s) => s.message)
  const setPracticeId = useCashDrawerStore((s) => s.setPracticeId)
  const bind = useCashDrawerStore((s) => s.bind)
  const unbind = useCashDrawerStore((s) => s.unbind)
  const refresh = useCashDrawerStore((s) => s.refresh)
  const openShift = useCashDrawerStore((s) => s.openShift)
  const closeShift = useCashDrawerStore((s) => s.closeShift)
  const setOpeningFloat = useCashDrawerStore((s) => s.setOpeningFloat)
  const setCountedCash = useCashDrawerStore((s) => s.setCountedCash)
  const setNotes = useCashDrawerStore((s) => s.setNotes)

  useEffect(() => {
    setPracticeId(practiceId ?? null)
  }, [practiceId, setPracticeId])

  useEffect(() => {
    if (!practiceId) return
    bind()
    void useCashDrawerStore.getState().refresh()
    return () => unbind()
  }, [practiceId, bind, unbind])

  return {
    practiceId,
    open,
    cashSalesCents,
    expectedCashCents,
    lastClosedVarianceFlagged,
    loading,
    openingFloat,
    countedCash,
    notes,
    message,
    setOpeningFloat,
    setCountedCash,
    setNotes,
    refresh,
    openShift,
    closeShift,
  }
}
