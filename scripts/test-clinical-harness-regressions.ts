import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string): string {
  return readFileSync(path, "utf-8")
}

function testLangGraphHarnessExists() {
  const harness = read("lib/clinical-agent/graph/harness.ts")
  const route = read("app/api/chat/route.ts")
  const config = read("lib/config.ts")

  assert.match(
    harness,
    /new StateGraph\(/,
    "Clinical harness should be implemented with LangGraph StateGraph"
  )
  assert.match(
    harness,
    /runClinicalAgentHarness\(/,
    "Clinical harness should export the runtime entrypoint"
  )
  assert.match(
    config,
    /ENABLE_LANGGRAPH_HARNESS/,
    "Config should include LangGraph harness feature flag"
  )
  assert.match(
    config,
    /ENABLE_CONNECTOR_REGISTRY[\s\S]*ENABLE_STRICT_CITATION_CONTRACT/,
    "Config should expose connector/citation rollout feature flags"
  )
  assert.match(
    route,
    /runClinicalAgentHarness\(/,
    "Chat route should invoke the LangGraph harness"
  )
  assert.match(
    route,
    /type:\s*"langgraph-routing"/,
    "Chat stream should emit routing trace annotation when harness runs"
  )
}

function testConnectorRegistryWiring() {
  const registry = read("lib/evidence/connectors/registry.ts")
  const route = read("app/api/chat/route.ts")
  const provenance = read("lib/evidence/provenance.ts")

  assert.match(
    registry,
    /runConnectorSearch\(/,
    "Connector registry should expose unified runConnectorSearch API"
  )
  assert.match(
    registry,
    /connectorCircuitState/,
    "Connector registry should implement circuit-breaker style reliability state"
  )
  assert.match(
    registry,
    /recordConnectorMetric\(/,
    "Connector registry should emit connector telemetry events"
  )
  assert.match(
    route,
    /scholarGatewaySearch:\s*tool\(/,
    "Chat route should expose Scholar Gateway as runtime tool"
  )
  assert.match(
    route,
    /bioRxivSearch:\s*tool\(/,
    "Chat route should expose bioRxiv as runtime tool"
  )
  assert.match(
    route,
    /npiRegistrySearch:\s*tool\(/,
    "Chat route should expose NPI registry as runtime tool"
  )
  assert.match(
    route,
    /cmsCoverageSearch:\s*tool\(/,
    "Chat route should expose CMS coverage as runtime tool"
  )
  assert.match(
    route,
    /chemblSearch:\s*tool\(/,
    "Chat route should expose ChEMBL as runtime tool"
  )
  assert.match(
    provenance,
    /scholar_gateway|chemical_database|coverage_policy|provider_registry/,
    "Provenance types should include connector-backed source categories"
  )
}

function run() {
  testLangGraphHarnessExists()
  testConnectorRegistryWiring()
  console.log("clinical harness regression checks passed")
}

run()
