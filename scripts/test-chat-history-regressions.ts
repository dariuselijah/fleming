import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { shouldApplyHydrationResult } from "../lib/chat-store/messages/load-guards"
import { normalizeStoredMessageRow } from "../lib/chat-store/messages/normalize"
import { resolveScopedSessionMessages } from "../lib/chat-store/messages/session-restore"
import { resetChatClientState } from "../lib/chat-store/new-chat"
import {
  buildUploadReferenceTokens,
  extractUploadReferenceIds,
  stripUploadReferenceTokens,
} from "../lib/uploads/reference-tokens"

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

function testUploadReferenceTokens() {
  const tokenString = buildUploadReferenceTokens([
    "123e4567-e89b-12d3-a456-426614174000",
    "123e4567-e89b-12d3-a456-426614174000",
  ])
  assert.equal(
    tokenString,
    "[UPLOAD_REF:123e4567-e89b-12d3-a456-426614174000]",
    "Token builder should dedupe upload ids"
  )

  const extracted = extractUploadReferenceIds(
    `Explain page 50 [UPLOAD_REF:123e4567-e89b-12d3-a456-426614174000]`
  )
  assert.deepEqual(
    extracted,
    ["123e4567-e89b-12d3-a456-426614174000"],
    "Should extract upload references from message"
  )

  const stripped = stripUploadReferenceTokens(
    `What does this say?\n\n[UPLOAD_REF:123e4567-e89b-12d3-a456-426614174000]`
  )
  assert.equal(stripped, "What does this say?", "Should remove upload reference tokens from display text")
}

function createMemoryStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  } as any
}

function testScopedNewChatReset() {
  const localStorageMock = createMemoryStorage({
    chatDraft: "draft",
    keepLocal: "true",
  })
  const sessionStorageMock = createMemoryStorage({
    "pendingMessages:latest": "latest",
    "evidenceCitations:latest": "latest",
    pendingMessage: "auth-pending",
    "hasSentMessage:chat-a": "true",
    "messages:chat-a": "[]",
    "pendingMessages:chat-a": "[]",
    "evidenceCitations:chat-a": "[]",
    "topicContext:chat-a": "{}",
    "hasSentMessage:chat-b": "true",
    keepSession: "true",
  })

  let dispatched = 0
  ;(globalThis as any).window = {
    location: { pathname: "/c/chat-a" },
    localStorage: localStorageMock,
    sessionStorage: sessionStorageMock,
    dispatchEvent: (event: Event) => {
      if (event.type === "resetChatState") dispatched += 1
      return true
    },
    __lastMessagesForMigration: { chatId: "chat-a", messages: [] },
  }

  resetChatClientState("/c/chat-a")

  assert.equal(localStorageMock.getItem("chatDraft"), null)
  assert.equal(localStorageMock.getItem("keepLocal"), "true")
  assert.equal(sessionStorageMock.getItem("pendingMessages:latest"), null)
  assert.equal(sessionStorageMock.getItem("evidenceCitations:latest"), null)
  assert.equal(sessionStorageMock.getItem("pendingMessage"), null)
  assert.equal(sessionStorageMock.getItem("hasSentMessage:chat-a"), null)
  assert.equal(sessionStorageMock.getItem("messages:chat-a"), null)
  assert.equal(sessionStorageMock.getItem("pendingMessages:chat-a"), null)
  assert.equal(sessionStorageMock.getItem("evidenceCitations:chat-a"), null)
  assert.equal(sessionStorageMock.getItem("topicContext:chat-a"), null)
  assert.equal(sessionStorageMock.getItem("hasSentMessage:chat-b"), "true")
  assert.equal(sessionStorageMock.getItem("keepSession"), "true")
  assert.equal(dispatched, 1, "Expected exactly one resetChatState event")
  assert.equal(
    (globalThis as any).window.__lastMessagesForMigration,
    undefined,
    "Migration buffer should be cleared"
  )
}

function testUploadsLoadingShellExists() {
  assert.equal(
    existsSync("app/uploads/loading.tsx"),
    true,
    "Uploads loading shell should exist for instant route transition feedback"
  )
}

function run() {
  testScopedSessionRestore()
  testMessageNormalization()
  testHydrationGuard()
  testUploadReferenceTokens()
  testScopedNewChatReset()
  testUploadsLoadingShellExists()
  console.log("chat-history regression checks passed")
}

run()
