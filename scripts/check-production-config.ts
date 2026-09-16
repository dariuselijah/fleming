import { assertProductionConfig } from "../lib/config/production"

try {
  assertProductionConfig(process.env)
  console.log("Production configuration validation passed.")
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
