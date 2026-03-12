import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testConfigLimits() {
  const config = read("lib/config.ts")

  assert.match(
    config,
    /AUTH_HOURLY_MESSAGE_LIMIT = 10/,
    "Authenticated hourly message limit should be 10"
  )
  assert.match(
    config,
    /NON_AUTH_HOURLY_MESSAGE_LIMIT = 10/,
    "Non-auth hourly message limit should be 10"
  )
  assert.match(
    config,
    /AUTH_HOURLY_ATTACHMENT_LIMIT = 5/,
    "Authenticated hourly attachment limit should be 5"
  )
  assert.match(
    config,
    /NON_AUTH_HOURLY_ATTACHMENT_LIMIT = 5/,
    "Non-auth hourly attachment limit should be 5"
  )
}

function testServerRateLimitEnforcement() {
  const usage = read("lib/usage.ts")
  const chatApi = read("app/api/chat/api.ts")
  const chatRoute = read("app/api/chat/route.ts")

  assert.match(
    usage,
    /checkHourlyAttachmentUsage\(/,
    "Usage module should expose hourly attachment usage checks"
  )
  assert.match(
    usage,
    /HOURLY_ATTACHMENT_LIMIT_REACHED/,
    "Usage checks should emit explicit hourly attachment limit code"
  )
  assert.match(
    chatApi,
    /attachmentCount = 0/,
    "Chat API validation helper should accept attachmentCount context"
  )
  assert.match(
    chatApi,
    /checkUsageByModel\(supabase, userId, model, isAuthenticated, \{\s*attachmentCount/s,
    "Chat API validation should pass attachmentCount into usage checks"
  )
  assert.match(
    chatRoute,
    /attachmentCount: requestedAttachmentCount/,
    "Chat route should pass latest user attachment count into usage validation"
  )
  assert.match(
    chatRoute,
    /ATTACHMENT_LIMIT_EXCEEDED/,
    "Chat route should reject oversized attachment payloads deterministically"
  )
}

function testClientPrechecks() {
  const rateLimitsApi = read("app/api/rate-limits/api.ts")
  const chatOps = read("app/components/chat/use-chat-operations.ts")
  const uploadLimitRoute = read("app/api/check-file-upload-limit/route.ts")
  const fileHandling = read("lib/file-handling.ts")
  const fileUpload = read("app/components/chat/use-file-upload.ts")

  assert.match(
    rateLimitsApi,
    /remainingHourlyAttachments/,
    "Rate limits API should expose remaining hourly attachment budget"
  )
  assert.match(
    chatOps,
    /requestedAttachmentCount > rateData\.remainingHourlyAttachments/,
    "Chat operations should block sends when requested attachments exceed hourly remaining budget"
  )
  assert.match(
    uploadLimitRoute,
    /checkHourlyAttachmentUsage\(/,
    "Upload limit endpoint should use shared hourly attachment usage checks"
  )
  assert.match(
    fileHandling,
    /HOURLY_ATTACHMENT_LIMIT_REACHED/,
    "File handling should use explicit hourly attachment limit error code"
  )
  assert.match(
    fileUpload,
    /checkFileUploadLimit\(uid, targetFiles\.length\)/,
    "Client upload pipeline should pre-check hourly limit against requested file count"
  )
  assert.match(
    fileUpload,
    /\.then\(\(\) => true\)/,
    "Client upload limit precheck should treat a successful count check (including zero) as allowed"
  )
}

function run() {
  testConfigLimits()
  testServerRateLimitEnforcement()
  testClientPrechecks()
  console.log("PASS test-hourly-rate-limit-regressions")
}

run()
