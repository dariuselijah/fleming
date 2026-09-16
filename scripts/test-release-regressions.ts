import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { validateProductionConfig } from "../lib/config/production"
import { createRequestLogger, redactLogValue } from "../lib/observability/server"

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

function testTenantIsolationContract() {
  const foundation = source(
    "supabase/migrations/20260406120000_clinical_workspace_e2ee_rag.sql"
  )
  for (const table of [
    "practice_patients",
    "clinical_encounters",
    "practice_appointments",
    "practice_claims",
  ]) {
    assert.match(
      foundation,
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`)
    )
  }
  assert.match(
    foundation,
    /CREATE POLICY practice_patients_select[\s\S]*is_practice_member\(practice_id\)/
  )
  assert.match(
    foundation,
    /CREATE POLICY clinical_encounters_select[\s\S]*USING \(public\.is_practice_member\(practice_id\)\)/
  )
  assert.match(
    foundation,
    /CREATE POLICY clinical_encounters_insert[\s\S]*WITH CHECK \(public\.is_practice_member\(practice_id\)\)/
  )
}

function testSignedEncounterImmutability() {
  const migration = source(
    "supabase/migrations/20260721131600_encounter_attestation_amendments.sql"
  )
  assert.match(migration, /IF OLD\.status = 'signed'/)
  assert.match(migration, /Signed clinical encounters are immutable/)
  assert.match(migration, /BEFORE UPDATE ON public\.clinical_encounters/)
}

function testClaimEventsAreAppendOnly() {
  const migration = source(
    "supabase/migrations/20260721115955_revenue_claim_integrity.sql"
  )
  assert.match(migration, /practice_claim_events is append-only/)
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON public\.practice_claim_events/
  )
  assert.doesNotMatch(
    migration,
    /CREATE POLICY practice_claim_events_member_(?:update|delete)/
  )
}

function testAppointmentConflictGuard() {
  const migration = source(
    "supabase/migrations/20260721120029_enforce_appointment_conflicts.sql"
  )
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /existing\.practice_id = NEW\.practice_id/)
  assert.match(migration, /existing\.provider_staff_id = NEW\.provider_staff_id/)
  assert.match(migration, /BEFORE INSERT OR UPDATE OF/)
}

function testProductionRejectsTestModes() {
  const baseline = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-anon",
    SUPABASE_SERVICE_ROLE_KEY: "ci-service",
    CSRF_SECRET: "c".repeat(64),
    ENCRYPTION_KEY: "e".repeat(44),
    CRON_SECRET: "r".repeat(64),
    MEDPRAX_CLAIM_PREFLIGHT_MODE: "required",
  }
  assert.deepEqual(validateProductionConfig(baseline), [])

  for (const unsafe of [
    "E2E_DISABLE_EXTERNAL_SERVICES",
    "MEDIKREDIT_DRY_RUN",
    "POLAR_SH_DRY_RUN",
    "STITCH_DRY_RUN",
  ]) {
    assert.ok(
      validateProductionConfig({ ...baseline, [unsafe]: "1" }).some((message) =>
        message.includes(unsafe)
      )
    )
  }

  const medikreditClient = source("lib/medikredit/client.ts")
  const polar = source("lib/billing/providers/polar.ts")
  const stitch = source("lib/billing/providers/stitch.ts")
  assert.match(medikreditClient, /NODE_ENV !== "production"/)
  assert.match(polar, /NODE_ENV !== "production"/)
  assert.match(stitch, /NODE_ENV !== "production"/)

  const previewRoute = source("app/api/clinical/medikredit/claim/preview/route.ts")
  assert.match(
    previewRoute,
    /MEDIKREDIT_ENABLE_XML_PREVIEW[\s\S]*NODE_ENV !== "production"/
  )
  assert.match(previewRoute, /MEDIKREDIT_DRY_RUN[\s\S]*NODE_ENV !== "production"/)

  const verificationRoute = source("app/api/verify/rx/[token]/route.ts")
  assert.match(
    verificationRoute,
    /E2E_DISABLE_EXTERNAL_SERVICES[\s\S]*NODE_ENV !== "production"/
  )

  const developmentGuard = source("lib/auth/internal-route.ts")
  assert.match(developmentGuard, /NODE_ENV === "production"[\s\S]*status: 404/)
  for (const route of ["app/api/test-auth/route.ts", "app/api/create-guest/route.ts"]) {
    assert.match(source(route), /authorizeDevelopmentRoute\(request\)/)
  }
}

function testStructuredLogRedaction() {
  const redacted = redactLogValue({
    eventType: "claim_submitted",
    patientName: "Amina Dlamini",
    note: "Contact thandi@example.co.za or 082 123 4567",
    authorization: "Bearer secret-value",
  }) as Record<string, unknown>

  assert.equal(redacted.patientName, "[REDACTED]")
  assert.equal(redacted.authorization, "[REDACTED]")
  assert.doesNotMatch(String(redacted.note), /thandi|082 123 4567/)
  assert.equal(redacted.eventType, "claim_submitted")

  const logger = source("lib/observability/server.ts")
  for (const field of [
    "timestamp",
    "level",
    "service",
    "event",
    "route",
    "method",
    "requestId",
    "elapsedMs",
  ]) {
    assert.match(logger, new RegExp(`\\b${field}\\b`))
  }
  assert.match(logger, /JSON\.stringify\(record\)/)
}

function testRequestCorrelation() {
  const requestId = "release-regression-request-0001"
  const log = createRequestLogger(
    new Request("https://example.invalid/api/check", {
      headers: { "x-request-id": requestId },
    }),
    "/api/check"
  )
  assert.equal(log.requestId, requestId)
  assert.equal(log.withRequestId(new Response()).headers.get("x-request-id"), requestId)

  for (const route of [
    "app/api/clinical/medikredit/claim/route.ts",
    "app/api/billing/stitch/webhook/route.ts",
    "app/api/cron/appointment-reminders/route.ts",
    "app/api/verify/rx/[token]/route.ts",
  ]) {
    const routeSource = source(route)
    assert.match(routeSource, /createRequestLogger\(/)
    assert.match(routeSource, /withRequestId/)
  }
}

testTenantIsolationContract()
testSignedEncounterImmutability()
testClaimEventsAreAppendOnly()
testAppointmentConflictGuard()
testProductionRejectsTestModes()
testStructuredLogRedaction()
testRequestCorrelation()
console.log("Release migration and static regression checks passed.")
