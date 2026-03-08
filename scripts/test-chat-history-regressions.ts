import assert from "node:assert/strict"
import { shouldApplyHydrationResult } from "../lib/chat-store/messages/load-guards"
import { normalizeStoredMessageRow } from "../lib/chat-store/messages/normalize"
import { resolveScopedSessionMessages } from "../lib/chat-store/messages/session-restore"

function testScopedSessionRestore() {
  const now = Date.now()
  const pendingForChat = JSON.stringify([{ id: "m1" }])
  const latestFromOtherChat = JSON.stringify({
    chatId: "chat-b",
    messages: [{ id: "m-latest" }],
    timestamp: now,
  })

  const forConcreteChat = resolveScopedSessionMessages({
    chatId: "chat-a",
    pendingRaw: pendingForChat,
    latestRaw: latestFromOtherChat,
    nowMs: now,
  })
  assert.ok(Array.isArray(forConcreteChat), "Expected array for concrete chat")
  assert.equal(forConcreteChat?.length, 1, "Concrete chat should restore only chat-scoped payload")

  const forConcreteWithoutPending = resolveScopedSessionMessages({
    chatId: "chat-a",
    pendingRaw: null,
    latestRaw: latestFromOtherChat,
    nowMs: now,
  })
  assert.equal(
    forConcreteWithoutPending,
    null,
    "Concrete chat must not restore from latest fallback"
  )

  const forHome = resolveScopedSessionMessages({
    chatId: null,
    pendingRaw: null,
    latestRaw: latestFromOtherChat,
    nowMs: now,
  })
  assert.ok(Array.isArray(forHome), "Home route should use recent latest fallback")

  const staleHome = resolveScopedSessionMessages({
    chatId: null,
    pendingRaw: null,
    latestRaw: JSON.stringify({
      chatId: "chat-b",
      messages: [{ id: "old" }],
      timestamp: now - 30_000,
    }),
    nowMs: now,
  })
  assert.equal(staleHome, null, "Home route should ignore stale latest fallback")
}

function testMessageNormalization() {
  const plaintext = normalizeStoredMessageRow({
    id: 1,
    role: "assistant",
    content: "normal content",
    content_iv: null,
    parts: null,
  })
  assert.equal(plaintext.content, "normal content")

  const objectFallback = normalizeStoredMessageRow({
    id: 2,
    role: "assistant",
    content: { bad: "shape" },
    content_iv: null,
    parts: [{ type: "text", text: "from parts" }],
  })
  assert.equal(
    objectFallback.content,
    "from parts",
    "Object-like payload should never leak and should fallback to text parts"
  )

  const ciphertextFallback = normalizeStoredMessageRow({
    id: 3,
    role: "user",
    content: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef:abcdefabcdefabcdef",
    content_iv: null,
    parts: null,
  })
  assert.equal(
    ciphertextFallback.content,
    "",
    "Ciphertext-like payload should not be rendered to users"
  )
}

function testHydrationGuard() {
  assert.equal(
    shouldApplyHydrationResult({
      cancelled: false,
      activeToken: 5,
      requestToken: 5,
      activeChatId: "chat-a",
      requestChatId: "chat-a",
    }),
    true,
    "Matching token/chat should apply"
  )

  assert.equal(
    shouldApplyHydrationResult({
      cancelled: false,
      activeToken: 6,
      requestToken: 5,
      activeChatId: "chat-b",
      requestChatId: "chat-a",
    }),
    false,
    "Late result from previous chat must be ignored"
  )

  assert.equal(
    shouldApplyHydrationResult({
      cancelled: true,
      activeToken: 5,
      requestToken: 5,
      activeChatId: "chat-a",
      requestChatId: "chat-a",
    }),
    false,
    "Cancelled loads must never apply"
  )
}

function run() {
  testScopedSessionRestore()
  testMessageNormalization()
  testHydrationGuard()
  console.log("chat-history regression checks passed")
}

run()
