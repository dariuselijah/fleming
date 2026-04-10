/** Set by `ClinicalPersistence` so `signConsult` can flush encrypted state immediately. */
let flush: (() => void | Promise<void>) | null = null

export function registerEncounterPersistenceFlush(fn: () => void | Promise<void>) {
  flush = fn
  return () => {
    flush = null
  }
}

export function requestEncounterPersistenceFlush() {
  void flush?.()
}
