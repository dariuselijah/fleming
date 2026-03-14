type ConnectorMetric = {
  successes: number
  degraded: number
  failures: number
  fallbacks: number
  empty: number
  reasons: Record<string, number>
}

type ClinicalTelemetryState = {
  harnessRuns: number
  harnessFallbacks: number
  citationContractViolations: number
  connectorMetrics: Map<string, ConnectorMetric>
}

const telemetryState: ClinicalTelemetryState = {
  harnessRuns: 0,
  harnessFallbacks: 0,
  citationContractViolations: 0,
  connectorMetrics: new Map(),
}

export function recordHarnessRun(fallback = false): void {
  telemetryState.harnessRuns += 1
  if (fallback) {
    telemetryState.harnessFallbacks += 1
  }
}

export function recordCitationContractViolation(): void {
  telemetryState.citationContractViolations += 1
}

export function recordConnectorMetric(
  connectorId: string,
  outcome: "success" | "degraded" | "failure",
  details?: { fallbackUsed?: boolean; sourceCount?: number; reason?: string | null }
): void {
  const current = telemetryState.connectorMetrics.get(connectorId) || {
    successes: 0,
    degraded: 0,
    failures: 0,
    fallbacks: 0,
    empty: 0,
    reasons: {},
  }
  if (outcome === "success") {
    current.successes += 1
  } else if (outcome === "degraded") {
    current.degraded += 1
  } else {
    current.failures += 1
  }
  if (details?.fallbackUsed) {
    current.fallbacks += 1
  }
  if (typeof details?.sourceCount === "number" && details.sourceCount <= 0) {
    current.empty += 1
  }
  if (details?.reason) {
    current.reasons[details.reason] = (current.reasons[details.reason] || 0) + 1
  }
  telemetryState.connectorMetrics.set(connectorId, current)
}

export function getClinicalTelemetrySnapshot() {
  return {
    harnessRuns: telemetryState.harnessRuns,
    harnessFallbacks: telemetryState.harnessFallbacks,
    citationContractViolations: telemetryState.citationContractViolations,
    connectors: Object.fromEntries(telemetryState.connectorMetrics),
  }
}
