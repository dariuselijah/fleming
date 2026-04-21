/** Integer cents for money movement (avoid float drift). */

export function zarToCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

export function centsToZar(cents: number): number {
  return Math.round(cents) / 100
}

export function formatZar(cents: number): string {
  const n = Math.round(cents) / 100
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
