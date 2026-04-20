/** Public base URL for patient portal links (no trailing slash). */
export function getPortalBaseUrl(): string {
  const raw = process.env.PORTAL_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) return raw.replace(/\/$/, "")
  return ""
}
