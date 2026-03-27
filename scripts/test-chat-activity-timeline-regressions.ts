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
  assert.doesNotMatch(
    route,
    /generateDynamicActivityCopy\(/,
    "Chat route should avoid synthetic reasoning copy generation for user-facing reasoning"
  )
  assert.doesNotMatch(
    route,
    /dynamicActivityCopyPromise/,
    "Chat route should not stream synthetic dynamic reasoning summaries"
  )
  assert.match(
    route,
    /routingSummaryForStream/,
    "Chat route should build deterministic routing summary metadata for timeline reasoning"
  )
  assert.match(
    route,
    /summary:\s*routingSummaryText/,
    "Chat route should include a human-readable summary in routing metadata"
  )
  assert.match(
    route,
    /taskPlanForStream/,
    "Chat route should stream planner task plan metadata"
  )
  assert.match(
    route,
    /retrievalNotesForStream/,
    "Chat route should stream retrieval fallback note metadata"
  )
  assert.match(
    route,
    /taskBoardTitleForStream/,
    "Chat route should provide task board title context per turn"
  )
  assert.match(
    route,
    /hasCurriculumAlignmentTaskForStream/,
    "Chat route should surface curriculum-alignment state in routing summaries when planner emits it"
  )
  assert.match(
    route,
    /DIAGRAM\/CODE CITATIONS:/,
    "Chat route prompt guard should keep citations outside chart and mermaid fenced blocks"
  )
  assert.match(
    route,
    /executeConnectorWithFallback\s*=\s*async/,
    "Chat route should run connectors through deterministic fallback orchestration"
  )
}

