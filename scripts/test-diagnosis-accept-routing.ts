/**
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-diagnosis-accept-routing.ts
 */
import {
  routeAcceptedDiagnosis,
  shouldPromoteDiagnosisToChronic,
} from "../lib/clinical-workspace/diagnosis-accept-routing"

function assert(name: string, cond: boolean) {
  if (!cond) {
    console.error(`FAIL: ${name}`)
    process.exit(1)
  }
  console.log(`ok: ${name}`)
}

assert("diabetes chronic", shouldPromoteDiagnosisToChronic("Type 2 diabetes, poorly controlled (A1C ~9)"))
assert("hypertension chronic", shouldPromoteDiagnosisToChronic("Essential hypertension"))
assert("tobacco not chronic", !shouldPromoteDiagnosisToChronic("Tobacco use — 10 cigarettes/day"))
assert("alcohol not chronic", !shouldPromoteDiagnosisToChronic("Alcohol use — drinks ~24 beers/week"))
assert("resolved asthma not chronic", !shouldPromoteDiagnosisToChronic("childhood asthma (resolved)"))
assert("acute bronchitis not chronic", !shouldPromoteDiagnosisToChronic("Acute bronchitis"))
assert("possible cellulitis encounter", routeAcceptedDiagnosis("possible cellulitis (under evaluation)") === "encounter")

console.log("All diagnosis-accept-routing checks passed.")
