/** Format integer cents as ZAR (e.g. 12500 → "R 125.00"). */
export function formatZarCents(cents: number): string {
  const rands = cents / 100
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(rands)
}
