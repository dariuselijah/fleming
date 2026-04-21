import type { HealthConnectorDefinition, HealthConnectorId } from "./types"

const SIMPLE_ICON_BY_CONNECTOR_ID: Partial<Record<HealthConnectorId, string>> = {
  fitbit: "fitbit",
  oura: "ouraring",
  whoop: "whoop",
  withings: "withings",
  polar: "polar",
  garmin: "garmin",
  apple_healthkit: "apple",
  android_health_connect: "android",
  samsung_health: "samsung",
  aggregator_redox: "redox",
}

const CONNECTOR_TINT_BY_ID: Partial<Record<HealthConnectorId, string>> = {
  fitbit: "border-cyan-500/30 bg-cyan-500/10",
  oura: "border-violet-500/30 bg-violet-500/10",
  whoop: "border-neutral-500/30 bg-neutral-500/10",
  withings: "border-sky-500/30 bg-sky-500/10",
  polar: "border-red-500/30 bg-red-500/10",
  garmin: "border-indigo-500/30 bg-indigo-500/10",
  apple_healthkit: "border-rose-500/30 bg-rose-500/10",
  android_health_connect: "border-green-500/30 bg-green-500/10",
  samsung_health: "border-blue-500/30 bg-blue-500/10",
}

function googleFaviconLogoForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(
    `https://${domain}`
  )}`
}

export function getConnectorLogoSrc(
  connector: Pick<HealthConnectorDefinition, "id" | "domain">
): string {
  const simpleIconSlug = SIMPLE_ICON_BY_CONNECTOR_ID[connector.id]
  if (simpleIconSlug) {
    return `https://cdn.simpleicons.org/${simpleIconSlug}`
  }
  if (!connector.domain.includes(".")) {
    return googleFaviconLogoForDomain("askfleming.com")
  }
  return googleFaviconLogoForDomain(connector.domain)
}

export function getConnectorTintClassName(connectorId: HealthConnectorId): string {
  return CONNECTOR_TINT_BY_ID[connectorId] || "border-border/70 bg-muted/30"
}

export function getConnectorInitials(name: string): string {
  const cleaned = name
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
  if (!cleaned) return "CN"
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}
