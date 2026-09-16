const DEFAULT_LOCALE = "en-ZA"
const DEFAULT_TIME_ZONE = "Africa/Johannesburg"
const EMPTY_VALUE = "—"

type DateInput = Date | string | number

function toValidDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Format a rand amount. Values are rands, not cents.
 */
export function formatZAR(
  amount: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  if (amount == null || !Number.isFinite(amount)) return EMPTY_VALUE

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount)
}

export function formatZARCents(
  cents: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  return cents == null ? EMPTY_VALUE : formatZAR(cents / 100, options)
}

export function formatDate(
  value: DateInput | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (value == null) return EMPTY_VALUE
  const date = toValidDate(value)
  if (!date) return EMPTY_VALUE

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(date)
}

export function formatTime(
  value: DateInput | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (value == null) return EMPTY_VALUE
  const date = toValidDate(value)
  if (!date) return EMPTY_VALUE

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(date)
}

export function formatDateTime(
  value: DateInput | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (value == null) return EMPTY_VALUE
  const date = toValidDate(value)
  if (!date) return EMPTY_VALUE

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(date)
}

export const formattingDefaults = {
  locale: DEFAULT_LOCALE,
  timeZone: DEFAULT_TIME_ZONE,
  emptyValue: EMPTY_VALUE,
} as const
