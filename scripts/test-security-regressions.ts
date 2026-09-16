import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { anonymizeText, containsPII } from "../lib/anonymize"
import { requireCronAuthorization } from "../lib/auth/cron"
import { verifyResendWebhook } from "../lib/auth/webhook"

function testSouthAfricanPhiRedaction() {
  const input =
    "Patient ID 8001015009087, email thandi@example.co.za, mobile +27 82 123 4567."
  const redacted = anonymizeText(input)
  assert.equal(redacted.includes("8001015009087"), false)
  assert.equal(redacted.includes("thandi@example.co.za"), false)
  assert.equal(redacted.includes("+27 82 123 4567"), false)
  assert.match(redacted, /\[SA_ID_REDACTED\]/)
  assert.match(redacted, /\[EMAIL_REDACTED\]/)
  assert.match(redacted, /\[PHONE_REDACTED\]/)
  assert.equal(containsPII("Call me on 082 123 4567"), true)
  assert.equal(containsPII("Call me on 082 123 4567"), true, "global regex state must reset")
}

function testCronFailsClosedInProduction() {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previousNodeEnv = process.env.NODE_ENV
  const previousSecret = process.env.CRON_SECRET
  mutableEnv.NODE_ENV = "production"
  delete process.env.CRON_SECRET

  assert.equal(requireCronAuthorization(new Request("https://example.test"))?.status, 503)

  process.env.CRON_SECRET = "a-secure-cron-secret"
  assert.equal(requireCronAuthorization(new Request("https://example.test"))?.status, 401)
  assert.equal(
    requireCronAuthorization(
      new Request("https://example.test", {
        headers: { authorization: "Bearer a-secure-cron-secret" },
      })
    ),
    null
  )

  if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV
  else mutableEnv.NODE_ENV = previousNodeEnv
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
}

function testResendSignature() {
  const raw = JSON.stringify({ type: "email.received" })
  const id = "msg_test"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from("regression-test-secret")
  const secret = `whsec_${key.toString("base64")}`
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64")
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  })

  assert.equal(verifyResendWebhook(raw, headers, secret), true)
  assert.equal(verifyResendWebhook(`${raw} `, headers, secret), false)
}

function testSecurityMigrationContract() {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260721115946_security_safety_hardening.sql"
    ),
    "utf8"
  )
  assert.match(migration, /DROP POLICY IF EXISTS practice_members_insert/)
  assert.doesNotMatch(migration, /WITH CHECK \(user_id = auth\.uid\(\)\)/)
  assert.match(migration, /patient_attachments_storage_update/)
  assert.match(migration, /storage\.foldername\(name\)/)
  assert.match(migration, /clinical_session_keys_all/)
}

function main() {
  testSouthAfricanPhiRedaction()
  testCronFailsClosedInProduction()
  testResendSignature()
  testSecurityMigrationContract()
  console.log("Security regression checks passed.")
}

main()
