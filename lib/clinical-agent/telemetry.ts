type ConnectorMetric = {
  hits: number
  failures: number
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

export function recordConnectorMetric(connectorId: string, success: boolean): void {
  const current = telemetryState.connectorMetrics.get(connectorId) || {
    hits: 0,
    failures: 0,
  }
  if (success) {
    current.hits += 1
  } else {
    current.failures += 1
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
