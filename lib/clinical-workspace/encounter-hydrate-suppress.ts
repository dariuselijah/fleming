/** After "New visit", avoid reloading the previous encounter from DB for a short window. */
let suppressUntil = 0

export function suppressEncounterHydrationForMs(ms: number) {
  suppressUntil = Date.now() + ms
}

export function isEncounterHydrationSuppressed() {
  return Date.now() < suppressUntil
}
