import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testTimelineFlagWiring() {
  const config = read("lib/config.ts")
  const envExample = read(".env.example")

  assert.match(
    config,
    /ENABLE_CHAT_ACTIVITY_TIMELINE_V2/,
    "Config should expose ENABLE_CHAT_ACTIVITY_TIMELINE_V2 flag"
  )
  assert.match(
    envExample,
    /ENABLE_CHAT_ACTIVITY_TIMELINE_V2=true/,
    ".env.example should document timeline rollout flag"
  )
}

function testServerTimelineEmission() {
  const route = read("app/api/chat/route.ts")

  assert.match(
    route,
    /emitToolLifecycleEvent/,
    "Chat route should emit explicit tool lifecycle stream annotations"
  )
  assert.match(
    route,
    /type:\s*"tool-lifecycle"/,
    "Chat route should stream tool-lifecycle annotations"
  )
  assert.match(
    route,
    /type:\s*"upload-status-tracking"/,
    "Chat route should stream upload-status tracking annotations for chat-side polling"
  )
  assert.match(
    route,
    /type:\s*"timeline-event"/,
    "Chat route should stream normalized timeline-event annotations"
  )
  assert.match(
    route,
    /wrapRuntimeToolWithLifecycle/,
    "Runtime tools should be wrapped to emit queued\/running\/completed\/failed states"
  )
  assert.match(
    route,
    /generateDynamicActivityCopy\(/,
    "Chat route should support low-latency dynamic intro\/reasoning generation"
  )
  assert.match(
    route,
    /dynamicActivityCopyPromise/,
    "Chat route should kick off dynamic activity copy generation in parallel"
  )
  assert.match(
    route,
    /summary:\s*dynamicCopy\.reasoning/,
    "Chat route should stream reasoning updates via langgraph-routing summary annotations"
  )
}

function testClientTimelineRendering() {
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const activityTimeline = read("app/components/chat/activity/activity-timeline.tsx")
  const timelineBuilder = read("app/components/chat/activity/build-timeline.ts")

  assert.match(
    messageAssistant,
    /ENABLE_CHAT_ACTIVITY_TIMELINE_V2 \?/,
    "Assistant message renderer should gate timeline v2 behind feature flag"
  )
  assert.match(
    messageAssistant,
    /<ActivityTimeline/,
    "Assistant messages should render through unified ActivityTimeline in v2 mode"
  )
  assert.match(
    messageAssistant,
    /buildChatActivityTimeline\(/,
    "Assistant messages should build normalized timeline events before rendering"
  )
  assert.match(
    activityTimeline,
    /buildRenderableRows\(/,
    "Timeline UI should normalize render rows before drawing"
  )
  assert.match(
    activityTimeline,
    /GroupedToolActivityCard/,
    "Timeline UI should render grouped tool activity cards"
  )
  assert.match(
    activityTimeline,
    /buildToolGroupRows\(/,
    "Timeline UI should group tool activity across the full turn by source family"
  )
  assert.match(
    activityTimeline,
    /splitRowsByRail\(/,
    "Timeline UI should split activity and answer rails"
  )
  assert.match(
    activityTimeline,
    /activityRows\.map\(\(row\) => renderRow\(row\)\)/,
    "Activity rail should render before answer rail"
  )
  assert.match(
    activityTimeline,
    /answerRows\.map\(\(row\) => renderRow\(row\)\)/,
    "Answer rail should render separately after activity rail"
  )
  assert.match(
    activityTimeline,
    /formatPayload\(/,
    "Grouped tool cards should expose expandable payload formatting for completed calls"
  )
  assert.match(
    activityTimeline,
    /Response/,
    "Grouped tool cards should show completed result payload sections"
  )
  assert.match(
    timelineBuilder,
    /kind:\s*"tool-result"|kind:\s*"upload-status"|kind:\s*"artifact"|type === "langgraph-routing"/,
    "Timeline builder should normalize tool/upload/artifact events and routing annotations"
  )
  assert.match(
    messageAssistant,
    /splitTrailingSourceAppendix\(/,
    "Assistant renderer should split trailing source appendix from body text"
  )
}

function testUploadParityAndClientIngestion() {
  const uploadsWorkspace = read("app/components/uploads/uploads-workspace.tsx")
  const statusLabelUtil = read("lib/uploads/status-label.ts")
  const conversation = read("app/components/chat/conversation.tsx")
  const useChatCore = read("app/components/chat/use-chat-core.ts")

  assert.match(
    statusLabelUtil,
    /getUploadStatusLabel/,
    "Shared upload status label utility should exist for parity across surfaces"
  )
  assert.match(
    uploadsWorkspace,
    /getUploadStatusLabel\(upload\)/,
    "Uploads workspace should use shared status label mapping"
  )
  assert.match(
    conversation,
    /useReferencedUploadStatus\(/,
    "Conversation should poll and provide referenced upload statuses"
  )
  assert.match(
    conversation,
    /referencedUploads={referencedUploads}/,
    "Conversation should pass referenced upload status snapshots into message rendering"
  )
  assert.match(
    useChatCore,
    /type === "timeline-event"/,
    "Chat core should persist timeline-event annotations in session snapshots"
  )
  assert.match(
    useChatCore,
    /type === "tool-lifecycle"/,
    "Chat core should persist tool-lifecycle annotations in session snapshots"
  )
}

function testQuizAndUploadSurfaceNormalization() {
  const toolInvocation = read("app/components/chat/tool-invocation.tsx")
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const messageUser = read("app/components/chat/message-user.tsx")
  const chatInput = read("app/components/chat-input/chat-input.tsx")
  const timelineBuilder = read("app/components/chat/activity/build-timeline.ts")
  const uploadSendActivity = read("app/components/chat/user-upload-send-activity.tsx")

  assert.doesNotMatch(
    toolInvocation,
    /bg-gradient-to-r from-violet/,
    "Quiz refinement cards should not use forced purple gradient shell"
  )
  assert.doesNotMatch(
    messageAssistant,
    /from-violet-200\/50 via-fuchsia-200\/45 to-purple-200\/55/,
    "Assistant refinement fallback should use neutral container styling"
  )
  assert.match(
    messageUser,
    /UserUploadSendActivity/,
    "User message should render in-chat upload send activity component"
  )
  assert.doesNotMatch(
    chatInput,
    /<FileList/,
    "Composer should avoid pre-send file tile list as primary upload status surface"
  )
  assert.match(
    chatInput,
    /files\.slice\(0,\s*3\)/,
    "Composer should keep compact file preview chips before send"
  )
  assert.doesNotMatch(
    uploadSendActivity,
    /setTimeout\(/,
    "Upload send activity should be status-driven and avoid timer-forced completion"
  )
  assert.match(
    timelineBuilder,
    /summarizeLangGraphTrace\(/,
    "Routing annotations should be transformed into user-facing reasoning summaries"
  )
}

function testUnifiedSourcesWiring() {
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const referencesSection = read("app/components/chat/references-section.tsx")
  const sourceAppendix = read("app/components/chat/source-appendix.ts")

  assert.match(
    messageAssistant,
    /mergeEvidenceIntoCitations\(/,
    "Assistant renderer should merge evidence and non-evidence citations into one sources map"
  )
  assert.match(
    messageAssistant,
    /<ReferencesSection citations={sourcesCitations} title="Sources"/,
    "Assistant renderer should show one unified Sources section"
  )
  assert.doesNotMatch(
    messageAssistant,
    /<EvidenceReferencesSection/,
    "Assistant renderer should avoid split evidence vs references sections"
  )
  assert.match(
    referencesSection,
    /title = "Sources"/,
    "References section should default to Sources labeling"
  )
  assert.match(
    sourceAppendix,
    /from tools\?\|tool output/i,
    "Source appendix parser should support multiline 'References (from tools)' blocks"
  )
}

function run() {
  testTimelineFlagWiring()
  testServerTimelineEmission()
  testClientTimelineRendering()
  testUploadParityAndClientIngestion()
  testQuizAndUploadSurfaceNormalization()
  testUnifiedSourcesWiring()
  console.log("chat activity timeline regression checks passed")
}

run()

