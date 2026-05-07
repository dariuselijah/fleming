export function formatZarCents(cents: number | null | undefined): string {
  const value = Number(cents ?? 0) / 100
  return `R ${value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-ZA", { dateStyle: "medium" })
}

export function parseZarToCents(raw: string): number | null {
  const n = parseFloat(raw.replace(",", ".").trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
