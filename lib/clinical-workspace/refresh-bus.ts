"use client"

type RefreshListener = () => void

export function createRefreshBus() {
  const listeners = new Set<RefreshListener>()

  return {
    onRefresh(cb: RefreshListener): () => void {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    requestRefresh(): void {
      for (const cb of listeners) {
        try {
          cb()
        } catch {
          /* one bad listener shouldn't block others */
        }
      }
    },
  }
}