function testClientTimelineRendering() {
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const activityTimeline = read("app/components/chat/activity/activity-timeline.tsx")
  const timelineBuilder = read("app/components/chat/activity/build-timeline.ts")
  const citationMarkdown = read("app/components/chat/citation-markdown.tsx")

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
    /taskBoardRows\.map\(\(row\) => renderRow\(row\)\)/,
    "Task board rail should render before answer rail"
  )
  assert.match(
    activityTimeline,
    /nonTaskActivityRows\.map\(\(row\) => renderRow\(row\)\)/,
    "Non-task activity rail should render after the compact task board"
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
    activityTimeline,
    /item\.reasoning/,
    "Task board rows should preserve task reasoning in compact task text"
  )
  assert.doesNotMatch(
    activityTimeline,
    /Execution details/,
    "Task board should not render execution-details disclosure when simplified mode is active"
  )
  assert.match(
    timelineBuilder,
    /kind:\s*"tool-result"|kind:\s*"upload-status"|kind:\s*"artifact"|type === "langgraph-routing"/,
    "Timeline builder should normalize tool/upload/artifact events and routing annotations"
  )
  assert.match(
    timelineBuilder,
    /if \(type === "langgraph-routing"\) \{\s*return null/s,
    "Timeline builder should suppress langgraph-routing annotations from user-visible reasoning"
  )
  assert.match(
    timelineBuilder,
    /taskPlanItems/,
    "Timeline builder should prefer planner task-plan rows when available"
  )
  assert.match(
    timelineBuilder,
    /retrievalNotes/,
    "Timeline builder should parse retrieval fallback notes from routing snapshots"
  )
  assert.match(
    timelineBuilder,
    /taskBoardTitle/,
    "Timeline builder should parse task board title metadata from routing snapshots"
  )
  assert.doesNotMatch(
    activityTimeline,
    /item\.id !== "task-finalize"/,
    "Task board normalization should not rely on a hardcoded task-finalize template id"
  )
  assert.match(
    citationMarkdown,
    /collectFencedCodeRanges\(/,
    "Citation markdown should detect fenced code ranges before citation parsing"
  )
  assert.match(
    citationMarkdown,
    /maskRangesWithSpaces\(/,
    "Citation markdown should mask fenced blocks so marker parsing stays prose-only"
  )
  assert.match(
    citationMarkdown,
    /elementType === "code" \|\| elementType === "pre"/,
    "Citation markdown should skip recursive citation processing inside code and pre elements"
  )
  assert.match(
    citationMarkdown,
    /remapMarkerSourceIds\(/,
    "Citation markdown should remap canonical source-id markers into citation indices"
  )
  assert.match(
    citationMarkdown,
    /sourceIds|CITE_|sourceIdPattern/,
    "Citation markdown/parser path should support canonical [CITE_<sourceId>] markers"
  )
  assert.doesNotMatch(
    citationMarkdown,
    /code:\s*\(\{/,
    "Citation markdown should not override the markdown code component and must preserve chart/mermaid block renderers"
  )
  assert.match(
    timelineBuilder,
    /extractReasoningText\(/,
    "Timeline builder should normalize reasoning parts from both text and reasoning payload fields"
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
  assert.match(
    useChatCore,
    /type === "langgraph-routing"/,
    "Chat core should persist langgraph-routing annotations for reload-safe dynamic task boards"
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
  assert.doesNotMatch(
    timelineBuilder,
    /appendExecutionReasoning\(/,
    "Timeline builder should not append synthetic execution prose to reasoning"
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
    /showSourcesSection[\s\S]*!hasEvidenceCitations/s,
    "Sources section should not be hidden when evidence citations are present"
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

function testQuizFlowStabilityAndRefinementGating() {
  const toolInvocation = read("app/components/chat/tool-invocation.tsx")
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const route = read("app/api/chat/route.ts")
  const timelineBuilder = read("app/components/chat/activity/build-timeline.ts")
  const inlineParts = read("app/components/chat/assistant-inline-parts.tsx")

  assert.match(
    toolInvocation,
    /submitState.*"idle" \| "submitting" \| "submitted"/s,
    "Refinement tool card should track idle/submitting/submitted state transitions"
  )
  assert.match(
    toolInvocation,
    /Requirements submitted\. Generating quiz\.\.\./,
    "Refinement tool card should show post-submit generating status"
  )
  assert.match(
    messageAssistant,
    /refinementSubmitState/,
    "Annotation fallback refinement UI should track submit state locally"
  )
  assert.match(
    messageAssistant,
    /submitAnnotationRefinement\(/,
    "Annotation fallback refinement UI should use a dedicated submit handler"
  )
  assert.match(
    route,
    /canInferScopeFromContext/,
    "Quiz routing should infer scope from retrieval\/inspection context"
  )
  assert.match(
    route,
    /canEmitRefinementPrompt/,
    "Refinement prompting should be gated on post-tool context readiness"
  )
  assert.match(
    route,
    /shouldDefaultToBalancedQuizGeneration/,
    "Generic quiz requests with tool context should default to direct balanced generation"
  )
  assert.match(
    route,
    /artifactWorkflowStage === "refine" &&\s*shouldAskArtifactTopicFollowup/s,
    "Artifact refinement annotation should emit only in refine stage"
  )
  assert.match(
    route,
    /QUIZ INSPECTION MODE:/,
    "Quiz inspection stage should explicitly require continuing to refine or generate in the same turn"
  )
  assert.match(
    route,
    /shouldEnableArtifactGenerationToolInInspect/,
    "Inspect stage should keep quiz generation tool available to avoid dead-end turns"
  )
  assert.match(
    timelineBuilder,
    /hasQuizArtifactSurface/,
    "Timeline builder should detect canonical quiz artifact surface"
  )
  assert.match(
    timelineBuilder,
    /\(hasQuizArtifactSurface \|\| text\.length > 160\)/,
    "Timeline builder should suppress only provisional quiz prose to avoid flicker"
  )
  assert.match(
    inlineParts,
    /hasQuizWorkflowToolInvocation/,
    "Inline fallback renderer should apply quiz workflow suppression guards too"
  )
}

function run() {
  testTimelineFlagWiring()
  testServerTimelineEmission()
  testClientTimelineRendering()
  testUploadParityAndClientIngestion()
  testQuizAndUploadSurfaceNormalization()
  testUnifiedSourcesWiring()
  testQuizFlowStabilityAndRefinementGating()
  console.log("chat activity timeline regression checks passed")
}

run()

