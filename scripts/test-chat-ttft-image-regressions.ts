import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testInstantSubmitFeedback() {
  const useChatCore = read("app/components/chat/use-chat-core.ts")
  const conversation = read("app/components/chat/conversation.tsx")
  const chat = read("app/components/chat/chat.tsx")

  assert.match(
    useChatCore,
    /startSubmitTelemetry\("submit"\)/,
    "Submit flow should start TTFT telemetry at click time"
  )
  assert.match(
    useChatCore,
    /setStreamIntroPreview\(INSTANT_STREAM_INTRO\)/,
    "Submit flow should set an immediate intro preview before async prework"
  )
  assert.match(
    useChatCore,
    /withTimeout<Attachment\[] \| null>\(/,
    "Image attachment prep should use a bounded wait window to avoid long blocking"
  )
  assert.match(
    conversation,
    /isSubmitting\?: boolean/,
    "Conversation should accept isSubmitting to render loading state early"
  )
  assert.match(
    conversation,
    /const shouldShowProcessing =/,
    "Conversation should compute processing visibility with submit state"
  )
  assert.match(
    chat,
    /isSubmitting,\s*\n\s*onDelete:/,
    "Chat should pass isSubmitting into conversation props"
  )
}

function testImagePolicyWiring() {
  const route = read("app/api/chat/route.ts")
  const chatInput = read("app/components/chat-input/chat-input.tsx")
  const buttonUpload = read("app/components/chat-input/button-file-upload.tsx")
  const policy = read("lib/chat-attachments/policy.ts")

  assert.match(
    route,
    /enforceImageAttachmentPolicy\(/,
    "Server route should enforce shared image attachment policy"
  )
  assert.match(
    route,
    /MODEL_DOES_NOT_SUPPORT_VISION/,
    "Server should return deterministic error for non-vision image attempts"
  )
  assert.match(
    route,
    /X-Chat-Id/,
    "Server stream response should expose canonical chat id header"
  )
  assert.match(
    chatInput,
    /enforceImageFilePolicy\(/,
    "Paste flow should enforce shared client image file policy"
  )
  assert.match(
    chatInput,
    /hasVisionSupport/,
    "Paste flow should block image inputs when model lacks vision"
  )
  assert.match(
    buttonUpload,
    /CHAT_ALLOWED_IMAGE_MIME_TYPES/,
    "Upload picker accept list should align with shared allowed image types"
  )
  assert.match(
    policy,
    /CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE = 6/,
    "Shared policy should define max images per message"
  )
}

function testServerLatencyGuardrails() {
  const route = read("app/api/chat/route.ts")

  assert.match(
    route,
    /\[TTFT\]\[server\] response-ready/,
    "Server should log request-to-stream-ready timing"
  )
  assert.match(
    route,
    /\[TTFT\]\[server\] first-stream-write/,
    "Server should log first stream write timing"
  )
  assert.match(
    route,
    /shouldRunUploadContextSearch[\s\S]*shouldPreferUploadContext/,
    "Upload retrieval preflight should only run when upload intent/context exists"
  )
}

function run() {
  testInstantSubmitFeedback()
  testImagePolicyWiring()
  testServerLatencyGuardrails()
  console.log("PASS test-chat-ttft-image-regressions")
}

run()
