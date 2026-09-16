/** Set by `ClinicalPersistence` so `signConsult` can flush encrypted state immediately. */
let flush: (() => Promise<void>) | null = null

export function registerEncounterPersistenceFlush(fn: () => Promise<void>) {
  flush = fn
  return () => {
    flush = null
  }
}

/** Fire-and-forget debounced flush (store updates, visibility). */
export function requestEncounterPersistenceFlush() {
  void flushEncounterPersistenceNow()
}

/** Await after sign/consult so encrypted save + summary run before the UI claims success. */
export async function flushEncounterPersistenceNow(): Promise<void> {
  if (!flush) return
  await flush()
}
