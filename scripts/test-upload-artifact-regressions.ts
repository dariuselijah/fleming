import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string) {
  return readFileSync(path, "utf-8")
}

function testRouteClarificationGuards() {
  const route = read("app/api/chat/route.ts")
  assert.match(
    route,
    /const isTextbookScaleUpload\s*=/,
    "Route should compute textbook-scale upload heuristic"
  )
  assert.match(
    route,
    /const artifactWorkflowStage:\s*"none"\s*\|\s*"inspect"\s*\|\s*"refine"\s*\|\s*"generate"/,
    "Route should enforce explicit inspect/refine/generate workflow stages"
  )
  assert.match(
    route,
    /requiresInspectionBeforeGeneration[\s\S]*inspectionGateSatisfied/,
    "Route should block generation when inspection gate is not satisfied"
  )
  assert.match(
    route,
    /toolName:\s*"refineQuizRequirements"|toolName:\s*"generateQuizFromUpload"/,
    "Route should force quiz refinement/generation tool choice in artifact stages"
  )
  assert.match(
    route,
    /pendingArtifactStage:\s*artifactWorkflowStage/,
    "Route should persist workflow stage in topic context"
  )
  assert.match(
    route,
    /decodeArtifactWorkflowInput\(stripUploadReferenceTokens\(rawQueryText\)\)/,
    "Route should decode workflow-only refinement inputs before orchestration"
  )
  assert.match(
    route,
    /const requestedArtifactIntent = artifactIntentFromRequest === "quiz" \? "quiz" : "none"[\s\S]*const artifactIntent =[\s\S]*\? "quiz"[\s\S]*: "none"/,
    "Route should keep artifact intents quiz-only while allowing context-aware quiz intent inference"
  )
  assert.match(
    route,
    /const canUseArtifactTools\s*=\s*[\s\S]*supportsTools[\s\S]*ENABLE_UPLOAD_CONTEXT_SEARCH/,
    "Artifact tools should not depend on evidence toggle alone"
  )
  assert.match(
    route,
    /type:\s*"artifact-runtime-warnings"/,
    "Route should stream artifact runtime warning annotations"
  )
  assert.doesNotMatch(
    route,
    /generateDocumentFromUpload:\s*tool\(/,
    "Route should not expose document generation runtime tools"
  )
  assert.match(
    route,
    /inspectUploadStructure:\s*tool\(/,
    "Route should expose inspectUploadStructure runtime tool"
  )
}

function testUploadServerStructureAndSynthesis() {
  const server = read("lib/uploads/server.ts")
  assert.match(
    server,
    /async inspectUploadStructure\(/,
    "Upload service should implement structure inspection"
  )
  assert.match(
    server,
    /classifyDocumentPart\(/,
    "Structure inspection should classify document parts"
  )
  assert.match(
    server,
    /mapTopicsToSourceRanges\(/,
    "TOC topics should be mapped onto source page ranges"
  )
  assert.match(
    server,
    /sourcePageStart|sourcePageEnd|pageOffsetEstimate/,
    "Mapped topic ranges should include source-page coordinates"
  )
  assert.match(
    server,
    /requiredBodyEvidence\s*=\s*structureInspection\?\.textbookScale\s*\?\s*2\s*:\s*1/,
    "Section retrieval should require body-evidence thresholds before section inclusion"
  )
  assert.match(
    server,
    /filterArtifactSectionContent\(/,
    "Final artifact assembly should run quality filtering on section content"
  )
  assert.match(
    server,
    /fallbackReason:\s*"none"/,
    "Upload context metrics should include explicit fallback reason"
  )
}

function testWorkflowBiasCleanup() {
  const route = read("app/api/chat/route.ts")
  const uploadsWorkspace = read("app/components/uploads/uploads-workspace.tsx")
  const conversation = read("app/components/chat/conversation.tsx")
  const messageAssistant = read("app/components/chat/message-assistant.tsx")
  const toolInvocation = read("app/components/chat/tool-invocation.tsx")
  assert.match(
    route,
    /preview may be incomplete for large PDFs[\s\S]*prefer upload tools/,
    "Artifact flows should not over-trust raw attachment preview text"
  )
  assert.doesNotMatch(
    uploadsWorkspace,
    /Use Harvard references and include a structured bibliography\./,
    "Upload workspace should not default document prompts to bibliography-heavy output"
  )
  assert.doesNotMatch(
    uploadsWorkspace,
    /Generate Doc/,
    "Uploads workspace should not expose document-generation CTA"
  )
  assert.match(
    conversation,
    /isArtifactWorkflowInput\(message\.content\)/,
    "Workflow-only refinement messages should stay in the same UI workflow"
  )
  assert.doesNotMatch(
    messageAssistant,
    /Retrieval Warnings/,
    "Assistant message UI should not render retrieval warning banners"
  )
  assert.doesNotMatch(
    toolInvocation,
    /Retrieval Warnings/,
    "Artifact tool cards should not render retrieval warning banners"
  )
}

function testUploadIntentRoutingAndCaching() {
  const route = read("app/api/chat/route.ts")
  const useChatCore = read("app/components/chat/use-chat-core.ts")
  const fileHandling = read("lib/file-handling.ts")
  const uploadApi = read("lib/uploads/api.ts")
  const getSources = read("app/components/chat/get-sources.ts")
  const messageAssistant = read("app/components/chat/message-assistant.tsx")

  assert.match(
    route,
    /detectImplicitUploadIntent\(/,
    "Route should detect implicit upload intent phrases when explicit upload refs are missing"
  )
  assert.match(
    route,
    /resolveAutoLatestUploadIds\(/,
    "Route should auto-resolve most recent uploads for vague upload prompts"
  )
  assert.match(
    route,
    /const shouldPreferUploadContext[\s\S]*!shouldPreferUploadContext/,
    "Route should bias tooling away from web search when upload context is likely intended"
  )
  assert.match(
    route,
    /buildUploadRetrievalPreflightCacheKey[\s\S]*getUploadRetrievalPreflightCache[\s\S]*setUploadRetrievalPreflightCache/,
    "Route should memoize upload retrieval preflight calls"
  )
  assert.match(
    fileHandling,
    /if \(!isImageAttachment\(file\.type\) && isAuthenticated\)[\s\S]*uploadKnowledgeFile\(/,
    "Non-image chat files should route through uploads ingestion pipeline"
  )
  assert.match(
    useChatCore,
    /const imageFiles = currentFiles\.filter\(\(file\) => isImageAttachment\(file\.type\)\)/,
    "Chat submit should keep only images in inline attachment path"
  )
  assert.match(
    useChatCore,
    /buildUploadReferenceTokens\(uploadReferenceIds\)/,
    "Chat submit should inject upload reference tokens for routed non-image files"
  )
  assert.match(
    uploadApi,
    /UPLOAD_LIST_CACHE_KEY[\s\S]*uploadListMemoryCache[\s\S]*invalidateUploadListCache/,
    "Uploads API should provide cache + invalidation for upload list refreshes"
  )
  assert.match(
    getSources,
    /result\.provenance && Array\.isArray\(result\.provenance\)/,
    "Chat source extraction should understand provenance-bearing tool results"
  )
  assert.match(
    messageAssistant,
    /if \(hasEvidenceMarkers && sources\.length === 0\)/,
    "Message assistant should still extract citations from sources when evidence markers exist"
  )
}

function testEvidenceAndPubMedRebuild() {
  const route = read("app/api/chat/route.ts")
  const useChatCore = read("app/components/chat/use-chat-core.ts")

  assert.match(
    route,
    /function buildSafeIntroPreview\(input:\s*\{/,
    "Route should use a structured, context-aware stream intro builder"
  )
  assert.match(
    route,
    /const evidenceSeekingIntent = hasEvidenceSeekingIntent\(queryText\)/,
    "Route should auto-enable evidence mode for evidence-seeking intents"
  )
  assert.match(
    route,
    /const strategies = buildPubMedQueryStrategies\(query\)/,
    "PubMed tool should try multiple safer query strategies"
  )
  assert.match(
    route,
    /rawTotalResults/,
    "PubMed tool should expose raw result counts for debugging and UX"
  )
  assert.match(
    route,
    /pushRuntimeEvidenceCitations\(payload\)|pushRuntimeEvidenceCitations\(result\)|pushRuntimeEvidenceCitations\(fallbackResult\)/,
    "Evidence tools should push runtime provenance into streamed evidence citations"
  )
  assert.match(
    useChatCore,
    /mergeEvidenceCitationAnnotations\(/,
    "Chat core should merge multiple evidence-citation annotations instead of taking only the first one"
  )
  assert.match(
    route,
    /ENABLE_STRICT_CITATION_CONTRACT/,
    "Route should support strict citation contract enforcement"
  )
  assert.match(
    route,
    /type:\s*"tool-lifecycle"/,
    "Route should emit explicit tool lifecycle annotations for chat activity continuity"
  )
  assert.match(
    route,
    /type:\s*"upload-status-tracking"/,
    "Route should emit upload-status tracking annotations for referenced uploads"
  )
}

function testAgenticQuizFlowAndUi() {
  const route = read("app/api/chat/route.ts")
  const server = read("lib/uploads/server.ts")
  const artifactCards = read("app/components/chat/generated-artifact-cards.tsx")
  const toolInvocation = read("app/components/chat/tool-invocation.tsx")

  assert.match(
    route,
    /const requiresInspectionBeforeGeneration =[\s\S]*isTextbookScaleUpload[\s\S]*hasWeakOrMissingRetrievalSignals/,
    "Quiz generation should require structure inspection for broad or weakly grounded uploads"
  )
  assert.match(
    server,
    /const structureInspection = await this\.inspectUploadStructure\(/,
    "Quiz generation should inspect upload structure before finalizing the retrieval query"
  )
  assert.match(
    server,
    /parseQuizGenerationSettings\(/,
    "Quiz generation should parse question count, difficulty, style, and scope settings"
  )
  assert.match(
    server,
    /isVerifiedQuizCandidate\(/,
    "Quiz generation should verify candidate questions against source evidence before finalizing"
  )
  assert.match(
    server,
    /isValidDistractorCandidate\(/,
    "Quiz generation should validate distractors for plausibility and topic relevance"
  )
  assert.match(
    server,
    /if \(selectedDistractors.length < 3\)\s*\{\s*return null/,
    "Quiz generation should drop low-quality questions that fail distractor quality gate"
  )
  assert.match(
    server,
    /finalizedCitationPool = dedupeQuizCitations/,
    "Quiz artifacts should only keep deduped citations used by finalized questions"
  )
  assert.match(
    artifactCards,
    /if \(submitted\) return/,
    "Interactive quiz card should lock answer changes after submission"
  )
  assert.match(
    artifactCards,
    /const referencedCitations = useMemo\(/,
    "Interactive quiz card should surface deduped supporting references"
  )
  assert.match(
    toolInvocation,
    /if \(submitted\) return/,
    "Fallback quiz card should also lock answer changes after submission"
  )
}

function testEmbeddingProviderSafety() {
  const embeddings = read("lib/rag/embeddings.ts")
  assert.match(
    embeddings,
    /Embedding provider mismatch: non-OpenAI API key/,
    "Embedding layer should fail fast on provider/key mismatch"
  )
}

function run() {
  testRouteClarificationGuards()
  testUploadServerStructureAndSynthesis()
  testWorkflowBiasCleanup()
  testUploadIntentRoutingAndCaching()
  testEvidenceAndPubMedRebuild()
  testAgenticQuizFlowAndUi()
  testEmbeddingProviderSafety()
  console.log("upload artifact regression checks passed")
}

run()
